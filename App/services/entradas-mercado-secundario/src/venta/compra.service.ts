import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, QueryFailedError } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio, ReglasVenta } from '../config/configuracion';
import { Compra, EstadoCompra } from '../persistencia/entidades/compra.entity';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { HistorialPropietario, MotivoCambioPropietario } from '../persistencia/entidades/historial-propietario.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import { PagarDto } from '../reventa/dto/pagar.dto';
import { PROCESADOR_PAGOS, ProcesadorPagos, ResultadoCobro } from '../reventa/pagos/procesador-pagos';
import { GeneradorQr } from '../reventa/qr/generador-qr.service';
import { Contadores } from './contadores';
import { CompraDto, CrearCompraDto, aCompraDto } from './dto/compra.dto';
import { NotificacionesVenta } from './notificaciones-venta.service';
import { PromocionesService } from './promociones.service';
import { calcularImportes, repartirPorEntrada } from './reglas';
import {
  CompraNoEncontrada,
  CompraNoPagable,
  EventoNoALaVenta,
  LocalidadNoEncontrada,
  PagoCompraIndeterminado,
  PagoCompraRechazado,
  ReservaVencida,
  SinDisponibilidad,
} from './venta.errors';

// Reintentar los QR si chocan con uno existente CU-001D
const INTENTOS_EMISION = 3;

/** Compra de entradas CU-001
 * Reservar: se aparta el cupo y se calcula el total, si no
 * hay cupo se para antes de que el cliente escriba nada CU-001A
 * la reserva tiene un plazo CU-001B

 * Pagar: se cobra, si se aprueba se emiten las entradas*/
