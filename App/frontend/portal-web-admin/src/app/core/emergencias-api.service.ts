import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { seguirFlujo } from './flujo-sse';
import { DetalleEvacuacion, Evacuacion, EventoEmergencia, PlanEvacuacion } from './models';
import { Servidor } from './servidor';

export interface DatosActivacion {
  tipo: string;
  ubicacion: string;
  nivel: number;
  alcance: 'PARCIAL' | 'TOTAL';
  zonaOrigenId?: string;
  zonasIds?: string[];
  descripcion?: string;
}

export interface DatosPlan {
  salidas: { nombre: string; capacidadPorMinuto?: number }[];
  rutas: { zonaId: string; salida: string; prioridad: number; descripcion?: string }[];
}

/** CU-010 contra `/api/v1/emergencias` (Operación, en el Núcleo). */
@Injectable({ providedIn: 'root' })
export class EmergenciasApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta: string): string {
    return `${Servidor.api}/emergencias${ruta}`;
  }

  eventos(): Promise<EventoEmergencia[]> {
    return this.auth.conAcceso((h) => this.http.get<EventoEmergencia[]>(this.url('/eventos'), { headers: h }));
  }

  historial(eventoId: string): Promise<Evacuacion[]> {
    return this.auth.conAcceso((h) => this.http.get<Evacuacion[]>(this.url(`/eventos/${eventoId}/evacuaciones`), { headers: h }));
  }

  plan(recintoId: string): Promise<PlanEvacuacion> {
    return this.auth.conAcceso((h) => this.http.get<PlanEvacuacion>(this.url(`/recintos/${recintoId}/plan`), { headers: h }));
  }

  guardarPlan(recintoId: string, datos: DatosPlan): Promise<PlanEvacuacion> {
    return this.auth.conAcceso((h) => this.http.put<PlanEvacuacion>(this.url(`/recintos/${recintoId}/plan`), datos, { headers: h }));
  }

  detalle(id: string): Promise<DetalleEvacuacion> {
    return this.auth.conAcceso((h) => this.http.get<DetalleEvacuacion>(this.url(`/evacuaciones/${id}`), { headers: h }));
  }

  /** Pasos 1-6. */
  proponer(eventoId: string, datos: DatosActivacion): Promise<DetalleEvacuacion> {
    return this.auth.conAcceso((h) => this.http.post<DetalleEvacuacion>(this.url(`/eventos/${eventoId}/evacuaciones`), datos, { headers: h }));
  }

  confirmar(id: string): Promise<DetalleEvacuacion> {
    return this.accion(id, '/confirmar', {});
  }

  descartar(id: string): Promise<DetalleEvacuacion> {
    return this.accion(id, '/descartar', {});
  }

  reportarZona(id: string, zonaId: string, datos: { personasRestantes?: number; estado?: string }): Promise<DetalleEvacuacion> {
    return this.auth.conAcceso((h) => this.http.patch<DetalleEvacuacion>(this.url(`/evacuaciones/${id}/zonas/${zonaId}`), datos, { headers: h }));
  }

  cambiarRuta(id: string, zonaId: string, salidaId: string, motivo?: string): Promise<DetalleEvacuacion> {
    return this.accion(id, `/zonas/${zonaId}/ruta`, { salidaId, motivo });
  }

  bloqueo(id: string, salidaId: string, bloqueada: boolean, motivo?: string): Promise<DetalleEvacuacion> {
    return this.accion(id, `/salidas/${salidaId}/bloqueo`, { bloqueada, ...(motivo ? { motivo } : {}) });
  }

  escalar(id: string, nivel: number, motivo: string): Promise<DetalleEvacuacion> {
    return this.accion(id, '/nivel', { nivel, motivo });
  }

  finalizar(id: string, observaciones?: string): Promise<DetalleEvacuacion> {
    return this.accion(id, '/finalizar', observaciones ? { observaciones } : {});
  }

  reporte(id: string): Promise<Record<string, unknown>> {
    return this.auth.conAcceso((h) => this.http.get<Record<string, unknown>>(this.url(`/evacuaciones/${id}/reporte`), { headers: h }));
  }

  seguir(id: string, alRecibir: (d: DetalleEvacuacion) => void, alCaer: (motivo: string) => void): () => void {
    return seguirFlujo(this.url(`/evacuaciones/${id}/flujo`), () => this.auth.tokenVigente(), 'evacuacion', alRecibir, alCaer);
  }

  private accion(id: string, ruta: string, cuerpo: object): Promise<DetalleEvacuacion> {
    return this.auth.conAcceso((h) => this.http.post<DetalleEvacuacion>(this.url(`/evacuaciones/${id}${ruta}`), cuerpo, { headers: h }));
  }
}
