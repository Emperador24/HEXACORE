import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ErrorCuenta } from '../core/auth.service';
import { EventoMonitoreable, ReporteAsistencia } from '../core/models';
import { MonitoreoApiService } from '../core/monitoreo-api.service';
import { PersonalApiService } from '../core/personal-api.service';
import { PestanasPersonalComponent } from './pestanas-personal.component';

/**
 * CU-009, pasos 12-13: el supervisor consulta la asistencia de un evento.
 * El registro de entrada y salida se hace con la credencial en el punto de
 * control (app móvil, modo offline-first); aquí se ve el resultado: horas,
 * llegadas tarde o antes (CU-009A/B), salidas fuera de horario (CU-009C),
 * anomalías y quién está en turno ahora.
 */
@Component({
  selector: 'app-asistencia',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule, MatTooltipModule, PestanasPersonalComponent],
  template: `
    <div class="pagina-encabezado">
      <div>
        <h1>Asistencia <span class="referencia-cu">CU-009</span></h1>
        <p class="descripcion">Horas trabajadas y puntualidad del personal de un evento, calculadas con los registros de entrada y salida.</p>
      </div>
      <div class="acciones">
        <button mat-icon-button (click)="cargar()" [disabled]="!eventoId()" matTooltip="Actualizar" aria-label="Actualizar"><mat-icon>refresh</mat-icon></button>
      </div>
    </div>

    <app-pestanas-personal />

    @if (error()) {
      <div class="mensaje error" role="alert"><mat-icon>error_outline</mat-icon><span>{{ error() }}</span></div>
    }

    <section class="panel barra">
      <mat-form-field class="evento">
        <mat-label>Evento</mat-label>
        <mat-select [value]="eventoId()" (selectionChange)="elegir($event.value)">
          @for (e of eventos(); track e.id) {
            <mat-option [value]="e.id">{{ e.enCurso ? '● ' : '' }}{{ e.nombre }} — {{ e.fechaInicio | date: 'd MMM, HH:mm' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </section>

    @if (cargando()) { <mat-progress-bar mode="indeterminate" /> }

    @if (reporte(); as r) {
      <div class="kpis">
        <section class="panel kpi"><p class="etiqueta">En turno ahora</p><p class="valor">{{ r.totales.enTurno }}<small>/{{ r.totales.empleados }}</small></p></section>
        <section class="panel kpi"><p class="etiqueta">Horas trabajadas</p><p class="valor">{{ r.totales.horasTrabajadas | number: '1.0-1' }}<small> de {{ r.totales.horasProgramadas | number: '1.0-1' }} h</small></p></section>
        <section class="panel kpi"><p class="etiqueta">Llegadas tarde</p><p class="valor">{{ r.totales.tardias }}</p></section>
        <section class="panel kpi"><p class="etiqueta">Anomalías</p><p class="valor">{{ r.totales.anomalias }}</p></section>
      </div>
      <section class="panel">
        <div class="tabla-contenedor">
          <table class="reporte">
            <thead>
              <tr><th>Empleado</th><th>Estado</th><th class="num">Turnos</th><th class="num">Horas</th><th class="num">Tarde</th><th class="num">Antes</th><th class="num">Salida antes</th><th class="num">Salida después</th><th class="num">Anomalías</th></tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.empleadoId) {
                <tr>
                  <td><strong>{{ f.nombre }}</strong><div class="secundario">{{ f.rol }}</div></td>
                  <td><span class="estado-emp" [class.en-turno]="f.estado === 'EN_TURNO'">{{ f.estado === 'EN_TURNO' ? 'En turno' : 'Fuera de turno' }}</span></td>
                  <td class="num">{{ f.turnos }}</td>
                  <td class="num">{{ f.horasTrabajadas | number: '1.0-2' }}<span class="secundario"> / {{ f.horasProgramadas | number: '1.0-1' }}</span></td>
                  <td class="num" [class.marca]="f.tardias">{{ f.tardias }}</td>
                  <td class="num">{{ f.anticipadas }}</td>
                  <td class="num" [class.marca]="f.salidasAnticipadas">{{ f.salidasAnticipadas }}</td>
                  <td class="num">{{ f.salidasPosteriores }}</td>
                  <td class="num" [class.marca]="f.anomalias">{{ f.anomalias }}</td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="vacio-fila secundario">Nadie tiene turnos en este evento.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (!cargando() && !eventos().length) {
      <section class="panel"><div class="vacio"><mat-icon>badge</mat-icon><p>No hay eventos publicados.</p></div></section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .barra { padding: 14px 20px 0; .evento { width: 100%; max-width: 560px; } }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .kpi { padding: 16px 18px; margin: 0 0 16px; p { margin: 0; } }
    .etiqueta { color: var(--hx-texto-2); font-size: 0.8rem; font-weight: 700; }
    .valor { font-family: 'Space Grotesk', sans-serif; font-size: 1.7rem; font-weight: 700; small { font-size: 0.85rem; color: var(--hx-texto-3); } }
    table.reporte { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--hx-texto-3); padding: 10px 14px; border-bottom: 1px solid var(--hx-linea); }
    td { padding: 10px 14px; border-bottom: 1px solid var(--hx-linea); }
    .num { text-align: right; white-space: nowrap; }
    .marca { color: var(--hx-ambar); font-weight: 700; }
    .vacio-fila { text-align: center; padding: 24px; }
    .estado-emp { padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; color: var(--hx-texto-3); background: var(--hx-hover); white-space: nowrap; }
    .estado-emp.en-turno { color: var(--hx-verde); background: color-mix(in srgb, var(--hx-verde) 14%, transparent); }
  `
})
export class AsistenciaComponent implements OnInit {
  private readonly api = inject(PersonalApiService);
  private readonly monitoreo = inject(MonitoreoApiService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly eventos = signal<EventoMonitoreable[]>([]);
  readonly eventoId = signal('');
  readonly reporte = signal<ReporteAsistencia | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** Primero quien está en turno, luego por nombre. */
  readonly filas = computed(() =>
    [...(this.reporte()?.empleados ?? [])].sort((a, b) => Number(b.estado === 'EN_TURNO') - Number(a.estado === 'EN_TURNO') || a.nombre.localeCompare(b.nombre))
  );

  async ngOnInit(): Promise<void> {
    try {
      this.eventos.set(await this.monitoreo.eventos());
      const pedido = this.ruta.snapshot.queryParamMap.get('evento');
      const inicial = this.eventos().find((e) => e.id === pedido) ?? this.eventos().find((e) => e.enCurso) ?? this.eventos()[0];
      if (inicial) this.elegir(inicial.id);
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudieron cargar los eventos.');
    }
  }

  elegir(id: string): void {
    this.eventoId.set(id);
    void this.router.navigate([], { queryParams: { evento: id }, replaceUrl: true });
    void this.cargar();
  }

  async cargar(): Promise<void> {
    const id = this.eventoId();
    if (!id) return;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const r = await this.api.reporteAsistencia(id);
      if (id === this.eventoId()) this.reporte.set(r);
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudo cargar el reporte.');
    } finally {
      this.cargando.set(false);
    }
  }
}
