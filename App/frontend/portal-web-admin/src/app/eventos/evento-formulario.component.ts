import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, firstValueFrom, map, startWith } from 'rxjs';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { EventosApiService } from '../core/eventos-api.service';
import { DatosEvento, DetalleEvento, Disponibilidad, EstadoEvento, LocalidadGestion, Recinto, Rol } from '../core/models';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { aControles, desdeControles } from '../compartido/formato';
import { CATEGORIAS, estadoEvento, etiquetaHistorial, resumenCambios } from './formato-eventos';

/** Una fila de tipo de entrada: id (si ya existía), nombre, precio, cantidad y zona. */
type FormLocalidad = FormGroup;
interface ValorLocalidad { id: string | null; nombre: string; precio: number; cantidad: number; zonaRecintoId: string | null }

/**
 * CU-026: crear, editar, publicar y cancelar un evento.
 *
 * El formulario repite las reglas del servidor para avisar mientras se
 * escribe (aforo por recinto y por zona, traslape de fechas con sugerencias),
 * pero quien decide es el servidor: sus respuestas se muestran tal cual, con
 * la zona o los horarios que señala.
 *
 * En un evento publicado no se cambia el recinto ni se quitan o reducen tipos
 * de entrada (ya hay entradas vendidas); en uno cancelado no se cambia nada.
 */
