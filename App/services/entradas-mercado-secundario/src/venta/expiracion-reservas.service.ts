import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GestorConcurrencia } from '../reventa/concurrencia/gestor-concurrencia.service';
import { CompraService } from './compra.service';

/**
 * Cada minuto por defecto: una reserva vive `COMPRA_RESERVA_MINUTOS` (10), y
 * mientras no se libere ese cupo no se le puede vender a nadie más. En una
 * apertura de venta con la localidad casi agotada, esperar diez minutos más a
 * liberar lo abandonado sería vender menos de lo que hay.
 */
const CRON = process.env.RESERVAS_CRON ?? CronExpression.EVERY_MINUTE;
const TAREA = 'venta-expirar-reservas';
const TTL_TAREA_MS = 50_000;

/**
 * Barrido de reservas vencidas (CU-001B: *"Si el tiempo de compra expira se
 * cancela la reserva y se reinicia el proceso"*).
 *
 * El pago también comprueba el vencimiento por su cuenta, así que el barrido
 * no es lo que impide pagar tarde; es lo que devuelve el cupo a la venta
 * cuando el cliente simplemente se fue.
 *
 * Como el de la reventa, toma un bloqueo de tarea en Redis para que con varias
 * réplicas (ASR-06) solo una barra a la vez.
 */
@Injectable()
export class ExpiracionReservas {
  private readonly log = new Logger(ExpiracionReservas.name);

  constructor(
    private readonly compras: CompraService,
    private readonly concurrencia: GestorConcurrencia,
  ) {}

  @Cron(CRON, { name: TAREA })
  async barrer(): Promise<void> {
    let testigo: string | null;
    try {
      testigo = await this.concurrencia.bloquearTarea(TAREA, TTL_TAREA_MS);
    } catch (error) {
      // Sin Redis no se sabe si otra réplica está barriendo. Se salta este
      // ciclo: el siguiente lo intentará de nuevo.
      this.log.warn(`No se pudo tomar el bloqueo de la tarea: ${error instanceof Error ? error.message : error}`);
      return;
    }
    if (!testigo) return;

    try {
      await this.compras.expirarVencidas();
    } catch (error) {
      this.log.error(`Fallo liberando reservas vencidas: ${error instanceof Error ? error.message : error}`);
    } finally {
      await this.concurrencia.liberarTarea(TAREA, testigo).catch(() => undefined);
    }
  }
}
