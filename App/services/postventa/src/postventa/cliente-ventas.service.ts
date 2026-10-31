import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

/**
 * Marca "esta llamada no viene de nadie".
 *
 * No es un token: es el valor que `comoServicio()` devuelve para que `enviar`
 * mande la cabecera de servicio en vez de un `Authorization` de usuario. Se
 * hace así, y no con un parámetro aparte, para que los seis métodos del cliente
 * sigan teniendo la misma firma.
 */
const SIN_USUARIO = '\u0000servicio';

/**
 * Estados de entrada que Ventas reporta.
 *
 * Es una copia **del contrato**, no de la tabla: Postventa necesita entender
 * lo que Ventas le contesta, y para eso le hacen falta los nombres. El dueño
 * del estado sigue siendo Ventas; aquí nadie lo escribe.
 */
export enum EstadoEntrada {
  VALIDA = 'VALIDA',
  EN_REVENTA = 'EN_REVENTA',
  USADA = 'USADA',
  ANULADA = 'ANULADA',
}

/** Por qué Ventas no retuvo la entrada. Cada uno es un camino del CU-006. */
export enum MotivoNoRevendible {
  NO_EXISTE = 'NO_EXISTE',
  /** Pre-condición 1: es de otra persona. */
  NO_ES_SUYA = 'NO_ES_SUYA',
  /** Pre-condición 2 y camino CU-006E: usada, anulada o ya publicada. */
  ESTADO = 'ESTADO',
  /** Ventas no contestó. No se escribió nada, pero tampoco se sabe nada. */
  SIN_RESPUESTA = 'SIN_RESPUESTA',
}

export type ResultadoEnReventa =
  | { marcada: true; entrada: EntradaEnReventa }
  | { marcada: false; motivo: MotivoNoRevendible; estado?: string };

/** Lo que Postventa copia en la publicación. Lo devuelve Ventas al marcar la entrada. */
export interface EntradaEnReventa {
  entradaId: string;
  eventoId: string;
  numeroTicket: string;
  localidadNombre: string;
  precioOriginal: number;
}

/** Una entrada de la persona, con su estado actual (paso 1 del CU-006). */
export interface EntradaPropia extends EntradaEnReventa {
  estado: EstadoEntrada;
}

export interface Transferencia {
  transferida: boolean;
  qrAnterior: string | null;
  /** `false` si no hubo respuesta: no se sabe si se transfirió o no. */
  respondio: boolean;
}

/**
 * Cliente de la API interna de Ventas.
 *
 * `Entrada` y `HistorialPropietario` son de Ventas desde ADR-14. Postventa
 * orquesta la reventa, pero no toca esas tablas: las pide.
 *
 * Los timeouts son más largos que en Acceso QR a propósito. Allí hay una
 * persona delante de un lector y la espera se nota; aquí el comprador ya está
 * en una pantalla de "procesando", y cortar pronto una transferencia con el
 * pago hecho sería peor que esperar.
 */
@Injectable()
export class ClienteVentas {
  private readonly log = new Logger(ClienteVentas.name);
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly tokenServicios: string;

  constructor(@Inject(CONFIGURACION) config: ConfiguracionServicio) {
    this.url = config.ventas.url.replace(/\/$/, '');
    this.timeoutMs = config.ventas.timeoutMs;
    this.tokenServicios = config.tokenServicios;
  }

  /**
   * Credencial propia de Postventa, para cuando no hay usuario que reenviar.
   *
   * La usa el trabajo de expiración (CU-006D), que corre por reloj: cierra las
   * publicaciones vencidas y libera sus entradas sin que nadie haya pedido
   * nada. Ver `llamada-interna.guard.ts` en Ventas.
   */
  comoServicio(): string {
    return SIN_USUARIO;
  }

  /**
   * Las entradas de la persona (paso 1 del CU-006).
   *
   * Devuelve `null` si Ventas no responde. Quien llama debe decirlo, no
   * mostrar una lista vacía: "no tienes entradas" y "no pude preguntarlo" son
   * cosas distintas, y confundirlas hace que alguien crea que perdió su
   * entrada.
   */
  async entradasDe(propietarioId: string, tokenSesion: string): Promise<EntradaPropia[] | null> {
    const r = await this.enviar<{ entradas?: EntradaPropia[] }>(
      `/interno/entradas/de/${propietarioId}`,
      tokenSesion,
      undefined,
    );
    return Array.isArray(r?.entradas) ? r.entradas : null;
  }

