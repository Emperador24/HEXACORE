import { Component, OnInit, computed, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { CarteleraApiService } from '../core/cartelera-api.service';
import { CuentasApiService } from '../core/cuentas-api.service';
import { Cuenta, DatosEmpleado, DetalleEmpleado, EstadoCuenta, Rol } from '../core/models';
import { PersonalApiService } from '../core/personal-api.service';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { estadoAsignacion, etiquetaAccion, resumenAuditoria } from '../compartido/formato';

/** Áreas de trabajo habituales; se puede escribir otra. `Jefe de personal` supervisa (CU-018). */
const ROLES_SUGERIDOS = ['Entrada', 'Parqueadero', 'Restaurante', 'Seguridad', 'Logística', 'Jefe de personal'];

/**
 * CU-007, pasos 3-5 y CU-007A: alta, consulta, edición y desactivación de una ficha.
 *
 * Con `id = 'nuevo'` es el alta: primero se elige la **cuenta** (CU-027) a la
 * que pertenece la ficha —sin cuenta, el empleado no podría entrar a la app a
 * confirmar sus asignaciones— y después se completan los datos. Los
 * duplicados los decide el servidor; aquí solo se muestra su respuesta junto
 * al campo que la causó.
 */
@Component({
  selector: 'app-empleado-ficha',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule
  ],
  templateUrl: './empleado-ficha.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './empleado-ficha.component.scss'
})
export class EmpleadoFichaComponent implements OnInit {
  private readonly api = inject(PersonalApiService);
  private readonly cuentasApi = inject(CuentasApiService);
  private readonly cartelera = inject(CarteleraApiService);
  private readonly auth = inject(AuthService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /**
   * Parámetro de ruta (`withComponentInputBinding`). En `personal/nuevo` no
   * existe y el enlace lo pone en `undefined`, no en un valor por defecto.
   */
  readonly id = input<string | undefined>();
  readonly esAlta = computed(() => !this.id());

  readonly detalle = signal<DetalleEmpleado | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly nombresEvento = signal<Map<string, string>>(new Map());

  // Alta: elección de cuenta.
  readonly busquedaCuenta = signal('');
  readonly cuentas = signal<Cuenta[]>([]);
  readonly buscandoCuentas = signal(false);
  readonly cuenta = signal<Cuenta | null>(null);
  readonly puedeDarDeAlta = computed(() => this.auth.roles().includes(Rol.ADMINISTRADOR));

  readonly rolesSugeridos = ROLES_SUGERIDOS;
  readonly columnasTurnos = ['evento', 'zona', 'horario', 'estado'];
  readonly estadoAsignacion = estadoAsignacion;
  readonly etiquetaAccion = etiquetaAccion;
  readonly resumenAuditoria = resumenAuditoria;

  readonly formulario = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    documento: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{5,20}$/)]],
    correo: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required, Validators.pattern(/^\+?[0-9 ]{7,20}$/)]],
    rol: ['', Validators.required],
    credencial: ['', Validators.required]
  });

  /** Campo que el servidor señaló como duplicado. */
  readonly campoDuplicado = signal<string | null>(null);

  constructor() {
    // Tras el alta se llega aquí con el aviso en el estado de la navegación.
    const aviso = (history.state as { aviso?: string } | null)?.aviso;
    if (aviso) this.aviso.set(aviso);
  }

  async ngOnInit(): Promise<void> {
    void this.cargarEventos();
    if (this.esAlta()) {
      this.formulario.controls.credencial.setValue(this.credencialNueva());
      if (this.puedeDarDeAlta()) await this.buscarCuentas();
      return;
    }
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const detalle = await this.api.detalle(this.id()!);
      this.detalle.set(detalle);
      const e = detalle.empleado;
      this.formulario.reset({
        nombre: e.nombre,
        documento: e.documento ?? '',
        correo: e.correo ?? '',
        telefono: e.telefono ?? '',
        rol: e.rol,
        credencial: e.credencial
      });
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo cargar la ficha.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarEventos(): Promise<void> {
    try {
      const eventos = await this.cartelera.proximos();
      this.nombresEvento.set(new Map(eventos.map((e) => [e.id, e.nombre])));
    } catch {
      // Sin cartelera se muestra el identificador del evento: no impide trabajar.
    }
  }

  nombreEvento(id: string): string {
    return this.nombresEvento().get(id) ?? `Evento ${id.slice(0, 8)}`;
  }

  // --- Alta -------------------------------------------------------------------

  /** Solo cuentas activas: una desactivada no podría usar su ficha. */
  async buscarCuentas(): Promise<void> {
    this.buscandoCuentas.set(true);
    try {
      const pagina = await this.cuentasApi.listar({ busqueda: this.busquedaCuenta(), estado: EstadoCuenta.ACTIVA, limite: 8 });
      this.cuentas.set(pagina.cuentas);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudieron buscar las cuentas.'));
    } finally {
      this.buscandoCuentas.set(false);
    }
  }

  elegirCuenta(cuenta: Cuenta): void {
    this.cuenta.set(cuenta);
    const f = this.formulario.controls;
    if (!f.nombre.value) f.nombre.setValue(cuenta.nombre);
    if (!f.correo.value) f.correo.setValue(cuenta.email);
  }

  private credencialNueva(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(3));
    return `HXC-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  regenerarCredencial(): void {
    this.formulario.controls.credencial.setValue(this.credencialNueva());
    this.formulario.controls.credencial.markAsDirty();
  }

  // --- Guardar ----------------------------------------------------------------

  async guardar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || (this.esAlta() && !this.cuenta())) return;
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.campoDuplicado.set(null);
    const datos = this.formulario.getRawValue() as DatosEmpleado;
    try {
      if (this.esAlta()) {
        const creado = await this.api.crear(this.cuenta()!.id, datos);
        await this.router.navigate(['/admin/personal', creado.id], { state: { aviso: `Se dio de alta a ${creado.nombre}.` } });
        return;
      }
      await this.api.actualizar(this.id()!, this.soloCambios(datos));
      await this.cargar();
      this.aviso.set('Cambios guardados.');
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo guardar.'));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Solo lo que se tocó: la auditoría registra cambios reales, no el formulario entero. */
  private soloCambios(datos: DatosEmpleado): Partial<DatosEmpleado> {
    const cambios: Partial<DatosEmpleado> = {};
    for (const [campo, control] of Object.entries(this.formulario.controls)) {
      if (control.dirty) (cambios as Record<string, string>)[campo] = datos[campo as keyof DatosEmpleado];
    }
    return cambios;
  }

  descartar(): void {
    void this.cargar();
  }

  // --- Desactivar / reactivar (CU-007A) ----------------------------------------

  async desactivar(): Promise<void> {
    const e = this.detalle()?.empleado;
    if (!e) return;
    const motivo = await this.confirmar({
      titulo: `Desactivar a ${e.nombre}`,
      mensaje:
        'Dejará de aparecer como disponible y sus turnos futuros se cancelarán; las solicitudes de cambio pendientes ' +
        'sobre ellos se cierran. Su cuenta de acceso no cambia (eso se gestiona en Cuentas).',
      accion: 'Desactivar',
      pedirMotivo: true,
      peligrosa: true
    });
    if (motivo === undefined) return;
    await this.accion(async () => {
      const r = await this.api.desactivar(e.id, motivo);
      return r.turnosCancelados ? `Empleado desactivado; se cancelaron ${r.turnosCancelados} turno(s) futuros.` : 'Empleado desactivado.';
    });
  }

  async reactivar(): Promise<void> {
    const e = this.detalle()?.empleado;
    if (!e) return;
    const ok = await this.confirmar({
      titulo: `Reactivar a ${e.nombre}`,
      mensaje: 'Volverá a aparecer como disponible para nuevas asignaciones. Los turnos cancelados no se restauran.',
      accion: 'Reactivar'
    });
    if (ok === undefined) return;
    await this.accion(async () => {
      await this.api.reactivar(e.id);
      return 'Empleado reactivado.';
    });
  }

  private async accion(operacion: () => Promise<string>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    try {
      const mensaje = await operacion();
      await this.cargar();
      this.aviso.set(mensaje);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo completar la operación.'));
    }
  }

  private confirmar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '460px' }).afterClosed());
  }

  private mensaje(e: unknown, defecto: string): string {
    if (e instanceof ErrorCuenta) {
      if (e.codigo === 'EMPLEADO_DUPLICADO') {
        const campo = /documento|correo|credencial/.exec(e.message)?.[0] ?? null;
        this.campoDuplicado.set(campo);
      }
      return e.message;
    }
    return defecto;
  }
}
