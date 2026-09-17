import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Errores del CU-027, cada uno con el código del camino de la ficha.
 *
 * ## Lo que estos errores NO dicen
 *
 * El atributo de Usabilidad del CU-027 es explícito: *"mensajes de error
 * claros, **sin revelar si el correo existe** (evita filtrar información)"*.
 *
 * Eso descarta el error más obvio de un registro —"ese correo ya está
 * registrado"—, porque cualquiera podría usar el formulario para averiguar
 * quién tiene cuenta probando correos uno a uno. Por eso aquí no hay ningún
 * `CorreoYaRegistrado`: ese caso se resuelve respondiendo lo mismo que un
 * registro correcto. Ver DECISIONES.md §8.
 */

/** La contraseña no cumple la política (paso 2 del CU-027). */
export class ContrasenaDebil extends UnprocessableEntityException {
  constructor(motivo: string) {
    super({ codigo: 'CONTRASENA_DEBIL', mensaje: motivo });
  }
}

/**
 * El rol que el registro necesita no existe en la base.
 *
 * No debería ocurrir nunca —la migración crea los cuatro roles—, pero si
 * alguien los borrara a mano, el paso 4 del CU-027 no podría *"crear la cuenta
 * con el rol correspondiente"*. Es mejor fallar en claro que crear cuentas sin
 * rol, que quedarían sin poder hacer nada y sin explicación.
 */
export class RolNoDisponible extends ConflictException {
  constructor(nombre: string) {
    super({
      codigo: 'ROL_NO_DISPONIBLE',
      mensaje: `El rol ${nombre} no existe en la base; ¿se corrió la migración?`,
    });
  }
}

/**
 * El enlace de verificación o recuperación no sirve.
 *
 * **Un solo error para cuatro situaciones distintas** —no existe, ya se usó,
 * caducó, o es de otro tipo— y es deliberado: distinguirlas le diría a quien
 * prueba enlaces al azar si ha acertado con uno real pero caducado, que es
 * información que no necesita.
 *
 * Quien tiene un enlace legítimo y caducado no se queda atascado: puede pedir
 * uno nuevo.
 */
export class EnlaceNoValido extends UnprocessableEntityException {
  constructor() {
    super({
      codigo: 'ENLACE_NO_VALIDO',
      mensaje: 'Este enlace no es válido o ya caducó. Solicita uno nuevo.',
    });
  }
}

/** No hay ninguna cuenta con ese identificador. */
export class CuentaNoEncontrada extends NotFoundException {
  constructor() {
    super({ codigo: 'CUENTA_NO_ENCONTRADA', mensaje: 'No existe esa cuenta' });
  }
}

/**
 * El correo no existe, la contraseña no coincide, **o la cuenta está
 * bloqueada** por CU-027D. Un solo error para los tres, y es la pieza central
 * de la Usabilidad del CU-027.
 *
 * Si hubiera un error distinto para "ese correo no está registrado", el
 * formulario de login sería un buscador de cuentas: se prueban correos y se lee
 * la respuesta. Por eso el mensaje es el mismo, el código es el mismo y —lo que
 * se olvida más a menudo— **el tiempo de respuesta también**: ver el señuelo de
 * `AutenticacionService`.
 *
 * ## Por qué el bloqueo tampoco se distingue
 *
 * Un "cuenta bloqueada" explícito tiene dos fugas. Si se diera solo a quien
 * acierta la contraseña, el atacante seguiría probando durante el bloqueo y
 * sabría cuándo acertó — el bloqueo no frenaría nada. Si se diera siempre,
 * bastaría con fallar cinco veces con un correo para saber si existe.
 *
 * Por eso el mensaje avisa del bloqueo *en general*, a todos por igual, y el
 * aviso concreto le llega por correo al dueño de la cuenta. Ver
 * DECISIONES.md §12.
 */
export class CredencialesInvalidas extends UnauthorizedException {
  constructor() {
    super({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje:
        'El correo o la contraseña no son correctos. Tras varios intentos fallidos, ' +
        'el acceso se suspende durante unos minutos.',
    });
  }
}

/**
 * La cuenta existe y la contraseña es correcta, pero nadie confirmó el correo.
 *
 * El paso 7 del CU-027 dice que es la verificación la que *"activa la cuenta y
 * **permite el inicio de sesión**"*: sin ella no se entra.
 */
