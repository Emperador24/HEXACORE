import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../core/auth.service';
import { EventosService } from '../core/eventos.service';
import { EstadoEvento } from '../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly eventosService = inject(EventosService);

  readonly usuario = this.auth.usuarioActual;
  readonly totalEventos = computed(() => this.eventosService.eventos().length);
  readonly eventosPublicados = computed(
    () => this.eventosService.eventos().filter((e) => e.estado === EstadoEvento.PUBLICADO).length
  );
}
