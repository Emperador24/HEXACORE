import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ErrorCuenta } from '../core/auth.service';
import { Empleado, EntradaAuditoriaPersonal, ReemplazosSolicitud, SolicitudCambio } from '../core/models';
import { PersonalApiService } from '../core/personal-api.service';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { PestanasPersonalComponent } from './pestanas-personal.component';

const ESTADOS: [string, string][] = [
  ['PENDIENTE', 'Pendientes'],
  ['SIN_REEMPLAZO', 'Sin reemplazo'],
  ['APROBADA', 'Aprobadas'],
  ['RECHAZADA', 'Rechazadas'],
  ['BLOQUEADA_POR_HORAS', 'Bloqueadas'],
  ['CANCELADA', 'Canceladas'],
  ['', 'Todas']
];

const ACCIONES: Record<string, string> = {
  CAMBIO_SOLICITADO: 'Solicitó el cambio',
  CAMBIO_APROBADO: 'Aprobado por el supervisor',
  CAMBIO_RECHAZADO: 'Rechazado por el supervisor',
  CAMBIO_BLOQUEADO: 'Bloqueado por límite de horas',
  CAMBIO_CANCELADO: 'Cancelado por el empleado',
  REEMPLAZO_ACEPTO: 'El reemplazo confirmó',
  REEMPLAZO_RECHAZO: 'El reemplazo rechazó'
};

/**
 * CU-008: el supervisor revisa las solicitudes de cambio de turno.
 *
 * Paso 6: al abrir una solicitud pendiente se consultan los posibles
 * reemplazos con su disponibilidad; paso 7, el supervisor elige uno (viene
 * marcado el que propuso el sistema); pasos 9-10, aprueba. CU-008A: rechaza
 * con motivo. El empleado pide y cancela desde la app; el reemplazo responde
 * desde la suya (CU-008C), y aquí se ve el resultado y el historial (paso 13).
 */
@Component({
  selector: 'app-cambios-turno',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatRadioModule, MatTooltipModule, PestanasPersonalComponent],
  templateUrl: './cambios-turno.component.html',
  styleUrl: './cambios-turno.component.scss'
})
export class CambiosTurnoComponent implements OnInit {
  private readonly api = inject(PersonalApiService);
  private readonly dialogo = inject(MatDialog);

  readonly estados = ESTADOS;
  readonly estado = signal('PENDIENTE');
  readonly solicitudes = signal<SolicitudCambio[]>([]);
  readonly empleados = signal<Map<string, Empleado>>(new Map());
  readonly abierta = signal<string | null>(null);
  readonly reemplazos = signal<ReemplazosSolicitud | null>(null);
  readonly elegido = signal<string | null>(null);
  readonly historial = signal<EntradaAuditoriaPersonal[] | null>(null);
  readonly cargando = signal(false);
  readonly trabajando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly disponibles = computed(() => (this.reemplazos()?.candidatos ?? []).filter((c) => c.disponible).length);

  async ngOnInit(): Promise<void> {
    try {
      this.empleados.set(new Map((await this.api.listar()).map((e) => [e.id, e])));
    } catch {
      // Sin la lista se muestran los ids; la revisión sigue funcionando.
    }
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.solicitudes.set(await this.api.solicitudes(this.estado() || undefined));
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudieron cargar las solicitudes.'));
    } finally {
      this.cargando.set(false);
    }
  }

  filtrar(estado: string): void {
    this.estado.set(estado);
    this.cerrar();
    void this.cargar();
  }

  nombre(id: string | null | undefined): string {
    if (!id) return '—';
    return this.empleados().get(id)?.nombre ?? id.slice(0, 8);
  }

  solicitante(s: SolicitudCambio): string {
    return this.nombre(s.empleadoSolicitanteId ?? s.turno?.empleadoId);
  }

  etiquetaEstado(estado: string): string {
    return ESTADOS.find(([e]) => e === estado)?.[1].replace(/s$/, '') ?? estado;
  }

  accion(a: string): string {
    return ACCIONES[a] ?? a;
  }

  /** Paso 5-6: abrir la revisión y consultar los reemplazos. */
  async abrir(s: SolicitudCambio): Promise<void> {
    if (this.abierta() === s.id) return this.cerrar();
    this.abierta.set(s.id);
    this.reemplazos.set(null);
    this.historial.set(null);
    this.elegido.set(s.empleadoReemplazoId);
    try {
      const [historial, reemplazos] = await Promise.all([
        this.api.historialSolicitud(s.id),
        s.estado === 'PENDIENTE' ? this.api.reemplazos(s.id) : Promise.resolve(null)
      ]);
      this.historial.set(historial.eventos);
      this.reemplazos.set(reemplazos);
      if (reemplazos && !reemplazos.candidatos.some((c) => c.empleado.id === this.elegido() && c.disponible)) {
        this.elegido.set(reemplazos.candidatos.find((c) => c.disponible)?.empleado.id ?? null);
      }
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo abrir la solicitud.'));
    }
  }

  cerrar(): void {
    this.abierta.set(null);
    this.reemplazos.set(null);
    this.historial.set(null);
  }

  /** Pasos 7-10. */
  async aprobar(s: SolicitudCambio): Promise<void> {
    const reemplazoId = this.elegido();
    if (!reemplazoId) return;
    await this.revisar(s, { aprobar: true, reemplazoId }, `Cambio aprobado: ${this.nombre(reemplazoId)} cubre el turno y debe confirmarlo.`);
  }

  /** CU-008A. */
  async rechazar(s: SolicitudCambio): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialogo
        .open(DialogoConfirmacionComponent, {
          data: { titulo: 'Rechazar el cambio', mensaje: `${this.solicitante(s)} conserva su turno en «${s.turno.zona}». Se le avisa con el motivo.`, accion: 'Rechazar', pedirMotivo: true, peligrosa: true } satisfies DatosConfirmacion,
          width: '480px'
        })
        .afterClosed()
    );
    if (motivo === undefined) return;
    await this.revisar(s, { aprobar: false, motivo }, 'Solicitud rechazada; el empleado conserva su turno.');
  }

  private async revisar(s: SolicitudCambio, datos: { aprobar: boolean; reemplazoId?: string; motivo?: string }, exito: string): Promise<void> {
    this.trabajando.set(true);
    this.error.set(null);
    try {
      const r = await this.api.revisar(s.id, datos);
      this.aviso.set(r.estado === 'BLOQUEADA_POR_HORAS' ? `No procede: ${r.motivoRechazoOBloqueo}` : exito);
      this.cerrar();
      await this.cargar();
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo revisar la solicitud.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  private mensaje(e: unknown, defecto: string): string {
    return e instanceof ErrorCuenta ? e.message : defecto;
  }
}
