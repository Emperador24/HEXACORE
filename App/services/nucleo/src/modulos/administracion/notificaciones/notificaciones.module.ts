import { Module, OnModuleInit } from '@nestjs/common';
import { ConfirmChannel } from 'amqplib';
import { ConexionRabbitMq } from '../../../comun/rabbitmq/conexion-rabbitmq.service';
import { ConsumidorCorreos } from './consumidor-correos.service';
import { PublicadorCorreos } from './publicador-correos.service';
import {
  CLAVE_CORREO_PENDIENTE,
  COLA_CORREOS,
  COLA_CORREOS_DLQ,
  EXCHANGE_CUENTAS,
  EXCHANGE_MUERTOS,
} from './topologia';

/**
 * Envío asíncrono de correos (CU-027: *"cola de mensajes para el envío
 * asíncrono de correos de verificación/recuperación"*).
 *
 * La conexión al broker la pone el Núcleo (`comun/rabbitmq`): aquí solo se
 * registra **esta** topología, separada de la de Pedidos. Comparten broker y
 * nada más: si la cola de correos se atasca, los eventos de pedido siguen
 * saliendo.
 */
@Module({
  providers: [PublicadorCorreos, ConsumidorCorreos],
  exports: [PublicadorCorreos],
})
export class NotificacionesModule implements OnModuleInit {
  constructor(private readonly conexion: ConexionRabbitMq) {}

  /**
   * Se registra antes de que la conexión se abra —Nest ejecuta todos los
   * `onModuleInit` antes del `onApplicationBootstrap` que conecta—, así que la
   * topología queda declarada en el primer canal y en cada reconexión.
   */
  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaCuentas);
  }
}

/** Crea exchanges y colas de cuentas. Idempotente: se llama en cada canal nuevo. */
async function declararTopologiaCuentas(canal: ConfirmChannel): Promise<void> {
  // `durable: true`: un correo de verificación pendiente no puede perderse
  // porque el broker se reiniciara. Quien se registró estaría esperándolo.
  await canal.assertExchange(EXCHANGE_CUENTAS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });

  // La DLQ primero: si la cola de trabajo apuntara a un exchange sin destino,
  // los mensajes rechazados se perderían en vez de quedar guardados.
  await canal.assertQueue(COLA_CORREOS_DLQ, { durable: true });
  await canal.bindQueue(COLA_CORREOS_DLQ, EXCHANGE_MUERTOS, COLA_CORREOS);

  await canal.assertQueue(COLA_CORREOS, {
    durable: true,
    deadLetterExchange: EXCHANGE_MUERTOS,
    deadLetterRoutingKey: COLA_CORREOS,
  });
  await canal.bindQueue(COLA_CORREOS, EXCHANGE_CUENTAS, CLAVE_CORREO_PENDIENTE);
}
