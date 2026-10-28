import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual } from 'typeorm';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { ReservaInventario, EstadoReservaInventario as Reserva } from '../persistencia/entidades/reserva-inventario.entity';
import { TransaccionPedido, EstadoTransaccionPedido as Pago } from '../persistencia/entidades/transaccion-pedido.entity';
import { ReservasService } from './reservas.service';

/** Sondeo del prototipo; no cambia los 600 segundos del checkout ni depende de TTL Redis. */
@Injectable()
export class ExpiracionReservasService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ExpiracionReservasService.name);
  private temporizador?: ReturnType<typeof setInterval>;
  private ciclo?: Promise<void>;

  constructor(
    @InjectDataSource() private readonly datos: DataSource,
    private readonly reservas: ReservasService,
  ) {}

  onModuleInit(): void {
    this.temporizador = setInterval(() => { void this.ejecutarCiclo(); }, 5000);
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.temporizador);
    await this.ciclo;
  }

  ejecutarCiclo(): Promise<void> {
    // No acumular ejecuciones si PostgreSQL o Redis tardan más que el intervalo.
    if (!this.ciclo) {
      this.ciclo = this.procesar().catch(() => {
        this.log.error('EXPIRACION_RESERVAS_FALLIDA');
      }).finally(() => { this.ciclo = undefined; });
    }
    return this.ciclo;
  }

  private async procesar(): Promise<void> {
    const ahora = new Date();
    // Incluye los pedidos que PagosService ya marcó EXPIRADO y liberaciones pendientes.
    const candidatas = await this.datos.manager.find(ReservaInventario, {
      where: {
        estado: In([Reserva.ACTIVA, Reserva.LIBERACION_PENDIENTE]),
        pedido: { estado: In([EstadoPedido.PENDIENTE_PAGO, EstadoPedido.EXPIRADO]), expiraEn: LessThanOrEqual(ahora) },
      },
      select: { pedidoId: true },
      order: { pedidoId: 'ASC' },
    });
    for (const { pedidoId } of candidatas) {
      try {
        const establecimientoId = await this.datos.transaction(async (gestor) => {
          // Mismo bloqueo y orden que pagos: ningún cobro nuevo puede adelantarse a esta decisión.
          const pedido = await gestor.findOne(Pedido, { where: { id: pedidoId }, lock: { mode: 'pessimistic_write' } });
          if (!pedido || ![EstadoPedido.PENDIENTE_PAGO, EstadoPedido.EXPIRADO].includes(pedido.estado) ||
              pedido.expiraEn > ahora) return null;
          const pagoInseguro = await gestor.exists(TransaccionPedido, {
            where: { pedidoId, estado: In([Pago.APROBADA, Pago.PENDIENTE, Pago.FALLIDA]) },
          });
          if (pagoInseguro) return null;
          const reserva = await gestor.findOne(ReservaInventario, { where: { pedidoId }, lock: { mode: 'pessimistic_write' } });
          if (!reserva || ![Reserva.ACTIVA, Reserva.LIBERACION_PENDIENTE].includes(reserva.estado)) return null;
          if (pedido.estado === EstadoPedido.PENDIENTE_PAGO) {
            pedido.estado = EstadoPedido.EXPIRADO;
            await gestor.save(Pedido, pedido);
          }
          if (reserva.estado === Reserva.ACTIVA) {
            reserva.estado = Reserva.LIBERACION_PENDIENTE;
            await gestor.save(ReservaInventario, reserva);
          }
          return pedido.establecimientoId;
        });
        if (!establecimientoId) continue;
        // Solo tras commit. Lua devuelve stock una vez, incluso si falló el registro PostgreSQL posterior.
        const resultado = await this.reservas.liberar(establecimientoId, pedidoId);
        if (resultado.estado !== 'LIBERADA') throw new Error('Reserva no liberada');
        await this.datos.manager.update(ReservaInventario,
          { pedidoId, estado: Reserva.LIBERACION_PENDIENTE }, { estado: Reserva.LIBERADA });
      } catch {
        // No revertir EXPIRADO: el próximo ciclo reintenta la liberación pendiente de forma idempotente.
        this.log.error(`EXPIRACION_RESERVA_PENDIENTE pedidoId=${pedidoId}`);
      }
    }
  }
}