export class CuentaNoVerificada extends ForbiddenException {
  constructor() {
    super({
      codigo: 'CUENTA_NO_VERIFICADA',
      mensaje: 'Todavía no confirmaste tu cuenta. Revisa el correo que te enviamos.',
    });
  }
}

/** CU-027B: *"el usuario no puede iniciar sesión hasta que sea reactivada"*. */
export class CuentaDesactivada extends ForbiddenException {
  constructor() {
    super({
      codigo: 'CUENTA_DESACTIVADA',
      mensaje: 'Esta cuenta está desactivada. Contacta con el administrador.',
    });
  }
}

/** No llegó token, o el que llegó no vale. */
export class SinAutenticar extends UnauthorizedException {
  constructor(motivo = 'Necesitas iniciar sesión para hacer esto') {
    super({ codigo: 'SIN_AUTENTICAR', mensaje: motivo });
  }
}

/**
 * CU-027C: la contraseña actual no coincide al intentar cambiarla.
 *
 * 422 y no 401: quien llama **sí** está autenticado. Un 401 haría creer al
 * cliente que la sesión caducó y lo mandaría a la pantalla de login.
 *
 * Aquí sí se puede ser explícito: la cuenta es la de la sesión, no hay nada que
 * averiguar sobre su existencia.
 */
export class ContrasenaActualIncorrecta extends UnprocessableEntityException {
  constructor() {
    super({ codigo: 'CONTRASENA_ACTUAL_INCORRECTA', mensaje: 'La contraseña actual no es correcta' });
  }
}

/**
 * CU-027D alcanzado **desde dentro de una sesión**, probando la contraseña
 * actual en el cambio de contraseña.
 *
 * A diferencia del login (DECISIONES.md §12), aquí decirlo no filtra nada: quien
 * llama ya está dentro de esa cuenta. Y al bloquear se cierran todas las
 * sesiones, porque el caso típico es un token robado con el que alguien intenta
 * adivinar la contraseña para quedarse con la cuenta.
 */
export class CuentaBloqueadaEnSesion extends HttpException {
  constructor() {
    super(
      {
        codigo: 'CUENTA_BLOQUEADA',
        mensaje:
          'Demasiados intentos fallidos. Por seguridad cerramos tus sesiones; ' +
          'podrás volver a entrar en unos minutos.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** CU-027C: el perfil no permite cambiar el correo. Ver DECISIONES.md §14. */
export class CorreoNoEditable extends UnprocessableEntityException {
  constructor() {
    super({
      codigo: 'CORREO_NO_EDITABLE',
      mensaje: 'El correo no se puede cambiar desde el perfil.',
    });
  }
}

/**
 * El token de renovación no sirve: no es auténtico, la sesión se cerró, caducó
 * por no usarse, o la cuenta ya no está activa. Un solo mensaje: la persona
 * solo necesita saber que tiene que volver a entrar.
 */
export class SesionTerminada extends UnauthorizedException {
  constructor() {
    super({ codigo: 'SESION_TERMINADA', mensaje: 'Tu sesión terminó. Inicia sesión de nuevo.' });
  }
}

/**
 * Se usó un token de renovación **ya gastado**: dos partes tienen copia de la
 * sesión, y una de ellas no debería. Se cierra la sesión entera.
 */
export class SesionCerradaPorSeguridad extends UnauthorizedException {
  constructor() {
    super({
      codigo: 'SESION_CERRADA_POR_SEGURIDAD',
      mensaje:
        'Por seguridad cerramos tu sesión: se intentó usar un acceso que ya había sido renovado. ' +
        'Inicia sesión de nuevo y, si no fuiste tú, cambia tu contraseña.',
    });
  }
}

/**
 * Se pidió renovar sin ningún token (un visitante sin cookie). Distinto de
 * `SesionTerminada` para que el portal sepa si debe avisar: solo tiene sentido
 * decir "tu sesión terminó" a quien tenía una.
 */
export class SinSesionQueRenovar extends UnauthorizedException {
  constructor() {
    super({ codigo: 'SIN_SESION', mensaje: 'No hay ninguna sesión abierta.' });
  }
}
