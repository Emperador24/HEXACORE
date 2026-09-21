import { Component, effect, input, signal } from '@angular/core';
import { toDataURL } from 'qrcode';

/** El valor del backend se codifica localmente: no se envía a servicios externos. */
@Component({
  selector: 'app-qr-pedido',
  standalone: true,
  template: `
    @if (imagen()) { <img [src]="imagen()" width="256" height="256" alt="Código QR del pedido confirmado" /> }
    @if (error()) { <p role="alert">No pudimos mostrar tu QR. Tu compra sigue confirmada; mantén esta pantalla abierta.</p> }

  `,
  styles: [':host { display: block; text-align: center; } img { max-width: 100%; height: auto; } .codigo { overflow-wrap: anywhere; }']
})
export class QrPedidoComponent {
  readonly codigo = input.required<string>();
  readonly imagen = signal('');
  readonly error = signal(false);
  constructor() {
    effect((limpiar) => {
      let vigente = true;
      limpiar(() => { vigente = false; });
      this.imagen.set('');
      this.error.set(false);
      void toDataURL(this.codigo(), { width: 256, margin: 4, errorCorrectionLevel: 'M' })
        .then((imagen) => { if (vigente) this.imagen.set(imagen); })
        .catch(() => { if (vigente) this.error.set(true); });
    });
  }
}
