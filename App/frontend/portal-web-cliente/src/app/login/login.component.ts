import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  correo = '';
  contrasena = '';
  readonly error = signal(false);

  /** A dónde volver tras iniciar sesión: lo pone el guard o el botón que trajo al usuario aquí. */
  private readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/eventos';

  ingresar(): void {
    if (this.auth.iniciarSesion(this.correo, this.contrasena)) {
      this.error.set(false);
      this.router.navigateByUrl(this.returnUrl);
    } else {
      this.error.set(true);
    }
  }
}
