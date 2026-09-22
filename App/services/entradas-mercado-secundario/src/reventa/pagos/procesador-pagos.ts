/**
 * Contrato del Procesador de Pagos (SAD §9).
 *
 * Existe como interfaz y no como una clase suelta por **RNF-16**: *"La pasarela
 * de pagos puede sustituirse por otro proveedor sin tocar la lógica de negocio.
 * Componentes a modificar para el cambio de proveedor: **1** (solo el
 * adaptador), **0** cambios en el servicio de Entradas"*.
 *
 * Ese "1" solo es verificable si el dominio depende de esta abstracción y no de
 * un cliente HTTP concreto. Cambiar de proveedor es escribir otra
 * implementación de `ProcesadorPagos`; el `CheckoutService` no se entera.
 */

export enum ResultadoCobro {
  APROBADO = 'APROBADO',
  /** La pasarela respondió que no. Se sabe con certeza que no hubo cargo. */
  RECHAZADO = 'RECHAZADO',
  /**
   * No hubo respuesta: timeout, error de red, la pasarela caída.
   *
   * **No se sabe si se cobró o no.** Es la diferencia que obliga a tener este
   * tercer valor y no solo aprobado/rechazado, y la razón de que el SAD §13
   * pida para este riesgo una *"cola de reconciliación de pagos"*.
   */
  INDETERMINADO = 'INDETERMINADO',
}

export interface SolicitudCobro {
  monto: number;
  moneda: string;
  /**
   * Token opaco del medio de pago, emitido por la pasarela.
   *
   * Es lo único que viaja del medio de pago. RNF-05 no admite matices:
   * *"campos de tarjeta persistidos en cualquier base de datos propia: 0"*, y
   * este servicio ni siquiera los recibe.
   */
  token: string;
  descripcion: string;
  /**
   * Clave de idempotencia: el id de la transacción.
   *
   * Es lo que hace seguro reintentar un cobro cuyo resultado se desconoce
   * (CU-006I): con la misma clave, la pasarela devuelve el resultado del primer
   * intento en vez de cobrar otra vez.
   */
  claveIdempotencia: string;
}

export interface RespuestaCobro {
  resultado: ResultadoCobro;
  /** Identificador opaco del cobro en la pasarela. Nulo si no llegó a haberlo. */
  referencia: string | null;
  /** Explicación del rechazo o del fallo, para auditar (RNF-11). */
  motivo: string | null;
}

/**
 * Devolución total o parcial de un cobro aprobado (CU-003, paso 6).
 *
 * No lleva token del medio de pago: el dinero vuelve por donde entró, y la
 * pasarela lo sabe por la referencia del cobro original.
 */
export interface SolicitudReembolso {
  /** La `referencia` que devolvió la pasarela al aprobar el cobro. */
  referenciaCobro: string;
  monto: number;
  moneda: string;
  motivo: string;
  /** Mismo papel que en el cobro: reintentar no devuelve el dinero dos veces. */
  claveIdempotencia: string;
}

export interface ProcesadorPagos {
  cobrar(solicitud: SolicitudCobro): Promise<RespuestaCobro>;
  /**
   * Los tres resultados significan lo mismo que al cobrar: APROBADO se
   * devolvió, RECHAZADO con certeza no, INDETERMINADO no se sabe.
   */
  reembolsar(solicitud: SolicitudReembolso): Promise<RespuestaCobro>;
}

/** Clave de inyección del Procesador de Pagos. */
export const PROCESADOR_PAGOS = 'PROCESADOR_PAGOS';
