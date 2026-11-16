import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { Servidor } from './servidor';
export interface CancelacionPedido { operacionId: string; pedidoId: string; motivo: string; canceladoEn: string;
  inventario: 'PENDIENTE' | 'RESTITUIDO' | 'NO_REINCORPORAR' | 'REVISION';
  reembolso: { estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'INCIERTO'; monto: string; moneda: string; referencia: string | null; resueltoEn: string | null } }
export interface IntencionCancelacion { id: string; local: string; pedido: string; datos: { version: number; motivo: string; confirmar: true } }
export interface AvancePedido { estado: string; version: number; iniciadoEn: string | null; estimadoListoEn: string | null; listoEn: string | null; incidenciasAbiertas: number; retrasado: boolean }
export interface PedidoRecibido { estadoOperativo?: string; entrega?: {entregadoEn:string;puntoEntrega:string} | null; id: string; estado: string; total: string; moneda: string; pagoVerificado: boolean; confirmadoEn: string | null; preparacion: AvancePedido;
  cancelacion?: CancelacionPedido | null;
  productos: { productoId: string; nombreProducto: string; cantidad: number; precioUnitario: string }[];
  incidencias?: { id: string; descripcion: string; resueltaEn: string | null; resolucion: string | null }[];
  avisos?: { id: string; mensaje: string; creadoEn: string }[];
  historial?: { id: string; actorId: string; accion: string; versionNueva: number; creadoEn: string }[] }
export interface DatosPreparacion { accion: 'INICIAR' | 'RETRASAR' | 'LISTO' | 'INCIDENCIA' | 'RESOLVER_INCIDENCIA'; version: number; minutos?: number; motivo?: string; incidenciaId?: string; productoId?: string }
export interface IntencionPreparacion { id: string; local: string; pedido: string; datos: DatosPreparacion }
@Injectable({ providedIn: 'root' })
export class PreparacionApiService {
  private readonly http = inject(HttpClient); private readonly auth = inject(AuthService);
  private url(local: string, ruta = '') { return `${Servidor.api}/pedidos/establecimientos/${local}/pedidos${ruta}`; }
  listar(local: string, pagina = 0) { return this.auth.conAcceso(h => this.http.get<PedidoRecibido[]>(this.url(local) + (pagina ? `?pagina=${pagina}` : ''), { headers: h })); }
  detalle(local: string, pedido: string) { return this.auth.conAcceso(h => this.http.get<PedidoRecibido>(this.url(local, `/${pedido}`), { headers: h })); }
  operar(i: IntencionPreparacion) { return this.auth.conAcceso(h => this.http.post<{ id: string; preparacion: AvancePedido }>(this.url(i.local, `/${i.pedido}/preparacion`), i.datos, { headers: h.set('Idempotency-Key', i.id) })); }
  cancelar(i: IntencionCancelacion) { return this.auth.conAcceso(h => this.http.post<CancelacionPedido>(this.url(i.local, `/${i.pedido}/cancelacion`), i.datos, { headers: h.set('Idempotency-Key', i.id) })); }
  cancelacion(local: string, pedido: string) { return this.auth.conAcceso(h => this.http.get<CancelacionPedido>(this.url(local, `/${pedido}/cancelacion`), { headers: h })); }
}
