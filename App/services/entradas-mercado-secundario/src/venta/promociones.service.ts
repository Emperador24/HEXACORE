import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CodigoPromocional } from '../persistencia/entidades/codigo-promocional.entity';
import { Compra, EstadoCompra } from '../persistencia/entidades/compra.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import { EstadoUsoPromocion, UsoPromocion } from '../persistencia/entidades/uso-promocion.entity';
import { Contadores } from './contadores';
import { CompraDto, aCompraDto } from './dto/compra.dto';
import { calcularImportes, evaluarCupon, normalizarCodigo } from './reglas';
import {
  CompraNoAdmiteCupon,
  CompraNoEncontrada,
  CompraYaTieneCupon,
  CuponAgotado,
  CuponInvalido,
  CuponNoAplica,
  ReservaVencida,
} from './venta.errors';

/**
 * Promociones CU-004 
 * aplicar un codigo a una compra en curso y quitarlo.
 *
 * El cupon se aplica a la compra reservada no a un carrito
 * el descuento lo calcula y lo guarda el servidor para
 * evitar la manipulación del descuento desde el cliente
 */
@Injectable()
export class PromocionesService {
  private readonly log = new Logger(PromocionesService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly contadores: Contadores,
  ) {}

  async aplicar(usuarioId: string, compraId: string, codigoEscrito: string): Promise<CompraDto> {
    const codigo = normalizarCodigo(codigoEscrito);

    return this.fuenteDatos.transaction(async (tx) => {
      const compra = await this.compraEditable(tx, usuarioId, compraId);
      if (compra.codigoPromocional) throw new CompraYaTieneCupon(compra.codigoPromocional);

      // validar disponivilidad del cupon
      const cupon = await tx.findOne(CodigoPromocional, { where: { codigo } });
      const problema = evaluarCupon(cupon, compra, new Date());
      if (problema?.tipo === 'INVALIDO') throw new CuponInvalido(problema.motivo);
      if (problema?.tipo === 'NO_APLICA') throw new CuponNoAplica(await this.describirAlcance(tx, cupon!));
      if (problema?.tipo === 'AGOTADO') throw new CuponAgotado();

      // ocupar el uso con un UPDATE condicional
      if (!(await this.contadores.ocuparUsoCupon(tx, codigo))) throw new CuponAgotado();

      // calcular y aplicar
      const importes = calcularImportes(compra.precioUnitario, compra.cantidad, cupon!.porcentaje);
      await tx.update(Compra, { id: compra.id }, { ...importes, codigoPromocional: codigo });

      // registrar el uso al usuario
      await tx.insert(UsoPromocion, {
        codigo,
        compraId: compra.id,
        usuarioId,
        descuento: importes.descuento,
        estado: EstadoUsoPromocion.RESERVADO,
      });

      this.log.log(`Cupón ${codigo} aplicado a ${compra.numeroCompra}: -${importes.descuento}`);
      // actualizar total
      return aCompraDto({ ...compra, ...importes, codigoPromocional: codigo });
    });
  }

  // CU-004B, si se retira el codigo se recalcula el total sin el descuento
  async quitar(usuarioId: string, compraId: string): Promise<CompraDto> {
    return this.fuenteDatos.transaction(async (tx) => {
      const compra = await this.compraEditable(tx, usuarioId, compraId);
      if (!compra.codigoPromocional) return aCompraDto(compra);

      await this.liberarUso(tx, compra);
      const importes = calcularImportes(compra.precioUnitario, compra.cantidad, 0);
      await tx.update(Compra, { id: compra.id }, { ...importes, codigoPromocional: null });
      return aCompraDto({ ...compra, ...importes, codigoPromocional: null });
    });
  }

  // Al pagar pasa de reservado a confirmado
  async confirmarUso(tx: EntityManager, compraId: string): Promise<void> {
    await tx.update(
      UsoPromocion,
      { compraId, estado: EstadoUsoPromocion.RESERVADO },
      { estado: EstadoUsoPromocion.CONFIRMADO },
    );
  }

  // devuelve el uso al quitar un cupon CU-004B o cuando la reserva vence CU-001B
  async liberarUso(tx: EntityManager, compra: Pick<Compra, 'id' | 'codigoPromocional'>): Promise<void> {
    if (!compra.codigoPromocional) return;
    const liberado = await tx.update(
      UsoPromocion,
      { compraId: compra.id, estado: EstadoUsoPromocion.RESERVADO },
      { estado: EstadoUsoPromocion.LIBERADO },
    );
    // Verifica que este reservado para devolver el uso
    if (liberado.affected) await this.contadores.liberarUsoCupon(tx, compra.codigoPromocional);
  }

  /**
   * bloquear la compra durante la transaccion para evitar que dos pestañas apliquen dos cupones
   * a la vez o que se aplique uno mientras la compra se esta pagando.
   */
  private async compraEditable(tx: EntityManager, usuarioId: string, compraId: string): Promise<Compra> {
    const compra = await tx.findOne(Compra, {
      where: { id: compraId, compradorId: usuarioId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!compra) throw new CompraNoEncontrada();
    if (compra.estado !== EstadoCompra.PENDIENTE) throw new CompraNoAdmiteCupon(compra.estado);
    if (compra.expiraEn <= new Date()) throw new ReservaVencida();
    return compra;
  }

  // a que aplica el cupon
  private async describirAlcance(tx: EntityManager, cupon: CodigoPromocional): Promise<string> {
    const evento = cupon.eventoId ? await tx.findOne(EventoReferencia, { where: { eventoId: cupon.eventoId } }) : null;
    const localidad = cupon.localidadId
      ? await tx.findOne(LocalidadEvento, { where: { localidadId: cupon.localidadId } })
      : null;
    if (localidad) return `la localidad ${localidad.nombre}${evento ? ` de ${evento.nombre}` : ''}`;
    return evento ? `el evento ${evento.nombre}` : 'otros eventos';
  }
}