  /**
   * Pone la entrada EN_REVENTA y trae lo que hay que copiar en la publicación.
   *
   * Cuando Ventas la rechaza devuelve **por qué**, no solo que no pudo: el
   * CU-006 tiene un camino distinto para "no es tuya" (pre-condición 1) y para
   * "no está en un estado revendible" (CU-006E), y el vendedor tiene que ver
   * cuál de los dos le aplica.
   *
   * En ninguno de los dos casos se escribió nada, así que no hay nada que
   * compensar. Si Ventas no responde, el motivo es `SIN_RESPUESTA`.
   */
  async marcarEnReventa(
    entradaId: string,
    propietarioId: string,
    tokenSesion: string,
  ): Promise<ResultadoEnReventa> {
    const r = await this.enviarConEstado<EntradaEnReventa & { estado?: string; codigo?: string }>(
      '/interno/entradas/marcar-en-reventa',
      tokenSesion,
      { entradaId, propietarioId },
    );
    if (r.cuerpo && typeof r.cuerpo.eventoId === 'string') {
      return { marcada: true, entrada: r.cuerpo };
    }
    return { marcada: false, motivo: this.motivoDe(r), estado: r.cuerpo?.estado };
  }

  /** Traduce la respuesta de Ventas al motivo que Postventa entiende. */
  private motivoDe(r: { estadoHttp: number | null; cuerpo: { codigo?: string } | null }): MotivoNoRevendible {
    if (r.estadoHttp === null) return MotivoNoRevendible.SIN_RESPUESTA;
    if (r.cuerpo?.codigo === 'NO_ES_PROPIETARIO') return MotivoNoRevendible.NO_ES_SUYA;
    if (r.cuerpo?.codigo === 'ENTRADA_NO_ENCONTRADA') return MotivoNoRevendible.NO_EXISTE;
    return MotivoNoRevendible.ESTADO;
  }

  /**
   * Devuelve la entrada a su dueño: retiro, expiración o compensación.
   *
   * Si falla se registra fuerte y no se reintenta aquí: la entrada queda
   * bloqueada en `EN_REVENTA` sin publicación, que es un estado recuperable —
   * nadie puede comprarla— pero que hay que arreglar.
   */
  async devolverDeReventa(entradaId: string, tokenSesion: string): Promise<boolean> {
    const r = await this.enviar<{ devuelta?: boolean }>('/interno/entradas/devolver-de-reventa', tokenSesion, { entradaId });
    if (r?.devuelta !== true) {
      this.log.error(
        `No se pudo devolver la entrada ${entradaId} de la reventa. ` +
          'Queda EN_REVENTA sin publicación: nadie puede comprarla, pero su dueño tampoco usarla.',
      );
      return false;
    }
    return true;
  }

  /**
   * Transfiere la entrada al comprador. Ventas hace el cambio de dueño, el QR
   * nuevo y el historial en una sola transacción suya.
   *
   * Distingue "no se transfirió" de "no respondió": lo segundo no permite
   * concluir nada, y quien llama tiene que tratarlo como cobrado-sin-saber.
   */
  async transferir(datos: {
    entradaId: string;
    compradorId: string;
    vendedorId: string;
    transaccionId: string;
    codigoQrNuevo: string;
  }, tokenSesion: string): Promise<Transferencia> {
    const r = await this.enviar<{ transferida?: boolean; qrAnterior?: string | null }>(
      '/interno/entradas/transferir',
      tokenSesion,
      datos,
    );
    if (r === null) return { transferida: false, qrAnterior: null, respondio: false };
    return {
      transferida: r.transferida === true,
      qrAnterior: typeof r.qrAnterior === 'string' ? r.qrAnterior : null,
      respondio: true,
    };
  }

  /**
   * Una llamada a Ventas. `null` si no hubo respuesta, que no es lo mismo que
   * una respuesta negativa. Sin cuerpo es un GET: consultar no cambia nada, y
   * así un reintento de la consulta es gratis.
   */
  private async enviar<T>(ruta: string, tokenSesion: string, cuerpo?: object): Promise<T | null> {
    const r = await this.enviarConEstado<T>(ruta, tokenSesion, cuerpo);
    return r.estadoHttp !== null && r.estadoHttp < 400 ? r.cuerpo : null;
  }

  /**
   * Como `enviar`, pero devolviendo también el código HTTP y el cuerpo de
   * error. Lo necesita `marcarEnReventa`: tiene que distinguir un rechazo
   * razonado —que trae un código— de un silencio, que no trae nada.
   */
  private async enviarConEstado<T>(
    ruta: string,
    tokenSesion: string,
    cuerpo?: object,
  ): Promise<{ estadoHttp: number | null; cuerpo: T | null }> {
    try {
      const respuesta = await fetch(`${this.url}${ruta}`, {
        method: cuerpo === undefined ? 'GET' : 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
        headers: {
          ...(tokenSesion === SIN_USUARIO
            ? { 'X-Token-Servicio': this.tokenServicios }
            : { Authorization: `Bearer ${tokenSesion}` }),
          ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const leido = await respuesta.text();
      return {
        estadoHttp: respuesta.status,
        cuerpo: leido ? (JSON.parse(leido) as T) : null,
      };
    } catch {
      // Ni código ni cuerpo: no hubo respuesta. Es lo que `respondio: false`
      // y `SIN_RESPUESTA` significan, y no es lo mismo que una negativa.
      return { estadoHttp: null, cuerpo: null };
    }
  }
}
