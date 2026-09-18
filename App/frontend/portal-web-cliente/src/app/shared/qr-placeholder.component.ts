import { Component, input } from '@angular/core';

/**
 * Placeholder visual del QR que recibe el cliente una vez algo queda pagado
 * (entrada, pedido o reserva de parqueadero — SAD §2/§4) — mismo criterio
 * que QrPlaceholder en app-movil-cliente. La generación real del código
 * llega con la integración al backend; por ahora solo representa que existe
 * y muestra su identificador de texto.
 */
@Component({
  selector: 'app-qr-placeholder',
  standalone: true,
  template: `
    <div class="qr">
      <div class="caja">QR</div>
      <span class="codigo">{{ codigo() }}</span>
    </div>
  `,
  styles: [
    `
      .qr {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      /* Un QR se lee oscuro sobre claro: la caja es blanca en los dos temas,
         como el QR real que mostrará la app. */
      .caja {
        width: 96px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: #fff;
        color: #0b0f1a;
        border: 1px solid rgb(0 0 0 / 0.12);
        font-weight: 600;
      }
      .codigo {
        font-size: 0.75rem;
        color: rgb(var(--hxc-texto-rgb) / 0.6);
      }
    `
  ]
})
export class QrPlaceholderComponent {
  readonly codigo = input.required<string>();
}
