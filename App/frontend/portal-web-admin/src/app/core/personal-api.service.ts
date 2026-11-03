import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Candidato, DatosEmpleado, DetalleEmpleado, Empleado, Turno, ZonaEvento } from './models';
import { Servidor } from './servidor';

/**
 * CU-007 contra `/api/v1/logistica` (Personal/Logística, en el Núcleo).
 *
 * Igual que [CuentasApiService]: todas las peticiones pasan por
 * `AuthService.conAcceso`, y el servidor vuelve a comprobar en cada una quién
 * supervisa. Lo que el portal oculta por rol es comodidad, no seguridad.
 */
@Injectable({ providedIn: 'root' })
export class PersonalApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta: string): string {
    return `${Servidor.api}/logistica/${ruta}`;
  }

  // --- Fichas -----------------------------------------------------------------

  listar(): Promise<Empleado[]> {
    return this.auth.conAcceso((h) => this.http.get<Empleado[]>(this.url('empleados'), { headers: h }));
  }

  detalle(id: string): Promise<DetalleEmpleado> {
    return this.auth.conAcceso((h) => this.http.get<DetalleEmpleado>(this.url(`empleados/${id}`), { headers: h }));
  }

  crear(usuarioId: string, datos: DatosEmpleado): Promise<Empleado> {
    return this.auth.conAcceso((h) =>
      this.http.post<Empleado>(this.url('empleados'), { usuarioId, ...datos }, { headers: h })
    );
  }

  actualizar(id: string, datos: Partial<DatosEmpleado>): Promise<Empleado> {
    return this.auth.conAcceso((h) => this.http.patch<Empleado>(this.url(`empleados/${id}`), datos, { headers: h }));
  }

  desactivar(id: string, motivo: string): Promise<{ empleado: Empleado; turnosCancelados: number }> {
    return this.auth.conAcceso((h) =>
      this.http.post<{ empleado: Empleado; turnosCancelados: number }>(
        this.url(`empleados/${id}/desactivar`),
        { motivo },
        { headers: h }
      )
    );
  }

  reactivar(id: string): Promise<Empleado> {
    return this.auth.conAcceso((h) => this.http.post<Empleado>(this.url(`empleados/${id}/reactivar`), {}, { headers: h }));
  }

  // --- Zonas y asignaciones ---------------------------------------------------

  zonas(eventoId: string): Promise<ZonaEvento[]> {
    return this.auth.conAcceso((h) =>
      this.http.get<ZonaEvento[]>(this.url('zonas'), { headers: h, params: { eventoId } })
    );
  }

  crearZona(datos: { eventoId: string; nombre: string; rolRequerido: string; personalRequerido: number }): Promise<ZonaEvento> {
    return this.auth.conAcceso((h) => this.http.post<ZonaEvento>(this.url('zonas'), datos, { headers: h }));
  }

  /** Paso 7. `excluirTurnoId`, al reasignar: el turno que se modifica no cuenta como choque. */
  candidatos(zonaId: string, horaInicio: string, horaFin: string, excluirTurnoId?: string): Promise<Candidato[]> {
    const params: Record<string, string> = { horaInicio, horaFin };
    if (excluirTurnoId) params['excluirTurnoId'] = excluirTurnoId;
    return this.auth.conAcceso((h) =>
      this.http.get<Candidato[]>(this.url(`zonas/${zonaId}/candidatos`), { headers: h, params })
    );
  }

  asignaciones(eventoId: string): Promise<Turno[]> {
    return this.auth.conAcceso((h) =>
      this.http.get<Turno[]>(this.url('asignaciones'), { headers: h, params: { eventoId } })
    );
  }

  asignar(zonaId: string, empleadoId: string, horaInicio: string, horaFin: string): Promise<{ turno: Turno; cobertura: ZonaEvento }> {
    return this.auth.conAcceso((h) =>
      this.http.post<{ turno: Turno; cobertura: ZonaEvento }>(
        this.url(`zonas/${zonaId}/asignaciones`),
        { empleadoId, horaInicio, horaFin },
        { headers: h }
      )
    );
  }

  /** CU-007C: otro empleado u otro horario sobre la misma asignación. */
  reasignar(turnoId: string, empleadoId: string, horaInicio: string, horaFin: string): Promise<{ turno: Turno }> {
    return this.auth.conAcceso((h) =>
      this.http.patch<{ turno: Turno }>(this.url(`turnos/${turnoId}/reasignar`), { empleadoId, horaInicio, horaFin }, { headers: h })
    );
  }

  cancelar(turnoId: string, motivo: string): Promise<Turno> {
    return this.auth.conAcceso((h) => this.http.post<Turno>(this.url(`turnos/${turnoId}/cancelar`), { motivo }, { headers: h }));
  }
}
