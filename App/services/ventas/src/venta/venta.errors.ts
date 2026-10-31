import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Errores de la venta primaria (CU-001 a CU-004), cada uno con el código del
 * camino de la ficha. Mismo criterio que `reventa.errors.ts`: el `codigo` deja
 * al cliente decidir qué mostrar sin interpretar el texto, y hace visible desde
 * fuera qué camino del caso de uso se tomó.
 */

// --- Comunes -----------------------------------------------------------------

export class CompraNoEncontrada extends NotFoundException {
  constructor() {
    // "No existe" también cuando es de otra persona: decir "no es tuya"
    // confirmaría que ese identificador existe.
    super({ codigo: 'COMPRA_NO_ENCONTRADA', mensaje: 'No existe esa compra en tu cuenta' });
  }
}

export class LocalidadNoEncontrada extends NotFoundException {
  constructor() {
    super({ codigo: 'LOCALIDAD_NO_ENCONTRADA', mensaje: 'No existe esa localidad' });
  }
}

export class EventoNoALaVenta extends ConflictException {
  constructor(motivo: string) {
    super({ codigo: 'EVENTO_NO_A_LA_VENTA', mensaje: motivo });
  }
}

// --- CU-001 Compra de entradas -------------------------------------------------

/** **CU-001A**: *"Si no hay disponibilidad el sistema informa al usuario y no permite continuar"*. */
export class SinDisponibilidad extends ConflictException {
  constructor(disponibles: number) {
    super({
      codigo: 'CU-001A',
      mensaje:
        disponibles === 0
          ? 'No quedan entradas en esta localidad'
          : `Solo quedan ${disponibles} entradas en esta localidad`,
      disponibles,
    });
  }
}

/** **CU-001B**: *"Si el tiempo de compra expira se cancela la reserva y se reinicia el proceso"*. */
export class ReservaVencida extends ConflictException {
  constructor() {
    super({
      codigo: 'CU-001B',
      mensaje: 'El tiempo para pagar se agotó y la reserva se liberó. Vuelve a elegir tus entradas.',
    });
  }
}

/** **CU-001C**: *"Si el pago es rechazado el sistema muestra un mensaje de error y permite reintentar"*. */
export class PagoCompraRechazado extends ConflictException {
  constructor(motivo: string, expiraEn: Date) {
    super({
      codigo: 'CU-001C',
      mensaje: `El pago fue rechazado: ${motivo}. Puedes intentarlo con otro medio de pago.`,
      motivo,
      // Para que el cliente pueda decir "tienes hasta las 3:15 para reintentar".
      reservaHasta: expiraEn.toISOString(),
    });
  }
}

/** La pasarela no respondió: no se sabe si se cobró. Mismo criterio que CU-006I. */
export class PagoCompraIndeterminado extends ServiceUnavailableException {
  constructor(numeroCompra: string) {
    super({
      codigo: 'PAGO_INDETERMINADO',
      mensaje:
        'No pudimos confirmar el pago con la pasarela. Revisa tu medio de pago antes de reintentar; ' +
        `reintentar es seguro y no cobra dos veces. Referencia: ${numeroCompra}.`,
      numeroCompra,
      requiereConciliacion: true,
    });
  }
}

export class CompraNoPagable extends ConflictException {
  constructor(estado: string) {
    super({ codigo: 'COMPRA_NO_PAGABLE', mensaje: `La compra está ${estado} y ya no admite pagos`, estado });
  }
}

// --- CU-004 Promociones ----------------------------------------------------------

/** **CU-004C**: *"Si el cupón es inválido, el sistema muestra un mensaje de error manteniendo el precio original"*. */
export class CuponInvalido extends UnprocessableEntityException {
  constructor(motivo: string) {
    super({ codigo: 'CU-004C', mensaje: `El código promocional no es válido: ${motivo}` });
  }
}

/** **CU-004D**: *"Si el cupón ya alcanzó su límite máximo de usos, el sistema rechaza su aplicación e informa el motivo"*. */
export class CuponAgotado extends ConflictException {
  constructor() {
    super({ codigo: 'CU-004D', mensaje: 'Este código promocional ya alcanzó su límite de usos' });
  }
}

/**
 * **CU-004A**: el código solo aplica a ciertos eventos o localidades.
 *
 * Una compra es de una sola localidad, así que el "carrito" del CU-004A tiene
 * una sola línea: o todas sus entradas reciben el descuento o ninguna. Se
 * informa a qué aplica para que el cliente sepa dónde sí puede usarlo.
 */
export class CuponNoAplica extends UnprocessableEntityException {
  constructor(aplicaA: string) {
    super({ codigo: 'CU-004A', mensaje: `Este código solo aplica a ${aplicaA}`, aplicaA });
  }
}

export class CompraNoAdmiteCupon extends ConflictException {
  constructor(estado: string) {
    super({
      codigo: 'COMPRA_NO_ADMITE_CUPON',
      mensaje: `Los códigos se aplican antes de pagar; esta compra está ${estado}`,
    });
  }
}

export class CompraYaTieneCupon extends ConflictException {
  constructor(codigo: string) {
    super({
      codigo: 'COMPRA_YA_TIENE_CUPON',
      mensaje: `Esta compra ya tiene aplicado el código ${codigo}. Quítalo antes de aplicar otro.`,
    });
  }
}

