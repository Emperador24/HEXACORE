import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { MonitoreoApiService } from './monitoreo-api.service';
import { EmergenciasApiService } from './emergencias-api.service';
import { MonitoreoComponent } from '../monitoreo/monitoreo.component';
import { EmergenciasComponent } from '../emergencias/emergencias.component';

for (const tipo of ['monitoreo', 'evacuacion']) describe('Operación ' + tipo + ': renovación acotada del SSE (dobles)', () => {
  let c: MonitoreoComponent | EmergenciasComponent, seguir: jasmine.Spy, renovar: jasmine.Spy;
  const conectar = () => (c as unknown as { conectar(id?: string): void }).conectar(tipo === 'evacuacion' ? 'evacuacion-propia' : undefined);
  const caer = (estado: number) => seguir.calls.mostRecent().args[2]('Cerrado', estado);
  const recibir = () => seguir.calls.mostRecent().args[1](tipo === 'monitoreo' ? { evento: { id: 'evento-propio' } } : { evacuacion: { id: 'evacuacion-propia', estado: 'ACTIVA' } });
  beforeEach(() => {
    seguir = jasmine.createSpy('seguir').and.returnValue(() => undefined); renovar = jasmine.createSpy('renovar').and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [
      { provide: MonitoreoApiService, useValue: { seguir } }, { provide: EmergenciasApiService, useValue: { seguir } },
      { provide: AuthService, useValue: { renovar } }, { provide: MatDialog, useValue: {} },
      { provide: Router, useValue: {} }, { provide: ActivatedRoute, useValue: {} },
    ] });
    c = TestBed.runInInjectionContext(() => tipo === 'monitoreo' ? new MonitoreoComponent() : new EmergenciasComponent());
    c.eventoId.set('evento-propio');
    if (c instanceof EmergenciasComponent) c.detalle.set({ evacuacion: { id: 'evacuacion-propia', estado: 'ACTIVA' } } as never);
  });
  afterEach(() => c.ngOnDestroy());
  it('ante 401 renueva una vez hasta recibir datos válidos', async () => {
    conectar(); caer(401); await Promise.resolve(); expect(renovar).toHaveBeenCalledTimes(1); expect(seguir).toHaveBeenCalledTimes(2);
    caer(401); await Promise.resolve(); expect(renovar).toHaveBeenCalledTimes(1); expect(seguir).toHaveBeenCalledTimes(2);
  });
  it('datos nuevos permiten una futura renovación legítima, otra vez acotada', async () => {
    conectar(); caer(401); await Promise.resolve(); recibir(); caer(401); await Promise.resolve();
    expect(renovar).toHaveBeenCalledTimes(2); expect(seguir).toHaveBeenCalledTimes(3);
    caer(401); await Promise.resolve(); expect(renovar).toHaveBeenCalledTimes(2); expect(seguir).toHaveBeenCalledTimes(3);
  });
  for (const estado of [403, 503]) it('el terminal ' + estado + ' detiene reconexión y sondeo/renovación periódicos', () => {
    jasmine.clock().install();
    try {
      conectar(); recibir(); caer(estado); jasmine.clock().tick(11 * 60_000);
      expect(seguir).toHaveBeenCalledTimes(1); expect(renovar).not.toHaveBeenCalled(); expect(c.enVivo()).toBeFalse();
    } finally { jasmine.clock().uninstall(); }
  });
  it('destruir durante renovación impide reabrir', async () => {
    let completar!: (v: boolean) => void; renovar.and.returnValue(new Promise<boolean>(r => completar = r));
    conectar(); caer(401); c.ngOnDestroy(); completar(true); await Promise.resolve(); expect(seguir).toHaveBeenCalledTimes(1);
  });
  it('cambiar de recurso durante renovación impide reabrir el anterior', async () => {
    let completar!: (v: boolean) => void; renovar.and.returnValue(new Promise<boolean>(r => completar = r));
    conectar(); caer(401); (c as unknown as { detener(): void }).detener(); c.eventoId.set('otro-evento');
    completar(true); await Promise.resolve(); expect(seguir).toHaveBeenCalledTimes(1);
  });
});
