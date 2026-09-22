import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { PagoService } from '../core/pago.service';
import { MetodoPago } from '../core/models';
import { mensajeDeError } from '../core/reventa.service';

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
  imports: [DecimalPipe, MatCardModule, MatRadioModule, MatButtonModule],
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
  readonly etiqueta = (m: MetodoPago) => ETIQUETAS[m];

  readonly metodo = signal(MetodoPago.TARJETA);
  readonly token = signal('');
  readonly procesando = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const tokens = this.pendiente()?.tokensDemo;
    if (tokens?.length) this.token.set(tokens[0].valor);
  }

  async confirmar(): Promise<void> {
    const pendiente = this.pendiente();
    if (!pendiente || this.procesando()) return;
    const destino = pendiente.rutaDestino;

    this.procesando.set(true);
    this.error.set(null);
    try {
      await this.pagoService.confirmar(this.metodo(), this.token() || undefined);
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
