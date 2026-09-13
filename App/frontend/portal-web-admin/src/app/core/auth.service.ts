import { Injectable, signal } from '@angular/core';
import { RolAdmin, Usuario } from './models';

const CONTRASENA_DEMO = '1234';

/** Usuarios de ejemplo — el mismo patrón que MockAuth en app-movil-cliente. */
const USUARIOS: ReadonlyArray<Usuario> = [
  { id: 'usr-org-1', nombre: 'Camila Rojas', correo: 'organizador@hexacore.com', rol: RolAdmin.ORGANIZADOR },
  { id: 'usr-admin-1', nombre: 'Jorge Salazar', correo: 'administrador@hexacore.com', rol: RolAdmin.ADMINISTRADOR },
  {
    id: 'usr-sup-1',
    nombre: 'Elena Vargas',
    correo: 'supervisor@hexacore.com',
    rol: RolAdmin.SUPERVISOR_EMERGENCIA
  }
];

/**
 * Autenticación mock: sin backend todavía, un solo login detecta el rol por
 * el correo (Organizador, Administrador o Supervisor de Emergencia) y el
 * shell decide qué secciones mostrar — ver ShellComponent.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _usuarioActual = signal<Usuario | null>(null);
  readonly usuarioActual = this._usuarioActual.asReadonly();

  iniciarSesion(correo: string, contrasena: string): boolean {
    if (contrasena !== CONTRASENA_DEMO) return false;
    const usuario = USUARIOS.find((u) => u.correo.toLowerCase() === correo.trim().toLowerCase());
    if (!usuario) return false;
    this._usuarioActual.set(usuario);
    return true;
  }

  cerrarSesion(): void {
    this._usuarioActual.set(null);
  }
}
