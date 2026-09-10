import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  correo = '';
  contrasena = '';
  readonly error = signal(false);

  ingresar(): void {
    const exito = this.auth.iniciarSesion(this.correo, this.contrasena);
    if (exito) {
      this.error.set(false);
      this.router.navigateByUrl('/cliente/eventos');
    } else {
      this.error.set(true);
    }
  }
}
