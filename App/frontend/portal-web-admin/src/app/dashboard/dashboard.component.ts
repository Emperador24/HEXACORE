import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { CarteleraApiService } from '../core/cartelera-api.service';
import { Empleado, EventoCartelera, Rol } from '../core/models';
import { PersonalApiService } from '../core/personal-api.service';
import { NAV_ITEMS } from '../core/nav-items';

import { acento } from '../compartido/acentos';

/**
 * Inicio: cifras reales y accesos a lo que ya funciona. Cada cifra se pide por
 * separado: si un servicio no responde, su tarjeta lo dice y el resto se ve.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly personal = inject(PersonalApiService);
  private readonly cartelera = inject(CarteleraApiService);

  readonly usuario = this.auth.usuarioActual;
  readonly primerNombre = computed(() => this.usuario()?.nombre.split(' ')[0] ?? '');
  readonly acento = acento;
  readonly esAdministrador = computed(() => this.auth.roles().includes(Rol.ADMINISTRADOR));

  readonly eventos = signal<EventoCartelera[] | null>(null);
  readonly empleados = signal<Empleado[] | null>(null);
  readonly sinEventos = signal(false);
  readonly sinPersonal = signal(false);

  readonly proximos = computed(() => (this.eventos() ?? []).slice(0, 5));
  readonly activos = computed(() => (this.empleados() ?? []).filter((e) => e.activo).length);
  readonly sinContacto = computed(() => (this.empleados() ?? []).filter((e) => e.activo && (!e.documento || !e.correo)).length);

  readonly accesos = computed(() => {
    const roles = this.auth.roles();
    return NAV_ITEMS.filter((i) => !i.pendiente && i.ruta !== 'inicio' && i.roles.some((r) => roles.includes(r)));
  });

  constructor() {
    this.cartelera.proximos().then((e) => this.eventos.set(e), () => this.sinEventos.set(true));
    this.personal.listar().then((e) => this.empleados.set(e), () => this.sinPersonal.set(true));
  }
}
