import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ErrorCuenta } from '../core/auth.service';
import { AlertaPanel, DecisionPanel, EventoMonitoreable, PanelMonitoreo, PuntoAccesoPanel } from '../core/models';
import { MonitoreoApiService } from '../core/monitoreo-api.service';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { DatosDialogoDecision, DialogoDecisionComponent } from './dialogo-decision.component';

type Seccion = 'alertas' | 'accesos' | 'personal' | 'decisiones';

const ETIQUETAS_DECISION: Record<string, string> = {
  REDISTRIBUIR_PERSONAL: 'Redistribuir personal',
  CERRAR_ACCESO: 'Cerrar acceso',
  HABILITAR_ACCESO: 'Habilitar acceso',
  ESCALAR_INCIDENTE: 'Escalar incidente',
  OTRA: 'Otra decisión'
};

/**
 * CU-019: panel de monitoreo del evento.
 *
 * Se alimenta del flujo en vivo del servidor (Server-Sent Events, cada 3 s).
 * Si el flujo cae, reintenta con espera creciente y mientras tanto consulta
 * el panel cada 10 s: el supervisor nunca se queda con datos congelados sin
 * saberlo, porque la cabecera dice si está en vivo y cuándo se actualizó.
 */
@Component({
  selector: 'app-monitoreo',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule,
    MatSelectModule, MatTooltipModule
  ],
  templateUrl: './monitoreo.component.html',
  styleUrl: './monitoreo.component.scss'
})
export class MonitoreoComponent implements OnInit, OnDestroy {
  private readonly api = inject(MonitoreoApiService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly eventos = signal<EventoMonitoreable[]>([]);
  readonly eventoId = signal('');
  readonly panel = signal<PanelMonitoreo | null>(null);
  readonly enVivo = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly cargando = signal(false);

  // Paso 6: filtrar por zona o punto y por tipo de indicador.
  readonly filtroLugar = signal('');
  readonly secciones = signal<Set<Seccion>>(new Set(['alertas', 'accesos', 'personal', 'decisiones']));
  readonly etiquetaDecision = (t: string) => ETIQUETAS_DECISION[t] ?? t;

  private cortar: (() => void) | null = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private sondeo: ReturnType<typeof setInterval> | null = null;
  private renovacion: ReturnType<typeof setInterval> | null = null;
  private espera = 2000;

  readonly lugares = computed(() => {
    const p = this.panel();
    if (!p) return [];
    return [...new Set([...p.accesos.puntos.map((x) => x.nombre), ...p.personal.zonas.map((z) => z.nombre)])].sort();
  });

  readonly puntos = computed(() => (this.panel()?.accesos.puntos ?? []).filter((p) => !this.filtroLugar() || p.nombre === this.filtroLugar()));
  readonly zonas = computed(() => (this.panel()?.personal.zonas ?? []).filter((z) => !this.filtroLugar() || z.nombre === this.filtroLugar()));
  readonly alertas = computed(() =>
    (this.panel()?.alertas ?? []).filter((a) => !this.filtroLugar() || a.clave.endsWith(`:${this.filtroLugar()}`) || a.mensaje.includes(`«${this.filtroLugar()}»`) || a.clave === 'AFORO')
  );

  /** Barras del flujo por minuto: alto relativo al máximo de la ventana (mínimo 1 para no dividir por cero). */
  readonly barras = computed(() => {
    const serie = this.panel()?.accesos.porMinuto ?? [];
    const maximo = Math.max(1, ...serie.map((s) => s.ingresos));
    return { serie, maximo };
  });

  readonly tonoAforo = computed(() => {
    const p = this.panel()?.aforo.porcentaje ?? 0;
    return p >= 100 ? 'peligro' : p >= 90 ? 'aviso' : 'ok';
  });

  async ngOnInit(): Promise<void> {
    this.cargando.set(true);
    try {
      this.eventos.set(await this.api.eventos());
      const pedido = this.ruta.snapshot.queryParamMap.get('evento');
      const inicial = this.eventos().find((e) => e.id === pedido) ?? this.eventos().find((e) => e.enCurso) ?? this.eventos()[0];
      if (inicial) this.elegirEvento(inicial.id);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudieron cargar los eventos.'));
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    this.detener();
  }

  elegirEvento(id: string): void {
    this.detener();
    this.eventoId.set(id);
    this.panel.set(null);
    this.filtroLugar.set('');
    void this.router.navigate([], { queryParams: { evento: id }, replaceUrl: true });
    void this.consultar();
    this.conectar();
    // El flujo usa el token del momento en que abrió: se reabre antes de que caduque.
    this.renovacion = setInterval(() => this.reconectar(), 10 * 60_000);
  }

  alternarSeccion(s: Seccion): void {
    this.secciones.update((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(s)) nuevo.delete(s);
      else nuevo.add(s);
      return nuevo;
    });
  }

  // --- Flujo en vivo ----------------------------------------------------------

  private conectar(): void {
    const id = this.eventoId();
    this.cortar = this.api.seguir(
      id,
      (p) => {
        if (id !== this.eventoId()) return;
        this.panel.set(p);
        this.enVivo.set(true);
        this.espera = 2000;
        this.pararSondeo();
      },
      () => {
        if (id !== this.eventoId()) return;
        this.enVivo.set(false);
        this.iniciarSondeo();
        this.reintento = setTimeout(() => this.conectar(), this.espera);
        this.espera = Math.min(this.espera * 2, 30_000);
      }
    );
  }

  private reconectar(): void {
    this.cortar?.();
    this.conectar();
  }

  private iniciarSondeo(): void {
    if (!this.sondeo) this.sondeo = setInterval(() => void this.consultar(), 10_000);
  }

  private pararSondeo(): void {
    if (this.sondeo) clearInterval(this.sondeo);
    this.sondeo = null;
  }

  private detener(): void {
    this.cortar?.();
    this.cortar = null;
    if (this.reintento) clearTimeout(this.reintento);
    if (this.renovacion) clearInterval(this.renovacion);
    this.pararSondeo();
    this.enVivo.set(false);
  }

  async consultar(): Promise<void> {
    const id = this.eventoId();
    if (!id) return;
    try {
      const p = await this.api.panel(id);
      if (id === this.eventoId()) this.panel.set(p);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo consultar el panel.'));
    }
  }

  // --- Decisiones (pasos 7-8) ----------------------------------------------------

  /** Desde una alerta: el diálogo llega prellenado con su sugerencia. */
  async actuar(alerta: AlertaPanel): Promise<void> {
    const s = alerta.sugerencia;
    await this.decidir({
      tipo: s?.accion === 'CERRAR_ACCESO' ? 'CERRAR_ACCESO' : s?.accion === 'REDISTRIBUIR_PERSONAL' ? 'REDISTRIBUIR_PERSONAL' : 'OTRA',
      descripcion: s?.texto ?? '',
      puntoAcceso: s?.punto ?? s?.hacia ?? '',
      alternativa: s?.alternativa ?? '',
      alertaId: alerta.id,
      motivo: alerta.mensaje
    });
  }

  async cerrarPunto(p: PuntoAccesoPanel): Promise<void> {
    const otro = this.panel()?.accesos.puntos.find((x) => x.nombre !== p.nombre && x.estado === 'HABILITADO');
    await this.decidir({ tipo: 'CERRAR_ACCESO', descripcion: '', puntoAcceso: p.nombre, alternativa: otro?.nombre ?? '' });
  }

  async habilitarPunto(p: PuntoAccesoPanel): Promise<void> {
    await this.decidir({ tipo: 'HABILITAR_ACCESO', descripcion: `Se reabre «${p.nombre}».`, puntoAcceso: p.nombre });
  }

  async decidir(datos: Partial<DatosDialogoDecision> = {}): Promise<void> {
    const p = this.panel();
    if (!p) return;
    const entrada: DatosDialogoDecision = {
      tipo: 'OTRA',
      descripcion: '',
      puntos: p.accesos.puntos.map((x) => x.nombre),
      zonas: p.personal.zonas.map((z) => z.nombre),
      ...datos
    };
    const resultado = await firstValueFrom(this.dialogo.open(DialogoDecisionComponent, { data: entrada, width: '560px', maxWidth: '95vw' }).afterClosed());
    if (!resultado) return;
    this.error.set(null);
    try {
      await this.api.decidir(p.evento.id, resultado);
      this.aviso.set('Decisión registrada en el historial del evento.');
      await this.consultar();
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo registrar la decisión.'));
    }
  }

  async anotarResultado(d: DecisionPanel): Promise<void> {
    const p = this.panel();
    if (!p) return;
    const texto = await this.confirmar({
      titulo: 'Resultado de la decisión',
      mensaje: `${this.etiquetaDecision(d.tipo)}: ${d.descripcion}`,
      accion: 'Guardar resultado',
      pedirMotivo: true
    });
    if (texto === undefined) return;
    try {
      await this.api.resultado(p.evento.id, d.id, texto);
      await this.consultar();
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo guardar el resultado.'));
    }
  }

  // --- Apoyo --------------------------------------------------------------------

  minuto(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private confirmar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '480px' }).afterClosed());
  }

  private mensaje(e: unknown, defecto: string): string {
    return e instanceof ErrorCuenta ? e.message : defecto;
  }
}
