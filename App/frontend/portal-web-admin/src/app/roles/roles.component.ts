import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { ErrorCuenta } from '../core/auth.service';
import { CatalogoPermisos, DetalleRol, PermisoRol, RolConPermisos } from '../core/models';
import { RolesApiService } from '../core/roles-api.service';

/** Lo que se está editando: un rol existente o uno nuevo (sin id). */
interface Borrador {
  id: string | null;
  nombre: string;
  descripcion: string;
  version: number;
  delSistema: boolean;
  marcados: Set<string>;
}

const ETIQUETAS_ACCION: Record<string, string> = {
  leer: 'Leer',
  crear: 'Crear',
  actualizar: 'Actualizar',
  eliminar: 'Eliminar'
};

const ETIQUETAS_AUDITORIA: Record<string, string> = {
  CREAR: 'Creó el rol',
  EDITAR: 'Cambió permisos',
  ELIMINAR: 'Eliminó el rol',
  ASIGNAR: 'Asignó una cuenta',
  RETIRAR: 'Retiró una cuenta'
};

/**
 * Roles y permisos — **CU-028**.
 *
 * Muestra los roles y la matriz por módulo (paso 2), deja crear un rol propio
 * o editar uno (pasos 3 a 6) y asignarlo a cuentas. Los cuatro roles del
 * sistema se ven, pero no se editan: sus reglas las fija el código.
 *
 * Guardar no toca la sesión de nadie: la matriz nueva se aplica en la petición
 * siguiente de cada sesión abierta (CU-028B).
 */
@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule
  ],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.scss'
})
export class RolesComponent {
  private readonly api = inject(RolesApiService);
  private readonly dialogo = inject(MatDialog);

  readonly roles = signal<RolConPermisos[]>([]);
  readonly catalogo = signal<CatalogoPermisos>({ modulos: [], acciones: [] });
  readonly detalle = signal<DetalleRol | null>(null);
  readonly borrador = signal<Borrador | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  correoAsignar = '';
  reasignarA = '';

  readonly propios = computed(() => this.roles().filter((r) => !r.delSistema));
  readonly delSistema = computed(() => this.roles().filter((r) => r.delSistema));
  /** A dónde pueden pasar los usuarios del rol que se elimina: cualquier otro. */
  readonly destinos = computed(() => this.roles().filter((r) => r.id !== this.borrador()?.id));
  readonly cuentaMarcados = computed(() => this.borrador()?.marcados.size ?? 0);

  constructor() {
    void this.cargar();
  }

