import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { CorreoPendiente, TipoCorreo } from './correo-pendiente.evento';
import { COLA_CORREOS, MAXIMO_INTENTOS, VERSION_CORREO_PENDIENTE } from './topologia';

/** Lo que se le manda al proveedor de notificaciones. */
interface CorreoCompuesto {
  para: string;
  asunto: string;
  texto: string;
}

/**
 * Envía los correos encolados (CU-027 paso 5 y CU-027A).
 *
 * Aquí es donde ocurre de verdad el camino de excepción **CU-027E**: *"el correo
 * de verificación/recuperación no puede enviarse por falla del proveedor de
 * notificaciones; el sistema reintenta y notifica al usuario si el error
 * persiste"*.
 *
 * ## Qué se reintenta y qué no
 *
 * - **5xx del proveedor** (está caído, sobrecargado): fallo pasajero. Se
 *   reintenta hasta `MAXIMO_INTENTOS`.
 * - **4xx** (la dirección no existe, el mensaje es inválido): reintentar no lo
 *   va a arreglar. Va directo a la cola de muertos, donde alguien puede verlo.
 *
 * La distinción importa: sin ella, una dirección inexistente rebotaría para
 * siempre y taparía a los correos que sí pueden salir.
 */
@Injectable()
export class ConsumidorCorreos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ConsumidorCorreos.name);

  /** Eventos ya enviados, para no mandar el mismo correo dos veces. */
  private readonly procesados = new Set<string>();
  /** Intentos por evento. RabbitMQ no cuenta los de un `nack(requeue)`. */
  private readonly intentos = new Map<string, number>();

  private etiquetaConsumidor: string | null = null;
  private cerrando = false;
  private readonly urlProveedor: string;
  private readonly urlBase: string;
  private readonly bloqueoMinutos: number;

  constructor(
    private readonly conexion: ConexionRabbitMq,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.urlProveedor = config.correo.urlProveedor;
    this.urlBase = config.correo.urlBaseEnlaces;
    this.bloqueoMinutos = config.seguridad.bloqueoMinutos;
  }

  async onApplicationBootstrap(): Promise<void> {
    // Se registra para resuscribirse en cada reconexión: un canal nuevo no
    // conserva las suscripciones del anterior, y sin esto el servicio quedaría
    // conectado pero sin consumir nada.
    this.conexion.registrarAlReconectar(() => this.suscribir());
    await this.suscribir();
  }

  private async suscribir(): Promise<void> {
    if (this.cerrando) return;
    const canal = this.conexion.obtenerCanal();
    if (!canal) {
      const reintento = setTimeout(() => void this.suscribir(), 5000);
      reintento.unref();
      return;
    }

    await canal.prefetch(1);
    this.etiquetaConsumidor = null;

    const { consumerTag } = await canal.consume(COLA_CORREOS, (mensaje) => {
      if (mensaje) {
        this.recibir(mensaje).catch((error: unknown) => {
          this.log.error(
            `Fallo no controlado enviando un correo: ${error instanceof Error ? error.message : error}`,
          );
        });
      }
    });
    this.etiquetaConsumidor = consumerTag;
    this.log.log(`Escuchando ${COLA_CORREOS}`);
  }

  private async recibir(mensaje: ConsumeMessage): Promise<void> {
    let evento: CorreoPendiente;
    try {
      evento = JSON.parse(mensaje.content.toString()) as CorreoPendiente;
    } catch {
      this.log.error('Mensaje de correo ilegible; va a la DLQ');
      return this.cerrar(mensaje, 'dlq');
    }

    if (evento.version !== VERSION_CORREO_PENDIENTE) {
      this.log.error(`Versión ${evento.version} desconocida; va a la DLQ`);
      return this.cerrar(mensaje, 'dlq');
    }

    if (this.procesados.has(evento.id)) {
      this.log.warn(`Correo ${evento.tipo} repetido para ${evento.destinatario.email}; se descarta`);
      return this.cerrar(mensaje, 'ack');
    }

    try {
      await this.enviar(this.componer(evento));
      this.procesados.add(evento.id);
      this.intentos.delete(evento.id);
      this.log.log(`Correo ${evento.tipo} entregado a ${evento.destinatario.email}`);
      this.cerrar(mensaje, 'ack');
    } catch (error) {
      this.manejarFallo(mensaje, evento, error);
    }
  }

  /**
   * Decide qué hacer con un envío fallido.
   *
   * Es la implementación de CU-027E: distinguir el fallo del que se puede
   * volver del que no.
   */
  private manejarFallo(mensaje: ConsumeMessage, evento: CorreoPendiente, error: unknown): void {
    const permanente = error instanceof ErrorPermanenteDeCorreo;
    const causa = error instanceof Error ? error.message : String(error);

    if (permanente) {
      this.log.error(
        `Correo ${evento.tipo} para ${evento.destinatario.email} rechazado de forma definitiva ` +
          `(${causa}); va a la DLQ sin reintentar`,
      );
      this.intentos.delete(evento.id);
      return this.cerrar(mensaje, 'dlq');
    }

    const fallos = (this.intentos.get(evento.id) ?? 0) + 1;
    this.intentos.set(evento.id, fallos);

    if (fallos >= MAXIMO_INTENTOS) {
      this.log.error(
        `Correo ${evento.tipo} para ${evento.destinatario.email} falló ${fallos} veces (${causa}); ` +
          'va a la DLQ',
      );
      this.intentos.delete(evento.id);
      return this.cerrar(mensaje, 'dlq');
    }

    this.log.warn(
      `Correo ${evento.tipo} para ${evento.destinatario.email} falló (${causa}); ` +
        `intento ${fallos} de ${MAXIMO_INTENTOS}`,
    );
    this.cerrar(mensaje, 'reintentar');
  }

  /** Compone asunto y cuerpo según el tipo. */
  private componer(evento: CorreoPendiente): CorreoCompuesto {
    const { email, nombre } = evento.destinatario;

    if (evento.tipo === TipoCorreo.VERIFICACION) {
      return {
        para: email,
        asunto: 'Verifica tu cuenta de HEXACORE',
        texto:
          `Hola ${nombre}:\n\n` +
          'Para activar tu cuenta, abre este enlace:\n\n' +
          `${this.urlBase}/verificar?token=${evento.token}\n\n` +
          'Si no te registraste en HEXACORE, puedes ignorar este mensaje.',
      };
    }

    if (evento.tipo === TipoCorreo.RECUPERACION) {
      return {
        para: email,
        asunto: 'Restablece tu contraseña de HEXACORE',
        texto:
          `Hola ${nombre}:\n\n` +
          'Para elegir una contraseña nueva, abre este enlace:\n\n' +
          `${this.urlBase}/restablecer?token=${evento.token}\n\n` +
          'El enlace caduca pronto y solo puede usarse una vez.\n' +
          'Si no pediste cambiarla, ignora este mensaje: tu contraseña sigue siendo la misma.',
      };
    }

    if (evento.tipo === TipoCorreo.CUENTA_BLOQUEADA) {
      // Sin enlace, por lo mismo que el de registro duplicado: lo provoca un
      // desconocido, y no debe poder desencadenar nada sobre la cuenta.
      return {
        para: email,
        asunto: 'Bloqueamos temporalmente el acceso a tu cuenta de HEXACORE',
        texto:
          `Hola ${nombre}:\n\n` +
          'Hubo varios intentos fallidos de iniciar sesión en tu cuenta, así que ' +
          `bloqueamos el acceso durante ${this.bloqueoMinutos} minutos.\n` +
          'Mientras dure el bloqueo no se aceptará ninguna contraseña, tampoco la correcta.\n\n' +
          'Si fuiste tú, espera y vuelve a intentarlo, o restablece tu contraseña si no la ' +
          'recuerdas.\nSi no fuiste tú, alguien está probando contraseñas: te recomendamos ' +
          'cambiar la tuya cuando se levante el bloqueo.',
      };
    }

    if (evento.tipo === TipoCorreo.CONTRASENA_CAMBIADA) {
      return {
        para: email,
        asunto: 'Tu contraseña de HEXACORE ha cambiado',
        texto:
          `Hola ${nombre}:\n\n` +
          'La contraseña de tu cuenta acaba de cambiar, y cerramos las sesiones que tenías ' +
          'abiertas en otros dispositivos.\n\n' +
          'Si fuiste tú, no tienes que hacer nada.\n' +
          'Si no fuiste tú, alguien tiene acceso a tu cuenta: pide restablecer la contraseña ' +
          'desde la pantalla de inicio de sesión y revisa también la seguridad de este correo.',
      };
    }

    // REGISTRO_DUPLICADO. Es el correo que sostiene la decisión de no revelar
    // si una dirección está registrada: hacia fuera el registro responde lo
    // mismo, y solo quien de verdad tiene la cuenta se entera de lo ocurrido.
    //
    // No lleva enlace a propósito: quien ya tiene cuenta no necesita
    // "verificarla" otra vez, y ofrecer un enlace aquí sería darle a un
    // desconocido una forma de provocar acciones sobre una cuenta ajena.
    return {
      para: email,
      asunto: 'Alguien intentó registrarse con tu correo en HEXACORE',
      texto:
        `Hola ${nombre}:\n\n` +
        'Alguien intentó crear una cuenta con esta dirección, que ya tiene una.\n' +
        'No hemos hecho ningún cambio.\n\n' +
        'Si fuiste tú, puedes iniciar sesión con tu contraseña de siempre, o pedir ' +
        'restablecerla si no la recuerdas.',
    };
  }

  /** Llama al proveedor de notificaciones. */
  private async enviar(correo: CorreoCompuesto): Promise<void> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.urlProveedor}/correos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correo),
        // Sin timeout, un proveedor que no responde dejaría el consumidor
        // bloqueado con `prefetch(1)`: ningún otro correo saldría.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // Red caída o timeout: pasajero por definición, se reintenta.
      throw new Error(`no hubo respuesta del proveedor (${error instanceof Error ? error.name : 'error'})`);
    }

    if (respuesta.ok) return;

    // 4xx: el proveedor entendió y rechazó. Reintentar no cambiará nada.
    if (respuesta.status >= 400 && respuesta.status < 500) {
      throw new ErrorPermanenteDeCorreo(`el proveedor rechazó el envío (${respuesta.status})`);
    }
    // 5xx: el proveedor está mal ahora mismo.
    throw new Error(`el proveedor respondió ${respuesta.status}`);
  }

  /** Confirma o rechaza el mensaje, tolerando que el canal haya muerto. */
  private cerrar(mensaje: ConsumeMessage, accion: 'ack' | 'dlq' | 'reintentar'): void {
    const canal = this.conexion.obtenerCanal();
    if (!canal) {
      this.log.warn('Canal caído al cerrar un correo; se reentregará');
      return;
    }
    try {
      if (accion === 'ack') canal.ack(mensaje);
      else canal.nack(mensaje, false, accion === 'reintentar');
    } catch (error) {
      this.log.warn(`No se pudo ${accion} un correo: ${error instanceof Error ? error.message : error}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.cerrando = true;
    const canal = this.conexion.obtenerCanal();
    if (canal && this.etiquetaConsumidor) {
      try {
        await canal.cancel(this.etiquetaConsumidor);
      } catch {
        // El canal ya puede estar cerrado; no hay nada que rescatar.
      }
    }
  }
}

/** Fallo del que no se vuelve: la dirección no existe, el mensaje es inválido. */
class ErrorPermanenteDeCorreo extends Error {}
