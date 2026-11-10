import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EventosApiService } from '../core/eventos-api.service';
import { DatosEstablecimiento, Establecimiento, EstablecimientosApiService } from '../core/establecimientos-api.service';
import { EventoResumen } from '../core/models';

@Component({
  selector: 'app-establecimientos', standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './establecimientos.component.html', styleUrl: './establecimientos.component.scss'
})
export class EstablecimientosComponent {
  private readonly api = inject(EstablecimientosApiService);
  private readonly eventosApi = inject(EventosApiService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  readonly eventos = signal<EventoResumen[]>([]);
  readonly locales = signal<Establecimiento[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly mensaje = signal('');
  readonly formulario = signal(false);
  eventoId = this.ruta.snapshot.queryParamMap.get('eventoId') ?? '';
  editando?: string;
  datos = this.nuevosDatos();
  readonly gestionPersonal = signal<Establecimiento | null>(null);
  readonly candidatos = signal<{ id: string; nombre: string; email: string }[]>([]);
  readonly vinculados = signal<{ usuarioId: string; nombre: string; email: string; activo: boolean }[]>([]);
  cuentaId = '';
  busquedaPersonal = '';

  constructor() { void this.iniciar(); }
  private nuevosDatos(): DatosEstablecimiento {
    return { eventoId: this.eventoId, nombre: '', contacto: '', puntoEntrega: '',
      horaApertura: '00:00', horaCierre: '00:00', zonaHoraria: 'America/Bogota', estado: 'DISPONIBLE' };
  }
  private fallo(e: unknown): void { this.error.set(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
  private async iniciar(): Promise<void> {
    this.cargando.set(true);
    try { this.eventos.set(await this.eventosApi.listar()); }
    catch (e) { this.fallo(e); }
    finally { this.cargando.set(false); }
    if (this.eventoId) await this.consultar();
  }
  async consultar(): Promise<void> {
    this.formulario.set(false); this.error.set(''); this.mensaje.set(''); this.locales.set([]);
    await this.router.navigate([], { relativeTo: this.ruta, queryParams: { eventoId: this.eventoId || null }, replaceUrl: true });
    if (!this.eventoId) return;
    this.cargando.set(true);
    try { this.locales.set(await this.api.listar(this.eventoId)); }
    catch (e) { this.fallo(e); }
    finally { this.cargando.set(false); }
  }
  nuevo(): void {
    this.editando = undefined; this.datos = this.nuevosDatos();
    this.error.set(''); this.mensaje.set(''); this.formulario.set(true);
  }
  editar(e: Establecimiento): void {
    this.editando = e.id;
    this.datos = { eventoId: e.eventoId, nombre: e.nombre, contacto: e.contacto, puntoEntrega: e.puntoEntrega,
      horaApertura: e.horaApertura, horaCierre: e.horaCierre, zonaHoraria: e.zonaHoraria, estado: e.estado };
    this.error.set(''); this.mensaje.set(''); this.formulario.set(true);
  }
  async guardar(): Promise<void> {
    if (this.cargando()) return;
    this.cargando.set(true); this.error.set(''); this.mensaje.set('');
    try {
      await this.api.guardar(this.datos, this.editando);
      this.locales.set(await this.api.listar(this.eventoId));
      this.mensaje.set(this.editando ? 'Establecimiento actualizado.' : 'Establecimiento registrado.');
      this.formulario.set(false);
    } catch (e) { this.fallo(e); }
    finally { this.cargando.set(false); }
  }
  async alternar(e: Establecimiento): Promise<void> {
    this.cargando.set(true); this.error.set(''); this.mensaje.set('');
    try {
      const estado = e.estado === 'DESHABILITADO' ? 'DISPONIBLE' : 'DESHABILITADO';
      await this.api.estado(e.id, estado);
      this.locales.set(await this.api.listar(this.eventoId));
      this.mensaje.set(estado === 'DISPONIBLE' ? 'Establecimiento habilitado. Se aplica su horario.' : 'Establecimiento deshabilitado. Los pedidos existentes se conservan.');
    } catch (e) { this.fallo(e); }
    finally { this.cargando.set(false); }
  }
  async abrirPersonal(e: Establecimiento): Promise<void> {
    this.cargando.set(true); this.error.set(''); this.gestionPersonal.set(e);
    this.busquedaPersonal = ''; this.cuentaId = ''; this.candidatos.set([]); this.vinculados.set([]);
    try {
      this.candidatos.set(await this.api.candidatos());
      this.vinculados.set(await this.api.personal(e.id));
    } catch (error) { this.fallo(error); }
    finally { this.cargando.set(false); }
  }
  async buscarPersonal(): Promise<void> {
    this.cargando.set(true); this.error.set(''); this.cuentaId = '';
    try { this.candidatos.set(await this.api.candidatos(this.busquedaPersonal)); }
    catch (e) { this.fallo(e); }
    finally { this.cargando.set(false); }
  }
  async cambiarVinculo(usuario: string, asignar: boolean): Promise<void> {
    const local = this.gestionPersonal(); if (!local || !usuario) return;
    this.cargando.set(true); this.error.set('');
    try {
      if (asignar) await this.api.asignar(local.id, usuario); else await this.api.revocar(local.id, usuario);
      this.vinculados.set(await this.api.personal(local.id));
      this.mensaje.set(asignar ? 'Personal asignado al establecimiento.' : 'Acceso al establecimiento revocado.');
    } catch (e) { this.fallo(e); }
    finally { this.cargando.set(false); }
  }
}
