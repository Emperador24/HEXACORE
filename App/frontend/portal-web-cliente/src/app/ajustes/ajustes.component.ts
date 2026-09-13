import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';

/** Ajustes del cliente — mismas secciones que AjustesScreen en app-movil-cliente (sin modo oscuro: la web sigue el tema del sistema). */
@Component({
  selector: 'app-ajustes',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatSlideToggleModule, MatButtonModule],
  templateUrl: './ajustes.component.html',
  styleUrl: './ajustes.component.scss'
})
export class AjustesComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  notificaciones = true;

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/login');
  }
}
