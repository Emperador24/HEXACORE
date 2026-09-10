import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { EntradasService } from '../core/entradas.service';
import { AuthService } from '../core/auth.service';
import { EstadoEntrada } from '../core/models';
import { PagoService } from '../core/pago.service';

/**
 * Mercado de reventa (CU-007, CU-008): entradas que otros clientes pusieron
 * en venta. La reventa no vive en app-movil-cliente (ver comentario en
 * EntradasScreen allá) — este portal es el único lugar donde se gestiona.
 */
@Component({
  selector: 'app-mercado-reventa',
  standalone: true,
  imports: [DecimalPipe, MatCardModule, MatChipsModule, MatButtonModule],
  templateUrl: './mercado-reventa.component.html',
  styleUrl: './mercado-reventa.component.scss'
})
export class MercadoReventaComponent {
  private readonly entradasService = inject(EntradasService);
  private readonly auth = inject(AuthService);
  private readonly pagoService = inject(PagoService);
  private readonly router = inject(Router);

  readonly publicadas = computed(() => {
    const usuarioId = this.auth.usuarioActual()?.id;
    return this.entradasService
      .entradas()
      .filter((e) => e.estado === EstadoEntrada.EN_REVENTA && e.propietarioId !== usuarioId);
  });

  comprar(entradaId: string): void {
    const entrada = this.entradasService.obtenerPorId(entradaId);
    const usuario = this.auth.usuarioActual();
    if (!entrada || !usuario || !entrada.precioReventa) return;

    this.pagoService.registrar({
      titulo: `Reventa · ${entrada.eventoNombre}`,
      lineas: [{ etiqueta: `Entrada · ${entrada.zona}`, cantidad: 1, precioUnitario: entrada.precioReventa }],
      rutaDestino: '/cliente/entradas',
      onConfirmar: () => this.entradasService.comprarEnReventa(entrada.id, usuario.id)
    });
    this.router.navigateByUrl('/cliente/pago');
  }
}
