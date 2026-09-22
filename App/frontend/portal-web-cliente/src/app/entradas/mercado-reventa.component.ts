import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import {
  Checkout,
  PublicacionMercado,
  ResultadoCompra,
  ReventaService,
  mensajeDeError
} from '../core/reventa.service';

/**
 * Mercado de reventa — CU-006, pasos 5 a 13, contra el backend real.
 *
 * La pantalla tiene tres momentos, y son tres momentos del caso de uso, no
 * tres pantallas decorativas:
 *
 * 1. **Catálogo.** Lo que otros publicaron.
 * 2. **Reserva.** Al pulsar comprar, el servidor bloquea la publicación y
 *    devuelve cuántos segundos quedan. Mientras corre ese reloj nadie más
 *    puede comprarla; si se agota, vuelve al mercado sola.
 * 3. **Resultado.** La entrada cambió de dueño y hay un código QR nuevo.
 *
 * El reloj que se ve **no decide nada**: solo muestra. Quien decide si la
 * reserva sigue viva es el servidor, y lo dice al pagar. Un contador de
 * navegador que se adelantara o atrasara no puede regalar ni quitar una compra.
 */
@Component({
  selector: 'app-mercado-reventa',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule
  ],
  templateUrl: './mercado-reventa.component.html',
  styleUrl: './mercado-reventa.component.scss'
})
export class MercadoReventaComponent implements OnInit {
  private readonly reventa = inject(ReventaService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly publicaciones = signal<PublicacionMercado[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  /** La reserva en curso, si la hay. */
  readonly checkout = signal<Checkout | null>(null);
  readonly segundos = signal(0);
  readonly pagando = signal(false);
  readonly resultado = signal<ResultadoCompra | null>(null);

  /**
   * Los tres tokens que entiende la pasarela simulada. Se ofrecen a la vista
   * porque son los que permiten demostrar los caminos de excepción del CU-006
   * sin tener que provocar un fallo real.
   */
  readonly tokensDemo = [
    { valor: 'tok_ok_demo', etiqueta: 'Pago aprobado' },
    { valor: 'tok_rechazo_demo', etiqueta: 'Pago rechazado (CU-006G)' },
    { valor: 'tok_timeout_demo', etiqueta: 'La pasarela no responde (CU-006I)' }
  ];

  metodo = 'TARJETA';
  token = 'tok_ok_demo';

  private reloj?: ReturnType<typeof setInterval>;

  readonly reservaVencida = computed(() => this.checkout() !== null && this.segundos() <= 0);

  ngOnInit(): void {
    this.cargar();
    this.destroyRef.onDestroy(() => this.pararReloj());
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const mercado = await this.reventa.consultarMercado({ limite: 50 });
      this.publicaciones.set(mercado.publicaciones);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Paso 6: reservar. Exige sesión — mirar el mercado no. */
  async reservar(publicacion: PublicacionMercado): Promise<void> {
    if (!this.auth.usuarioActual()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    this.error.set(null);
    try {
      const checkout = await this.reventa.iniciarCheckout(publicacion.id);
      this.checkout.set(checkout);
      this.segundos.set(checkout.segundosRestantes);
      this.arrancarReloj();
    } catch (error) {
      // Si otra persona se adelantó (CU-006H) el catálogo ya no es el que se
      // está viendo: se recarga para que no quede una tarjeta fantasma.
      this.error.set(mensajeDeError(error));
      this.cargar();
    }
  }

  /** CU-006C: soltar la reserva para que otro pueda comprarla. */
  async cancelar(): Promise<void> {
    const checkout = this.checkout();
    if (!checkout) return;
    try {
      await this.reventa.cancelarCheckout(checkout.id);
    } catch {
      // Si ya había caducado, da igual: el resultado es el mismo.
    }
    this.cerrarReserva();
    this.cargar();
  }

  /** Pasos 7 a 13. */
  async pagar(): Promise<void> {
    const checkout = this.checkout();
    if (!checkout || this.pagando()) return;

    this.pagando.set(true);
    this.error.set(null);
    try {
      const resultado = await this.reventa.pagar(checkout.id, this.metodo, this.token);
      this.resultado.set(resultado);
      this.cerrarReserva();
      this.cargar();
    } catch (error) {
      this.error.set(mensajeDeError(error));
      // Un rechazo devuelve la publicación al mercado de inmediato, así que el
      // catálogo de al lado ya no refleja la realidad.
      this.cargar();
    } finally {
      this.pagando.set(false);
    }
  }

  cerrarResultado(): void {
    this.resultado.set(null);
  }

  private arrancarReloj(): void {
    this.pararReloj();
    this.reloj = setInterval(() => {
      const quedan = this.segundos() - 1;
      this.segundos.set(quedan);
      if (quedan <= 0) this.pararReloj();
    }, 1000);
  }

  private pararReloj(): void {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = undefined;
  }

  private cerrarReserva(): void {
    this.pararReloj();
    this.checkout.set(null);
    this.segundos.set(0);
  }

  /** Fecha del evento en formato corto y local. */
  fechaEvento(iso: string): string {
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(iso));
  }

  /** `1:59`, que se lee mejor que 119 segundos. */
  reloj_texto(): string {
    const total = Math.max(0, this.segundos());
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    return `${minutos}:${String(resto).padStart(2, '0')}`;
  }
}
