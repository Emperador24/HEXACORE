import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { FondoAtmosferaComponent } from './shared/fondo-atmosfera.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FondoAtmosferaComponent],
  template: `
    <app-fondo-atmosfera />
    <router-outlet />
  `
})
export class AppComponent {
  constructor() {
    const auth = inject(AuthService);
    const router = inject(Router);
    // Si la sesión se cierra sola (caducó, se cerró en otro sitio, se
    // desactivó la cuenta), se vuelve al login, que explica por qué.
    effect(() => {
      if (!auth.motivoCierre()) return;
      // En la primera carga el router aún no ha navegado y `router.url` es "/":
      // la ruta pedida está en la barra de direcciones.
      const actual = router.navigated ? router.url : location.pathname + location.search;
      if (!actual.startsWith('/login')) {
        router.navigate(['/login'], { queryParams: { returnUrl: actual } });
      }
    });
  }
}
