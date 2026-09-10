import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { PagoService } from '../core/pago.service';
import { MetodoPago } from '../core/models';

/**
 * Pago compartido por los tres flujos de compra (entradas, parqueadero,
 * pedidos) — mismo criterio que PasarelaPagoScreen en app-movil-cliente
 * (CU-011: sin pasarela de pagos real todavía, nunca se piden datos de
 * tarjeta, solo se elige entre medios ya guardados).
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

  readonly MetodoPago = MetodoPago;
  readonly pendiente = this.pagoService.pendiente;
  readonly total = this.pagoService.total;
  readonly metodo = signal(MetodoPago.TARJETA);

  confirmar(): void {
    const pendiente = this.pendiente();
    if (!pendiente) return;
    const destino = pendiente.rutaDestino;
    this.pagoService.confirmar(this.metodo());
    this.router.navigateByUrl(destino);
  }

  cancelar(): void {
    const destino = this.pendiente()?.rutaDestino ?? '/cliente/eventos';
    this.pagoService.cancelar();
    this.router.navigateByUrl(destino);
  }
}
