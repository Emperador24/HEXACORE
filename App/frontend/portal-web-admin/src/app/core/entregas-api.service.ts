import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { Servidor } from './servidor';
export interface RevisionEntrega {
  pedidoId: string; version: number; puntoRevision: string; puntoEntrega: string; total: string; moneda: string;
  productos: { nombreProducto: string; cantidad: number; precioUnitario: string }[];
}
export interface IntencionEntrega { id: string; local: string; pedidoId: string; version: number; puntoRevision: string }
export interface ResultadoEntrega { id: string; pedidoId: string; estadoOperativo: string; entrega: { entregadoEn: string; puntoEntrega: string } }
@Injectable({ providedIn: 'root' })
export class EntregasApiService {
  private readonly http = inject(HttpClient); private readonly auth = inject(AuthService);
  private ruta(local: string, accion: string) { return `${Servidor.api}/pedidos/establecimientos/${local}/entregas/${accion}`; }
  prevalidar(local: string, codigoQr: string) {
    return this.auth.conAcceso(h => this.http.post<RevisionEntrega>(this.ruta(local, 'prevalidar'), { codigoQr }, { headers: h }));
  }
  confirmar(i: IntencionEntrega, codigoQr?: string) {
    const datos = { pedidoId: i.pedidoId, version: i.version, puntoRevision: i.puntoRevision, ...(codigoQr === undefined ? {} : { codigoQr }) };
    return this.auth.conAcceso(h => this.http.post<ResultadoEntrega>(this.ruta(i.local, 'confirmar'), datos, { headers: h.set('Idempotency-Key', i.id) }));
  }
}
