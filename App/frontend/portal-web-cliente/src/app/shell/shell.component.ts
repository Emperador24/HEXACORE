import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../core/auth.service';
import { NAV_ITEMS } from '../core/nav-items';

/**
 * Shell del portal: navbar horizontal azul + <router-outlet> + pie — guiado
 * por el patrón de sitios de boletería (Ticketmaster/TuBoleta usan un navbar
 * superior, no un menú lateral) en vez del sidenav de portal-web-admin, que
 * es una herramienta interna y no necesita esa identidad de marca.
 *
 * El mismo shell sirve al visitante sin sesión y al cliente autenticado: solo
 * cambian las secciones visibles del menú y el bloque de la derecha (botón
 * "Iniciar sesión" o menú de cuenta).
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly usuario = this.auth.usuarioActual;
  readonly menuMovilAbierto = signal(false);

  /** Sin sesión solo se listan las secciones públicas; con sesión, todas. */
  readonly itemsMenu = computed(() =>
    this.usuario() ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.publico)
  );

  /** Al iniciar sesión desde el navbar se vuelve a la página en la que estaba el visitante. */
  irALogin(): void {
    this.menuMovilAbierto.set(false);
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/eventos');
  }
}
