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
  readonly total = computed(
    () => this._pendiente()?.lineas.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0) ?? 0
  );

  registrar(pago: PagoPendiente): void {
    this._pendiente.set(pago);
  }

  confirmar(metodo: MetodoPago): void {
    const pago = this._pendiente();
    if (!pago) return;
    pago.onConfirmar(metodo);
    this._pendiente.set(null);
  }

  cancelar(): void {
    this._pendiente.set(null);
  }
}
