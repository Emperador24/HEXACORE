import { Component, OnDestroy, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ErrorCuenta } from '../core/auth.service';
import { DatosActivacion, EmergenciasApiService } from '../core/emergencias-api.service';
import { AlertaEvacuacion, DetalleEvacuacion, Evacuacion, EventoEmergencia, PlanEvacuacion, SalidaEmergencia, TIPOS_EMERGENCIA, ZonaEvacuacion } from '../core/models';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';

type Vista = 'evacuacion' | 'plan';

interface FilaSalida { nombre: string; capacidadPorMinuto: number | null }
interface FilaRuta { zonaId: string; salida: string; prioridad: number; descripcion: string }

const BITACORA: Record<string, string> = {
  PROPUESTA: 'Emergencia registrada y propuesta calculada',
  ACTIVADA: 'Protocolo activado y avisos enviados',
  DESCARTADA: 'Propuesta descartada',
  SALIDA_BLOQUEADA: 'Salida bloqueada',
  SALIDA_HABILITADA: 'Salida habilitada',
  RUTA_RECALCULADA: 'Ruta recalculada',
  RUTA_CAMBIADA: 'Ruta alternativa confirmada',
  NIVEL_CAMBIADO: 'Nivel escalado',
  ZONA_ACTUALIZADA: 'Reporte de zona',
  FINALIZADA: 'Evacuación finalizada'
};

/**
 * CU-010: Gestionar evacuación ante emergencias.
 *
 * Una pantalla para el supervisor de emergencia (Organizador o
 * Administrador): registra la emergencia (paso 1), revisa la propuesta de
 * zonas y rutas (2-6), la confirma (7-9) y sigue la evacuación en vivo por
 * Server-Sent Events (10-11): reportes de zona, salidas bloqueadas (CU-010A),
 * rutas alternativas (CU-010B), evacuación parcial (CU-010C) y escalada
 * (CU-010D), hasta finalizarla con su reporte (12-13). La pestaña «Plan»
 * configura las salidas y rutas del recinto (precondición 1).
 */
@Component({
  selector: 'app-emergencias',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatSelectModule, MatTooltipModule
  ],
  templateUrl: './emergencias.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './emergencias.component.scss'
})
export class EmergenciasComponent implements OnInit, OnDestroy {
  private readonly api = inject(EmergenciasApiService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly tipos = TIPOS_EMERGENCIA;
  readonly vista = signal<Vista>('evacuacion');
  readonly eventos = signal<EventoEmergencia[]>([]);
  readonly eventoId = signal('');
  readonly evento = computed(() => this.eventos().find((e) => e.id === this.eventoId()) ?? null);
  readonly plan = signal<PlanEvacuacion | null>(null);
  readonly historial = signal<Evacuacion[]>([]);
  readonly detalle = signal<DetalleEvacuacion | null>(null);
  readonly enVivo = signal(false);
  readonly cargando = signal(false);
  readonly trabajando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // Paso 1.
  readonly formulario = signal<DatosActivacion>({ tipo: 'INCENDIO', ubicacion: '', nivel: 1, alcance: 'PARCIAL' });
  readonly observaciones = signal('');
  readonly personas = signal<Partial<Record<string, number>>>({});

  // Plan del recinto.
  readonly salidasPlan = signal<FilaSalida[]>([]);
  readonly rutasPlan = signal<FilaRuta[]>([]);

  readonly estado = computed(() => this.detalle()?.evacuacion.estado ?? null);
  readonly abierta = computed(() => this.estado() === 'PROPUESTA' || this.estado() === 'ACTIVA');
  /** Las zonas que entraron al escalar (CU-010D) son las de nivel mayor al de las primeras. */
  readonly nivelInicial = computed(() => Math.min(...(this.detalle()?.zonas ?? []).map((z) => z.incorporadaEnNivel)));
  readonly avance = computed(() => {
    const r = this.detalle()?.resumen;
    return r && r.zonas ? Math.round((r.evacuadas / r.zonas) * 100) : 0;
  });
  readonly nombresSalidas = computed(() => this.salidasPlan().map((s) => s.nombre.trim()).filter(Boolean));
  readonly etiquetaBitacora = (t: string) => BITACORA[t] ?? t;
  readonly etiquetaTipo = (t: string) => TIPOS_EMERGENCIA.find(([v]) => v === t)?.[1] ?? t;

  private cortar: (() => void) | null = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private espera = 2000;

  async ngOnInit(): Promise<void> {
    this.cargando.set(true);
    try {
      this.eventos.set(await this.api.eventos());
      const pedido = this.ruta.snapshot.queryParamMap.get('evento');
      const inicial = this.eventos().find((e) => e.id === pedido) ?? this.eventos().find((e) => e.evacuacion) ?? this.eventos().find((e) => e.enCurso) ?? this.eventos()[0];
      if (inicial) await this.elegirEvento(inicial.id);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudieron cargar los eventos.'));
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    this.detener();
  }

  async elegirEvento(id: string): Promise<void> {
    this.detener();
    this.eventoId.set(id);
    this.detalle.set(null);
    void this.router.navigate([], { queryParams: { evento: id }, replaceUrl: true });
    const evento = this.evento();
    if (!evento) return;
    try {
      const [plan, historial] = await Promise.all([this.api.plan(evento.recintoId), this.api.historial(id)]);
      this.plan.set(plan);
      this.cargarPlanEditable(plan);
      this.historial.set(historial);
      const abierta = historial.find((h) => h.estado === 'PROPUESTA' || h.estado === 'ACTIVA');
      if (abierta) await this.abrir(abierta.id);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo cargar el plan del recinto.'));
    }
  }

  async abrir(id: string): Promise<void> {
    this.detener();
    this.mostrar(await this.api.detalle(id));
    if (this.abierta()) this.conectar(id);
  }

  actualizarFormulario(cambio: Partial<DatosActivacion>): void {
    this.formulario.update((f) => ({ ...f, ...cambio }));
  }

  // --- Pasos 1-9 ---------------------------------------------------------------

  async proponer(): Promise<void> {
    const f = this.formulario();
    await this.ejecutar(async () => {
      const datos: DatosActivacion = { ...f, ubicacion: f.ubicacion.trim(), ...(f.alcance === 'TOTAL' ? { zonaOrigenId: undefined } : {}) };
      this.mostrar(await this.api.proponer(this.eventoId(), datos));
      this.conectar(this.detalle()!.evacuacion.id);
      await this.refrescarHistorial();
    }, 'No se pudo calcular la propuesta.');
  }

  async confirmar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    const ok = await this.preguntar({
      titulo: 'Activar la evacuación',
      mensaje: `Se avisará al personal y a los asistentes de ${d.zonas.length} zona(s) con su ruta. ¿Confirmas la activación?`,
      accion: 'Activar y avisar',
      peligrosa: true
    });
    if (ok === undefined) return;
    await this.ejecutar(async () => {
      this.mostrar(await this.api.confirmar(d.evacuacion.id));
      this.aviso.set('Evacuación activa: los avisos salieron por la cola de alta prioridad.');
      await this.refrescarHistorial();
    }, 'No se pudo activar la evacuación.');
  }

  async descartar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    await this.ejecutar(async () => {
      this.mostrar(await this.api.descartar(d.evacuacion.id));
      this.detener();
      await this.refrescarHistorial();
    }, 'No se pudo descartar.');
  }

