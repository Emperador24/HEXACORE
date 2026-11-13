import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ErrorCuenta } from '../core/auth.service';
import { CarteleraApiService } from '../core/cartelera-api.service';
import { Candidato, EventoCartelera, Turno, ZonaEvento } from '../core/models';
import { PersonalApiService } from '../core/personal-api.service';
import { DatosConfirmacion, DialogoConfirmacionComponent } from '../compartido/dialogo-confirmacion.component';
import { aControles, asignacionVigente, desdeControles, estadoAsignacion, horasEntre } from '../compartido/formato';
import { PestanasPersonalComponent } from './pestanas-personal.component';
import { DatosReasignacion, ReasignarDialogoComponent } from './reasignar-dialogo.component';

/**
 * CU-007, pasos 6-12 y CU-007C: el organizador elige un evento, una zona y un
 * horario, ve el personal activo de ese rol con su disponibilidad y asigna.
 *
 * Las reglas (rol, choque de horario, tope de horas) las aplica el servidor:
 * la tabla de candidatos usa las mismas, así que lo que aparece como
 * disponible es lo que la asignación acepta. Si dos organizadores asignan a la
 * vez, el servidor responde con el conflicto y la pantalla lo muestra.
 */
@Component({
  selector: 'app-asignaciones',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    PestanasPersonalComponent
  ],
  templateUrl: './asignaciones.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './asignaciones.component.scss'
})
export class AsignacionesComponent implements OnInit {
  private readonly api = inject(PersonalApiService);
  private readonly cartelera = inject(CarteleraApiService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly eventos = signal<EventoCartelera[]>([]);
  readonly eventoId = signal<string>('');
  readonly evento = computed(() => this.eventos().find((e) => e.id === this.eventoId()) ?? null);

  readonly zonas = signal<ZonaEvento[]>([]);
  readonly zonaId = signal<string>('');
  readonly zona = computed(() => this.zonas().find((z) => z.id === this.zonaId()) ?? null);
  readonly asignaciones = signal<Turno[]>([]);
  readonly candidatos = signal<Candidato[] | null>(null);

  readonly cargando = signal(false);
  readonly buscando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // Horario de la asignación (paso 8).
  fecha = '';
  inicio = '';
  fin = '';
  readonly horario = signal<{ horaInicio: string; horaFin: string } | null>(null);

  // Nueva zona.
  readonly creandoZona = signal(false);
  nuevaZona = { nombre: '', rolRequerido: '', personalRequerido: 1 };

  readonly columnas = ['empleado', 'zona', 'horario', 'estado', 'acciones'];
  readonly estadoAsignacion = estadoAsignacion;
  readonly asignacionVigente = asignacionVigente;
  readonly horasEntre = horasEntre;

  readonly resumen = computed(() => {
    const a = this.asignaciones().filter(asignacionVigente);
    return {
      requeridos: this.zonas().reduce((n, z) => n + z.personalRequerido, 0),
      asignados: a.length,
      pendientes: a.filter((t) => t.confirmacion === 'PENDIENTE').length,
      rechazadas: this.asignaciones().filter((t) => t.confirmacion === 'RECHAZADA').length
    };
  });

  async ngOnInit(): Promise<void> {
    try {
      this.eventos.set(await this.cartelera.proximos());
    } catch {
      this.error.set('No se pudo cargar la cartelera de eventos. Comprueba que Boletería esté en marcha.');
      return;
    }
    const pedido = this.ruta.snapshot.queryParamMap.get('evento');
    const inicial = this.eventos().find((e) => e.id === pedido) ?? null;
    if (inicial) await this.elegirEvento(inicial.id);
  }

  // --- Evento y zonas (paso 6) -------------------------------------------------

  async elegirEvento(id: string): Promise<void> {
    this.eventoId.set(id);
    this.zonaId.set('');
    this.candidatos.set(null);
    void this.router.navigate([], { queryParams: { evento: id }, replaceUrl: true });
    const e = this.evento();
    if (e) {
      // Por defecto, el turno empieza dos horas antes del evento y dura seis.
      const inicio = new Date(new Date(e.fechaInicio).getTime() - 2 * 3_600_000);
      const c = aControles(inicio.toISOString());
      this.fecha = c.fecha;
      this.inicio = c.hora;
      this.fin = aControles(new Date(inicio.getTime() + 6 * 3_600_000).toISOString()).hora;
    }
    await this.recargar();
  }

  async recargar(): Promise<void> {
    if (!this.eventoId()) return;
    this.cargando.set(true);
    try {
      const [zonas, asignaciones] = await Promise.all([
        this.api.zonas(this.eventoId()),
        this.api.asignaciones(this.eventoId())
      ]);
      this.zonas.set(zonas);
      this.asignaciones.set(asignaciones);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudieron cargar las zonas del evento.'));
    } finally {
      this.cargando.set(false);
    }
  }

  async crearZona(): Promise<void> {
    const z = this.nuevaZona;
    if (!z.nombre.trim() || !z.rolRequerido.trim() || z.personalRequerido < 1) return;
    this.limpiarMensajes();
    try {
      const creada = await this.api.crearZona({
        eventoId: this.eventoId(),
        nombre: z.nombre.trim(),
        rolRequerido: z.rolRequerido.trim(),
        personalRequerido: z.personalRequerido
      });
      this.nuevaZona = { nombre: '', rolRequerido: '', personalRequerido: 1 };
      this.creandoZona.set(false);
      await this.recargar();
      this.elegirZona(creada.id);
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo crear la zona.'));
    }
  }

  elegirZona(id: string): void {
    this.zonaId.set(id);
    this.candidatos.set(null);
    void this.buscarCandidatos();
  }

  asignacionesDeZona(zona: ZonaEvento): Turno[] {
    return this.asignaciones().filter((t) => t.zonaEventoId === zona.id && asignacionVigente(t));
  }

  // --- Candidatos y asignación (pasos 7-11) ------------------------------------

  async buscarCandidatos(): Promise<void> {
    const zona = this.zona();
    const horario = desdeControles(this.fecha, this.inicio, this.fin);
    this.horario.set(horario);
    if (!zona || !horario) return;
    this.buscando.set(true);
    try {
      this.candidatos.set(await this.api.candidatos(zona.id, horario.horaInicio, horario.horaFin));
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo consultar el personal disponible.'));
      this.candidatos.set(null);
    } finally {
      this.buscando.set(false);
    }
  }

  async asignar(candidato: Candidato): Promise<void> {
    const zona = this.zona();
    const horario = this.horario();
    if (!zona || !horario) return;
    const fecha = new Date(horario.horaInicio).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' });
    // Paso 10: el organizador confirma la asignación antes de registrarla.
    const ok = await this.confirmar({
      titulo: 'Confirmar asignación',
      mensaje: `${candidato.empleado.nombre} cubrirá "${zona.nombre}" desde el ${fecha}, ${horasEntre(horario.horaInicio, horario.horaFin).toFixed(1)} h. Se le notificará para que confirme.`,
      accion: 'Asignar'
    });
    if (ok === undefined) return;
    this.limpiarMensajes();
    try {
      await this.api.asignar(zona.id, candidato.empleado.id, horario.horaInicio, horario.horaFin);
      this.aviso.set(`${candidato.empleado.nombre} quedó asignado a ${zona.nombre}. Su confirmación aparecerá abajo.`);
      await this.recargar();
      await this.buscarCandidatos();
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo asignar.'));
      await this.buscarCandidatos();
    }
  }

  // --- Asignaciones existentes (CU-007C) ---------------------------------------

  async reasignar(turno: Turno): Promise<void> {
    const datos: DatosReasignacion = { turno, rolRequerido: this.zonas().find((z) => z.id === turno.zonaEventoId)?.rolRequerido ?? '' };
    const hecho = await firstValueFrom(
      this.dialogo.open(ReasignarDialogoComponent, { data: datos, width: '720px', maxWidth: '95vw' }).afterClosed()
    );
    if (!hecho) return;
    this.limpiarMensajes();
    this.aviso.set(hecho as string);
    await this.recargar();
    if (this.zona()) await this.buscarCandidatos();
  }

  async cancelar(turno: Turno): Promise<void> {
    const motivo = await this.confirmar({
      titulo: 'Cancelar asignación',
      mensaje: `${turno.empleado.nombre} dejará de cubrir "${turno.zona}". Se le notificará y la zona volverá a contar el puesto como libre.`,
      accion: 'Cancelar asignación',
      pedirMotivo: true,
      peligrosa: true
    });
    if (motivo === undefined) return;
    this.limpiarMensajes();
    try {
      await this.api.cancelar(turno.id, motivo);
      this.aviso.set('Asignación cancelada.');
      await this.recargar();
      if (this.zona()) await this.buscarCandidatos();
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo cancelar la asignación.'));
    }
  }

  // --- Apoyo -------------------------------------------------------------------

  porcentaje(zona: ZonaEvento): number {
    return Math.min(100, Math.round((zona.personalAsignado / zona.personalRequerido) * 100));
  }

  private confirmar(datos: DatosConfirmacion): Promise<string | undefined> {
    return firstValueFrom(this.dialogo.open(DialogoConfirmacionComponent, { data: datos, width: '480px' }).afterClosed());
  }

  private limpiarMensajes(): void {
    this.error.set(null);
    this.aviso.set(null);
  }

  private mensaje(e: unknown, defecto: string): string {
    return e instanceof ErrorCuenta ? e.message : defecto;
  }
}
