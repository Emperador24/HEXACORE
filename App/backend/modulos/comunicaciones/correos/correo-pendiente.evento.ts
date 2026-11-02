import { VERSION_CORREO_PENDIENTE } from './topologia';

/** Para qué es el correo. Decide el asunto y el cuerpo que se compone. */
export enum TipoCorreo {
  /** Paso 5 del CU-027: enlace para confirmar la cuenta. */
  VERIFICACION = 'VERIFICACION',
  /** CU-027A: enlace para restablecer la contraseña. */
  RECUPERACION = 'RECUPERACION',
  /**
   * Alguien intentó registrarse con un correo que ya tiene cuenta.
   *
   * Existe por la decisión de no revelar si un correo está registrado
   * (DECISIONES.md §8): hacia fuera el registro responde lo mismo, y es este
   * correo —que solo llega a quien de verdad tiene la cuenta— el que cuenta lo
   * que pasó.
   */
  REGISTRO_DUPLICADO = 'REGISTRO_DUPLICADO',
  /**
   * CU-027D: la cuenta acaba de bloquearse por intentos fallidos.
   *
   * Es la otra mitad de responder lo mismo a un login bloqueado que a uno con
   * la contraseña mal (DECISIONES.md §12): hacia fuera no se nota, y es este
   * correo el que se lo cuenta a la persona legítima.
   */
  CUENTA_BLOQUEADA = 'CUENTA_BLOQUEADA',
  /**
   * La contraseña acaba de cambiar (CU-027A o CU-027C).
   *
   * Es la alarma para el caso malo: si el cambio no lo hizo la persona, este
   * correo es lo único que le avisa de que alguien entró en su cuenta.
   */
  CONTRASENA_CAMBIADA = 'CONTRASENA_CAMBIADA',
}

/**
 * Un correo pendiente de enviar.
 *
 * ## El token viaja aquí dentro
 *
 * Es inevitable: el correo tiene que llevar el enlace, y el enlace lleva el
 * token. Por eso la cola está en modo duradero pero el mensaje **se descarta en
 * cuanto se entrega**, y el token nunca se guarda en la base — solo su hash.
 *
 * Es también la razón de que este evento no se publique en el exchange del
 * CU-006 ni lo consuma nadie más: cuantos menos ojos, mejor.
 */
export interface CorreoPendiente {
  evento: 'CORREO_PENDIENTE';
  version: typeof VERSION_CORREO_PENDIENTE;
  /** Id del evento; sirve para descartar una entrega repetida. */
  id: string;
  ocurridoEn: string;
  tipo: TipoCorreo;
  destinatario: {
    email: string;
    nombre: string;
  };
  /**
   * El token del enlace. Ausente en `REGISTRO_DUPLICADO`, que no lleva enlace:
   * a quien ya tiene cuenta no se le da forma de "verificarla" otra vez.
   */
  token?: string;
}
