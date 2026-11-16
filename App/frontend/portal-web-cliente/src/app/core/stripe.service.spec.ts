import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Servidor } from './servidor';
import { StripeService } from './stripe.service';

describe('StripeService (pasarela real)', () => {
  let servicio: StripeService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    servicio = TestBed.inject(StripeService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('pregunta al gateway una sola vez qué pasarela hay', async () => {
    const primera = servicio.activo();
    const segunda = servicio.activo();
    http.expectOne(`${Servidor.api}/pagos/configuracion`).flush({ proveedor: 'stripe', clavePublica: 'pk_test_1' });
    expect(await primera).toBeTrue();
    expect(await segunda).toBeTrue();
  });

  it('con la pasarela simulada no monta Stripe', async () => {
    const activo = servicio.activo();
    http.expectOne(`${Servidor.api}/pagos/configuracion`).flush({ proveedor: 'simulada', clavePublica: null });
    expect(await activo).toBeFalse();
  });

  it('si el gateway no responde, sigue con la simulada en vez de bloquear el pago', async () => {
    const activo = servicio.activo();
    http.expectOne(`${Servidor.api}/pagos/configuracion`).flush(null, { status: 503, statusText: 'Sin servicio' });
    expect(await activo).toBeFalse();
  });
});
