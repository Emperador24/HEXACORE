import { TestBed } from '@angular/core/testing';
import { toDataURL } from 'qrcode';
import { QrPedidoComponent } from './qr-pedido.component';

describe('QR de pedido confirmado', () => {
  it('dibuja un PNG local del valor exacto enviado por el backend', async () => {
    const codigo = '0123456789abcdef'.repeat(4);
    const fixture = TestBed.createComponent(QrPedidoComponent);
    fixture.componentRef.setInput('codigo', codigo);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const esperado = await toDataURL(codigo, { width: 256, margin: 4, errorCorrectionLevel: 'M' });
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(esperado);
    expect(esperado).toContain('data:image/png;base64,');
    expect(fixture.nativeElement.textContent).toContain(codigo);
  });
});
