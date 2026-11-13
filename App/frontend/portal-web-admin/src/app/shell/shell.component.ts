import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { TemaService } from '../core/tema.service';
import { Rol } from '../core/models';
import { NAV_GRUPOS, NAV_ITEMS } from '../core/nav-items';

/**
 * Marco común a los roles de administración: menú lateral agrupado y filtrado
 * por rol, barra superior con la ubicación actual, y el contenido.
 *
 * El filtro va contra **todos** los roles de la cuenta, no contra uno: en el
 * Servicio de Administración una persona puede tener varios (la cuenta de
 * demostración `admin@hexacore.com` tiene Administrador y Personal), y quedarse
 * con el primero escondería secciones que sí le corresponden.
 *
 * Por debajo de 960 px el menú pasa a ser un panel que se abre encima.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly tema = inject(TemaService);
  readonly usuario = this.auth.usuarioActual;
  readonly menuAbierto = signal(false);
  readonly estrecho = toSignal(
    inject(BreakpointObserver).observe('(max-width: 960px)').pipe(map((r) => r.matches)),
    { initialValue: false }
  );

  readonly gruposMenu = computed(() => {
    return NAV_GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => this.auth.puedeVer(i)) })).filter(
      (g) => g.items.length > 0
    );
  });

  readonly rolPrincipal = computed(() => {
    const roles = this.auth.roles();
    return [Rol.ADMINISTRADOR, Rol.ORGANIZADOR].filter((r) => roles.includes(r)).join(' · ');
  });

  readonly iniciales = computed(() =>
    (this.usuario()?.nombre ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('')
  );

  /** Lo que muestra la barra superior: la sección del menú y el título de la pantalla. */
  private readonly ubicacion = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        // Del estado del router y no de la ruta inyectada: durante la primera
        // navegación sus `snapshot` todavía no existen.
        let actual = this.router.routerState.snapshot.root;
        while (actual.firstChild) actual = actual.firstChild;
        const primera = this.router.url.split(/[/?#]/)[2] ?? '';
        return {
          seccion: NAV_ITEMS.find((i) => i.ruta === primera)?.etiqueta ?? '',
          titulo: (actual.data['titulo'] as string | undefined) ?? ''
        };
      })
    ),
    { initialValue: { seccion: '', titulo: '' } }
  );
  readonly seccion = computed(() => this.ubicacion().seccion);
  readonly titulo = computed(() => this.ubicacion().titulo);

  async cerrarSesion(): Promise<void> {
    // Se cierra también en el servidor, así que hay que esperar antes de
    // navegar: si no, la guarda podría dejar pasar con la sesión a medio cerrar.
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }
}
