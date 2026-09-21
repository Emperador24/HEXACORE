import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual } from 'typeorm';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { TransaccionPedido, EstadoTransaccionPedido as Estado } from '../persistencia/entidades/transaccion-pedido.entity';
import { ReservaInventario, EstadoReservaInventario as EstadoReserva } from '../persistencia/entidades/reserva-inventario.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { ReservasService } from '../inventario/reservas.service';
import { aPagoDto, PagoDto } from './dto/pago.dto';
import { PasarelaHttp } from './pasarela-http.service';

type Preparacion = { pedido: Pedido; intento: TransaccionPedido; cobrar: boolean } | { expirado: true };

@Injectable()
export class PagosService {
  private readonly log = new Logger(PagosService.name);

  constructor(
    @InjectDataSource() private readonly datos: DataSource,
    private readonly pasarela: PasarelaHttp,
    private readonly reservas: ReservasService,
  ) {}

  async pagar(clienteId: string, pedidoId: string, clave: string, tokenPago: string): Promise<PagoDto> {
    pedidoId = pedidoId.toLowerCase();
    clave = clave.toLowerCase();
    let preparacion: Preparacion;
    try {
      preparacion = await this.datos.transaction(async (gestor): Promise<Preparacion> => {
        const pedido = await gestor.findOne(Pedido, {
          where: { id: pedidoId, clienteId }, lock: { mode: 'pessimistic_write' },
        });
        if (!pedido) throw new NotFoundException({ codigo: 'PEDIDO_NO_ENCONTRADO' });
        const previo = await gestor.findOne(TransaccionPedido, { where: { id: clave } });
        if (previo) {
          if (previo.pedidoId !== pedido.id) throw new ConflictException({ codigo: 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE' });
          // Sin consulta de estado ni idempotencia durable en el simulador, FALLIDA no se reenvía.
          // También después de expirar: repetir consulta el resultado, nunca vuelve a cobrar.
          return { pedido, intento: previo, cobrar: false };
        }
        const intentos = await gestor.find(TransaccionPedido, { where: { pedidoId } });
        if (intentos.some((intento) => intento.estado === Estado.APROBADA)) {
          throw new ConflictException({ codigo: 'PEDIDO_YA_PAGADO' });
        }
        if (intentos.some((intento) => intento.estado === Estado.PENDIENTE || intento.estado === Estado.FALLIDA)) {
          throw new ConflictException({ codigo: 'PAGO_PENDIENTE_RESOLUCION' });
        }
        if (pedido.estado !== EstadoPedido.PENDIENTE_PAGO) {
          throw new ConflictException({ codigo: 'ESTADO_PEDIDO_NO_PERMITE_PAGO' });
        }
        if (pedido.expiraEn.getTime() <= Date.now()) {
          pedido.estado = EstadoPedido.EXPIRADO;
          await gestor.save(Pedido, pedido);
          return { expirado: true }; // Confirmar este cambio antes de devolver el error HTTP.
        }
        const reserva = await gestor.findOne(ReservaInventario, { where: { pedidoId }, lock: { mode: 'pessimistic_write' } });
        if (!reserva || reserva.estado !== EstadoReserva.ACTIVA) {
          throw new ConflictException({ codigo: 'RESERVA_NO_ACTIVA' });
        }
        const intento = gestor.create(TransaccionPedido, {
          id: clave, pedidoId, monto: pedido.total, moneda: pedido.moneda,
          estado: Estado.PENDIENTE, referenciaPasarela: null, motivo: null,
        });
        // INSERT, no save/upsert: la PK impide reutilizar una clave simultáneamente entre pedidos.
        await gestor.insert(TransaccionPedido, intento);
        return { pedido, intento, cobrar: true };
      });
    } catch (error) {
      if ((error as { driverError?: { code?: string } })?.driverError?.code === '23505') {
        throw new ConflictException({ codigo: 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE' });
      }
      throw error;
    }
    if ('expirado' in preparacion) throw new ConflictException({ codigo: 'CHECKOUT_EXPIRADO' });
    if (!preparacion.cobrar) {
      return preparacion.intento.estado === Estado.APROBADA
        ? this.finalizarAprobacion(pedidoId, clave)
        : aPagoDto(preparacion.pedido, preparacion.intento);
    }

    // Sin conexión transaccional ni bloqueo de PostgreSQL durante el HTTP externo.
    const resultado = await this.pasarela.cobrar(clave, preparacion.intento.monto, preparacion.intento.moneda, tokenPago);
    // Guardar primero la evidencia del cobro: un fallo del descuento no debe borrar la aprobación.
    const respuesta = await this.datos.transaction(async (gestor) => {
      const pedido = await gestor.findOneOrFail(Pedido, { where: { id: pedidoId }, lock: { mode: 'pessimistic_write' } });
      const intento = await gestor.findOneOrFail(TransaccionPedido, { where: { id: clave } });
      if (intento.estado === Estado.PENDIENTE) {
        Object.assign(intento, resultado);
        await gestor.save(TransaccionPedido, intento);
        // Un cobro aprobado o incierto nunca se convierte en una expiración silenciosa.
        if (resultado.estado === Estado.RECHAZADA && pedido.estado === EstadoPedido.PENDIENTE_PAGO &&
            pedido.expiraEn.getTime() <= Date.now()) {
          pedido.estado = EstadoPedido.EXPIRADO;
          await gestor.save(Pedido, pedido);
        }
      }
      // Un rechazo o resultado incierto no descuenta ni consume inventario.
      return aPagoDto(pedido, intento);
    });
    return respuesta.estadoPago === Estado.APROBADA ? this.finalizarAprobacion(pedidoId, clave) : respuesta;
  }

  /** También permite completar un replay explícito sin volver a cobrar ni descontar dos veces. */
  private async finalizarAprobacion(pedidoId: string, clave: string): Promise<PagoDto> {
    const confirmacion = await this.datos.transaction(async (gestor) => {
      const pedido = await gestor.findOneOrFail(Pedido, { where: { id: pedidoId }, lock: { mode: 'pessimistic_write' } });
      const intento = await gestor.findOneOrFail(TransaccionPedido, { where: { id: clave, pedidoId, estado: Estado.APROBADA } });
      const reserva = await gestor.findOne(ReservaInventario, { where: { pedidoId }, lock: { mode: 'pessimistic_write' } });
      if (!reserva) throw new ConflictException({ codigo: 'RESERVA_NO_ACTIVA' });
      if (pedido.estado === EstadoPedido.CONFIRMADO) {
        if (reserva.estado !== EstadoReserva.CONSUMO_PENDIENTE && reserva.estado !== EstadoReserva.CONSUMIDA) {
          throw new ConflictException({ codigo: 'RESERVA_CONFIRMACION_INCONSISTENTE' });
        }
        return { pedido, intento, consumir: reserva.estado === EstadoReserva.CONSUMO_PENDIENTE };
      }
      if (pedido.estado !== EstadoPedido.PENDIENTE_PAGO || reserva.estado !== EstadoReserva.ACTIVA) {
        throw new ConflictException({ codigo: 'PEDIDO_NO_CONFIRMABLE' });
      }
      // Un pago iniciado a tiempo puede aprobarse después de expiraEn: no liberar su reserva por el reloj.
      const detalles = await gestor.find(DetallePedido, {
        where: { pedidoId }, order: { productoId: 'ASC' }, lock: { mode: 'pessimistic_write' },
      });
      if (!detalles.length) throw new ConflictException({ codigo: 'PEDIDO_SIN_DETALLES' });
      const productos = await gestor.find(Producto, {
        where: { id: In(detalles.map((detalle) => detalle.productoId)) },
        order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' },
      });
      const porId = new Map(productos.map((producto) => [producto.id, producto]));
      for (const detalle of detalles) {
        const producto = porId.get(detalle.productoId);
        if (!producto || producto.establecimientoId !== pedido.establecimientoId ||
            !Number.isInteger(detalle.cantidad) || detalle.cantidad <= 0) {
          throw new ConflictException({ codigo: 'DETALLE_INVENTARIO_INCONSISTENTE' });
        }
        const descuento = await gestor.decrement(Producto, {
          id: producto.id, establecimientoId: pedido.establecimientoId,
          cantidadInventario: MoreThanOrEqual(detalle.cantidad),
        }, 'cantidadInventario', detalle.cantidad);
        if (descuento.affected !== 1) throw new ConflictException({ codigo: 'INVENTARIO_INSUFICIENTE_CONFIRMACION' });
      }
      pedido.estado = EstadoPedido.CONFIRMADO;
      pedido.confirmadoEn = new Date();
      // 256 bits aleatorios, codificados en los 64 caracteres admitidos por codigo_qr.
      // Se guarda con la confirmación; el replay de un CONFIRMADO retorna antes de este punto.
      pedido.codigoQr = randomBytes(32).toString('hex');
      reserva.estado = EstadoReserva.CONSUMO_PENDIENTE;
      await gestor.save(Pedido, pedido);
      await gestor.save(ReservaInventario, reserva);
      return { pedido, intento, consumir: true };
    });
    // Solo tras COMMIT: si la transacción falla o su resultado es incierto, no tocar Redis.
    if (confirmacion.consumir) {
      try {
        const resultado = await this.reservas.consumir(confirmacion.pedido.establecimientoId, pedidoId);
        if (resultado.estado !== 'CONSUMIDA') throw new Error('Consumo Redis no confirmado');
        await this.datos.manager.update(ReservaInventario,
          { pedidoId, estado: EstadoReserva.CONSUMO_PENDIENTE }, { estado: EstadoReserva.CONSUMIDA });
      } catch {
        // El pedido y el descuento ya están confirmados. Un replay puede completar este cierre idempotente.
        this.log.error(`CONSUMO_REDIS_PENDIENTE pedido=${pedidoId} transaccion=${clave}`);
      }
    }
    return aPagoDto(confirmacion.pedido, confirmacion.intento);
  }
}
