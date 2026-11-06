import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FondoAtmosferaComponent } from './compartido/fondo-atmosfera.component';
import { TemaService } from './core/tema.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FondoAtmosferaComponent],
  template: '<app-fondo-atmosfera /><router-outlet />'
})
export class AppComponent {
  // Se inyecta aquí para que el tema guardado se aplique antes de pintar nada.
  readonly tema = inject(TemaService);
}
