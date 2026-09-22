import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ErrorCuenta } from '../core/auth.service';
import { CuentasApiService } from '../core/cuentas-api.service';
import { Cuenta, EstadoCuenta } from '../core/models';

const POR_PAGINA = 20;

/**
 * Gestión de cuentas de usuario — **CU-027B**.
 *
 * Es la primera sección del portal que habla con el backend de verdad: lista
 * las cuentas reales del Servicio de Administración y las activa, desactiva o
 * elimina. Lo que se ve aquí es lo que hay en la base, no datos de ejemplo.
 *
 * Desactivar y eliminar piden un motivo porque el servidor lo exige: queda
 * auditado y se puede consultar después en el historial de la cuenta.
 */
@Component({
  selector: 'app-cuentas',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule
  ],
  templateUrl: './cuentas.component.html',
  styleUrl: './cuentas.component.scss'
})
export class CuentasComponent {
  private readonly api = inject(CuentasApiService);

  readonly estados = Object.values(EstadoCuenta);
  readonly columnas = ['nombre', 'estado', 'roles', 'ultimoAcceso', 'acciones'];

  readonly cuentas = signal<Cuenta[]>([]);
  readonly total = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  busqueda = '';
  estado: EstadoCuenta | '' = '';
  incluirEliminadas = false;
  readonly pagina = signal(0);

  readonly hayMas = computed(() => (this.pagina() + 1) * POR_PAGINA < this.total());
  readonly desde = computed(() => (this.total() === 0 ? 0 : this.pagina() * POR_PAGINA + 1));
  readonly hasta = computed(() => Math.min((this.pagina() + 1) * POR_PAGINA, this.total()));

  constructor() {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.api.listar({
        busqueda: this.busqueda,
        estado: this.estado || undefined,
        incluirEliminadas: this.incluirEliminadas,
        limite: POR_PAGINA,
        desplazamiento: this.pagina() * POR_PAGINA
      });
      this.cuentas.set(pagina.cuentas);
      this.total.set(pagina.total);
    } catch (e) {
      this.error.set(this.mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Un filtro nuevo empieza por la primera página: si no, se vería vacía. */
  buscar(): void {
    this.pagina.set(0);
    void this.cargar();
  }

  paginar(delta: number): void {
    this.pagina.update((p) => Math.max(0, p + delta));
    void this.cargar();
  }

  async activar(cuenta: Cuenta): Promise<void> {
    await this.accion(() => this.api.activar(cuenta.id), `${cuenta.email} queda activa.`);
  }

  async desactivar(cuenta: Cuenta): Promise<void> {
    const motivo = prompt(`Motivo para desactivar a ${cuenta.email}:`);
    if (!motivo?.trim()) return;
    await this.accion(
      () => this.api.desactivar(cuenta.id, motivo),
      `${cuenta.email} desactivada; sus sesiones abiertas se cerraron.`
    );
  }

  async eliminar(cuenta: Cuenta): Promise<void> {
    const motivo = prompt(`Eliminar anonimiza la cuenta y no se puede deshacer.\n\nMotivo para ${cuenta.email}:`);
    if (!motivo?.trim()) return;
    await this.accion(() => this.api.eliminar(cuenta.id, motivo), 'Cuenta anonimizada y desactivada para siempre.');
  }

  /**
   * Cada acción recarga el listado en vez de retocar la fila en memoria: el
   * servidor puede cambiar más de lo que se pidió —desactivar cierra sesiones
   * y mueve el último acceso—, y una fila remendada a mano mentiría.
   */
  private async accion(operacion: () => Promise<Cuenta>, exito: string): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    try {
      await operacion();
      this.aviso.set(exito);
      await this.cargar();
    } catch (e) {
      this.error.set(this.mensaje(e));
    }
  }

  puedeActivar(cuenta: Cuenta): boolean {
    return !cuenta.eliminada && cuenta.estado !== EstadoCuenta.ACTIVA;
  }

  puedeDesactivar(cuenta: Cuenta): boolean {
    return !cuenta.eliminada && cuenta.estado !== EstadoCuenta.DESACTIVADA;
  }

  bloqueada(cuenta: Cuenta): boolean {
    return cuenta.bloqueadaHasta !== null && new Date(cuenta.bloqueadaHasta) > new Date();
  }

  private mensaje(e: unknown): string {
    return e instanceof ErrorCuenta ? e.message : 'No se pudo completar la operación.';
  }
}
