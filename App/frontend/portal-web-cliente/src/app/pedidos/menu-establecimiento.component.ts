import { QrPedidoComponent } from './qr-pedido.component';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PagoPedido, clavePago, CheckoutPedido, EstablecimientoPedido, PedidosService, ProductoPedido, mensajePedidos } from '../core/pedidos.service';
import { ErrorCuenta } from '../core/auth.service';

@Component({
  selector: 'app-menu-establecimiento',
  standalone: true,
  imports: [QrPedidoComponent, DatePipe, DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './menu-establecimiento.component.html',
  styleUrl: './menu-establecimiento.component.scss'
})
export class MenuEstablecimientoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly servicio = inject(PedidosService);
  private readonly establecimientoId: string = this.route.snapshot.params['id'];
  readonly eventoId = this.route.snapshot.queryParamMap.get('eventoId') ?? '';
  readonly establecimiento = signal<EstablecimientoPedido | undefined>(undefined);
  readonly productos = signal<ProductoPedido[]>([]);
  readonly cantidades = signal<Record<string, number>>({});
  readonly cargando = signal(false);
  readonly enviando = signal(false);
  readonly error = signal('');
  readonly resultadoIncierto = signal(false);
  readonly checkout = signal<CheckoutPedido | null>(null);
  readonly unidades = computed(() => Object.values(this.cantidades()).reduce((a, b) => a + b, 0));
  readonly pago = signal<PagoPedido | null>(null);
  readonly pagando = signal(false);
  readonly mensajePago = signal('');
  private claveIntento: string | null = null;
  metodoEntrega = 'RECOGER';

  async pagar(): Promise<void> {
    const pedido = this.checkout();
    if (!pedido || this.pagando() || this.pago()?.compraConfirmada) return;
    this.pagando.set(true);
    this.mensajePago.set('');
    try {
      this.claveIntento ??= clavePago();
      const resultado = await this.servicio.pagar(pedido.id, this.claveIntento);
      this.pago.set(resultado);
      if (resultado.estadoPago === 'RECHAZADA') {
        this.mensajePago.set('Pago rechazado. Puedes intentar nuevamente.');
        // Solo un rechazo definitivo permite iniciar otro intento lógico.
        this.claveIntento = null;
      } else if (!resultado.compraConfirmada) {
        this.mensajePago.set('El pago está pendiente de resolución. Puedes consultar nuevamente el mismo intento.');
      }
    } catch (error) {
      // Mantener la clave ante timeout o fallo de confirmación: nunca iniciar otro cobro a ciegas.
      this.mensajePago.set('No pudimos confirmar el pago. Puedes volver a consultar su resultado de forma segura.');
    } finally { this.pagando.set(false); }
  }

  constructor() { void this.cargar(); }

  async cargar(): Promise<void> {
    if (this.cargando()) return;
    if (!this.eventoId) { this.error.set('Selecciona primero el evento y el establecimiento desde Pedidos.'); return; }
    this.cargando.set(true);
    this.error.set('');
    try {
      const establecimientos = await this.servicio.establecimientos(this.eventoId);
      const establecimiento = establecimientos.find((e) => e.id === this.establecimientoId);
      if (!establecimiento) { this.error.set('El establecimiento ya no está disponible para este evento.'); return; }
      this.establecimiento.set(establecimiento);
      this.productos.set(await this.servicio.productos(this.establecimientoId));
    } catch (error) { this.error.set(mensajePedidos(error)); }
    finally { this.cargando.set(false); }
  }

  cantidadDe(producto: ProductoPedido): number { return this.cantidades()[producto.id] ?? 0; }

  cambiar(producto: ProductoPedido, incremento: number): void {
    if (this.enviando() || this.checkout() || this.resultadoIncierto()) return;
    this.cantidades.update((actual) => ({ ...actual, [producto.id]: Math.max(0, (actual[producto.id] ?? 0) + incremento) }));
  }

  async iniciarCheckout(): Promise<void> {
    if (this.enviando() || this.checkout() || this.resultadoIncierto() || !this.unidades() || !this.metodoEntrega.trim()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      this.checkout.set(await this.servicio.crearCheckout({
        eventoId: this.eventoId, establecimientoId: this.establecimientoId, metodoEntrega: this.metodoEntrega,
        productos: Object.entries(this.cantidades()).filter(([, cantidad]) => cantidad > 0)
          .map(([productoId, cantidad]) => ({ productoId, cantidad }))
      }));
      this.cantidades.set({});
    } catch (error) {
      // Checkout aún no ofrece idempotencia: un timeout no autoriza repetir la creación automáticamente.
      const incierto = !(error instanceof ErrorCuenta) || error.estado === 0 || error.estado >= 500;
      this.resultadoIncierto.set(incierto);
      this.error.set(incierto
        ? 'No pudimos confirmar el resultado. El pedido podría haberse creado; no vuelvas a enviarlo hasta revisar su estado.'
        : mensajePedidos(error));
    } finally { this.enviando.set(false); }
  }
}
