import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { PagoService } from '../core/pago.service';
import { MetodoPago } from '../core/models';
import { mensajeDeError } from '../core/reventa.service';
import { StripeService } from '../core/stripe.service';
import { TarjetaStripeComponent } from './tarjeta-stripe.component';

/** Cómo se muestra cada medio. */
const ETIQUETAS: Record<MetodoPago, string> = {
  [MetodoPago.TARJETA]: 'Tarjeta terminada en 4321',
  [MetodoPago.PSE]: 'PSE',
  [MetodoPago.EFECTIVO]: 'Efectivo en el punto de entrega'
};

/**
 * Pago compartido por los tres flujos de compra (entradas, parqueadero,
 * pedidos) — mismo criterio que PasarelaPagoScreen en app-movil-cliente
 * (CU-011: nunca se piden datos de tarjeta, solo se elige entre medios ya
 * guardados).
 *
 * Espera el resultado del cobro antes de salir: si falla, se queda en esta
 * pantalla con el mensaje del servidor y el pago sigue pendiente, para que se
 * pueda reintentar.
 */
@Component({
  selector: 'app-pasarela-pago',
  standalone: true,
  imports: [DecimalPipe, MatCardModule, MatRadioModule, MatButtonModule, TarjetaStripeComponent],
  templateUrl: './pasarela-pago.component.html',
  styleUrl: './pasarela-pago.component.scss'
})
export class PasarelaPagoComponent {
  private readonly pagoService = inject(PagoService);
  private readonly router = inject(Router);

  readonly pendiente = this.pagoService.pendiente;
  readonly total = this.pagoService.total;

  /** Los medios que admite esta compra; si no dice, todos menos PSE (que solo acepta entradas). */
  readonly metodos = computed(
    () => this.pendiente()?.metodos ?? [MetodoPago.TARJETA, MetodoPago.EFECTIVO]
  );
  readonly etiqueta = (m: MetodoPago) =>
    m === MetodoPago.TARJETA && this.conStripe() ? 'Tarjeta de crédito o débito' : ETIQUETAS[m];

  /**
   * Con Stripe, la tarjeta se escribe de verdad y su `pm_…` reemplaza al token
   * de demostración. PSE sigue con la pasarela simulada: Stripe no lo ofrece.
   */
  readonly conStripe = signal(false);
  readonly tarjetaReal = computed(() => this.conStripe() && this.metodo() === MetodoPago.TARJETA);
  private readonly tarjeta = viewChild(TarjetaStripeComponent);

  readonly metodo = signal(MetodoPago.TARJETA);
  readonly token = signal('');
  readonly procesando = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const tokens = this.pendiente()?.tokensDemo;
    if (tokens?.length) this.token.set(tokens[0].valor);
    void inject(StripeService).activo().then((activo) => this.conStripe.set(activo));
  }

  async confirmar(): Promise<void> {
    const pendiente = this.pendiente();
    if (!pendiente || this.procesando()) return;
    const destino = pendiente.rutaDestino;

    this.procesando.set(true);
    this.error.set(null);
    try {
      const tarjeta = this.tarjetaReal() ? this.tarjeta() : undefined;
      const token = tarjeta ? await tarjeta.token() : this.token() || undefined;
      await this.pagoService.confirmar(this.metodo(), token);
      this.router.navigateByUrl(destino);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.procesando.set(false);
    }
  }

  cancelar(): void {
    const destino = this.pendiente()?.rutaDestino ?? '/eventos';
    this.pagoService.cancelar();
    this.router.navigateByUrl(destino);
  }
}
