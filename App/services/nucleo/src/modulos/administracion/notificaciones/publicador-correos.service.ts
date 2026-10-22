import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { CorreoPendiente, TipoCorreo } from './correo-pendiente.evento';
import {
  CLAVE_CORREO_PENDIENTE,
  EVENTO_CORREO_PENDIENTE,
  EXCHANGE_CUENTAS,
  VERSION_CORREO_PENDIENTE,
} from './topologia';

/**
 * Encola un correo para que lo envíe el proceso de notificaciones.
 *
 * Es el paso 5 del CU-027 (*"envía un correo de verificación de cuenta"*), pero
 * visto desde el lado del registro: aquí solo se deja el encargo. Quién lo
 * entrega, cuándo y con cuántos reintentos es asunto del consumidor.
 */
@Injectable()
export class PublicadorCorreos {
  private readonly log = new Logger(PublicadorCorreos.name);

  constructor(private readonly conexion: ConexionRabbitMq) {}

  /**
   * Encola un correo. **Nunca lanza.**
   *
   * Si el broker no está, lo registra y devuelve `false`. La razón es la misma
   * que en el CU-006: para cuando se llama a este método, la cuenta ya está
   * creada en la base. Hacer fallar el registro porque un correo no se pudo
   * encolar sería decirle a alguien que su alta no funcionó cuando sí lo hizo.
   *
   * Lo que se pierde en ese caso es el correo de verificación, no la cuenta.
   * Queda anotado como límite conocido en DECISIONES.md §10.
   */
  async encolar(
    tipo: TipoCorreo,
    destinatario: { email: string; nombre: string },
    token?: string,
  ): Promise<boolean> {
    const canal = this.conexion.obtenerCanal();

    if (!canal) {
      this.log.error(
        `RabbitMQ no disponible: no se encoló el correo ${tipo} para ${destinatario.email}. ` +
          'La cuenta SÍ quedó creada; falta el correo.',
      );
      return false;
    }

    const evento: CorreoPendiente = {
      evento: EVENTO_CORREO_PENDIENTE,
      version: VERSION_CORREO_PENDIENTE,
      id: randomUUID(),
      ocurridoEn: new Date().toISOString(),
      tipo,
      destinatario,
      token,
    };

    try {
      const confirmado = await new Promise<boolean>((resolve) => {
        canal.publish(
          EXCHANGE_CUENTAS,
          CLAVE_CORREO_PENDIENTE,
          Buffer.from(JSON.stringify(evento)),
          {
            // Persistente: quien acaba de registrarse está esperando este
            // correo, y perderlo por un reinicio del broker lo dejaría con una
            // cuenta que no puede usar y sin saber por qué.
            persistent: true,
            contentType: 'application/json',
            messageId: evento.id,
            type: evento.evento,
            timestamp: Date.now(),
          },
          (error) => resolve(!error),
        );
      });

      if (!confirmado) {
        this.log.error(`El broker no confirmó el correo ${tipo} para ${destinatario.email}`);
        return false;
      }

      // Se registra el tipo y el destinatario, nunca el token: el log suele
      // acabar en sitios menos protegidos que la base, y un token en el log es
      // un enlace de acceso a la cuenta en el log.
      this.log.log(`Correo ${tipo} encolado para ${destinatario.email}`);
      return true;
    } catch (error) {
      this.log.error(
        `Fallo al encolar el correo ${tipo} para ${destinatario.email}: ` +
          `${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}
