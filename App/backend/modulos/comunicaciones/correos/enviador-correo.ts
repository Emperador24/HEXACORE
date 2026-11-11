import { createTransport, Transporter } from 'nodemailer';
import type { ConfiguracionServicio } from '../config/configuracion';

/** Lo que se le manda al proveedor de notificaciones. */
export interface CorreoCompuesto {
  para: string;
  asunto: string;
  texto: string;
}

/**
 * El proveedor de correo, detrás de un solo método (RNF-16): cambiar de
 * proveedor es escribir otra implementación, sin tocar el consumidor.
 *
 * Quien implementa decide qué fallo es definitivo: lanza
 * `ErrorPermanenteDeCorreo` cuando reintentar no lo va a arreglar (dirección
 * inexistente, mensaje rechazado) y cualquier otro error cuando sí podría.
 */
export interface EnviadorCorreo {
  readonly descripcion: string;
  enviar(correo: CorreoCompuesto): Promise<void>;
}

/** Fallo del que no se vuelve: la dirección no existe, el mensaje es inválido. */
export class ErrorPermanenteDeCorreo extends Error {}

/**
 * Proveedor simulado (`App/infra/correo-simulado`): guarda los correos y los
 * muestra en `/correos`, de donde las pruebas sacan el enlace de verificación.
 */
export class EnviadorHttp implements EnviadorCorreo {
  readonly descripcion: string;

  constructor(private readonly url: string) {
    this.descripcion = `simulado en ${url}`;
  }

  async enviar(correo: CorreoCompuesto): Promise<void> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.url}/correos`, {
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
}

/**
 * Correo real por SMTP. Pensado para Gmail con una contraseña de aplicación,
 * pero vale para cualquier servidor SMTP (Brevo, Outlook…).
 *
 * Las respuestas SMTP se clasifican por su código: 5xx es definitivo (p. ej.
 * 550, el buzón no existe) y 4xx es pasajero (p. ej. 421, el servidor está
 * ocupado). Un fallo de autenticación no es culpa del correo sino de la
 * configuración: se reintenta, para que al corregir la contraseña los correos
 * que estaban en cola salgan, y se avisa con un mensaje que dice qué revisar.
 */
export class EnviadorSmtp implements EnviadorCorreo {
  readonly descripcion: string;
  private readonly transporte: Transporter;

  constructor(
    private readonly smtp: ConfiguracionServicio['correo']['smtp'],
    transporte?: Transporter,
  ) {
    this.descripcion = `SMTP ${smtp.host}:${smtp.puerto} como ${smtp.remitente}`;
    this.transporte =
      transporte ??
      createTransport({
        host: smtp.host,
        port: smtp.puerto,
        secure: smtp.seguro,
        auth: { user: smtp.usuario, pass: smtp.contrasena },
        // Mismo motivo que el timeout del simulado: con `prefetch(1)`, un
        // servidor colgado detendría todos los correos.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
  }

  async enviar(correo: CorreoCompuesto): Promise<void> {
    try {
      await this.transporte.sendMail({
        from: conNombre(this.smtp.remitente),
        to: correo.para,
        subject: correo.asunto,
        text: correo.texto,
      });
    } catch (error) {
      const e = error as { code?: string; responseCode?: number; message?: string };
      if (e.code === 'EAUTH') {
        throw new Error(
          'el servidor SMTP rechazó el usuario o la contraseña. En Gmail hace falta una ' +
            'contraseña de aplicación en SMTP_CONTRASENA, no la contraseña de la cuenta',
        );
      }
      if (typeof e.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600) {
        throw new ErrorPermanenteDeCorreo(`el servidor SMTP rechazó el envío (${e.responseCode})`);
      }
      throw new Error(`no se pudo entregar por SMTP (${e.code ?? e.responseCode ?? e.message ?? 'error'})`);
    }
  }
}

/** Nombre visible del remitente: los correos llegan como "HEXACORE <cuenta@gmail.com>". */
function conNombre(direccion: string): { name: string; address: string } {
  return { name: 'HEXACORE', address: direccion };
}

export function crearEnviador(correo: ConfiguracionServicio['correo']): EnviadorCorreo {
  return correo.proveedor === 'smtp' ? new EnviadorSmtp(correo.smtp) : new EnviadorHttp(correo.urlProveedor);
}
