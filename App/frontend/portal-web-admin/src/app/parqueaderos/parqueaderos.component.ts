import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { AlertaParqueadero, EventoMonitoreable, PanelParqueadero, Redireccion, Rol, SalidaVehiculo, Tarifa, ZonaParqueadero } from '../core/models';
import { MonitoreoApiService } from '../core/monitoreo-api.service';
import { ParqueaderosApiService } from '../core/parqueaderos-api.service';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';

/**
 * CU-024 (Cobro) y CU-025 (Control de ocupación) en el Portal Web
 * Administrativo.
 *
 * El panel llega en vivo por Server-Sent Events: porcentaje por zona,
 * tendencia de llenado y alertas (pasos 2-4). Desde una alerta, o a mano, el
 * supervisor redirige los ingresos a otra zona y anota el resultado (pasos
 * 5-8). La caja registra la salida y muestra el cobro de un vistazo (CU-024);
 * la tarifa por hora solo la cambia el Administrador.
 */
@Component({
  selector: 'app-parqueaderos',
  standalone: true,
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatSelectModule, MatTooltipModule
  ],
  templateUrl: './parqueaderos.component.html',
  styleUrl: './parqueaderos.component.scss'
})
export class ParqueaderosComponent implements OnInit, OnDestroy {
  private readonly api = inject(ParqueaderosApiService);
  private readonly monitoreo = inject(MonitoreoApiService);
  private readonly auth = inject(AuthService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly eventos = signal<EventoMonitoreable[]>([]);
  readonly eventoId = signal('');
  readonly panel = signal<PanelParqueadero | null>(null);
  readonly tarifa = signal<Tarifa | null>(null);
  readonly enVivo = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly trabajando = signal(false);
  readonly esAdministrador = computed(() => this.auth.roles().includes(Rol.ADMINISTRADOR));

  // Formularios.
  readonly nuevaTarifa = signal<number | null>(null);
  readonly nuevaZona = signal({ nombre: '', capacidad: 50 });
  readonly capacidades = signal<Partial<Record<string, number>>>({});
  readonly redireccion = signal({ zonaOrigenId: '', zonaDestinoId: '', motivo: '' });
  readonly placaSalida = signal('');
  readonly ultimaSalida = signal<SalidaVehiculo | null>(null);
  readonly ingreso = signal({ placa: '', zonaId: '', prepagada: false });

  readonly zonasDestino = computed(() => (this.panel()?.zonas ?? []).filter((z) => z.estado !== 'LLENA' && z.id !== this.redireccion().zonaOrigenId));
  readonly vigente = computed(() => this.panel()?.redirecciones.find((r) => r.vigente) ?? null);

  private cortar: (() => void) | null = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private espera = 2000;

  async ngOnInit(): Promise<void> {
    try {
      const [eventos, tarifa] = await Promise.all([this.monitoreo.eventos(), this.api.tarifa()]);
      this.eventos.set(eventos);
      this.tarifa.set(tarifa.vigente);
      const pedido = this.ruta.snapshot.queryParamMap.get('evento');
      const inicial = eventos.find((e) => e.id === pedido) ?? eventos.find((e) => e.enCurso) ?? eventos[0];
      if (inicial) this.elegirEvento(inicial.id);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo cargar el parqueadero.'));
    }
  }

  ngOnDestroy(): void {
    this.detener();
  }

  elegirEvento(id: string): void {
    this.detener();
    this.eventoId.set(id);
    this.panel.set(null);
    this.ultimaSalida.set(null);
    void this.router.navigate([], { queryParams: { evento: id }, replaceUrl: true });
    void this.consultar();
    this.conectar();
  }

  tono(z: ZonaParqueadero): string {
    return z.estado === 'LLENA' ? 'var(--hx-rojo)' : z.estado === 'CASI_LLENA' ? 'var(--hx-ambar)' : 'var(--hx-verde)';
  }

  fijarCapacidad(zonaId: string, valor: number): void {
    this.capacidades.update((c) => ({ ...c, [zonaId]: valor }));
  }

  editarNuevaZona(cambio: Partial<{ nombre: string; capacidad: number }>): void {
    this.nuevaZona.update((z) => ({ ...z, ...cambio }));
  }

  editarIngreso(cambio: Partial<{ placa: string; zonaId: string; prepagada: boolean }>): void {
    this.ingreso.update((i) => ({ ...i, ...cambio }));
  }

  editarRedireccion(cambio: Partial<{ zonaOrigenId: string; zonaDestinoId: string; motivo: string }>): void {
    this.redireccion.update((r) => ({ ...r, ...cambio }));
  }

  // --- CU-024: tarifa y caja --------------------------------------------------------

  async definirTarifa(): Promise<void> {
    const valor = this.nuevaTarifa();
    if (!valor || valor <= 0) return;
    await this.ejecutar(async () => {
      this.tarifa.set((await this.api.definirTarifa(valor)).vigente);
      this.nuevaTarifa.set(null);
      this.aviso.set('Tarifa actualizada: aplica a las salidas desde ahora.');
    }, 'No se pudo actualizar la tarifa.');
  }

  async registrarSalida(): Promise<void> {
    const placa = this.placaSalida().trim();
    if (!placa) return;
    await this.ejecutar(async () => {
      this.ultimaSalida.set(await this.api.registrarSalida(this.eventoId(), placa));
      this.placaSalida.set('');
      await this.consultar();
    }, 'No se pudo registrar la salida.');
  }

  async registrarIngreso(): Promise<void> {
    const i = this.ingreso();
    if (!i.placa.trim()) return;
    await this.ejecutar(async () => {
      await this.api.registrarIngreso(this.eventoId(), { placa: i.placa.trim(), ...(i.zonaId ? { zonaId: i.zonaId } : {}), prepagada: i.prepagada });
      this.ingreso.set({ placa: '', zonaId: '', prepagada: false });
      this.aviso.set('Ingreso registrado.');
      await this.consultar();
    }, 'No se pudo registrar el ingreso.');
  }

  // --- Zonas ----------------------------------------------------------------------

  async crearZona(): Promise<void> {
    const z = this.nuevaZona();
    if (!z.nombre.trim() || z.capacidad < 1) return;
    await this.ejecutar(async () => {
      await this.api.crearZona(this.eventoId(), { nombre: z.nombre.trim(), capacidad: z.capacidad, orden: (this.panel()?.zonas.length ?? 0) + 1 });
      this.nuevaZona.set({ nombre: '', capacidad: 50 });
      await this.consultar();
    }, 'No se pudo crear la zona.');
  }

  async guardarCapacidad(z: ZonaParqueadero): Promise<void> {
    const capacidad = this.capacidades()[z.id];
    if (!capacidad) return;
    await this.ejecutar(async () => {
      await this.api.actualizarZona(this.eventoId(), z.id, { capacidad });
      this.capacidades.update(({ [z.id]: _quitada, ...resto }) => resto);
      await this.consultar();
    }, 'No se pudo cambiar la capacidad.');
  }

  // --- CU-025, pasos 5-8 -------------------------------------------------------------

  async redirigirDesde(a: AlertaParqueadero): Promise<void> {
    if (!a.sugerencia) return;
    const motivo = await this.preguntar({ titulo: `Redirigir a «${a.sugerencia.zona}»`, mensaje: a.mensaje, accion: 'Redirigir', pedirMotivo: true });
    if (motivo === undefined) return;
    await this.redirigir({ zonaOrigenId: a.zonaId, zonaDestinoId: a.sugerencia.zonaDestinoId, motivo });
  }

  async redirigirManual(): Promise<void> {
    const r = this.redireccion();
    if (!r.zonaDestinoId || !r.motivo.trim()) return;
    await this.redirigir({ ...(r.zonaOrigenId ? { zonaOrigenId: r.zonaOrigenId } : {}), zonaDestinoId: r.zonaDestinoId, motivo: r.motivo.trim() });
    this.redireccion.set({ zonaOrigenId: '', zonaDestinoId: '', motivo: '' });
  }

  async anotarResultado(r: Redireccion): Promise<void> {
    const resultado = await this.preguntar({
      titulo: 'Resultado de la redirección',
      mensaje: `${r.zonaOrigen ?? 'Todos los ingresos'} → ${r.zonaDestino}: ${r.ingresosAlDestino} vehículo(s) llegaron al destino. Al guardar, la recomendación vuelve a ser automática.`,
      accion: 'Guardar y terminar',
      pedirMotivo: true
    });
    if (resultado === undefined) return;
    await this.ejecutar(async () => this.panel.set(await this.api.resultado(this.eventoId(), r.id, resultado, true)), 'No se pudo guardar el resultado.');
  }

  private async redirigir(datos: { zonaOrigenId?: string; zonaDestinoId: string; motivo: string }): Promise<void> {
    await this.ejecutar(async () => {
      this.panel.set(await this.api.redirigir(this.eventoId(), datos));
      this.aviso.set('Redirección registrada: los operadores de ingreso ya ven la nueva zona recomendada.');
    }, 'No se pudo redirigir.');
  }

  // --- Flujo en vivo -------------------------------------------------------------------

  private conectar(): void {
    const id = this.eventoId();
    this.cortar = this.api.seguir(
      id,
      (p) => {
        if (id !== this.eventoId()) return;
        this.panel.set(p);
        this.enVivo.set(true);
        this.espera = 2000;
      },
      () => {
        if (id !== this.eventoId()) return;
        this.enVivo.set(false);
        this.reintento = setTimeout(() => this.conectar(), this.espera);
        this.espera = Math.min(this.espera * 2, 30_000);
      }
    );
  }

  private detener(): void {
    this.cortar?.();
    this.cortar = null;
    if (this.reintento) clearTimeout(this.reintento);
    this.enVivo.set(false);
  }

  private async consultar(): Promise<void> {
    const id = this.eventoId();
    if (!id) return;
    try {
      const p = await this.api.panel(id);
      if (id === this.eventoId()) this.panel.set(p);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo consultar la ocupación.'));
    }
  }

  private async ejecutar(trabajo: () => Promise<void>, error: string): Promise<void> {
    this.trabajando.set(true);
    this.error.set(null);
    try {
      await trabajo();
    } catch (e) {
      this.error.set(this.mensaje(e, error));
    } finally {
      this.trabajando.set(false);
    }
  }

  private preguntar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '480px' }).afterClosed());
  }

  private mensaje(e: unknown, defecto: string): string {
    return e instanceof ErrorCuenta ? e.message : defecto;
  }
}
