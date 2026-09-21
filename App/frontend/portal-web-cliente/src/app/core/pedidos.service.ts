import { catchError, of, throwError } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService, ErrorCuenta } from './auth.service';
import { Servidor } from './servidor';

export interface EstablecimientoPedido {
  id: string;
  eventoId: string;
  nombre: string;
  estado: string;
  puntoEntrega: string;
}
export interface ProductoPedido {
  id: string;
  establecimientoId: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  activo: boolean;
  cantidadInventario: number;
}
export interface CrearCheckout {
  eventoId: string;
  establecimientoId: string;
  metodoEntrega: string;
  productos: { productoId: string; cantidad: number }[];
}
export interface CheckoutPedido {
  id: string;
  establecimientoId: string;
  estado: 'PENDIENTE_PAGO';
  metodoEntrega: string;
  moneda: string;
  total: string;
  creadoEn: string;
  expiraEn: string;
  codigoQr: null;
  inventarioReservado: true;
  detalles: { productoId: string; nombreProducto: string; precioUnitario: string; cantidad: number }[];
}

export interface PagoPedido {
  pedidoId: string;
  transaccionId: string;
  estadoPago: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'FALLIDA';
  estadoPedido: string;
  monto: string;
  moneda: string;
  referenciaPasarela: string | null;
  codigo: string;
  compraConfirmada: boolean;
  codigoQr: string | null;
}

/** UUID v4 también en HTTP de la red local, donde randomUUID puede no estar disponible. */
export function clavePago(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Catálogo y checkout reales de CU-011; sesión y transporte compartidos con el portal. */
@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  establecimientos(eventoId: string): Promise<EstablecimientoPedido[]> {
    return this.auth.conAcceso((headers) => this.http.get<EstablecimientoPedido[]>(
      `${Servidor.api}/pedidos/eventos/${encodeURIComponent(eventoId)}/establecimientos`, { headers }));
  }

  productos(establecimientoId: string): Promise<ProductoPedido[]> {
    return this.auth.conAcceso((headers) => this.http.get<ProductoPedido[]>(
      `${Servidor.api}/pedidos/establecimientos/${encodeURIComponent(establecimientoId)}/productos`, { headers }));
  }

  pagar(pedidoId: string, clave: string): Promise<PagoPedido> {
    return this.auth.conAcceso((headers) => this.http.post<PagoPedido>(
      `${Servidor.api}/pedidos/${encodeURIComponent(pedidoId)}/pagos`,
      { tokenPago: 'tok_ok_pedidos_web' },
      { headers: headers.set('Idempotency-Key', clave) }
    ).pipe(catchError((error: unknown) => {
      // Conservar el resultado incierto explícito sin alterar renovación de sesión ni otros errores.
      if (error instanceof HttpErrorResponse && [502, 504].includes(error.status) &&
          error.error?.pedidoId === pedidoId && error.error?.transaccionId === clave &&
          error.error?.estadoPago === 'FALLIDA') return of(error.error as PagoPedido);
      return throwError(() => error);
    })));
  }

  crearCheckout(datos: CrearCheckout): Promise<CheckoutPedido> {
    // Proyección explícita: identidad, importes y vencimiento los decide el backend.
    const body: CrearCheckout = {
      eventoId: datos.eventoId,
      establecimientoId: datos.establecimientoId,
      metodoEntrega: datos.metodoEntrega.trim(),
      productos: datos.productos.map(({ productoId, cantidad }) => ({ productoId, cantidad }))
    };
    return this.auth.conAcceso((headers) => this.http.post<CheckoutPedido>(
      `${Servidor.api}/pedidos/checkout`, body, { headers }));
  }
}

export function mensajePedidos(error: unknown): string {
  if (!(error instanceof ErrorCuenta)) return 'No se pudo completar la solicitud. Intenta nuevamente.';
  const mensajes: Record<string, string> = {
    INVENTARIO_NO_PREPARADO: 'El establecimiento todavía no está listo para recibir pedidos.',
    INVENTARIO_INSUFICIENTE: 'No hay suficientes unidades disponibles. Revisa las cantidades.',
    PRODUCTO_NO_ENCONTRADO: 'Uno de los productos ya no está disponible.',
    PRODUCTO_INACTIVO: 'Uno de los productos ya no está activo.',
    ESTABLECIMIENTO_NO_ENCONTRADO: 'No se encontró el establecimiento.',
    EVENTO_NO_ENCONTRADO: 'No se encontró el evento.',
    EVENTO_NO_DISPONIBLE: 'El evento no está disponible para pedidos.',
    ESTABLECIMIENTO_NO_DISPONIBLE: 'El establecimiento no está disponible para pedidos.'
  };
  return mensajes[error.codigo] ?? (error.estado === 401 ? 'Tu sesión terminó. Inicia sesión nuevamente.' : error.estado === 403 ? 'No tienes permiso para realizar esta operación.' : 'No pudimos completar la solicitud. Revisa tu selección y vuelve a intentar.');
}
