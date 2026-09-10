import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

/**
 * Sección todavía sin construir. Igual que en el móvil, cada pantalla se va
 * agregando bajo pedido explícito — esto solo deja el menú y el ruteo
 * completos desde ya para que se note qué falta y dónde va a vivir.
 */
@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './placeholder.component.html',
  styleUrl: './placeholder.component.scss'
})
export class PlaceholderComponent {
  private readonly route = inject(ActivatedRoute);

  readonly titulo = toSignal(this.route.data.pipe(map((d) => d['titulo'] as string)), { initialValue: '' });
  readonly casoDeUso = toSignal(this.route.data.pipe(map((d) => d['casoDeUso'] as string)), { initialValue: '' });
}