@Component({
  selector: 'app-evento-formulario',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink, MatAutocompleteModule, MatButtonModule, MatCheckboxModule,
    MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule, MatTooltipModule
  ],
  templateUrl: './evento-formulario.component.html',
  styleUrl: './evento-formulario.component.scss'
})
export class EventoFormularioComponent implements OnInit {
  private readonly api = inject(EventosApiService);
  private readonly auth = inject(AuthService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destruir = inject(DestroyRef);

  /** Parámetro de ruta; `eventos/nuevo` no lo trae. */
  readonly id = input<string | undefined>();
  readonly esAlta = computed(() => !this.id());

  readonly detalle = signal<DetalleEvento | null>(null);
  readonly recintos = signal<Recinto[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly versionVieja = signal(false);
  readonly aviso = signal<string | null>(null);
  readonly disponibilidad = signal<Disponibilidad | null>(null);
  readonly zonaEnConflicto = signal<string | null>(null);

  readonly categorias = CATEGORIAS;
  readonly estadoEvento = estadoEvento;
  readonly etiquetaHistorial = etiquetaHistorial;
  readonly resumenCambios = resumenCambios;

  readonly esOrganizador = computed(() => this.auth.roles().includes(Rol.ORGANIZADOR));
  readonly estado = computed(() => this.detalle()?.evento.estado ?? EstadoEvento.BORRADOR);
  readonly publicado = computed(() => this.estado() === EstadoEvento.PUBLICADO);
  readonly soloLectura = computed(() => !this.esOrganizador() || this.estado() === EstadoEvento.CANCELADO);
  /** Cupos ya publicados por localidad: en un evento publicado no se reducen. */
  private readonly minimos = computed(() =>
    new Map((this.publicado() ? this.detalle()?.evento.localidades ?? [] : []).map((l) => [l.id, l.cantidad]))
  );

  readonly formulario = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(200)]],
    categoria: ['', [Validators.required, Validators.maxLength(60)]],
    artista: ['', Validators.maxLength(200)],
    descripcion: ['', Validators.maxLength(5000)],
    imagenUrl: ['', [Validators.pattern(/^https?:\/\/\S+$/), Validators.maxLength(500)]],
    recintoId: ['', Validators.required],
    fecha: ['', Validators.required],
    inicio: ['', Validators.required],
    fin: ['', Validators.required],
    aforoMaximo: [null as number | null, Validators.min(1)],
    permiteReventa: [true],
    localidades: this.fb.array<FormLocalidad>([])
  });

  get localidades(): FormArray<FormLocalidad> {
    return this.formulario.controls.localidades;
  }

  private readonly valor = toSignal(this.formulario.valueChanges.pipe(startWith(null), map(() => this.formulario.getRawValue())), {
    initialValue: this.formulario.getRawValue()
  });

  private readonly filas = computed(() => this.valor().localidades as ValorLocalidad[]);
  readonly recinto = computed(() => this.recintos().find((r) => r.id === this.valor().recintoId) ?? null);
  readonly aforo = computed(() => this.valor().aforoMaximo || this.recinto()?.capacidad || 0);
  readonly totalCupos = computed(() => this.filas().reduce((n, l) => n + (Number(l.cantidad) || 0), 0));
  readonly porZona = computed(() =>
    (this.recinto()?.zonas ?? []).map((z) => ({
      ...z,
      asignado: this.filas().filter((l) => l.zonaRecintoId === z.id).reduce((n, l) => n + (Number(l.cantidad) || 0), 0)
    }))
  );
  readonly horario = computed(() => desdeControles(this.valor().fecha, this.valor().inicio, this.valor().fin));
  readonly problemasAforo = computed(() => {
    const p: string[] = [];
    const r = this.recinto();
    if (r && this.aforo() > r.capacidad) p.push(`El aforo máximo supera la capacidad del recinto (${r.capacidad}).`);
    if (this.totalCupos() > this.aforo()) p.push(`Los tipos de entrada suman ${this.totalCupos()} cupos y el aforo es ${this.aforo()}.`);
    for (const z of this.porZona()) if (z.asignado > z.capacidad) p.push(`La zona «${z.nombre}» admite ${z.capacidad} y se le asignan ${z.asignado}.`);
    return p;
  });

  async ngOnInit(): Promise<void> {
    const aviso = (history.state as { aviso?: string } | null)?.aviso;
    if (aviso) this.aviso.set(aviso);
    this.cargando.set(true);
    try {
      this.recintos.set(await this.api.recintos());
      if (this.esAlta()) {
        this.agregarLocalidad();
      } else {
        this.mostrar(await this.api.detalle(this.id()!));
      }
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo cargar el evento.'));
    } finally {
      this.cargando.set(false);
    }
    // Paso 5 mientras se edita: al cambiar recinto u horario, consulta si choca.
    this.formulario.valueChanges.pipe(debounceTime(500), takeUntilDestroyed(this.destruir)).subscribe(() => void this.comprobarHorario());
    void this.comprobarHorario();
  }

  private mostrar(detalle: DetalleEvento): void {
    this.detalle.set(detalle);
    const e = detalle.evento;
    const inicio = aControles(e.fechaInicio);
    this.localidades.clear();
    for (const l of e.localidades) this.agregarLocalidad(l);
    this.formulario.reset({
      nombre: e.nombre,
      categoria: e.categoria,
      artista: e.artista ?? '',
      descripcion: e.descripcion ?? '',
      imagenUrl: e.imagenUrl ?? '',
      recintoId: e.recintoId,
      fecha: inicio.fecha,
      inicio: inicio.hora,
      fin: aControles(e.fechaFin).hora,
      aforoMaximo: e.aforoMaximo,
      permiteReventa: e.permiteReventa,
      localidades: this.localidades.getRawValue()
    });
    this.formulario.enable({ emitEvent: false });
    if (this.soloLectura()) this.formulario.disable({ emitEvent: false });
    else if (this.publicado()) this.formulario.controls.recintoId.disable({ emitEvent: false });
    if (detalle.disponibilidad) this.disponibilidad.set(detalle.disponibilidad);
  }

  // --- Tipos de entrada --------------------------------------------------------

  agregarLocalidad(l?: LocalidadGestion): void {
    const minimo = l ? this.minimos().get(l.id) ?? 1 : 1;
    this.localidades.push(
      this.fb.group({
        id: [l?.id ?? null],
        nombre: [l?.nombre ?? (this.localidades.length === 0 ? 'General' : ''), [Validators.required, Validators.maxLength(120)]],
        precio: [l?.precio ?? 0, [Validators.required, Validators.min(0)]],
        cantidad: [l?.cantidad ?? 100, [Validators.required, Validators.min(minimo), Validators.pattern(/^\d+$/)]],
        zonaRecintoId: [l?.zonaRecintoId ?? null]
      }) as FormLocalidad
    );
    this.formulario.markAsDirty();
  }

  quitarLocalidad(i: number): void {
    this.localidades.removeAt(i);
    this.formulario.markAsDirty();
  }

  /** En un publicado, las localidades que ya estaban a la venta no se quitan. */
  sePuedeQuitar(i: number): boolean {
    const id = this.localidades.at(i).get('id')?.value as string | null;
    return !this.soloLectura() && this.localidades.length > 1 && !(id && this.minimos().has(id));
  }

  minimoDe(i: number): number | null {
    const id = this.localidades.at(i).get('id')?.value as string | null;
    return id ? this.minimos().get(id) ?? null : null;
  }

  // --- Paso 5: horario y recinto ------------------------------------------------

  private async comprobarHorario(): Promise<void> {
    const h = this.horario();
    const recintoId = this.formulario.getRawValue().recintoId;
    if (!h || !recintoId || this.estado() === EstadoEvento.CANCELADO) {
      this.disponibilidad.set(null);
      return;
    }
    try {
      this.disponibilidad.set(await this.api.disponibilidad(recintoId, h.horaInicio, h.horaFin, this.id()));
    } catch {
      // La comprobación es una ayuda; el servidor vuelve a mirarlo al guardar y al publicar.
    }
  }

  usarSugerencia(s: { fechaInicio: string; fechaFin: string }): void {
    const a = aControles(s.fechaInicio);
    this.formulario.patchValue({ fecha: a.fecha, inicio: a.hora, fin: aControles(s.fechaFin).hora });
    this.formulario.markAsDirty();
  }

  // --- Guardar (pasos 3-5, 9, CU-026A) ------------------------------------------

  async guardar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || !this.horario()) return;
    await this.ejecutar(async () => {
      const datos = this.datos();
      if (this.esAlta()) {
        const creado = await this.api.crear(datos);
        await this.router.navigate(['/admin/eventos', creado.evento.id], {
          state: { aviso: 'Borrador guardado. Revísalo y publícalo cuando esté listo.' }
        });
        return null;
      }
      const r = await this.api.actualizar(this.id()!, { ...datos, version: this.detalle()!.evento.version });
      this.mostrar(r);
      return this.publicado() ? 'Cambios guardados. Boletería recibe la actualización del evento.' : 'Borrador guardado.';
    });
  }

  private datos(): DatosEvento {
    const v = this.formulario.getRawValue();
    const h = this.horario()!;
    return {
      nombre: v.nombre.trim(),
      categoria: v.categoria.trim(),
      ...(v.artista.trim() ? { artista: v.artista.trim() } : {}),
      ...(v.descripcion.trim() ? { descripcion: v.descripcion.trim() } : {}),
      ...(v.imagenUrl.trim() ? { imagenUrl: v.imagenUrl.trim() } : {}),
      recintoId: v.recintoId,
      fechaInicio: h.horaInicio,
      fechaFin: h.horaFin,
      ...(v.aforoMaximo ? { aforoMaximo: Number(v.aforoMaximo) } : {}),
      permiteReventa: v.permiteReventa,
      localidades: (v.localidades as ValorLocalidad[]).map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        nombre: String(l.nombre).trim(),
        precio: Number(l.precio),
        cantidad: Number(l.cantidad),
        ...(l.zonaRecintoId ? { zonaRecintoId: l.zonaRecintoId } : {})
      }))
    };
  }

  descartar(): void {
    const d = this.detalle();
    if (d) this.mostrar(d);
  }

  // --- Publicar, cancelar, eliminar ----------------------------------------------

  async publicar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    const fecha = new Date(d.evento.fechaInicio).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' });
    const ok = await this.confirmar({
      titulo: 'Publicar evento',
      mensaje: `«${d.evento.nombre}» quedará a la venta en la cartelera: ${fecha}, ${d.recinto?.nombre}, ${this.totalCupos()} cupos. Después ya no se podrá cambiar el recinto ni reducir cupos.`,
      accion: 'Publicar'
    });
    if (ok === undefined) return;
    await this.ejecutar(async () => {
      const r = await this.api.publicar(d.evento.id, d.evento.version);
      this.mostrar(r);
      return r.mensaje ?? 'Evento publicado.';
    });
  }

  async cancelar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    const publicado = d.evento.estado === EstadoEvento.PUBLICADO;
    const motivo = await this.confirmar({
      titulo: publicado ? 'Cancelar evento publicado' : 'Cancelar borrador',
      mensaje: publicado
        ? 'El evento saldrá de la cartelera y se pedirá a Boletería devolver el dinero a todos los compradores (CU-003). No se puede deshacer.'
        : 'El borrador quedará cancelado y no se podrá publicar.',
      accion: 'Cancelar evento',
      pedirMotivo: true,
      peligrosa: true
    });
    if (motivo === undefined) return;
    await this.ejecutar(async () => {
      const r = await this.api.cancelar(d.evento.id, d.evento.version, motivo);
      this.mostrar(r);
      return r.mensaje ?? 'Evento cancelado.';
    });
  }

  async eliminar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    const ok = await this.confirmar({
      titulo: 'Eliminar borrador',
      mensaje: `Se borra «${d.evento.nombre}». Nunca estuvo publicado; su historial se conserva.`,
      accion: 'Eliminar',
      peligrosa: true
    });
    if (ok === undefined) return;
    await this.ejecutar(async () => {
      await this.api.eliminar(d.evento.id, d.evento.version);
      await this.router.navigate(['/admin/eventos']);
      return null;
    });
  }

  async recargar(): Promise<void> {
    this.versionVieja.set(false);
    this.error.set(null);
    this.mostrar(await this.api.detalle(this.id()!));
  }

  // --- Apoyo ---------------------------------------------------------------------

  private async ejecutar(operacion: () => Promise<string | null>): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.zonaEnConflicto.set(null);
    try {
      const mensaje = await operacion();
      if (mensaje) this.aviso.set(mensaje);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo completar la operación.'));
    } finally {
      this.guardando.set(false);
    }
  }

  private mensaje(e: unknown, defecto: string): string {
    if (!(e instanceof ErrorCuenta)) return defecto;
    if (e.codigo === 'AFORO_SUPERA_ZONA') this.zonaEnConflicto.set((e.detalle['zona'] as { id: string }).id);
    if (e.codigo === 'EVENTO_TRASLAPADO') {
      this.disponibilidad.set({
        conflictos: e.detalle['conflictos'] as Disponibilidad['conflictos'],
        sugerencias: e.detalle['sugerencias'] as Disponibilidad['sugerencias']
      });
    }
    if (e.codigo === 'VERSION_DESACTUALIZADA') this.versionVieja.set(true);
    return e.message;
  }

  private confirmar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '480px' }).afterClosed());
  }
}