@Injectable()
export class CompraService {
  private readonly log = new Logger(CompraService.name);
  private readonly reglas: ReglasVenta;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly contadores: Contadores,
    private readonly promociones: PromocionesService,
    private readonly qr: GeneradorQr,
    private readonly notificaciones: NotificacionesVenta,
    @Inject(PROCESADOR_PAGOS) private readonly pagos: ProcesadorPagos,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.venta;
  }

  // CU-001: elegir localidad y cantidad, apartar el cupo y calcular el total
  async reservar(compradorId: string, datos: CrearCompraDto): Promise<CompraDto> {
    return this.fuenteDatos.transaction(async (tx) => {
      const localidad = await tx.findOne(LocalidadEvento, { where: { localidadId: datos.localidadId } });
      if (!localidad) throw new LocalidadNoEncontrada();

      const evento = await tx.findOne(EventoReferencia, { where: { eventoId: localidad.eventoId } });
      // tiene que tener disponibilidad y estar a la venta
      if (evento?.estado !== EstadoEvento.PUBLICADO) {
        throw new EventoNoALaVenta('El evento no está a la venta');
      }

      if (evento.fechaInicio <= new Date()) throw new EventoNoALaVenta('El evento ya empezó');

      if (!(await this.contadores.reservarCupo(tx, localidad.localidadId, datos.cantidad))) {
        throw new SinDisponibilidad(Math.max(0, localidad.aforo - localidad.vendidas - localidad.reservadas));
      }

      const importes = calcularImportes(localidad.precio, datos.cantidad);
      const compra = tx.create(Compra, {
        numeroCompra: await this.siguienteNumero(tx, 'numero_compra_seq', 'CMP'),
        compradorId,
        eventoId: evento.eventoId,
        localidadId: localidad.localidadId,
        cantidad: datos.cantidad,
        precioUnitario: localidad.precio,
        ...importes,
        codigoPromocional: null,
        estado: EstadoCompra.PENDIENTE,
        intentosRechazados: 0,
        referenciaPasarela: null,
        motivo: null,
        expiraEn: new Date(Date.now() + this.reglas.reservaMinutos * 60_000),
        pagadaEn: null,
      });
      await tx.save(compra);

      this.log.log(`Reserva ${compra.numeroCompra}: ${datos.cantidad} × ${localidad.nombre} de ${evento.nombre}`);
      return aCompraDto(compra);
    });
  }

  async listar(compradorId: string): Promise<CompraDto[]> {
    const compras = await this.fuenteDatos.manager.find(Compra, {
      where: { compradorId },
      order: { creadaEn: 'DESC' },
      take: 50,
    });
    return compras.map((compra) => aCompraDto(compra));
  }

  async detalle(compradorId: string, compraId: string): Promise<CompraDto> {
    const compra = await this.fuenteDatos.manager.findOne(Compra, { where: { id: compraId, compradorId } });
    if (!compra) throw new CompraNoEncontrada();
    return aCompraDto(compra, await this.entradasPropias(this.fuenteDatos.manager, compra.id, compradorId));
  }

  /** pagar
   * Por que primero se marca PAGANDO
   * mientras se procesa, la compra no se puede vencer por el barrido: 
   * si el barrido de reservas liberara el cupo y el cobro se aprobara despues, 
   * alguien podria haber pagado por entradas que ya son de otro
   * Solucion: pagando saca la compra del alcance del barrido.
   */
  async pagar(compradorId: string, compraId: string, pago: PagarDto): Promise<CompraDto> {
    const { compra, vencida } = await this.fuenteDatos.transaction(async (tx) => {
      const actual = await tx.findOne(Compra, {
        where: { id: compraId, compradorId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!actual) throw new CompraNoEncontrada();
      if (actual.estado === EstadoCompra.EXPIRADA) return { compra: actual, vencida: true };
      if (actual.estado !== EstadoCompra.PENDIENTE && actual.estado !== EstadoCompra.PAGANDO) {
        throw new CompraNoPagable(actual.estado);
      }
      // CU-001B: se vencio y el barrido no ha pasado, se libera.
      if (actual.estado === EstadoCompra.PENDIENTE && actual.expiraEn <= new Date()) {
        await this.expirar(tx, actual);
        return { compra: actual, vencida: true };
      }
      await tx.update(Compra, { id: actual.id }, { estado: EstadoCompra.PAGANDO });
      return { compra: actual, vencida: false };
    });
    if (vencida) throw new ReservaVencida();

    const cobro = await this.pagos.cobrar({
      monto: compra.total,
      moneda: 'COP',
      token: pago.token,
      descripcion: `Compra ${compra.numeroCompra} (${compra.cantidad} entradas)`,
      claveIdempotencia: `${compra.id}:${compra.intentosRechazados}`,
    });

    if (cobro.resultado === ResultadoCobro.RECHAZADO) {
      // CU-001C: la reserva sigue viva y se puede reintentar
      const motivo = cobro.motivo ?? 'La pasarela rechazó el cobro';
      await this.fuenteDatos.manager.update(
        Compra,
        { id: compra.id, estado: EstadoCompra.PAGANDO },
        { estado: EstadoCompra.PENDIENTE, intentosRechazados: compra.intentosRechazados + 1, motivo },
      );
      this.log.log(`Pago de ${compra.numeroCompra} rechazado: ${motivo}`);
      throw new PagoCompraRechazado(motivo, compra.expiraEn);
    }

    if (cobro.resultado === ResultadoCobro.INDETERMINADO) {
      // no se sabe si se cobro, la compra se queda en PAGANDO hasta que se reintente o se concilie.
      await this.fuenteDatos.manager.update(Compra, { id: compra.id }, { motivo: cobro.motivo });
      this.log.error(`Pago de ${compra.numeroCompra} INDETERMINADO: ${cobro.motivo}. Requiere conciliación.`);
      throw new PagoCompraIndeterminado(compra.numeroCompra);
    }

    return this.emitir(compra, cobro.referencia!);
  }

  // post pago
  private async emitir(compra: Compra, referencia: string): Promise<CompraDto> {
    for (let intento = 1; ; intento++) {
      try {
        const resultado = await this.fuenteDatos.transaction(async (tx) => {
          const pagada = await tx.update(
            Compra,
            { id: compra.id, estado: EstadoCompra.PAGANDO },
            { estado: EstadoCompra.PAGADA, referenciaPasarela: referencia, pagadaEn: new Date(), motivo: null },
          );
          // idempotencia para evitar doble pago
          if (!pagada.affected) return null;

          await this.contadores.confirmarCupo(tx, compra.localidadId, compra.cantidad);
          await this.promociones.confirmarUso(tx, compra.id);
          return this.crearEntradas(tx, compra);
        });

        if (!resultado) return this.detalle(compra.compradorId, compra.id);

        const { entradas, evento } = resultado;
        this.log.log(`Compra ${compra.numeroCompra} pagada: ${entradas.length} entradas emitidas`);
        // si falla y la compra está hecha, el cliente ya tiene sus QR en la respuesta.
        void this.notificaciones.publicar({
          id: `confirmada:${compra.id}`,
          tipo: 'COMPRA_CONFIRMADA',
          version: 1,
          ocurridoEn: new Date().toISOString(),
          clienteId: compra.compradorId,
          numeroCompra: compra.numeroCompra,
          eventoNombre: evento?.nombre ?? '',
          entradas: entradas.map((e) => ({
            numeroTicket: e.numeroTicket,
            localidadNombre: e.localidadNombre,
            codigoQr: e.codigoQr,
          })),
          monto: compra.total,
        });
        return aCompraDto(
          { ...compra, estado: EstadoCompra.PAGADA, referenciaPasarela: referencia, pagadaEn: new Date(), motivo: null },
          entradas,
        );
      } catch (error) {
        // CU-001D:Ocurre un error en la generación del QR, el sistema genera una alerta y reintenta
        if (esColisionDeQr(error) && intento < INTENTOS_EMISION) {
          this.log.error(`ALERTA CU-001D: colisión de QR en ${compra.numeroCompra}; reintento ${intento + 1}`);
          continue;
        }
        this.log.error(
          `ALERTA: ${compra.numeroCompra} se cobró (${referencia}) pero no se pudieron emitir las entradas: ` +
            `${error instanceof Error ? error.message : error}. Requiere conciliación.`,
        );
        throw error;
      }
    }
  }

  private async crearEntradas(
    tx: EntityManager,
    compra: Compra,
  ): Promise<{ entradas: Entrada[]; evento: EventoReferencia | null }> {
    const [localidad, evento] = await Promise.all([
      tx.findOne(LocalidadEvento, { where: { localidadId: compra.localidadId } }),
      tx.findOne(EventoReferencia, { where: { eventoId: compra.eventoId } }),
    ]);
    const precios = repartirPorEntrada(compra.total, compra.cantidad);

    const entradas: Entrada[] = [];
    for (const precio of precios) {
      //un QR por entrada
      const entrada = tx.create(Entrada, {
        eventoId: compra.eventoId,
        localidadId: compra.localidadId,
        localidadNombre: localidad?.nombre ?? '',
        propietarioId: compra.compradorId,
        codigoQr: this.qr.emitir(),
        estado: EstadoEntrada.VALIDA,
        precioOriginal: precio,
        numeroTicket: await this.siguienteNumero(tx, 'numero_ticket_seq', 'TCK'),
        compraId: compra.id,
      });
      await tx.save(entrada);
      // EMISION: trazabilidad de propietarios
      await tx.insert(HistorialPropietario, {
        entradaId: entrada.id,
        propietarioAnteriorId: null,
        propietarioNuevoId: compra.compradorId,
        motivo: MotivoCambioPropietario.EMISION,
        transaccionId: null,
        codigoQrAnterior: null,
        codigoQrNuevo: entrada.codigoQr,
      });
      entradas.push(entrada);
    }
    return { entradas, evento };
  }

  // CU-001B: barrido de las reservas vencidas
  async expirarVencidas(): Promise<number> {
    const vencidas = await this.fuenteDatos.manager.find(Compra, {
      where: { estado: EstadoCompra.PENDIENTE, expiraEn: LessThanOrEqual(new Date()) },
      take: 200,
    });
    let liberadas = 0;
    for (const compra of vencidas) {
      const hecho = await this.fuenteDatos.transaction((tx) => this.expirar(tx, compra));
      if (hecho) liberadas++;
    }
    if (liberadas > 0) this.log.log(`${liberadas} reservas vencidas liberadas (CU-001B)`);
    return liberadas;
  }

  //Vence una reserva: entrada y cupon vuelven a estar disponibles
  private async expirar(tx: EntityManager, compra: Compra): Promise<boolean> {
    const vencida = await tx.update(
      Compra,
      { id: compra.id, estado: EstadoCompra.PENDIENTE },
      { estado: EstadoCompra.EXPIRADA, motivo: 'La reserva venció sin pagarse (CU-001B)' },
    );
    if (!vencida.affected) return false;
    await this.contadores.liberarReserva(tx, compra.localidadId, compra.cantidad);
    await this.promociones.liberarUso(tx, compra);
    return true;
  }

  //reventa
  private entradasPropias(gestor: EntityManager, compraId: string, compradorId: string): Promise<Entrada[]> {
    return gestor.find(Entrada, {
      where: { compraId, propietarioId: compradorId },
      order: { numeroTicket: 'ASC' },
    });
  }

  private async siguienteNumero(tx: EntityManager, secuencia: string, prefijo: string): Promise<string> {
    const [{ valor }] = (await tx.query(`SELECT nextval('${secuencia}') AS valor`)) as { valor: string }[];
    return `${prefijo}-${new Date().getFullYear()}-${String(valor).padStart(6, '0')}`;
  }
}

function esColisionDeQr(error: unknown): boolean {
  const detalle = (error as { driverError?: { constraint?: string } }).driverError;
  return error instanceof QueryFailedError && detalle?.constraint === 'uq_entradas_codigo_qr';
}
