import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Servidor } from './servidor';

export interface DatosProducto { nombre: string; descripcion: string | null; precio: string; restriccionesAlimentarias: string[]; activo: boolean }
export interface ProductoMenu extends DatosProducto {
  id: string; establecimientoId: string; cantidadInventario: number; cantidadFisica: number;
  cantidadReservada: number | null; cantidadDisponible: number | null; inventarioEstado: string;
}
export interface OperacionMenu {
  id: string; productoId: string; estado: string; codigo: string | null; motivo: string; delta: number;
  fisicoAntes: number | null; fisicoDespues: number | null; disponibleAntes: number | null; disponibleDespues: number | null;
}
export interface IntencionMenu { id: string; establecimientoId: string; productoId?: string; datos: (DatosProducto & { cantidadInicial: number }) | { delta: number; motivo: string } }

@Injectable({ providedIn: 'root' })
export class MenuApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private url(id: string, ruta: string) { return `${Servidor.api}/pedidos/establecimientos/${id}/${ruta}`; }
  misEstablecimientos(): Promise<{ id: string; nombre: string; estado: string }[]> {
    return this.auth.conAcceso(h => this.http.get<{ id: string; nombre: string; estado: string }[]>(`${Servidor.api}/pedidos/mis-establecimientos`, { headers: h }));
  }
  menu(id: string): Promise<ProductoMenu[]> { return this.auth.conAcceso(h => this.http.get<ProductoMenu[]>(this.url(id, 'menu'), { headers: h })); }
  editar(id: string, producto: string, datos: DatosProducto): Promise<ProductoMenu> {
    return this.auth.conAcceso(h => this.http.put<ProductoMenu>(this.url(id, `productos/${producto}`), datos, { headers: h }));
  }
  estado(id: string, producto: string, activo: boolean): Promise<ProductoMenu> {
    return this.auth.conAcceso(h => this.http.patch<ProductoMenu>(this.url(id, `productos/${producto}`), { activo }, { headers: h }));
  }
  historial(id: string): Promise<OperacionMenu[]> { return this.auth.conAcceso(h => this.http.get<OperacionMenu[]>(this.url(id, 'ajustes'), { headers: h })); }
  ejecutar(i: IntencionMenu): Promise<OperacionMenu | { producto: ProductoMenu; operacion: OperacionMenu }> {
    return this.auth.conAcceso(h => this.http.post<OperacionMenu | { producto: ProductoMenu; operacion: OperacionMenu }>(
      this.url(i.establecimientoId, i.productoId ? `productos/${i.productoId}/ajustes` : 'productos'), i.datos,
      { headers: h.set('Idempotency-Key', i.id) }).pipe(catchError((e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 409 && e.error?.id === i.id && e.error.estado === 'RECHAZADA') return of(e.error as OperacionMenu);
        return throwError(() => e);
      })));
  }
}
