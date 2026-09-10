import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../core/auth.service';
import { NAV_ITEMS } from '../core/nav-items';

/**
 * Shell del portal: navbar horizontal azul + <router-outlet> — guiado por el
 * patrón de sitios de boletería (Ticketmaster/TuBoleta usan un navbar
 * superior, no un menú lateral) en vez del sidenav de portal-web-admin, que
 * es una herramienta interna y no necesita esa identidad de marca.
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
  readonly itemsMenu = NAV_ITEMS;
  readonly menuMovilAbierto = signal(false);

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/login');
  }
}
