import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { DatosProducto, IntencionMenu, MenuApiService, OperacionMenu, ProductoMenu } from '../core/menu-api.service';

@Component({ selector: 'app-menu', standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule],
  templateUrl: './menu.component.html', styleUrl: './menu.component.scss' })
export class MenuComponent {
  private readonly api = inject(MenuApiService);
  private readonly auth = inject(AuthService);
  readonly locales = signal<{ id: string; nombre: string; estado: string }[]>([]);
  readonly productos = signal<ProductoMenu[]>([]);
  readonly operaciones = signal<OperacionMenu[]>([]);
  readonly ocupado = signal(false);
  readonly error = signal(''); readonly aviso = signal('');
  readonly formulario = signal(false);
  readonly ajuste = signal<ProductoMenu | null>(null);
  readonly pendiente = signal<IntencionMenu | null>(null);
  establecimientoId = ''; editando?: string;
  datos: DatosProducto = this.vacios(); restricciones = ''; cantidadInicial = 0;
  delta = 1; motivo = '';
  private get claveLocal() { return `hexacore.cu012.intencion.${this.auth.usuarioActual()?.id}`; }
  private vacios(): DatosProducto { return { nombre: '', descripcion: '', precio: '', restriccionesAlimentarias: [], activo: true }; }
  constructor() { void this.iniciar(); }
  private fallo(e: unknown) { this.error.set(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
  private async iniciar() {
    this.ocupado.set(true);
    try {
      this.locales.set(await this.api.misEstablecimientos());
      const valor = localStorage.getItem(this.claveLocal);
      if (valor) this.pendiente.set(JSON.parse(valor) as IntencionMenu);
      this.establecimientoId = this.pendiente()?.establecimientoId ?? this.locales()[0]?.id ?? '';
      if (this.establecimientoId) await this.leer();
    } catch (e) { this.fallo(e); }
    finally { this.ocupado.set(false); }
  }
  private async leer() {
    this.productos.set(await this.api.menu(this.establecimientoId));
    this.operaciones.set(await this.api.historial(this.establecimientoId));
  }
  async cargar() {
    this.ocupado.set(true); this.error.set('');
    try { await this.leer(); } catch (e) { this.fallo(e); } finally { this.ocupado.set(false); }
  }
  nuevo() { this.editando = undefined; this.datos = this.vacios(); this.cantidadInicial = 0; this.restricciones = ''; this.formulario.set(true); this.ajuste.set(null); this.error.set(''); }
  editar(p: ProductoMenu) {
    this.editando = p.id; this.datos = { nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, restriccionesAlimentarias: p.restriccionesAlimentarias, activo: p.activo };
    this.restricciones = p.restriccionesAlimentarias.join(', '); this.formulario.set(true); this.ajuste.set(null); this.error.set('');
  }
  async guardar() {
    this.datos.restriccionesAlimentarias = this.restricciones.split(',').map(s => s.trim()).filter(Boolean);
    if (!this.editando) return this.ejecutar({ id: crypto.randomUUID(), establecimientoId: this.establecimientoId, datos: { ...this.datos, cantidadInicial: this.cantidadInicial } });
    this.ocupado.set(true); this.error.set('');
    try { await this.api.editar(this.establecimientoId, this.editando, this.datos); this.aviso.set('Producto actualizado. Los pedidos anteriores conservan sus datos y precio.'); this.formulario.set(false); await this.leer(); }
    catch (e) { this.fallo(e); } finally { this.ocupado.set(false); }
  }
  async alternar(p: ProductoMenu) {
    this.ocupado.set(true); this.error.set('');
    try { await this.api.estado(this.establecimientoId, p.id, !p.activo); this.aviso.set(p.activo ? 'Producto desactivado.' : 'Producto activado.'); await this.leer(); }
    catch (e) { this.fallo(e); } finally { this.ocupado.set(false); }
  }
  ajustar(p: ProductoMenu) { this.ajuste.set(p); this.formulario.set(false); this.delta = 1; this.motivo = ''; this.error.set(''); }
  async guardarAjuste() {
    const p = this.ajuste(); if (!p) return;
    await this.ejecutar({ id: crypto.randomUUID(), establecimientoId: this.establecimientoId, productoId: p.id, datos: { delta: this.delta, motivo: this.motivo } });
  }
  async resolver() { const p = this.pendiente(); if (p) await this.ejecutar(p); }
  private async ejecutar(i: IntencionMenu) {
    if (this.ocupado()) return;
    this.ocupado.set(true); this.error.set(''); this.aviso.set('');
    // Solo intención de negocio, sin tokens; se conserva antes de enviar, incluso tras recarga.
    this.pendiente.set(i); localStorage.setItem(this.claveLocal, JSON.stringify(i));
    try {
      const r = await this.api.ejecutar(i); const op = 'operacion' in r ? r.operacion : r;
      if (op.estado !== 'PENDIENTE') { this.pendiente.set(null); localStorage.removeItem(this.claveLocal); }
      if (op.estado === 'RECHAZADA') this.error.set(op.codigo === 'EXISTENCIAS_COMPROMETIDAS' ? 'La reducción dejaría existencias por debajo de las cantidades comprometidas.' : 'El ajuste supera los límites del inventario físico.');
      else this.aviso.set(op.estado === 'PENDIENTE' ? `Operación ${op.id} pendiente de confirmar. Se recuperará de forma segura.` : 'Operación de inventario aplicada.');
      this.formulario.set(false); this.ajuste.set(null); await this.leer();
    } catch (e) {
      this.fallo(e);
      if (e instanceof ErrorCuenta && [400, 409].includes(e.estado)) {
        this.pendiente.set(null); localStorage.removeItem(this.claveLocal);
        this.aviso.set('Solicitud rechazada. Corrige los datos para realizar otra operación.');
      } else this.aviso.set(`Resultado sin confirmar. Conservamos la operación ${i.id}; repetirla consultará la misma intención.`);
    }
    finally { this.ocupado.set(false); }
  }
}
