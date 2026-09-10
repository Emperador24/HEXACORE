import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EntradasService } from '../core/entradas.service';
import { AuthService } from '../core/auth.service';
import { Entrada, EstadoEntrada } from '../core/models';
import { QrPlaceholderComponent } from '../shared/qr-placeholder.component';

/**
 * Boletas propias del cliente (CU-009, CU-010), presentadas como tarjetas
 * con su QR — mismo dato que EntradasScreen en app-movil-cliente, pero aquí
 * además está la acción real de reventa (CU-007/CU-008); "Enviar" simula el
 * mismo envío por correo que hace la app móvil.
 */
@Component({
  selector: 'app-mis-entradas',
  standalone: true,
  imports: [DecimalPipe, FormsModule, MatCardModule, MatChipsModule, MatButtonModule, MatFormFieldModule, MatInputModule, QrPlaceholderComponent],
  templateUrl: './mis-entradas.component.html',
  styleUrl: './mis-entradas.component.scss'
})
export class MisEntradasComponent {
  private readonly entradasService = inject(EntradasService);
  private readonly auth = inject(AuthService);

  readonly EstadoEntrada = EstadoEntrada;
  readonly mias = computed(() => {
    const usuarioId = this.auth.usuarioActual()?.id;
    return this.entradasService.entradas().filter((e) => e.propietarioId === usuarioId);
  });

  readonly correoEnvio = signal('');
  readonly entradaEnEnvio = signal<Entrada | null>(null);
  readonly precioReventa = signal<number | null>(null);
  readonly entradaEnReventa = signal<Entrada | null>(null);

  etiquetaEstado(estado: EstadoEntrada): string {
    const etiquetas: Record<EstadoEntrada, string> = {
      [EstadoEntrada.VALIDA]: 'Válida',
      [EstadoEntrada.EN_REVENTA]: 'En reventa',
      [EstadoEntrada.USADA]: 'Usada'
    };
    return etiquetas[estado];
  }

  abrirEnvio(entrada: Entrada): void {
    this.entradaEnEnvio.set(entrada);
    this.correoEnvio.set('');
  }

  confirmarEnvio(): void {
    const entrada = this.entradaEnEnvio();
    if (!entrada || !this.correoEnvio().includes('@')) return;
    this.entradasService.enviar(entrada.id);
    this.entradaEnEnvio.set(null);
  }

  abrirReventa(entrada: Entrada): void {
    this.entradaEnReventa.set(entrada);
    this.precioReventa.set(null);
  }

  confirmarReventa(): void {
    const entrada = this.entradaEnReventa();
    const precio = this.precioReventa();
    if (!entrada || !precio || precio <= 0) return;
    this.entradasService.ponerEnReventa(entrada.id, precio);
    this.entradaEnReventa.set(null);
  }

  retirarDeReventa(entrada: Entrada): void {
    this.entradasService.retirarDeReventa(entrada.id);
  }
}
