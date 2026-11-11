import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { seguirFlujo } from './flujo-sse';
import {
  AsignacionEspacio, EspacioParqueadero, IngresoVehiculo, PanelParqueadero, ReservaParqueaderoEvento, SalidaVehiculo, Tarifa, TipoVehiculo,
  ZonaParqueadero
} from './models';
import { Servidor } from './servidor';

/** CU-021 a CU-025 contra `/api/v1/parqueaderos` (en el Núcleo). */
@Injectable({ providedIn: 'root' })
export class ParqueaderosApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta: string): string {
    return `${Servidor.api}/parqueaderos${ruta}`;
  }

  tarifa(): Promise<{ vigente: Tarifa | null; historial: Tarifa[] }> {
    return this.auth.conAcceso((h) => this.http.get<{ vigente: Tarifa | null; historial: Tarifa[] }>(this.url('/tarifa'), { headers: h }));
  }

  definirTarifa(valorHora: number, motivo?: string): Promise<{ vigente: Tarifa | null; historial: Tarifa[] }> {
    return this.auth.conAcceso((h) =>
      this.http.put<{ vigente: Tarifa | null; historial: Tarifa[] }>(this.url('/tarifa'), { valorHora, ...(motivo ? { motivo } : {}) }, { headers: h }));
  }

  panel(eventoId: string): Promise<PanelParqueadero> {
    return this.auth.conAcceso((h) => this.http.get<PanelParqueadero>(this.url(`/eventos/${eventoId}/ocupacion`), { headers: h }));
  }

  crearZona(eventoId: string, datos: { nombre: string; capacidad: number; orden?: number }): Promise<ZonaParqueadero> {
    return this.auth.conAcceso((h) => this.http.post<ZonaParqueadero>(this.url(`/eventos/${eventoId}/zonas`), datos, { headers: h }));
  }

  actualizarZona(eventoId: string, zonaId: string, datos: { nombre?: string; capacidad?: number }): Promise<ZonaParqueadero> {
    return this.auth.conAcceso((h) => this.http.patch<ZonaParqueadero>(this.url(`/eventos/${eventoId}/zonas/${zonaId}`), datos, { headers: h }));
  }

  /** CU-022: por el QR de la reserva o por la placa; el servidor asigna el espacio (CU-023). */
  registrarIngreso(eventoId: string, datos: { placa?: string; codigoQr?: string; tipoVehiculo: TipoVehiculo; zonaId?: string }): Promise<IngresoVehiculo> {
    return this.auth.conAcceso((h) => this.http.post<IngresoVehiculo>(this.url(`/eventos/${eventoId}/ingresos`), datos, { headers: h }));
  }

  registrarSalida(eventoId: string, datos: { placa?: string; codigoQr?: string }): Promise<SalidaVehiculo> {
    return this.auth.conAcceso((h) => this.http.post<SalidaVehiculo>(this.url(`/eventos/${eventoId}/salidas`), datos, { headers: h }));
  }

  espacios(eventoId: string): Promise<EspacioParqueadero[]> {
    return this.auth.conAcceso((h) => this.http.get<EspacioParqueadero[]>(this.url(`/eventos/${eventoId}/espacios`), { headers: h }));
  }

  actualizarEspacio(eventoId: string, espacioId: string, datos: { tipo?: TipoVehiculo; activo?: boolean }): Promise<EspacioParqueadero> {
    return this.auth.conAcceso((h) => this.http.patch<EspacioParqueadero>(this.url(`/eventos/${eventoId}/espacios/${espacioId}`), datos, { headers: h }));
  }

  asignaciones(eventoId: string): Promise<AsignacionEspacio[]> {
    return this.auth.conAcceso((h) => this.http.get<AsignacionEspacio[]>(this.url(`/eventos/${eventoId}/asignaciones`), { headers: h }));
  }

  reservas(eventoId: string): Promise<ReservaParqueaderoEvento[]> {
    return this.auth.conAcceso((h) => this.http.get<ReservaParqueaderoEvento[]>(this.url(`/eventos/${eventoId}/reservas`), { headers: h }));
  }

  redirigir(eventoId: string, datos: { zonaOrigenId?: string; zonaDestinoId: string; motivo: string }): Promise<PanelParqueadero> {
    return this.auth.conAcceso((h) => this.http.post<PanelParqueadero>(this.url(`/eventos/${eventoId}/redirecciones`), datos, { headers: h }));
  }

  resultado(eventoId: string, redireccionId: string, resultado: string, terminar: boolean): Promise<PanelParqueadero> {
    return this.auth.conAcceso((h) =>
      this.http.patch<PanelParqueadero>(this.url(`/eventos/${eventoId}/redirecciones/${redireccionId}`), { resultado, terminar }, { headers: h }));
  }

  seguir(eventoId: string, alRecibir: (p: PanelParqueadero) => void, alCaer: (motivo: string) => void): () => void {
    return seguirFlujo(this.url(`/eventos/${eventoId}/ocupacion/flujo`), () => this.auth.tokenVigente(), 'ocupacion', alRecibir, alCaer);
  }
}
