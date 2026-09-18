import { Injectable, computed, signal } from '@angular/core';
import { Establecimiento, EstadoPedido, ItemCarrito, Pedido, ProductoMenu } from './models';

const ESTABLECIMIENTOS: Establecimiento[] = [
  { id: 'est-1', nombre: 'Food Truck La Sazón', descripcion: 'Comida rápida' },
  { id: 'est-2', nombre: 'Cafetería Central', descripcion: 'Café y repostería' },
  { id: 'est-3', nombre: 'Cervecería del Parche', descripcion: 'Cerveza artesanal y piqueos' }
];

const MENU: ProductoMenu[] = [
  { id: 'prod-1', establecimientoId: 'est-1', nombre: 'Hamburguesa', precio: 25000, disponible: true },
  { id: 'prod-2', establecimientoId: 'est-1', nombre: 'Perro caliente', precio: 18000, disponible: true },
  { id: 'prod-3', establecimientoId: 'est-1', nombre: 'Papas fritas', precio: 12000, disponible: true },
  { id: 'prod-4', establecimientoId: 'est-1', nombre: 'Gaseosa', precio: 6000, disponible: true },
  { id: 'prod-5', establecimientoId: 'est-2', nombre: 'Café', precio: 8000, disponible: true },
  { id: 'prod-6', establecimientoId: 'est-2', nombre: 'Croissant', precio: 9000, disponible: true },
  { id: 'prod-7', establecimientoId: 'est-2', nombre: 'Jugo natural', precio: 7000, disponible: false },
  { id: 'prod-8', establecimientoId: 'est-3', nombre: 'Cerveza artesanal', precio: 16000, disponible: true },
  { id: 'prod-9', establecimientoId: 'est-3', nombre: 'Nachos', precio: 20000, disponible: true }
];

/**
 * Pedidos de alimentos del cliente (CU-011..CU-015): restaurantes, menú,
 * carrito y pedidos ya hechos — mismo dominio que PedidosScreen/
 * MenuRestauranteScreen en app-movil-cliente. El carrito se hoistea aquí (no
 * en un componente) por la misma razón que allá: debe sobrevivir la
 * navegación Restaurantes → Menú → Pasarela de pago.
 */
@Injectable({ providedIn: 'root' })
export class PedidosService {
  readonly establecimientos = ESTABLECIMIENTOS;
  readonly menu = MENU;

  private readonly _carrito = signal<ItemCarrito[]>([]);
  readonly carrito = this._carrito.asReadonly();
  readonly totalCarrito = computed(() => this._carrito().reduce((acc, i) => acc + i.producto.precio * i.cantidad, 0));

  private readonly _pedidos = signal<Pedido[]>([
    {
      id: 'ped-1',
      establecimiento: 'Food Truck La Sazón',
      items: ['2x Hamburguesa', '1x Gaseosa'],
      total: 58000,
      estado: EstadoPedido.EN_PREPARACION,
      codigoQr: 'HXC-PED-000045'
    },
    {
      id: 'ped-2',
      establecimiento: 'Cafetería Central',
      items: ['1x Café', '1x Croissant'],
      total: 21000,
      estado: EstadoPedido.ENTREGADO,
      codigoQr: 'HXC-PED-000039'
    }
  ]);

  readonly pedidos = this._pedidos.asReadonly();

  establecimiento(id: string): Establecimiento | undefined {
    return this.establecimientos.find((e) => e.id === id);
  }

  menuDe(establecimientoId: string): ProductoMenu[] {
    return this.menu.filter((p) => p.establecimientoId === establecimientoId);
  }

  agregarAlCarrito(producto: ProductoMenu): void {
    this._carrito.update((carrito) => {
      const i = carrito.findIndex((it) => it.producto.id === producto.id);
      if (i >= 0) {
        const copia = [...carrito];
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
        return copia;
      }
      return [...carrito, { producto, cantidad: 1 }];
    });
  }

  quitarDelCarrito(producto: ProductoMenu): void {
    this._carrito.update((carrito) => {
      const i = carrito.findIndex((it) => it.producto.id === producto.id);
      if (i < 0) return carrito;
      const actual = carrito[i];
      if (actual.cantidad <= 1) return carrito.filter((_, idx) => idx !== i);
      const copia = [...carrito];
      copia[i] = { ...actual, cantidad: actual.cantidad - 1 };
      return copia;
    });
  }

  /** Confirma el pedido con lo que haya en el carrito y lo vacía. */
  confirmarPedido(): void {
    const carrito = this._carrito();
    if (carrito.length === 0) return;
    const establecimiento = this.establecimiento(carrito[0].producto.establecimientoId)?.nombre ?? '';
    const nuevo: Pedido = {
      id: `ped-${Date.now()}`,
      establecimiento,
      items: carrito.map((i) => `${i.cantidad}x ${i.producto.nombre}`),
      total: this.totalCarrito(),
      estado: EstadoPedido.EN_PREPARACION,
      codigoQr: `HXC-PED-${Math.floor(100000 + Math.random() * 900000)}`
    };
    this._pedidos.update((lista) => [nuevo, ...lista]);
    this._carrito.set([]);
  }
}
