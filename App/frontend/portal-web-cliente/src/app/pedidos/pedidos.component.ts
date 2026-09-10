import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { PedidosService } from '../core/pedidos.service';
import { EstadoPedido } from '../core/models';
import { QrPlaceholderComponent } from '../shared/qr-placeholder.component';

/**
 * Pedidos de alimentos del cliente (CU-011..CU-015): "Restaurantes" para
 * armar uno nuevo y "Mis pedidos" para ver estado/QR — mismas dos pestañas
 * que PedidosScreen en app-movil-cliente.
 */
@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [DecimalPipe, RouterLink, MatTabsModule, MatCardModule, MatChipsModule, QrPlaceholderComponent],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.scss'
})
export class PedidosComponent {
  private readonly pedidosService = inject(PedidosService);

  readonly pestana = signal(0);
  readonly establecimientos = this.pedidosService.establecimientos;
  readonly pedidos = this.pedidosService.pedidos;

  etiquetaEstado(estado: EstadoPedido): string {
    const etiquetas: Record<EstadoPedido, string> = {
      [EstadoPedido.EN_PREPARACION]: 'En preparación',
      [EstadoPedido.LISTO]: 'Listo para retirar',
      [EstadoPedido.ENTREGADO]: 'Entregado'
    };
    return etiquetas[estado];
  }
}
