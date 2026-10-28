import { Module, OnModuleInit } from '@nestjs/common';
import { ConfirmChannel } from 'amqplib';
import { ConexionRabbitMq } from '../comun/rabbitmq/conexion-rabbitmq.service';
import { ConsumidorCorreos } from './consumidor-correos.service';
import {
  CLAVE_CORREO_PENDIENTE,
  COLA_CORREOS,
  COLA_CORREOS_DLQ,
  EXCHANGE_CUENTAS,
  EXCHANGE_MUERTOS,
} from './topologia';

/**
 * Envío asíncrono de correos.
 *
 * Aquí vive **solo el consumidor**. El publicador se quedó en Autenticación,
 * que es quien tiene algo que anunciar: este servicio no sabe de cuentas ni de
 * sesiones, solo de mensajes que llegan por la cola. Esa frontera es la que
 * permite que el proveedor de correo se cuelgue sin tocar el registro ni el
 * login (criterio 4 de ADR-14).
 *
 * Declara la topología igual que antes: es idempotente y se vuelve a aplicar
 * en cada reconexión. Que la declaren los dos lados no es un problema —
 * `assertExchange`/`assertQueue` con los mismos parámetros no chocan— y hace
 * que cada servicio pueda arrancar sin esperar al otro (RNF-18).
 */
@Module({
  providers: [ConsumidorCorreos],
})
export class NotificacionesModule implements OnModuleInit {
  constructor(private readonly conexion: ConexionRabbitMq) {}

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