// --- CU-003 Cancelaciones y devoluciones -------------------------------------------

export class CompraNoCancelable extends ConflictException {
  constructor(motivo: string) {
    super({ codigo: 'COMPRA_NO_CANCELABLE', mensaje: motivo });
  }
}

/** Paso 3: fuera del plazo que admite la política de cancelación. */
export class FueraDePlazo extends ConflictException {
  constructor(horasMinimas: number) {
    super({
      codigo: 'CANCELACION_FUERA_DE_PLAZO',
      mensaje: `Las cancelaciones se admiten hasta ${horasMinimas} horas antes del evento`,
    });
  }
}

/**
 * **CU-003D**: ninguna de las entradas pedidas se puede cancelar (todas se
 * usaron, o no son del solicitante). Si solo algunas fallan, no es un error:
 * se procesan las demás y la respuesta dice cuáles quedaron fuera.
 */
export class NingunaEntradaCancelable extends ConflictException {
  constructor(rechazadas: { entradaId: string; motivo: string }[]) {
    super({ codigo: 'CU-003D', mensaje: 'Ninguna de las entradas indicadas se puede cancelar', rechazadas });
  }
}

/**
 * Paso 5: *"El usuario confirma la solicitud con el monto informado"*. Si entre
 * cotizar y confirmar el monto cambió —cruzó el umbral del reembolso parcial,
 * u otra entrada se usó—, se le vuelve a preguntar en vez de reembolsarle algo
 * distinto de lo que aceptó.
 */
export class MontoCambio extends ConflictException {
  constructor(montoActual: number) {
    super({
      codigo: 'MONTO_REEMBOLSO_CAMBIO',
      mensaje: `El monto a reembolsar cambió a ${montoActual}. Revísalo y vuelve a confirmar.`,
      montoReembolso: montoActual,
    });
  }
}

/** **CU-003C**: *"Si el reembolso es denegado por la pasarela, se muestra un error y se mantiene la compra activa"*. */
export class ReembolsoRechazado extends ConflictException {
  constructor(motivo: string) {
    super({
      codigo: 'CU-003C',
      mensaje: `La pasarela rechazó el reembolso (${motivo}). Tus entradas siguen activas.`,
      motivo,
    });
  }
}

export class ReembolsoIndeterminado extends ServiceUnavailableException {
  constructor(cancelacionId: string) {
    super({
      codigo: 'REEMBOLSO_INDETERMINADO',
      mensaje:
        'No pudimos confirmar el reembolso con la pasarela. Las entradas quedan anuladas mientras se ' +
        `concilia; si no ves el abono, cita la referencia ${cancelacionId}.`,
      cancelacionId,
      requiereConciliacion: true,
    });
  }
}

// --- CU-002 Validar QR -----------------------------------------------------------

/** **CU-002A**: *"Si el código QR es inválido, el sistema muestra un mensaje de error y no autoriza el ingreso"*. */
export class QrInvalido extends NotFoundException {
  constructor(motivo: string) {
    super({ codigo: 'CU-002A', mensaje: `Ingreso NO autorizado: ${motivo}`, autorizado: false });
  }
}

/** **CU-002D**: *"Si el QR ya fue utilizado previamente, el sistema rechaza el ingreso y notifica al personal"*. */
export class QrYaUtilizado extends ConflictException {
  constructor(primerIngreso: Date | null, puntoAcceso: string | null) {
    const donde = puntoAcceso ? ` por ${puntoAcceso}` : '';
    super({
      codigo: 'CU-002D',
      mensaje: primerIngreso
        ? `Ingreso NO autorizado: esta entrada ya ingresó el ${primerIngreso.toISOString()}${donde}`
        : 'Ingreso NO autorizado: esta entrada ya fue utilizada',
      autorizado: false,
      primerIngreso: primerIngreso?.toISOString() ?? null,
      puntoAcceso,
    });
  }
}

/**
 * **CU-002B**: *"Si el aforo está en su límite, niega el ingreso y sugiere una zona de espera"*.
 *
 * La sugerencia manda a consultar con la administración, no a esperar a que se
 * libere cupo: `asistentes` solo sube, porque no se registran las salidas. A
 * quien llega con una entrada válida y se encuentra el recinto lleno hay que
 * darle una respuesta de alguien, no una espera que no termina.
 *
 * Que esto le ocurra a un comprador significa que se vendieron más entradas de
 * las que caben, y eso se evita al crear el evento (CU-026): si el recinto
 * declara aforo, las localidades no deberían sumar más. Mientras esa validación
 * no exista, este camino es la única red.
 */
export class AforoCompleto extends ConflictException {
  constructor(aforoMaximo: number) {
    super({
      codigo: 'CU-002B',
      mensaje: `Ingreso NO autorizado: el recinto alcanzó su aforo máximo (${aforoMaximo}).`,
      autorizado: false,
      sugerencia:
        'Dirige a la persona a la zona de espera y avisa al coordinador del evento: ' +
        'con una entrada válida, el ingreso lo autoriza la administración.',
    });
  }
}
