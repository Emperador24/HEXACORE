import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService, ErrorCuenta } from './auth.service';

describe('Mensajes del servidor con código de negocio', () => {
  for (const propiedad of ['message', 'mensaje']) {
    it(`conserva código y texto humano recibido en ${propiedad}`, async () => {
      TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
      const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
      const peticion = auth.iniciarSesion('propio@example.test', 'clave de prueba');
      const comprobacion = expectAsync(peticion).toBeRejectedWith(jasmine.objectContaining<ErrorCuenta>({
        codigo: 'PEDIDO_YA_ENTREGADO', message: 'Este pedido ya fue entregado.', estado: 409,
      }));
      http.expectOne(r => r.url.endsWith('/sesiones')).flush({ codigo: 'PEDIDO_YA_ENTREGADO', [propiedad]: 'Este pedido ya fue entregado.' }, { status: 409, statusText: 'Conflict' });
      await comprobacion; http.verify();
    });
  }
});