  async cargar(seleccionar?: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const { roles, catalogo } = await this.api.listar();
      this.roles.set(roles);
      this.catalogo.set(catalogo);
      // Un rol nuevo sin guardar (sin id) se conserva; uno que ya no existe se cierra.
      const id = seleccionar ?? this.borrador()?.id ?? null;
      const rol = id ? roles.find((r) => r.id === id) : undefined;
      if (rol) await this.abrir(rol);
      else if (id) this.cerrar();
    } catch (e) {
      this.error.set(this.mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }

  nuevo(): void {
    this.detalle.set(null);
    this.reasignarA = '';
    this.borrador.set({ id: null, nombre: '', descripcion: '', version: 0, delSistema: false, marcados: new Set() });
  }

  async abrir(rol: RolConPermisos): Promise<void> {
    this.reasignarA = '';
    this.borrador.set({
      id: rol.id,
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      version: rol.version,
      delSistema: rol.delSistema,
      marcados: new Set(rol.permisos.map((p) => this.clave(p.modulo, p.accion)))
    });
    try {
      this.detalle.set(await this.api.detalle(rol.id));
    } catch (e) {
      this.error.set(this.mensaje(e));
    }
  }

  cerrar(): void {
    this.borrador.set(null);
    this.detalle.set(null);
  }

  marcado(modulo: string, accion: string): boolean {
    return this.borrador()?.marcados.has(this.clave(modulo, accion)) ?? false;
  }

  alternar(modulo: string, accion: string): void {
    this.borrador.update((b) => {
      if (!b) return b;
      const marcados = new Set(b.marcados);
      const k = this.clave(modulo, accion);
      if (marcados.has(k)) marcados.delete(k);
      else marcados.add(k);
      return { ...b, marcados };
    });
  }

  actualizarTexto(campo: 'nombre' | 'descripcion', valor: string): void {
    this.borrador.update((b) => (b ? { ...b, [campo]: valor } : b));
  }

  /** Paso 6. El paso 5 (al menos un permiso) lo valida también el servidor. */
  async guardar(): Promise<void> {
    const b = this.borrador();
    if (!b || b.delSistema) return;
    const permisos: PermisoRol[] = [...b.marcados].map((k) => {
      const [modulo, accion] = k.split(':');
      return { modulo, accion };
    });
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      const rol = b.id
        ? await this.api.editar(b.id, b.descripcion, permisos, b.version)
        : await this.api.crear(b.nombre.trim(), b.descripcion, permisos);
      this.aviso.set(
        b.id
          ? `Permisos de «${rol.nombre}» guardados. Las sesiones abiertas con este rol ya los aplican.`
          : `Rol «${rol.nombre}» creado.`
      );
      await this.cargar(rol.id);
    } catch (e) {
      this.error.set(this.mensaje(e));
      // Otro administrador guardó antes: se recarga lo vigente para decidir sobre eso.
      if (e instanceof ErrorCuenta && e.codigo === 'VERSION_DESACTUALIZADA') await this.cargar(b.id ?? undefined);
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(): Promise<void> {
    const b = this.borrador();
    const d = this.detalle();
    if (!b?.id || !d) return;
    const conUsuarios = d.usuarios > 0;
    if (conUsuarios && !this.reasignarA) {
      this.error.set(`El rol tiene ${d.usuarios} usuarios activos. Elige a qué rol pasarlos antes de eliminarlo.`);
      return;
    }
    const destino = this.roles().find((r) => r.id === this.reasignarA)?.nombre;
    const ok = await this.confirmar({
      titulo: `Eliminar «${b.nombre}»`,
      mensaje: conUsuarios
        ? `Sus ${d.usuarios} usuarios pasan a «${destino}» y pierden en el acto los permisos de este rol.`
        : 'Nadie tiene este rol asignado. No se puede deshacer.',
      accion: 'Eliminar rol',
      peligrosa: true
    });
    if (ok === undefined) return;
    await this.accion(async () => {
      const r = await this.api.eliminar(b.id!, b.version, conUsuarios ? this.reasignarA : undefined);
      this.cerrar();
      return r.reasignados ? `Rol «${r.eliminado}» eliminado; ${r.reasignados} usuarios pasaron a «${destino}».` : `Rol «${r.eliminado}» eliminado.`;
    });
  }

  async asignar(): Promise<void> {
    const b = this.borrador();
    const correo = this.correoAsignar.trim();
    if (!b?.id || !correo) return;
    await this.accion(async () => {
      this.detalle.set(await this.api.asignar(b.id!, correo));
      this.correoAsignar = '';
      return `${correo} tiene ahora el rol «${b.nombre}».`;
    });
  }

  async retirar(usuario: { id: string; email: string }): Promise<void> {
    const b = this.borrador();
    if (!b?.id) return;
    await this.accion(async () => {
      this.detalle.set(await this.api.retirar(b.id!, usuario.id));
      return `${usuario.email} ya no tiene el rol «${b.nombre}».`;
    });
  }

  resumen(rol: RolConPermisos): string {
    if (rol.delSistema) return 'Permisos fijos del sistema';
    const modulos = new Set(rol.permisos.map((p) => p.modulo));
    const nombres = this.catalogo().modulos.filter((m) => modulos.has(m.id)).map((m) => m.nombre);
    return `${rol.permisos.length} permisos · ${nombres.join(', ')}`;
  }

  etiquetaAccion(accion: string): string {
    return ETIQUETAS_ACCION[accion] ?? accion;
  }

  etiquetaAuditoria(accion: string): string {
    return ETIQUETAS_AUDITORIA[accion] ?? accion;
  }

  detalleAuditoria(detalle: Record<string, unknown>): string {
    const lista = (v: unknown) => (Array.isArray(v) && v.length ? v.join(', ') : '');
    const partes = [
      lista(detalle['agregados']) && `+ ${lista(detalle['agregados'])}`,
      lista(detalle['retirados']) && `− ${lista(detalle['retirados'])}`,
      !detalle['agregados'] && lista(detalle['permisos']),
      detalle['reasignadosA'] ? `usuarios a «${detalle['reasignadosA']}»` : ''
    ].filter(Boolean);
    return partes.join(' · ');
  }

  private clave(modulo: string, accion: string): string {
    return `${modulo}:${accion}`;
  }

  private async accion(operacion: () => Promise<string>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    try {
      this.aviso.set(await operacion());
      await this.cargar();
    } catch (e) {
      this.error.set(this.mensaje(e));
    }
  }

  private confirmar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '460px' }).afterClosed());
  }

  private mensaje(e: unknown): string {
    return e instanceof ErrorCuenta ? e.message : 'No se pudo completar la operación.';
  }
}
