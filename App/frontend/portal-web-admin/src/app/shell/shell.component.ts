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
 * Shell común a los roles de administración: toolbar + menú lateral filtrado
 * por rol — mismo espíritu que HexacoreDrawerContent + destinosPara(cargo) en
 * la app móvil.
 *
 * El filtro va contra **todos** los roles de la cuenta, no contra uno: en el
 * Servicio de Administración una persona puede tener varios (la cuenta de
 * demostración `admin@hexacore.com` tiene Administrador y Personal), y quedarse
 * con el primero escondería secciones que sí le corresponden.
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
    const roles = this.auth.roles();
    return NAV_ITEMS.filter((item) => item.roles.some((rol) => roles.includes(rol)));
  });

  async cerrarSesion(): Promise<void> {
    // Se cierra también en el servidor, así que hay que esperar antes de
    // navegar: si no, la guarda podría dejar pasar con la sesión a medio cerrar.
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }
}
