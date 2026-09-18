import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Errores del CU-006, cada uno con el código del camino de la ficha.
 *
 * El `codigo` que viaja en la respuesta no es decorativo: es lo que permite
 * mirar una respuesta 409 y saber que corresponde al camino de excepción
 * CU-006F sin adivinar por el texto. Sirve para tres cosas a la vez — que el
 * cliente decida qué mensaje mostrar sin parsear castellano, que las pruebas
 * afirmen sobre el camino y no sobre la redacción, y que la trazabilidad
 * código ↔ caso de uso se vea desde fuera del código.
 *
 * Elección de códigos HTTP:
 * - **404** la entrada o la publicación no existe.
 * - **403** existe, pero no es de quien pregunta (pre-condición 1).
 * - **409** el estado del mundo impide la operación (entrada usada, evento sin
 *   reventa, publicación ya cerrada). Es un conflicto, no un error de formato:
 *   la misma petición sería válida en otro momento o sobre otra entrada.
 * - **422** la petición está bien formada pero su contenido viola una regla de
 *   negocio — hoy solo el tope de precio.
 */

export class EntradaNoEncontrada extends NotFoundException {
  constructor(entradaId: string) {
    super({ codigo: 'ENTRADA_NO_ENCONTRADA', mensaje: `No existe la entrada ${entradaId}` });
  }
}

export class PublicacionNoEncontrada extends NotFoundException {
  constructor(publicacionId: string) {
    super({ codigo: 'PUBLICACION_NO_ENCONTRADA', mensaje: `No existe la publicación ${publicacionId}` });
  }
}

/** Pre-condición 1: *"El vendedor debe ser propietario válido de la entrada"*. */
export class NoEsPropietario extends ForbiddenException {
  constructor() {
    super({
      codigo: 'NO_ES_PROPIETARIO',
      mensaje: 'Solo el propietario de la entrada puede realizar esta operación',
    });
  }
}

/** Camino de excepción **CU-006E**: *"La entrada ya fue utilizada o invalidada"*. */
export class EntradaNoRevendible extends ConflictException {
  constructor(estado: string) {
    super({
      codigo: 'CU-006E',
      mensaje: `La entrada está en estado ${estado} y no puede revenderse`,
      estado,
    });
  }
}

/** La entrada ya tiene una publicación activa. Es el caso que el índice único parcial respalda en la BD. */
export class EntradaYaPublicada extends ConflictException {
  constructor() {
    super({
      codigo: 'ENTRADA_YA_PUBLICADA',
      mensaje: 'La entrada ya está publicada en el mercado secundario',
    });
  }
}

/** Camino de excepción **CU-006F**: *"El evento no permite reventa"*. */
export class EventoSinReventa extends ConflictException {
  constructor() {
    super({
      codigo: 'CU-006F',
      mensaje: 'El evento no permite la reventa de sus entradas',
    });
  }
}

/**
 * Flujo alterno **CU-006D**: la ventana de reventa ya se cerró.
 *
 * Al publicar es un rechazo inmediato; sobre una publicación existente es lo
 * que la hace expirar (paso 8 de la implementación).
 */
export class VentanaReventaCerrada extends ConflictException {
  constructor(fechaExpiracion: Date) {
    super({
      codigo: 'CU-006D',
      mensaje: 'La ventana de reventa de este evento ya se cerró',
      fechaExpiracion: fechaExpiracion.toISOString(),
    });
  }
}

/** La publicación ya no está ACTIVA: se vendió, se retiró o expiró. */
export class PublicacionNoActiva extends ConflictException {
  constructor(estado: string) {
    super({
      codigo: 'PUBLICACION_NO_ACTIVA',
      mensaje: `La publicación está ${estado} y ya no admite cambios`,
      estado,
    });
  }
}

/**
 * Tope de precio de reventa.
 *
 * No es un requisito del SAD sino una decisión de producto de este servicio
 * (DECISIONES.md §1), y por eso el mensaje dice el tope concreto: el cliente
 * necesita poder explicárselo al vendedor, y el vendedor merece saber cuánto
 * puede pedir en vez de ir probando.
 */
export class PrecioSobreTope extends UnprocessableEntityException {
  constructor(precio: number, precioOriginal: number, factor: number) {
    const maximo = Math.floor(precioOriginal * factor);
    super({
      codigo: 'PRECIO_SOBRE_TOPE',
      mensaje: `El precio ${precio} supera el máximo de ${maximo} (${factor}× el precio original de ${precioOriginal})`,
      precioMaximo: maximo,
      precioOriginal,
      factor,
    });
  }
}

