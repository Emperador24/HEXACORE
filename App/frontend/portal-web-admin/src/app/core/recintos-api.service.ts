import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DatosRecinto, DetalleRecinto, RecintoResumen } from './models';
import { Servidor } from './servidor';

/** CU-029 contra `/api/v1/recintos` (eventos-recintos, en el Núcleo). */
@Injectable({ providedIn: 'root' })
export class RecintosApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta = ''): string {
    return `${Servidor.api}/recintos${ruta}`;
  }

  /** Todos, también los inactivos, con su uso. */
  listar(): Promise<RecintoResumen[]> {
    return this.auth.conAcceso((h) => this.http.get<RecintoResumen[]>(this.url(), { headers: h, params: { todos: 'true' } }));
  }

  detalle(id: string): Promise<DetalleRecinto> {
    return this.auth.conAcceso((h) => this.http.get<DetalleRecinto>(this.url(`/${id}`), { headers: h }));
  }

  crear(datos: DatosRecinto): Promise<DetalleRecinto> {
    return this.auth.conAcceso((h) => this.http.post<DetalleRecinto>(this.url(), datos, { headers: h }));
  }

  actualizar(id: string, datos: DatosRecinto): Promise<DetalleRecinto> {
    return this.auth.conAcceso((h) => this.http.put<DetalleRecinto>(this.url(`/${id}`), datos, { headers: h }));
  }

  eliminar(id: string): Promise<void> {
    return this.auth.conAcceso((h) => this.http.delete<void>(this.url(`/${id}`), { headers: h }));
  }

  /** El plano viene con autorización, así que se baja como blob y se muestra con una URL local. */
  plano(id: string): Promise<Blob> {
    return this.auth.conAcceso((h) => this.http.get(this.url(`/${id}/plano`), { headers: h, responseType: 'blob' }));
  }

  subirPlano(id: string, archivo: File): Promise<{ tipo: string; tamano: number }> {
    const cuerpo = new FormData();
    cuerpo.append('plano', archivo);
    return this.auth.conAcceso((h) => this.http.put<{ tipo: string; tamano: number }>(this.url(`/${id}/plano`), cuerpo, { headers: h }));
  }

  quitarPlano(id: string): Promise<void> {
    return this.auth.conAcceso((h) => this.http.delete<void>(this.url(`/${id}/plano`), { headers: h }));
  }
}
