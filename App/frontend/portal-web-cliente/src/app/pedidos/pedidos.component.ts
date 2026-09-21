import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EstablecimientoPedido, PedidosService, mensajePedidos } from '../core/pedidos.service';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [FormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.scss'
})
export class PedidosComponent {
  private readonly servicio = inject(PedidosService);
  // La cartelera sigue siendo simulada. Este UUID corresponde al seed real de Pedidos.
  eventoId = inject(ActivatedRoute).snapshot.queryParamMap.get('eventoId') ?? 'e0000001-0000-4000-8000-000000000001';
  readonly eventoConsultado = signal('');
  readonly establecimientos = signal<EstablecimientoPedido[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');

  constructor() { void this.consultar(); }

  async consultar(): Promise<void> {
    if (this.cargando() || !this.eventoId.trim()) return;
    this.cargando.set(true);
    this.error.set('');
    this.establecimientos.set([]);
    const eventoId = this.eventoId.trim();
    try {
      this.establecimientos.set(await this.servicio.establecimientos(eventoId));
      this.eventoConsultado.set(eventoId);
    } catch (error) { this.error.set(mensajePedidos(error)); }
    finally { this.cargando.set(false); }
  }
}
