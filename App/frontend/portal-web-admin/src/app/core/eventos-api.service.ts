import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DatosEvento, DetalleEvento, Disponibilidad, EstadoEvento, EventoResumen, Recinto } from './models';
import { Servidor } from './servidor';

/**
 * CU-026 contra `/api/v1/eventos` y `/api/v1/recintos` (eventos-recintos, en
 * el Núcleo). Como el resto de servicios del portal, todo pasa por
 * `AuthService.conAcceso`. Editar, publicar y cancelar envían la `version` que
 * se tenía en pantalla: si otra persona guardó antes, el servidor responde 409
 * en vez de pisar sus cambios.
 */
@Injectable({ providedIn: 'root' })
export class EventosApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta = ''): string {
    return `${Servidor.api}/eventos${ruta}`;
  }

  recintos(): Promise<Recinto[]> {
    return this.auth.conAcceso((h) => this.http.get<Recinto[]>(`${Servidor.api}/recintos`, { headers: h }));
  }

  listar(estado?: EstadoEvento): Promise<EventoResumen[]> {
    const params: Record<string, string> = estado ? { estado } : {};
    return this.auth.conAcceso((h) => this.http.get<EventoResumen[]>(this.url(), { headers: h, params }));
  }

  detalle(id: string): Promise<DetalleEvento> {
    return this.auth.conAcceso((h) => this.http.get<DetalleEvento>(this.url(`/${id}`), { headers: h }));
  }

  /** Paso 5 antes de guardar. */
  disponibilidad(recintoId: string, fechaInicio: string, fechaFin: string, excluirEventoId?: string): Promise<Disponibilidad> {
    const params: Record<string, string> = { recintoId, fechaInicio, fechaFin };
    if (excluirEventoId) params['excluirEventoId'] = excluirEventoId;
    return this.auth.conAcceso((h) => this.http.get<Disponibilidad>(this.url('/disponibilidad'), { headers: h, params }));
  }

  crear(datos: DatosEvento): Promise<DetalleEvento> {
    return this.auth.conAcceso((h) => this.http.post<DetalleEvento>(this.url(), datos, { headers: h }));
  }

  actualizar(id: string, datos: DatosEvento): Promise<DetalleEvento> {
    return this.auth.conAcceso((h) => this.http.put<DetalleEvento>(this.url(`/${id}`), datos, { headers: h }));
  }

  publicar(id: string, version: number): Promise<DetalleEvento> {
    return this.auth.conAcceso((h) => this.http.post<DetalleEvento>(this.url(`/${id}/publicar`), { version }, { headers: h }));
  }

  cancelar(id: string, version: number, motivo: string): Promise<DetalleEvento> {
    return this.auth.conAcceso((h) => this.http.post<DetalleEvento>(this.url(`/${id}/cancelar`), { version, motivo }, { headers: h }));
  }

  eliminar(id: string, version: number): Promise<void> {
    return this.auth.conAcceso((h) =>
      this.http.delete<void>(this.url(`/${id}`), { headers: h, params: { version: String(version) } })
    );
  }
}