/**
 * Camino de excepción **CU-006H**: *"La entrada es solicitada por dos
 * compradores de forma simultánea"*.
 *
 * Es el rechazo que ASR-01 exige que llegue *"de inmediato"*: el segundo
 * comprador no hace cola, se le dice ya que no está disponible.
 */
export class PublicacionEnCheckout extends ConflictException {
  constructor() {
    super({
      codigo: 'CU-006H',
      mensaje: 'Otra persona está comprando esta entrada en este momento. Inténtalo en un par de minutos.',
    });
  }
}

/** Nadie puede comprarse su propia entrada. */
export class NoPuedeComprarSuPropiaEntrada extends ConflictException {
  constructor() {
    super({
      codigo: 'VENDEDOR_ES_COMPRADOR',
      mensaje: 'No puedes comprar una entrada que tú mismo publicaste',
    });
  }
}

/** El checkout no existe, o no es de quien pregunta. */
export class CheckoutNoEncontrado extends NotFoundException {
  constructor(checkoutId: string) {
    super({ codigo: 'CHECKOUT_NO_ENCONTRADO', mensaje: `No existe el checkout ${checkoutId}` });
  }
}

/**
 * El checkout ya se resolvió (se pagó, se rechazó o se canceló) o su reserva
 * caducó. En cualquier caso ya no admite acciones.
 */
export class CheckoutNoVigente extends ConflictException {
  constructor(estado: string, motivo: string) {
    super({ codigo: 'CHECKOUT_NO_VIGENTE', mensaje: motivo, estado });
  }
}

/** Camino de excepción **CU-006G**: *"El pago es rechazado por la pasarela"*. */
export class PagoRechazado extends ConflictException {
  constructor(motivo: string) {
    super({
      codigo: 'CU-006G',
      mensaje: `El pago fue rechazado: ${motivo}`,
      motivo,
    });
  }
}

/**
 * Camino de excepción **CU-006I**: *"Falla la comunicación con la pasarela de
 * pagos"*.
 *
 * Se responde **503** y no 409: no es un conflicto con el estado del sistema,
 * es que un servicio del que dependemos no contestó — y un 503 invita a
 * reintentar, que es exactamente lo correcto aquí porque el cobro es
 * idempotente. Además, el mensaje evita
 * prometer que no se cobró, porque **no se sabe**: decirle al comprador "no se
 * cobró" y que luego aparezca el cargo sería peor que admitir la
 * incertidumbre.
 */
export class PagoIndeterminado extends ServiceUnavailableException {
  constructor(numeroTransaccion: string) {
    super({
      codigo: 'CU-006I',
      mensaje:
        'No pudimos confirmar el pago con la pasarela. Revisa tu medio de pago antes de reintentar; ' +
        `si aparece el cargo, cita la referencia ${numeroTransaccion}.`,
      numeroTransaccion,
      requiereConciliacion: true,
    });
  }
}

/**
 * Se cobró, pero otro comprador completó la transferencia primero.
 *
 * Es la red que queda cuando dos pagos entran simultáneamente y ambos superan
 * la comprobación del bloqueo: los `UPDATE` condicionales dejan pasar solo a
 * uno, y el otro llega aquí **con el cargo ya hecho**.
 *
 * Se distingue de `PublicacionNoActiva` porque el mensaje no puede ser el mismo:
 * a quien no se le cobró basta con decirle que la entrada ya no está; a quien
 * sí, hay que decírselo. Callarlo y devolver un 409 genérico dejaría a alguien
 * con un cargo que cree inexistente.
 */
export class CobradoSinTransferir extends ConflictException {
  constructor(numeroTransaccion: string) {
    super({
      codigo: 'COBRADO_SIN_TRANSFERIR',
      mensaje:
        'Otro comprador completó la compra primero y tu pago no pudo aplicarse. ' +
        `El cargo se revisará y reembolsará; cita la referencia ${numeroTransaccion}.`,
      numeroTransaccion,
      requiereConciliacion: true,
    });
  }
}

/** El servicio de Eventos aún no ha proyectado este evento en `eventos_referencia`. */
export class EventoNoConocido extends ConflictException {
  constructor(eventoId: string) {
    super({
      codigo: 'EVENTO_NO_CONOCIDO',
      mensaje: `Este servicio todavía no tiene datos del evento ${eventoId}; no puede validarse la política de reventa`,
    });
  }
}
