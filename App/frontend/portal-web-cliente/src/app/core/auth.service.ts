import { Injectable, signal } from '@angular/core';
import { Usuario } from './models';

const CONTRASENA_DEMO = '1234';

/** Usuario de ejemplo — mismo patrón que MockAuth en app-movil-cliente (rol Cliente). */
const USUARIO_DEMO: Usuario = {
  id: 'usr-cliente-1',
  nombre: 'Ana Torres',
  correo: 'cliente@hexacore.com',
  telefono: '300 123 4567',
  fotoUrl: null
};

/**
 * Autenticación mock: sin backend todavía, un solo usuario demo (rol
 * Cliente — este portal no atiende Personal/Administrador, esos viven en
 * portal-web-admin). Se reemplaza por una llamada real al API Gateway
 * cuando el Servicio de Personal/Usuarios (SAD §5) esté disponible.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _usuarioActual = signal<Usuario | null>(null);
  readonly usuarioActual = this._usuarioActual.asReadonly();

  iniciarSesion(correo: string, contrasena: string): boolean {
    if (contrasena !== CONTRASENA_DEMO) return false;
    if (correo.trim().toLowerCase() !== USUARIO_DEMO.correo) return false;
    this._usuarioActual.set(USUARIO_DEMO);
    return true;
  }

  actualizarPerfil(datos: Pick<Usuario, 'correo' | 'telefono' | 'fotoUrl'>): void {
    this._usuarioActual.update((usuario) => (usuario ? { ...usuario, ...datos } : usuario));
  }

  cerrarSesion(): void {
    this._usuarioActual.set(null);
  }
}
