import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Cuenta, DetalleCuenta, EstadoCuenta, PaginaCuentas } from './models';
import { Servidor } from './servidor';

export interface FiltroCuentas {
  busqueda?: string;
  estado?: EstadoCuenta;
  incluirEliminadas?: boolean;
  limite?: number;
  desplazamiento?: number;
}

/**
 * Gestión de cuentas de usuario — **CU-027B**, contra
 * `/api/v1/admin/cuentas` del Servicio de Administración.
 *
 * Todas las peticiones pasan por [AuthService.conAcceso], que pone el token
 * vigente y lo renueva si hace falta: aquí no se manejan tokens. El gateway
 * exige sesión antes de enrutar y el servicio vuelve a comprobar que quien
 * llama sea un administrador **activo**, contra la base y en cada petición —
 * no basta con lo que diga el token.
 */
@Injectable({ providedIn: 'root' })
export class CuentasApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta = ''): string {
    return `${Servidor.api}/admin/cuentas${ruta}`;
  }

  /** Busca cuentas por nombre o correo, filtra por estado y pagina. */
  listar(filtro: FiltroCuentas = {}): Promise<PaginaCuentas> {
    let params = new HttpParams();
    if (filtro.busqueda?.trim()) params = params.set('busqueda', filtro.busqueda.trim());
    if (filtro.estado) params = params.set('estado', filtro.estado);
    if (filtro.incluirEliminadas) params = params.set('incluirEliminadas', 'true');
    params = params
      .set('limite', String(filtro.limite ?? 20))
      .set('desplazamiento', String(filtro.desplazamiento ?? 0));

    return this.auth.conAcceso((cabeceras) =>
      this.http.get<PaginaCuentas>(this.url(), { headers: cabeceras, params })
    );
  }

  /** Detalle con su historial de administración (las 20 acciones más recientes). */
  detalle(id: string): Promise<DetalleCuenta> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.get<DetalleCuenta>(this.url(`/${id}`), { headers: cabeceras })
    );
  }

  /**
   * Activa o reactiva. Una cuenta pendiente de verificar pasa a activa sin el
   * correo: el administrador responde por ella. El motivo es opcional.
   */
  activar(id: string, motivo?: string): Promise<Cuenta> {
    const cuerpo = motivo?.trim() ? { motivo: motivo.trim() } : {};
    return this.auth.conAcceso((cabeceras) =>
      this.http.post<Cuenta>(this.url(`/${id}/activar`), cuerpo, { headers: cabeceras })
    );
  }

  /**
   * Desactiva (CU-027B). Cierra **todas** las sesiones abiertas de esa persona,
   * también en el resto de servicios, y exige un motivo que queda auditado.
   */
  desactivar(id: string, motivo: string): Promise<Cuenta> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.post<Cuenta>(this.url(`/${id}/desactivar`), { motivo: motivo.trim() }, { headers: cabeceras })
    );
  }

  /**
   * Elimina: **anonimiza** la cuenta y la deja desactivada para siempre. La
   * fila se conserva porque otros servicios guardan su identificador (ADR-01),
   * y el correo queda libre para un registro nuevo.
   */
  eliminar(id: string, motivo: string): Promise<Cuenta> {
    return this.auth.conAcceso((cabeceras) =>
      this.http.delete<Cuenta>(this.url(`/${id}`), { headers: cabeceras, body: { motivo: motivo.trim() } })
    );
  }
}
