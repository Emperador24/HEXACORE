import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { StripeService, TarjetaMontada } from '../core/stripe.service';

/**
 * Campo de tarjeta de Stripe (número, fecha y CVC en un solo control).
 *
 * Quien lo usa llama a `token()` al pagar y manda ese `pm_…` como token del
 * medio de pago, igual que antes mandaba `tok_ok_demo`.
 */
@Component({
  selector: 'app-tarjeta-stripe',
  standalone: true,
  template: `
    <div class="campo" #campo data-prueba="tarjeta-stripe"></div>
    @if (cargando()) { <p class="ayuda">Cargando el formulario seguro de Stripe…</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <p class="ayuda">Modo de prueba: 4242 4242 4242 4242, cualquier fecha futura y CVC.</p>
  `,
  styles: `
    .campo { padding: 12px; border: 1px solid rgba(0, 0, 0, 0.38); border-radius: 4px; background: #fff; }
    .ayuda { font-size: 12px; opacity: 0.7; margin: 6px 0 0; }
    .error { color: #b00020; margin: 6px 0 0; }
  `
})
export class TarjetaStripeComponent implements AfterViewInit, OnDestroy {
  private readonly stripe = inject(StripeService);
  private readonly campo = viewChild.required<ElementRef<HTMLElement>>('campo');
  private tarjeta?: TarjetaMontada;

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  async ngAfterViewInit(): Promise<void> {
    try {
      this.tarjeta = await this.stripe.montarTarjeta(this.campo().nativeElement, (e) => this.error.set(e));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el formulario de pago.');
    } finally {
      this.cargando.set(false);
    }
  }

  /** El `pm_…` de la tarjeta escrita. Lanza un `Error` con el motivo si no es válida. */
  async token(): Promise<string> {
    if (!this.tarjeta) throw new Error(this.error() ?? 'El formulario de pago aún no está listo.');
    return this.tarjeta.crearMetodoPago();
  }

  ngOnDestroy(): void {
    this.tarjeta?.destruir();
  }
}
