import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';
import { NAV_ITEMS } from '../core/nav-items';

/**
 * Shell común a los tres roles (Organizador, Administrador, Supervisor de
 * Emergencia): toolbar + menú lateral filtrado por rol — mismo espíritu que
 * HexacoreDrawerContent + destinosPara(cargo) en app-movil-cliente.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly usuario = this.auth.usuarioActual;
  readonly itemsMenu = computed(() => {
    const rol = this.usuario()?.rol;
    return rol ? NAV_ITEMS.filter((item) => item.roles.includes(rol)) : [];
  });

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/login');
  }
}
