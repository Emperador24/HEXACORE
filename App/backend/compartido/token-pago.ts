/** Solo los identificadores opacos que entienden los adaptadores actuales.
 * Rechaza PAN, JSON con tarjeta y cadenas de CVV antes de cualquier servicio.
 * El simulador usa tok_; Stripe recibe exclusivamente PaymentMethod pm_.
 */
export const TOKEN_PAGO = /^(?:tok_[A-Za-z0-9_-]+|pm_[A-Za-z0-9]+)$/;
