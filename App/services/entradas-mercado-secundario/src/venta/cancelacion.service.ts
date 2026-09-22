import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio, ReglasVenta } from '../config/configuracion';
import { Cancelacion, EstadoCancelacion } from '../persistencia/entidades/cancelacion.entity';
import { Compra, EstadoCompra } from '../persistencia/entidades/compra.entity';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { PROCESADOR_PAGOS, ProcesadorPagos, ResultadoCobro } from '../reventa/pagos/procesador-pagos';
import { Contadores } from './contadores';
import {
  CancelacionDto,
  CancelarCompraDto,
  CotizacionCancelacionDto,
  EntradaRechazadaDto,
} from './dto/cancelacion.dto';
import { NotificacionesVenta } from './notificaciones-venta.service';
import { montoReembolso, politicaCancelacion } from './reglas';
import {
  CompraNoCancelable,
  CompraNoEncontrada,
  FueraDePlazo,
  MontoCambio,
  NingunaEntradaCancelable,
  ReembolsoIndeterminado,
  ReembolsoRechazado,
} from './venta.errors';

interface Evaluacion {
  compra: Compra;
  evento: EventoReferencia | null;
  cancelables: Entrada[];
  cotizacion: CotizacionCancelacionDto;
}

/**
 * Cancelaciones y devoluciones CU-003
 *
 * orden de las operaciones*
 * se elige Anular y luego reembolsar: si el reembolso se rechaza, hay que
 * devolverle la entrada, en el peor caso deja una entrada anulada unos segundos
 * anular primero impide que la entrada se use en la puerta o se
 * publique en reventa mientras el reembolso se ejecuta.
 * si se rechaza las entradas vuelven a ser validas CU-003C*/
