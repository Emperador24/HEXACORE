import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { ParqueaderoService } from './parqueadero.service';
import { Servidor } from './servidor';

describe('ParqueaderoService HTTP (CU-021)', () => {
  let servicio: ParqueaderoService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), {
      provide: AuthService, useValue: { conAcceso: (peticion: any) => firstValueFrom(peticion(new HttpHeaders({ Authorization: 'Bearer prueba' }))) }
    }] });
    servicio = TestBed.inject(ParqueaderoService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta la disponibilidad del evento por el gateway con la sesión', async () => {
    const respuesta = servicio.disponibilidad('evento');
    const peticion = http.expectOne(`${Servidor.api}/parqueaderos/eventos/evento/disponibilidad`);
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer prueba');
    peticion.flush({ reservable: true, zonas: [] });
    expect((await respuesta).reservable).toBeTrue();
  });

  it('reserva sin mandar precio ni espacio: los decide el servidor', async () => {
    const respuesta = servicio.reservar('evento', { zonaId: 'zona', placa: 'ABC123', tipoVehiculo: 'MOTO' });
    const peticion = http.expectOne(`${Servidor.api}/parqueaderos/eventos/evento/reservas`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ zonaId: 'zona', placa: 'ABC123', tipoVehiculo: 'MOTO' });
    peticion.flush({ id: 'r1', estado: 'PENDIENTE_PAGO', monto: 15000 });
    expect((await respuesta).monto).toBe(15000);
  });

  it('paga solo con el token de la pasarela (RNF-05) y recarga las reservas con el QR', async () => {
    const respuesta = servicio.pagar('r1', 'tok_ok_demo');
    const pago = http.expectOne(`${Servidor.api}/parqueaderos/reservas/r1/pagar`);
    expect(pago.request.body).toEqual({ token: 'tok_ok_demo' });
    pago.flush({ id: 'r1', estado: 'CONFIRMADA', codigoQr: 'HXP-ABCDEFGHJKLMNPQR' });
    await Promise.resolve();
    http.expectOne(`${Servidor.api}/parqueaderos/reservas`).flush([{ id: 'r1', estado: 'CONFIRMADA', codigoQr: 'HXP-ABCDEFGHJKLMNPQR' }]);
    expect((await respuesta).codigoQr).toBe('HXP-ABCDEFGHJKLMNPQR');
    expect(servicio.reservas()[0].estado).toBe('CONFIRMADA');
  });
});