  // --- Pasos 10-11 y CU-010A/B/D --------------------------------------------------

  fijarPersonas(zonaId: string, valor: number): void {
    this.personas.update((p) => ({ ...p, [zonaId]: valor }));
  }

  async guardarPersonas(z: ZonaEvacuacion): Promise<void> {
    const valor = this.personas()[z.zonaId];
    if (valor === undefined || valor < 0) return;
    await this.accion((id) => this.api.reportarZona(id, z.zonaId, { personasRestantes: valor }), 'No se pudo guardar el reporte.');
    this.personas.update((p) => {
      const { [z.zonaId]: _quitado, ...resto } = p;
      return resto;
    });
  }

  marcarEvacuada(z: ZonaEvacuacion): Promise<void> {
    return this.accion((id) => this.api.reportarZona(id, z.zonaId, { estado: 'EVACUADA' }), 'No se pudo marcar la zona.');
  }

  cambiarRuta(z: ZonaEvacuacion, salidaId: string): Promise<void> {
    return this.accion((id) => this.api.cambiarRuta(id, z.zonaId, salidaId), 'No se pudo cambiar la ruta.');
  }

  aplicarSugerencia(a: AlertaEvacuacion): Promise<void> {
    const s = a.sugerencia!;
    return this.accion((id) => this.api.cambiarRuta(id, s.zonaId, s.salidaId, a.mensaje), 'No se pudo aplicar la ruta alternativa.');
  }

  async alternarSalida(s: SalidaEmergencia): Promise<void> {
    let motivo: string | undefined;
    if (s.habilitada) {
      motivo = await this.preguntar({
        titulo: `Bloquear «${s.nombre}»`,
        mensaje: 'Las zonas que salían por aquí pasan a su siguiente ruta y se les avisa.',
        accion: 'Bloquear salida',
        pedirMotivo: true,
        peligrosa: true
      });
      if (motivo === undefined) return;
    }
    await this.accion((id) => this.api.bloqueo(id, s.id, s.habilitada, motivo), 'No se pudo cambiar el estado de la salida.');
  }

  async escalar(): Promise<void> {
    const d = this.detalle();
    if (!d || d.evacuacion.nivel >= 3) return;
    const nivel = d.evacuacion.nivel + 1;
    const motivo = await this.preguntar({
      titulo: `Escalar a nivel ${nivel}`,
      mensaje: nivel === 3
        ? 'Nivel 3 evacúa todo el recinto, activa los altavoces y pide personal adicional.'
        : 'Nivel 2 suma las zonas vecinas en el plano y pide personal adicional.',
      accion: 'Escalar',
      pedirMotivo: true,
      peligrosa: true
    });
    if (motivo === undefined) return;
    await this.accion((id) => this.api.escalar(id, nivel, motivo), 'No se pudo escalar.');
  }

