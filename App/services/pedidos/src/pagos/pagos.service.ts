import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { TransaccionPedido, EstadoTransaccionPedido as Estado } from '../persistencia/entidades/transaccion-pedido.entity';
import { aPagoDto, PagoDto } from './dto/pago.dto';
import { PasarelaHttp } from './pasarela-http.service';

type Preparacion = { pedido: Pedido; intento: TransaccionPedido; cobrar: boolean } | { expirado: true };

@Injectable()
export class PagosService {
  constructor(@InjectDataSource() private readonly datos: DataSource, private readonly pasarela: PasarelaHttp) {}

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
    if (!preparacion.cobrar) return aPagoDto(preparacion.pedido, preparacion.intento);

    // Sin conexión transaccional ni bloqueo de PostgreSQL durante el HTTP externo.
    const resultado = await this.pasarela.cobrar(clave, preparacion.intento.monto, preparacion.intento.moneda, tokenPago);
    return this.datos.transaction(async (gestor) => {
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
      // APROBADA bloquea cobros nuevos, pero no confirma compra ni modifica inventario.
      return aPagoDto(pedido, intento);
    });
  }
}
