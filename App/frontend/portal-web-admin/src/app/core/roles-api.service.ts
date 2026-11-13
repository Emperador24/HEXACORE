import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { CatalogoPermisos, DetalleRol, PermisoRol, RolConPermisos } from './models';
import { Servidor } from './servidor';

/**
 * Roles y permisos — **CU-028**, contra `/api/v1/admin/roles` de Identidad.
 *
 * Como en cuentas, el servidor comprueba en cada petición que quien llama sea
 * un administrador activo. Lo que se guarda aquí llega a las sesiones abiertas
 * en su petición siguiente (CU-028B), sin que nadie tenga que volver a entrar.
 */
@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta = ''): string {
    return `${Servidor.api}/admin/roles${ruta}`;
  }

  listar(): Promise<{ roles: RolConPermisos[]; catalogo: CatalogoPermisos }> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.get<{ roles: RolConPermisos[]; catalogo: CatalogoPermisos }>(this.url(), { headers: cabeceras })
    );
  }

  detalle(id: string): Promise<DetalleRol> {
    return this.auth.conAcceso((cabeceras) => this.http.get<DetalleRol>(this.url(`/${id}`), { headers: cabeceras }));
  }

  crear(nombre: string, descripcion: string, permisos: PermisoRol[]): Promise<RolConPermisos> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.post<RolConPermisos>(this.url(), { nombre, descripcion, permisos }, { headers: cabeceras })
    );
  }

  /** Reemplaza la matriz. `version` es la que se editó: si otro guardó antes, 409. */
  editar(id: string, descripcion: string, permisos: PermisoRol[], version: number): Promise<RolConPermisos> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.put<RolConPermisos>(this.url(`/${id}`), { descripcion, permisos, version }, { headers: cabeceras })
    );
  }

  /** CU-028A: con usuarios activos exige `reasignarA`. */
  eliminar(id: string, version: number, reasignarA?: string): Promise<{ eliminado: string; reasignados: number }> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.delete<{ eliminado: string; reasignados: number }>(this.url(`/${id}`), {
        headers: cabeceras,
        body: reasignarA ? { version, reasignarA } : { version }
      })
    );
  }

  asignar(id: string, email: string): Promise<DetalleRol> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.post<DetalleRol>(this.url(`/${id}/usuarios`), { email }, { headers: cabeceras })
    );
  }

  retirar(id: string, usuarioId: string): Promise<DetalleRol> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.delete<DetalleRol>(this.url(`/${id}/usuarios/${usuarioId}`), { headers: cabeceras })
    );
  }
}
