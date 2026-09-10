import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PedidosService } from '../core/pedidos.service';
import { PagoService } from '../core/pago.service';
import { ProductoMenu } from '../core/models';

/**
 * Menú de un establecimiento (CU-011): el cliente arma su pedido aquí y
 * pasa a la pasarela de pago cuando termina — mismo flujo que
 * MenuRestauranteScreen en app-movil-cliente.
 */
@Component({
  selector: 'app-menu-establecimiento',
  standalone: true,
  imports: [DecimalPipe, RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './menu-establecimiento.component.html',
  styleUrl: './menu-establecimiento.component.scss'
})
export class MenuEstablecimientoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pedidosService = inject(PedidosService);
  private readonly pagoService = inject(PagoService);

  private readonly establecimientoId = this.route.snapshot.params['id'];
  readonly establecimiento = computed(() => this.pedidosService.establecimiento(this.establecimientoId));
  readonly productos = this.pedidosService.menuDe(this.establecimientoId);
  readonly carrito = this.pedidosService.carrito;
  readonly total = this.pedidosService.totalCarrito;

  cantidadDe(producto: ProductoMenu): number {
    return this.carrito().find((i) => i.producto.id === producto.id)?.cantidad ?? 0;
  }

  agregar(producto: ProductoMenu): void {
    this.pedidosService.agregarAlCarrito(producto);
  }

  quitar(producto: ProductoMenu): void {
    this.pedidosService.quitarDelCarrito(producto);
  }

  continuarAlPago(): void {
    const establecimiento = this.establecimiento();
    if (!establecimiento || this.carrito().length === 0) return;

    this.pagoService.registrar({
      titulo: `Pedido · ${establecimiento.nombre}`,
      lineas: this.carrito().map((i) => ({ etiqueta: i.producto.nombre, cantidad: i.cantidad, precioUnitario: i.producto.precio })),
      rutaDestino: '/cliente/pedidos',
      onConfirmar: () => this.pedidosService.confirmarPedido()
    });
    this.router.navigateByUrl('/cliente/pago');
  }
}
