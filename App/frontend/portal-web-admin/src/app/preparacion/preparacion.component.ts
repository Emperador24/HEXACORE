import { Component, inject, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { MenuApiService } from '../core/menu-api.service';
import { DatosPreparacion, IntencionPreparacion, PedidoRecibido, PreparacionApiService } from '../core/preparacion-api.service';

@Component({ selector: 'app-preparacion', standalone: true, imports: [DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './preparacion.component.html', styleUrl: './preparacion.component.scss' })
export class PreparacionComponent implements OnDestroy {
  private readonly api = inject(PreparacionApiService); private readonly menu = inject(MenuApiService); private readonly auth = inject(AuthService);
  readonly locales = signal<{ id: string; nombre: string; estado: string }[]>([]);
  readonly pedidos = signal<PedidoRecibido[]>([]); readonly seleccionado = signal<PedidoRecibido | null>(null);
  readonly ocupado = signal(false); readonly error = signal(''); readonly aviso = signal('');
  readonly pendiente = signal<IntencionPreparacion | null>(null); readonly pausa = signal(false);
  local = ''; pagina = 0; accion?: DatosPreparacion['accion']; minutos = 10; motivo = ''; incidenciaId?: string;
  private versionFormulario = 0; private pedidoFormulario = ''; private destruido = false;
  private readonly temporizador: ReturnType<typeof setInterval>;
  private get claveLocal() { return `hexacore.cu013.intencion.${this.auth.usuarioActual()?.id}`; }
  constructor() {
    void this.iniciar();
    this.temporizador = setInterval(() => { if (document.visibilityState === 'visible' && !this.ocupado() && !this.pausa() && !this.pendiente()) void this.actualizar(); }, 15000);
  }
  ngOnDestroy() { this.destruido = true; clearInterval(this.temporizador); }
  private fallo(e: unknown) { this.error.set(e instanceof Error ? e.message : 'No pudimos consultar los pedidos.'); this.pausa.set(true); }
  private async iniciar() {
    this.ocupado.set(true);
    try {
      this.locales.set(await this.menu.misEstablecimientos());
      if (this.destruido) return;
      const valor = localStorage.getItem(this.claveLocal); if (valor) this.pendiente.set(JSON.parse(valor));
      this.local = this.pendiente()?.local ?? this.locales()[0]?.id ?? '';
      await this.leer();
    } catch(e) { this.fallo(e); } finally { this.ocupado.set(false); }
  }
  private async leer() {
    if (!this.local || this.destruido) return;
    const lista = await this.api.listar(this.local, this.pagina); if (this.destruido) return; this.pedidos.set(lista);
    const id = this.seleccionado()?.id ?? this.pendiente()?.pedido;
    if (id) { const detalle = await this.api.detalle(this.local, id); if (!this.destruido) this.seleccionado.set(detalle); }
  }
  async actualizar() {
    if (this.ocupado()) return; this.ocupado.set(true); this.error.set(''); this.pausa.set(false);
    try { await this.leer(); } catch(e) { this.fallo(e); } finally { this.ocupado.set(false); }
  }
  async cambiarLocal() { this.pagina = 0; this.pedidos.set([]); this.seleccionado.set(null); this.accion = undefined; await this.actualizar(); }
  async cambiarPagina(delta: number) {
    if(this.ocupado() || this.pendiente() || this.pagina + delta < 0) return;
    this.pagina += delta; this.pedidos.set([]); this.seleccionado.set(null); this.accion = undefined; await this.actualizar();
  }
  async seleccionar(p: PedidoRecibido) {
    if (this.ocupado() || this.pendiente()) return; this.accion = undefined; this.ocupado.set(true); this.error.set('');
    try { this.seleccionado.set(await this.api.detalle(this.local, p.id)); } catch(e) { this.fallo(e); } finally { this.ocupado.set(false); }
  }
  abrir(accion: DatosPreparacion['accion'], incidenciaId?: string) {
    const p = this.seleccionado(); if (!p) return;
    this.accion = accion; this.incidenciaId = incidenciaId; this.motivo = ''; this.minutos = accion === 'INICIAR' ? 10 : 5;
    this.versionFormulario = p.preparacion.version; this.pedidoFormulario = p.id;
  }
  async guardar() {
    const p = this.seleccionado(); if (!p || !this.accion || p.id !== this.pedidoFormulario) return;
    const datos: DatosPreparacion = { accion: this.accion, version: this.versionFormulario };
    if (['INICIAR','RETRASAR'].includes(this.accion)) datos.minutos = this.minutos;
    if (['RETRASAR','INCIDENCIA','RESOLVER_INCIDENCIA'].includes(this.accion)) datos.motivo = this.motivo;
    if (this.incidenciaId) datos.incidenciaId = this.incidenciaId;
    await this.ejecutar({ id: crypto.randomUUID(), local: this.local, pedido: p.id, datos });
  }
  async listo() {
    const p = this.seleccionado(); if (p) await this.ejecutar({ id: crypto.randomUUID(), local: this.local, pedido: p.id, datos: { accion: 'LISTO', version: p.preparacion.version } });
  }
  async repetir() { const i = this.pendiente(); if (i) await this.ejecutar(i); }
  private async ejecutar(i: IntencionPreparacion) {
    if (this.ocupado()) return; this.ocupado.set(true); this.error.set(''); this.aviso.set('');
    try {
      this.pendiente.set(i); localStorage.setItem(this.claveLocal, JSON.stringify(i));
      await this.api.operar(i);
      this.pendiente.set(null); localStorage.removeItem(this.claveLocal); this.accion = undefined;
      this.aviso.set('Avance guardado. El aviso está disponible para el cliente.'); this.pausa.set(false); await this.leer();
    } catch(e) {
      this.fallo(e);
      if (e instanceof ErrorCuenta && [400,409].includes(e.estado)) {
        this.pendiente.set(null); localStorage.removeItem(this.claveLocal); this.accion = undefined;
        try { await this.leer(); } catch { /* Mantener el error y el sondeo pausado. */ }
      } else this.aviso.set('Resultado sin confirmar. Conservamos la misma operación para consultarla mediante repetición segura.');
    } finally { this.ocupado.set(false); }
  }
  etiqueta(estado: string) { return ({ RECIBIDO: 'Recibido', EN_PREPARACION: 'En preparación', LISTO_PARA_ENTREGAR: 'Listo para entregar' } as Record<string,string>)[estado] ?? estado; }
}