@Injectable()
export class CancelacionService {
  private readonly log = new Logger(CancelacionService.name);
  private readonly reglas: ReglasVenta;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly contadores: Contadores,
    private readonly notificaciones: NotificacionesVenta,
    @Inject(PROCESADOR_PAGOS) private readonly pagos: ProcesadorPagos,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.venta;
  }
  
  //cancelacion y devolucion
  async cotizar(usuarioId: string, compraId: string, entradaIds?: string[]): Promise<CotizacionCancelacionDto> {
    return (await this.evaluar(this.fuenteDatos.manager, usuarioId, compraId, entradaIds)).cotizacion;
  }

  //  confirmar, reembolsar, anular, registrar y notificar
  async cancelar(usuarioId: string, compraId: string, datos: CancelarCompraDto): Promise<CancelacionDto> {
   const { evaluacion, cancelacion } = await this.fuenteDatos.transaction(async (tx) => {
      // Bloqueo de la compra: no pueden cotizar sobre las mismas entradas
      await tx.findOne(Compra, { where: { id: compraId }, lock: { mode: 'pessimistic_write' } });
      const actual = await this.evaluar(tx, usuarioId, compraId, datos.entradaIds);

      // confirma el monto, si cambio se le vuelve a preguntar
      if (Math.round(datos.montoAceptado * 100) !== Math.round(actual.cotizacion.montoReembolso * 100)) {
        throw new MontoCambio(actual.cotizacion.montoReembolso);
      }

      const ids = actual.cancelables.map((e) => e.id);
      const anuladas = await tx.update(
        Entrada,
        { id: In(ids), estado: EstadoEntrada.VALIDA, propietarioId: usuarioId },
        { estado: EstadoEntrada.ANULADA },
      );
      if (anuladas.affected !== ids.length) {
        throw new CompraNoCancelable('Una de las entradas cambió de estado mientras se procesaba. Vuelve a intentarlo.');
      }

      const registro = await tx.save(
        tx.create(Cancelacion, {
          compraId,
          solicitanteId: usuarioId,
          entradasIds: ids,
          porcentajeReembolso: actual.cotizacion.porcentajeReembolso,
          montoReembolso: actual.cotizacion.montoReembolso,
          motivo: datos.motivo,
          estado: EstadoCancelacion.PENDIENTE,
          referenciaPasarela: null,
          motivoPasarela: null,
        }),
      );
      return { evaluacion: actual, cancelacion: registro };
    });

    // Reembolsar
    const reembolso = await this.pagos.reembolsar({
      referenciaCobro: evaluacion.compra.referenciaPasarela!,
      monto: cancelacion.montoReembolso,
      moneda: 'COP',
      motivo: datos.motivo,
      claveIdempotencia: cancelacion.id,
    });

    if (reembolso.resultado === ResultadoCobro.RECHAZADO) {
      const motivo = reembolso.motivo ?? 'La pasarela rechazó el reembolso';
      await this.fuenteDatos.transaction(async (tx) => {
        // CU-003C: mantiene la compra activa
        await tx.update(
          Entrada,
          { id: In(cancelacion.entradasIds), estado: EstadoEntrada.ANULADA },
          { estado: EstadoEntrada.VALIDA },
        );
        await tx.update(Cancelacion, { id: cancelacion.id }, { estado: EstadoCancelacion.RECHAZADA, motivoPasarela: motivo });
      });
      this.log.log(`Reembolso de ${evaluacion.compra.numeroCompra} rechazado: ${motivo}`);
      throw new ReembolsoRechazado(motivo);
    }

    if (reembolso.resultado === ResultadoCobro.INDETERMINADO) {
      // Hasta no confirmar el dinero volvio las entradas se quedan anuladas, PENDIENTE
      await this.fuenteDatos.manager.update(
        Cancelacion,
        { id: cancelacion.id },
        { estado: EstadoCancelacion.FALLIDA, motivoPasarela: reembolso.motivo },
      );
      this.log.error(`Reembolso de ${evaluacion.compra.numeroCompra} INDETERMINADO. Requiere conciliación.`);
      throw new ReembolsoIndeterminado(cancelacion.id);
    }

    // APROBADO
    await this.fuenteDatos.transaction(async (tx) => {
      await tx.update(
        Cancelacion,
        { id: cancelacion.id },
        { estado: EstadoCancelacion.APROBADA, referenciaPasarela: reembolso.referencia },
      );
      // El cupo vuelve a estar a la venta.
      await this.contadores.devolverVendidas(tx, evaluacion.compra.localidadId, cancelacion.entradasIds.length);
      const quedanActivas = await tx.count(Entrada, {
        where: { compraId, estado: Not(EstadoEntrada.ANULADA) },
      });
      await tx.update(
        Compra,
        { id: compraId },
        { estado: quedanActivas === 0 ? EstadoCompra.CANCELADA : EstadoCompra.PARCIALMENTE_CANCELADA },
      );
    });

    // notificar
    void this.notificaciones.publicar({
      id: `cancelada:${cancelacion.id}`,
      tipo: 'COMPRA_CANCELADA',
      version: 1,
      ocurridoEn: new Date().toISOString(),
      clienteId: usuarioId,
      numeroCompra: evaluacion.compra.numeroCompra,
      eventoNombre: evaluacion.evento?.nombre ?? '',
      entradas: evaluacion.cancelables.map((e) => ({ numeroTicket: e.numeroTicket, localidadNombre: e.localidadNombre })),
      monto: cancelacion.montoReembolso,
    });

    this.log.log(
      `Compra ${evaluacion.compra.numeroCompra}: ${cancelacion.entradasIds.length} entradas canceladas, ` +
        `reembolso ${cancelacion.montoReembolso}`,
    );
    return {
      ...evaluacion.cotizacion,
      cancelacionId: cancelacion.id,
      estado: EstadoCancelacion.APROBADA,
      referenciaReembolso: reembolso.referencia,
      mensaje: `Reembolso aprobado por ${cancelacion.montoReembolso} COP. Tus entradas quedaron anuladas.`,
    };
  }

  //separa las entradas que se pueden cancelar de las que no CU-003D
   
  private async evaluar(
    gestor: EntityManager,
    usuarioId: string,
    compraId: string,
    entradaIds?: string[],
  ): Promise<Evaluacion> {
    // Seguridad: solo el titular de la compra
    const compra = await gestor.findOne(Compra, { where: { id: compraId, compradorId: usuarioId } });
    if (!compra) throw new CompraNoEncontrada();
    if (compra.estado !== EstadoCompra.PAGADA && compra.estado !== EstadoCompra.PARCIALMENTE_CANCELADA) {
      throw new CompraNoCancelable(`La compra está ${compra.estado} y no se puede cancelar`);
    }

    // plazos
    const evento = await gestor.findOne(EventoReferencia, { where: { eventoId: compra.eventoId } });
    const politica = politicaCancelacion(
      evento?.fechaInicio ?? new Date(0),
      evento?.estado === EstadoEvento.CANCELADO,
      new Date(),
      this.reglas,
    );
    if (politica.porcentaje === null) throw new FueraDePlazo(this.reglas.cancelacionParcialHoras);

    const entradasDeLaCompra = await gestor.find(Entrada, { where: { compraId }, order: { numeroTicket: 'ASC' } });
    const pedidas = entradaIds ?? entradasDeLaCompra.map((e) => e.id);
    const porId = new Map(entradasDeLaCompra.map((e) => [e.id, e]));

    const cancelables: Entrada[] = [];
    const rechazadas: EntradaRechazadaDto[] = [];
    for (const id of pedidas) {
      const motivo = motivoNoCancelable(porId.get(id), usuarioId);
      if (motivo) rechazadas.push({ entradaId: id, motivo });
      else cancelables.push(porId.get(id)!);
    }

    const rechazadasVisibles = entradaIds
      ? rechazadas
      : rechazadas.filter((r) => porId.get(r.entradaId)?.estado !== EstadoEntrada.ANULADA);
    if (cancelables.length === 0) throw new NingunaEntradaCancelable(rechazadasVisibles);

    //  reembolso sobre las voletas cancelables
    const montoPagado = cancelables.reduce((suma, e) => suma + Math.round(e.precioOriginal * 100), 0) / 100;
    const monto = montoReembolso(cancelables.map((e) => e.precioOriginal), politica.porcentaje);
    const parcial = politica.porcentaje < 100;

    return {
      compra,
      evento,
      cancelables,
      cotizacion: {
        entradasCancelables: cancelables.map((e) => e.id),
        entradasRechazadas: rechazadasVisibles,
        montoPagado,
        porcentajeReembolso: politica.porcentaje,
        montoReembolso: monto,
        parcial,
        tramo: politica.tramo,
        // CU-003A: informa el monto parcial antes de que se confirme
        mensaje: parcial
          ? `Por la cercanía del evento, se reembolsa el ${politica.porcentaje} % de lo pagado: ${monto} COP de ${montoPagado} COP.`
          : `Se reembolsa el total pagado: ${monto} COP.`,
      },
    };
  }
}

//Por que una entrada no se puede cancelar
function motivoNoCancelable(entrada: Entrada | undefined, usuarioId: string): string | null {
  if (!entrada) return 'La entrada no pertenece a esta compra';
  if (entrada.propietarioId !== usuarioId) return 'La entrada ya no es tuya (se revendió)';
  switch (entrada.estado) {
    case EstadoEntrada.USADA:
      return 'La entrada ya se usó para ingresar al evento (CU-003D)';
    case EstadoEntrada.ANULADA:
      return 'La entrada ya estaba cancelada';
    case EstadoEntrada.EN_REVENTA:
      return 'La entrada está publicada en reventa; retírala del mercado antes de cancelarla';
    default:
      return null;
  }
}
