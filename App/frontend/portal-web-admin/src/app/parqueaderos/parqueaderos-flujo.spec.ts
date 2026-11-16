import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MonitoreoApiService } from '../core/monitoreo-api.service';
import { ParqueaderosApiService } from '../core/parqueaderos-api.service';
import { ParqueaderosComponent } from './parqueaderos.component';

describe('Parqueaderos: renovación acotada del SSE (dobles)', () => {
  let c: ParqueaderosComponent, seguir: jasmine.Spy, renovar: jasmine.Spy;
  const conectar = () => (c as unknown as { conectar(): void }).conectar();
  const caer = (estado: number) => seguir.calls.mostRecent().args[2]('Cerrado', estado);
  beforeEach(() => {
    seguir = jasmine.createSpy('seguir').and.returnValue(() => undefined); renovar = jasmine.createSpy('renovar').and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [
      { provide: ParqueaderosApiService, useValue: { seguir } }, { provide: AuthService, useValue: { renovar, roles: () => ['Organizador'] } },
      { provide: MonitoreoApiService, useValue: {} }, { provide: MatDialog, useValue: {} },
      { provide: Router, useValue: {} }, { provide: ActivatedRoute, useValue: {} },
    ] });
    c = TestBed.runInInjectionContext(() => new ParqueaderosComponent()); c.eventoId.set('evento-propio');
  });
  afterEach(() => c.ngOnDestroy());
  it('ante 401 renueva solo una vez hasta recibir nuevos datos', async () => {
    conectar(); caer(401); await Promise.resolve(); expect(renovar).toHaveBeenCalledTimes(1); expect(seguir).toHaveBeenCalledTimes(2); expect(c.error()).toBeNull();
    caer(401); await Promise.resolve(); expect(renovar).toHaveBeenCalledTimes(1); expect(seguir).toHaveBeenCalledTimes(2);
  });
  it('un 503 terminal no inicia reconexiones ni renovación', () => {
    jasmine.clock().install();
    try { conectar(); caer(503); jasmine.clock().tick(60000); expect(seguir).toHaveBeenCalledTimes(1); expect(renovar).not.toHaveBeenCalled(); }
    finally { jasmine.clock().uninstall(); }
  });
  it('destruir durante renovación impide reabrir la conexión', async () => {
    let completar!: (v: boolean) => void; renovar.and.returnValue(new Promise<boolean>(r => completar = r));
    conectar(); caer(401); c.ngOnDestroy(); completar(true); await Promise.resolve(); expect(seguir).toHaveBeenCalledTimes(1);
  });
});
