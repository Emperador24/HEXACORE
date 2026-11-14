import { Component, OnDestroy, OnInit, computed, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ErrorCuenta } from '../core/auth.service';
import { DatosRecinto, DetalleRecinto, ZonaEditable } from '../core/models';
import { RecintosApiService } from '../core/recintos-api.service';
import { ACENTOS } from '../compartido/acentos';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { estadoEvento } from '../eventos/formato-eventos';
import { MapaZonasComponent } from './mapa-zonas.component';

const TIPOS_PLANO = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_PLANO = 1_500_000;

/**
 * CU-029: registrar y editar un recinto con sus zonas y su plano.
 *
 * La suma de capacidades se comprueba mientras se escribe (CU-029A) y otra vez
 * en el servidor. Si el recinto tiene eventos publicados, el servidor pide
 * confirmación antes de cambiar capacidades (CU-029B): aquí se muestra qué
 * eventos están afectados y se reenvía solo si la persona confirma.
 */
@Component({
  selector: 'app-recinto-formulario',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatSlideToggleModule, MatTooltipModule, MapaZonasComponent
  ],
  templateUrl: './recinto-formulario.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './recinto-formulario.component.scss'
})
export class RecintoFormularioComponent implements OnInit, OnDestroy {
  private readonly api = inject(RecintosApiService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>();
  readonly esAlta = computed(() => !this.id());

  readonly detalle = signal<DetalleRecinto | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly sucio = signal(false);
  readonly estadoEvento = estadoEvento;

  // Datos generales (paso 2).
  nombre = '';
  ciudad = '';
  direccion = '';
  readonly capacidad = signal<number>(1000);
  activo = true;

  // Zonas (paso 3) y plano (paso 5).
  readonly zonas = signal<ZonaEditable[]>([]);
  readonly elegida = signal<number | null>(null);
  readonly planoUrl = signal<string | null>(null);
  private planoPendiente: File | null = null;

  readonly sumaZonas = computed(() => this.zonas().reduce((n, z) => n + (Number(z.capacidad) || 0), 0));
  readonly excede = computed(() => this.sumaZonas() > (Number(this.capacidad()) || 0));
  readonly porcentaje = computed(() => (this.capacidad() ? Math.min(100, (this.sumaZonas() / this.capacidad()) * 100) : 0));
  readonly eventosActivos = computed(() =>
    (this.detalle()?.eventos ?? []).filter((e) => e.estado === 'PUBLICADO' && new Date(e.fechaFin) > new Date())
  );

  async ngOnInit(): Promise<void> {
    const aviso = (history.state as { aviso?: string } | null)?.aviso;
    if (aviso) this.aviso.set(aviso);
    if (this.esAlta()) {
      this.zonas.set([{ nombre: 'General', capacidad: 800, color: ACENTOS[1] }]);
      return;
    }
    this.cargando.set(true);
    try {
      await this.mostrar(await this.api.detalle(this.id()!));
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo cargar el recinto.'));
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    const url = this.planoUrl();
    if (url) URL.revokeObjectURL(url);
  }

  private async mostrar(d: DetalleRecinto): Promise<void> {
    this.detalle.set(d);
    const r = d.recinto;
    this.nombre = r.nombre;
    this.ciudad = r.ciudad;
    this.direccion = r.direccion ?? '';
    this.capacidad.set(r.capacidad);
    this.activo = r.activo;
    this.zonas.set(r.zonas.map((z) => ({ id: z.id, nombre: z.nombre, capacidad: z.capacidad, x: z.x, y: z.y, ancho: z.ancho, alto: z.alto, color: z.color })));
    this.sucio.set(false);
    if (d.plano) await this.cargarPlano(r.id);
    else this.ponerPlano(null);
  }

  private async cargarPlano(id: string): Promise<void> {
    try {
      this.ponerPlano(URL.createObjectURL(await this.api.plano(id)));
    } catch {
      this.ponerPlano(null);
    }
  }

  private ponerPlano(url: string | null): void {
    const anterior = this.planoUrl();
    if (anterior) URL.revokeObjectURL(anterior);
    this.planoUrl.set(url);
  }

  marcar(): void {
    this.sucio.set(true);
  }

  // --- Zonas ----------------------------------------------------------------

  agregarZona(): void {
    const i = this.zonas().length;
    this.zonas.update((z) => [...z, { nombre: '', capacidad: 100, color: ACENTOS[i % ACENTOS.length] }]);
    this.elegida.set(i);
    this.marcar();
  }

  quitarZona(i: number): void {
    this.zonas.update((z) => z.filter((_, j) => j !== i));
    this.elegida.set(null);
    this.marcar();
  }

  editarZona(i: number, cambios: Partial<ZonaEditable>): void {
    this.zonas.update((z) => z.map((zona, j) => (j === i ? { ...zona, ...cambios } : zona)));
    this.marcar();
  }

  /** La coloca en un hueco del plano con un tamaño inicial; luego se ajusta arrastrando. */
  colocar(i: number): void {
    const colocadas = this.zonas().filter((z) => z.x !== null && z.x !== undefined).length;
    const x = 4 + (colocadas % 4) * 24;
    const y = Math.min(6 + Math.floor(colocadas / 4) * 26, 72);
    const color = this.zonas()[i].color ?? ACENTOS[i % ACENTOS.length];
    this.editarZona(i, { x, y, ancho: 21, alto: 20, color });
    this.elegida.set(i);
  }

  quitarDelPlano(i: number): void {
    this.editarZona(i, { x: null, y: null, ancho: null, alto: null });
  }

  // --- Plano ----------------------------------------------------------------

  async elegirPlano(e: Event): Promise<void> {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!archivo) return;
    this.error.set(null);
    if (!TIPOS_PLANO.includes(archivo.type)) return void this.error.set('El plano debe ser PNG, JPG o WebP.');
    if (archivo.size > MAX_PLANO) return void this.error.set('El plano no puede pasar de 1,5 MB.');
    if (this.esAlta()) {
      // Se sube cuando exista el recinto.
      this.planoPendiente = archivo;
      this.ponerPlano(URL.createObjectURL(archivo));
      return;
    }
    await this.ejecutar(async () => {
      await this.api.subirPlano(this.id()!, archivo);
      this.ponerPlano(URL.createObjectURL(archivo));
      return 'Plano actualizado.';
    });
  }

  async quitarPlano(): Promise<void> {
    if (this.esAlta()) {
      this.planoPendiente = null;
      this.ponerPlano(null);
      return;
    }
    await this.ejecutar(async () => {
      await this.api.quitarPlano(this.id()!);
      this.ponerPlano(null);
      return 'Plano quitado.';
    });
  }

  // --- Guardar (pasos 4, 6-8, CU-029A/B) ---------------------------------------

  async guardar(confirmarImpacto = false): Promise<void> {
    if (!this.nombre.trim() || !this.ciudad.trim() || !this.capacidad() || this.excede()) return;
    if (this.zonas().some((z) => !z.nombre.trim() || !(z.capacidad >= 1))) {
      this.error.set('Cada zona necesita nombre y una capacidad de al menos 1.');
      return;
    }
    const datos: DatosRecinto = {
      nombre: this.nombre.trim(),
      ciudad: this.ciudad.trim(),
      ...(this.direccion.trim() ? { direccion: this.direccion.trim() } : {}),
      capacidad: Number(this.capacidad()),
      activo: this.activo,
      zonas: this.zonas().map((z) => ({
        ...(z.id ? { id: z.id } : {}),
        nombre: z.nombre.trim(),
        capacidad: Number(z.capacidad),
        ...(z.x !== null && z.x !== undefined ? { x: z.x, y: z.y, ancho: z.ancho, alto: z.alto } : {}),
        ...(z.color ? { color: z.color } : {})
      })),
      ...(confirmarImpacto ? { confirmarImpacto: true } : {})
    };
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      if (this.esAlta()) {
        const creado = await this.api.crear(datos);
        if (this.planoPendiente) await this.api.subirPlano(creado.recinto.id, this.planoPendiente);
        await this.router.navigate(['/admin/recintos', creado.recinto.id], { state: { aviso: creado.mensaje } });
        return;
      }
      const r = await this.api.actualizar(this.id()!, datos);
      await this.mostrar(r);
      this.aviso.set(r.mensaje ?? 'Cambios guardados.');
    } catch (e) {
      if (e instanceof ErrorCuenta && e.codigo === 'CONFIRMAR_IMPACTO') {
        this.guardando.set(false);
        const eventos = (e.detalle['eventos'] as { nombre: string; fechaInicio: string }[]) ?? [];
        const ok = await this.confirmar({
          titulo: 'El recinto tiene eventos publicados',
          mensaje: `${e.message} Eventos: ${eventos.map((x) => `«${x.nombre}» (${new Date(x.fechaInicio).toLocaleDateString('es-CO')})`).join(', ')}.`,
          accion: 'Guardar de todos modos'
        });
        if (ok !== undefined) await this.guardar(true);
        return;
      }
      this.error.set(this.mensaje(e, 'No se pudo guardar.'));
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    const ok = await this.confirmar({
      titulo: `Eliminar ${d.recinto.nombre}`,
      mensaje: 'Se borra con sus zonas y su plano. Solo se puede si nunca tuvo eventos; si los tuvo, desactívalo.',
      accion: 'Eliminar',
      peligrosa: true
    });
    if (ok === undefined) return;
    await this.ejecutar(async () => {
      await this.api.eliminar(d.recinto.id);
      await this.router.navigate(['/admin/recintos']);
      return null;
    });
  }

  private async ejecutar(operacion: () => Promise<string | null>): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      const m = await operacion();
      if (m) this.aviso.set(m);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo completar la operación.'));
    } finally {
      this.guardando.set(false);
    }
  }

  private confirmar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '500px' }).afterClosed());
  }

  private mensaje(e: unknown, defecto: string): string {
    return e instanceof ErrorCuenta ? e.message : defecto;
  }
}
