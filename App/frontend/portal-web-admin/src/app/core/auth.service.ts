import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { ROLES_DEL_PORTAL, Usuario } from './models';
import { Servidor } from './servidor';

/** Error del Servicio de Administración, con el mensaje que manda el servidor. */
export class ErrorCuenta extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number
  ) {
    super(mensaje);
  }
}

interface SesionDelServidor {
  token: string;
  expiraEn: string;
  usuario: { id: string; nombre: string; email: string; roles: string[] };
}

interface RenovacionDelServidor {
  token: string;
  expiraEn: string;
  roles: string[];
}

const SIN_CONEXION = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
const SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';
const SIN_PERMISO =
  'Esta cuenta no tiene permisos de administración. Si eres cliente usa el portal de clientes; ' +
  'si eres del personal, la app móvil.';

/** Se renueva un poco antes de que el acceso caduque. */
const MARGEN_RENOVACION_MS = 60_000;
const ESPERA_MS = 15_000;

/**
 * Sesión del portal administrativo — CU-027 contra el Servicio de
 * Administración, a través del API Gateway.
 *
 * Es el mismo mecanismo que `portal-web-cliente`, con una diferencia: allí se
 * exige el rol `Cliente` y aquí `Administrador` u `Organizador`. Se comprueba
 * **también al renovar**, no solo al entrar: si a alguien le quitan el rol
 * mientras tiene la pestaña abierta, la siguiente renovación lo saca en vez de
 * dejarlo dentro hasta que cierre el navegador.
 *
 * ## Dónde vive cada token
 *
 * - **Acceso** (15 min): solo en memoria. Nunca en `localStorage`, donde
 *   cualquier script inyectado podría leerlo.
 * - **Renovación** (30 días sin uso): en una cookie `HttpOnly` que pone el
 *   servidor y que JavaScript no puede leer. Este servicio ni la ve: solo pide
 *   al navegador que la envíe (`withCredentials`).
 *
 * Al recargar la página la memoria se pierde y [restaurar] recupera la sesión
 * en silencio con esa cookie. Antes no había nada que recuperar: recargar
 * echaba fuera.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _usuarioActual = signal<Usuario | null>(null);
  readonly usuarioActual = this._usuarioActual.asReadonly();

  /** Roles de quien está dentro. El menú lateral se calcula con esto. */
  readonly roles = computed(() => this._usuarioActual()?.roles ?? []);

  /** Por qué se cerró la sesión sin que la persona lo pidiera. El login lo muestra y lo limpia. */
  readonly motivoCierre = signal<string | null>(null);

  private token: string | null = null;
  private expiraEn = 0;
  private renovacionEnCurso: Promise<boolean> | null = null;

  // --- Arranque ---------------------------------------------------------------

  /** Recupera la sesión tras recargar la página, si la cookie sigue valiendo. */
  async restaurar(): Promise<void> {
    try {
      if (await this.renovar()) await this.cargarUsuario();
    } catch {
      // Sin backend al arrancar: el portal abre en el login, como un visitante.
      this.limpiar();
    }
  }

  // --- Sin sesión -------------------------------------------------------------

  /** CU-027 pasos 8-9. Solo entran Administrador y Organizador. */
  async iniciarSesion(correo: string, contrasena: string): Promise<void> {
    const sesion = await this.enviar(
      this.http.post<SesionDelServidor>(
        this.url('sesiones'),
        { email: correo.trim(), contrasena },
        { headers: this.cabeceras(), withCredentials: true }
      )
    );
    this.guardarAcceso(sesion.token, sesion.expiraEn);
    if (!this.puedeEntrar(sesion.usuario.roles)) {
      // Se cierra también en el servidor: no se deja un token vivo sin uso.
      await this.cerrarSesion();
      throw new ErrorCuenta('SIN_ROL', SIN_PERMISO, 403);
    }
    this.motivoCierre.set(null);
    this._usuarioActual.set(this.aUsuario(sesion.usuario));
  }

  // --- Con sesión -------------------------------------------------------------

  /**
   * Cierra la sesión también en el servidor —el token deja de valer en todo el
   * sistema y la cookie se borra—. En el navegador se cierra pase lo que pase.
   */
  async cerrarSesion(): Promise<void> {
    try {
      if (this.token) {
        await this.conAcceso((cabeceras) =>
          this.http.delete(this.url('sesiones/actual'), { headers: cabeceras, withCredentials: true })
        );
      }
    } catch {
      // Sin red o sesión ya cerrada: no hay nada más que hacer en el servidor.
    } finally {
      this.limpiar();
    }
  }

  // --- Tokens -----------------------------------------------------------------

  /**
   * Ejecuta una petición con un token de acceso vigente: renueva antes si está
   * por caducar, y ante un 401 renueva y la repite **una vez**. Repetir es
   * seguro: un 401 es un rechazo antes de hacer nada.
   *
   * Es público porque los servicios de datos del portal (cuentas, y mañana
   * eventos) pasan por aquí en vez de manejar tokens cada uno por su cuenta.
   */
  async conAcceso<T>(peticion: (cabeceras: HttpHeaders) => Observable<T>): Promise<T> {
    if (!this.token || this.expiraEn - Date.now() < MARGEN_RENOVACION_MS) await this.renovar();
    const token = this.token;
    if (!token) throw new ErrorCuenta('SIN_SESION', SESION_TERMINADA, 401);

    try {
      return await this.enviar(peticion(this.cabeceras(token)));
    } catch (error) {
      if (!(error instanceof ErrorCuenta) || error.estado !== 401) throw error;
      await this.renovar(token);
      const nuevo = this.token;
      if (nuevo && nuevo !== token) {
        try {
          return await this.enviar(peticion(this.cabeceras(nuevo)));
        } catch (reintento) {
          if (reintento instanceof ErrorCuenta && reintento.estado === 401) this.caducada(reintento.message);
          throw reintento;
        }
      }
      this.caducada(error.message);
      throw error;
    }
  }

  /**
   * Renueva el token de acceso con la cookie. Comparte la renovación en curso:
   * si varias peticiones renovaran a la vez, la segunda usaría un token ya
   * gastado y el servidor cerraría la sesión por posible robo.
   */
  renovar(tokenRechazado?: string): Promise<boolean> {
    if (tokenRechazado && tokenRechazado !== this.token) return Promise.resolve(this.token !== null);
    this.renovacionEnCurso ??= this.hacerRenovacion().finally(() => (this.renovacionEnCurso = null));
    return this.renovacionEnCurso;
  }

  private async hacerRenovacion(): Promise<boolean> {
    try {
      const r = await this.enviar(
        this.http.post<RenovacionDelServidor>(
          this.url('sesiones/renovar'),
          {},
          { headers: this.cabeceras(), withCredentials: true }
        )
      );
      if (!this.puedeEntrar(r.roles)) {
        // Le quitaron el rol mientras tenía la pestaña abierta.
        this.guardarAcceso(r.token, r.expiraEn);
        const habiaSesion = this._usuarioActual() !== null;
        await this.cerrarSesion();
        if (habiaSesion) this.motivoCierre.set(SIN_PERMISO);
        return false;
      }
      this.guardarAcceso(r.token, r.expiraEn);
      this._usuarioActual.update((u) => (u ? { ...u, roles: r.roles } : u));
      return true;
    } catch (error) {
      if (error instanceof ErrorCuenta && (error.estado === 401 || error.estado === 400)) {
        // Sin cookie es un visitante: no hay nada que avisar. Con una cookie que
        // ya no vale (sesión cerrada desde otro sitio), sí: si no, la persona
        // vería el login sin saber por qué.
        this.caducada(error.message, error.codigo !== 'SIN_SESION');
        return false;
      }
      // Sin red: la sesión que hubiera se conserva; la petición fallará.
      throw error;
    }
  }

  private async cargarUsuario(): Promise<void> {
    const u = await this.conAcceso((cabeceras) =>
      this.http.get<SesionDelServidor['usuario']>(this.url('sesiones/actual'), { headers: cabeceras })
    );
    this._usuarioActual.set(this.aUsuario(u));
  }

  // --- Apoyo ------------------------------------------------------------------

  private puedeEntrar(roles: string[]): boolean {
    return roles.some((rol) => ROLES_DEL_PORTAL.includes(rol));
  }

  private aUsuario(u: SesionDelServidor['usuario']): Usuario {
    return { id: u.id, nombre: u.nombre, correo: u.email, roles: u.roles };
  }

  /** El servidor dijo que la sesión ya no vale. */
  private caducada(motivo: string, avisarSiempre = false): void {
    const habiaSesion = this._usuarioActual() !== null;
    this.limpiar();
    if (habiaSesion || avisarSiempre) this.motivoCierre.set(motivo || SESION_TERMINADA);
  }

  private guardarAcceso(token: string, expiraEn: string): void {
    this.token = token;
    this.expiraEn = new Date(expiraEn).getTime();
  }

  private limpiar(): void {
    this.token = null;
    this.expiraEn = 0;
    this._usuarioActual.set(null);
  }

  // --- Transporte -------------------------------------------------------------

  private url(ruta: string): string {
    return `${Servidor.api}/${ruta}`;
  }

  /**
   * `X-Hexacore-Cliente: web` pide al servidor la cookie en vez del token de
   * renovación en el cuerpo.
   */
  private cabeceras(token?: string): HttpHeaders {
    let cabeceras = new HttpHeaders({ 'X-Hexacore-Cliente': 'web' });
    if (token) cabeceras = cabeceras.set('Authorization', `Bearer ${token}`);
    return cabeceras;
  }

  private async enviar<T>(peticion: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(peticion.pipe(timeout(ESPERA_MS)));
    } catch (error) {
      throw this.aError(error);
    }
  }

  private aError(error: unknown): ErrorCuenta {
    if (!(error instanceof HttpErrorResponse) || error.status === 0) {
      return new ErrorCuenta('SIN_CONEXION', SIN_CONEXION, 0);
    }
    const cuerpo = error.error as { codigo?: string; mensaje?: string; message?: string | string[] } | null;
    if (cuerpo?.codigo) return new ErrorCuenta(cuerpo.codigo, cuerpo.mensaje ?? cuerpo.codigo, error.status);
    if (cuerpo?.message) {
      const texto = Array.isArray(cuerpo.message) ? cuerpo.message.join('\n') : cuerpo.message;
      return new ErrorCuenta('VALIDACION', texto, error.status);
    }
    if (error.status === 429 || error.status >= 500) {
      return new ErrorCuenta(
        'NO_DISPONIBLE',
        'El servicio está muy ocupado en este momento. Intenta de nuevo en unos segundos.',
        error.status
      );
    }
    return new ErrorCuenta('ERROR', error.message, error.status);
  }
}