  async finalizar(): Promise<void> {
    await this.accion((id) => this.api.finalizar(id, this.observaciones().trim() || undefined), 'No se pudo finalizar.');
    if (this.estado() === 'FINALIZADA') {
      this.detener();
      this.aviso.set('Evacuación finalizada. El reporte de auditoría quedó guardado.');
      await this.refrescarHistorial();
    }
  }

  // --- Plan del recinto (precondición 1) ---------------------------------------------

  agregarSalida(): void {
    this.salidasPlan.update((s) => [...s, { nombre: '', capacidadPorMinuto: null }]);
  }

  quitarSalida(i: number): void {
    const nombre = this.salidasPlan()[i]?.nombre;
    this.salidasPlan.update((s) => s.filter((_, j) => j !== i));
    this.rutasPlan.update((r) => r.filter((x) => x.salida !== nombre));
  }

  editarSalida(i: number, cambio: Partial<FilaSalida>): void {
    const anterior = this.salidasPlan()[i].nombre;
    this.salidasPlan.update((s) => s.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
    if (cambio.nombre !== undefined) this.rutasPlan.update((r) => r.map((x) => (x.salida === anterior ? { ...x, salida: cambio.nombre! } : x)));
  }

  rutasDe(zonaId: string): FilaRuta[] {
    return this.rutasPlan().filter((r) => r.zonaId === zonaId).sort((a, b) => a.prioridad - b.prioridad);
  }

  agregarRuta(zonaId: string): void {
    const prioridad = this.rutasDe(zonaId).length + 1;
    this.rutasPlan.update((r) => [...r, { zonaId, salida: this.nombresSalidas()[0] ?? '', prioridad, descripcion: '' }]);
  }

  editarRuta(ruta: FilaRuta, cambio: Partial<FilaRuta>): void {
    this.rutasPlan.update((r) => r.map((x) => (x === ruta ? { ...x, ...cambio } : x)));
  }

  quitarRuta(ruta: FilaRuta): void {
    this.rutasPlan.update((r) => r.filter((x) => x !== ruta));
  }

  async guardarPlan(): Promise<void> {
    const evento = this.evento();
    if (!evento) return;
    await this.ejecutar(async () => {
      const plan = await this.api.guardarPlan(evento.recintoId, {
        salidas: this.salidasPlan().filter((s) => s.nombre.trim()).map((s) => ({ nombre: s.nombre.trim(), ...(s.capacidadPorMinuto ? { capacidadPorMinuto: s.capacidadPorMinuto } : {}) })),
        rutas: this.rutasPlan().filter((r) => r.salida).map((r) => ({ zonaId: r.zonaId, salida: r.salida, prioridad: r.prioridad, ...(r.descripcion.trim() ? { descripcion: r.descripcion.trim() } : {}) }))
      });
      this.plan.set(plan);
      this.cargarPlanEditable(plan);
      this.aviso.set(plan.completo ? 'Plan guardado: el recinto está listo para una evacuación.' : `Plan guardado. Faltan rutas para: ${plan.zonasSinRuta.join(', ')}.`);
    }, 'No se pudo guardar el plan.');
  }

  private cargarPlanEditable(plan: PlanEvacuacion): void {
    this.salidasPlan.set(plan.salidas.map((s) => ({ nombre: s.nombre, capacidadPorMinuto: s.capacidadPorMinuto })));
    this.rutasPlan.set(plan.zonas.flatMap((z) => z.rutas.map((r) => ({ zonaId: z.id, salida: r.salida, prioridad: r.prioridad, descripcion: r.descripcion ?? '' }))));
  }

  // --- Flujo en vivo -------------------------------------------------------------------

  private conectar(id: string): void {
    this.cortar = this.api.seguir(
      id,
      (d) => {
        if (d.evacuacion.id !== this.detalle()?.evacuacion.id) return;
        this.mostrar(d);
        this.enVivo.set(true);
        this.espera = 2000;
      },
      () => {
        this.enVivo.set(false);
        if (!this.abierta()) return;
        this.reintento = setTimeout(() => this.conectar(id), this.espera);
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

  // --- Apoyo -------------------------------------------------------------------------

  private mostrar(d: DetalleEvacuacion): void {
    this.detalle.set(d);
  }

  private async refrescarHistorial(): Promise<void> {
    this.historial.set(await this.api.historial(this.eventoId()));
    this.eventos.set(await this.api.eventos());
  }

  private accion(llamar: (id: string) => Promise<DetalleEvacuacion>, error: string): Promise<void> {
    const d = this.detalle();
    if (!d) return Promise.resolve();
    return this.ejecutar(async () => this.mostrar(await llamar(d.evacuacion.id)), error);
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
