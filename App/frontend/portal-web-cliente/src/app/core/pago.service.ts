import { Injectable, computed, signal } from '@angular/core';
import { MetodoPago, PagoPendiente } from './models';

/**
 * Pasarela de pago compartida por los tres flujos de compra (entradas,
 * parqueadero, pedidos) — mismo espíritu que PasarelaPagoScreen en
 * app-movil-cliente (CU-011: nunca se piden datos de tarjeta, solo se elige
 * entre medios ya guardados). Cada pantalla de compra arma su resumen y lo
 * registra aquí antes de navegar a `/pago`, en vez de que la pasarela
 * conozca los detalles de cada tipo de compra (ASR-10: un solo lugar sabe
 * cobrar).
 */
@Injectable({ providedIn: 'root' })
export class PagoService {
  private readonly _pendiente = signal<PagoPendiente | null>(null);
  readonly pendiente = this._pendiente.asReadonly();
  readonly subtotal = computed(
    () => this._pendiente()?.lineas.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0) ?? 0
  );
  /** El descuento lo calcula el servidor (CU-004); aquí solo se resta para mostrarlo. */
  readonly total = computed(() => Math.max(0, this.subtotal() - (this._pendiente()?.descuento ?? 0)));

  registrar(pago: PagoPendiente): void {
    this._pendiente.set(pago);
  }

  /** CU-004: aplica o quita el código en el servidor y guarda el resultado que devolvió. */
  async cupon(accion: 'aplicar' | 'quitar', codigo = ''): Promise<void> {
    const pago = this._pendiente();
    if (!pago?.cupon) return;
    const resultado = accion === 'aplicar' ? await pago.cupon.aplicar(codigo) : await pago.cupon.quitar();
    this._pendiente.set({ ...pago, descuento: resultado.descuento, codigoPromocional: resultado.codigoPromocional });
  }

  /**
   * Ejecuta el cobro. Si falla, el pago **sigue pendiente** y el error sube a
   * la pantalla: en la compra de entradas, un rechazo deja la reserva viva
   * para reintentar con otro medio (CU-001C). Los flujos que aún son locales
   * (parqueadero) devuelven `void` y se comportan igual que antes.
   */
  async confirmar(metodo: MetodoPago, token?: string): Promise<void> {
    const pago = this._pendiente();
    if (!pago) return;
    await pago.onConfirmar(metodo, token);
    this._pendiente.set(null);
  }

  cancelar(): void {
    this._pendiente.set(null);
  }
}
