import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { FlujoOperacionService } from './flujo-operacion.service';
import { SesionValida } from '../../../compartido/seguridad/sesion-valida.guard';

describe.each([{ intervalo: 2000, tipo: 'evacuacion' as const }, { intervalo: 1000, tipo: 'panel' as const }])('SSE Operación $tipo: revalidación y ciclo de vida (dobles, tiempo virtual)', ({ intervalo, tipo }) => {
  let validar: jest.Mock, panel: jest.Mock, servicio: FlujoOperacionService;
  const diferida = () => { let resolver!: (v?: unknown) => void, rechazar!: (e: unknown) => void;
    const promesa = new Promise((res, rej) => { resolver = res; rechazar = rej; }); return { promesa, resolver, rechazar }; };
  beforeEach(() => {
    jest.useFakeTimers(); validar = jest.fn().mockResolvedValue({}); panel = jest.fn().mockResolvedValue({ total: 1 });
    servicio = new FlujoOperacionService({ validar } as unknown as SesionValida);
  });
  afterEach(() => { servicio.onModuleDestroy(); expect(jest.getTimerCount()).toBe(0); jest.useRealTimers(); });
  function abrir() {
    const datos: unknown[] = []; const completo = jest.fn();
    const sub = servicio.seguir(panel, 'token-en-cabecera', { roles: ['Organizador', 'Administrador'], modulo: tipo === 'evacuacion' ? 'emergencias' : 'reportes', accion: 'leer' }, intervalo, tipo).subscribe({ next: v => datos.push(v), complete: completo });
    return { datos, completo, sub };
  }
  it('continúa con sesión válida y comprueba también después del panel', async () => {
    const f = abrir(); await jest.advanceTimersByTimeAsync(intervalo);
    expect(f.datos).toEqual([{ type: tipo, data: { total: 1 } }, { type: tipo, data: { total: 1 } }]);
    expect(validar).toHaveBeenCalledTimes(4); expect(panel).toHaveBeenCalledTimes(2); f.sub.unsubscribe();
  });
  it.each([new UnauthorizedException('dato secreto'), new ServiceUnavailableException('detalle interno')])('cierra y sanea ante invalidación: %s', async error => {
    const f = abrir(); await jest.advanceTimersByTimeAsync(0); validar.mockRejectedValue(error);
    await jest.advanceTimersByTimeAsync(intervalo);
    expect(f.completo).toHaveBeenCalledTimes(1); expect(f.datos).toHaveLength(2);
    expect(JSON.stringify(f.datos)).not.toMatch(/dato secreto|detalle interno|token-en-cabecera/);
    await jest.advanceTimersByTimeAsync(intervalo * 3); expect(panel).toHaveBeenCalledTimes(1);
  });
  it('pasa el acceso exigido y cierra si se pierde el permiso (CU-028B)', async () => {
    const acceso = { roles: ['Organizador'], modulo: 'emergencias' as const, accion: 'leer' as const };
    const datos: unknown[] = []; const completo = jest.fn();
    servicio.seguir(panel, 'token-en-cabecera', acceso, intervalo, tipo).subscribe({ next: v => datos.push(v), complete: completo });
    await jest.advanceTimersByTimeAsync(0); expect(validar).toHaveBeenCalledWith('token-en-cabecera', acceso);
    validar.mockRejectedValue(new ForbiddenException()); await jest.advanceTimersByTimeAsync(intervalo);
    expect(datos.at(-1)).toMatchObject({ type: 'sesion_finalizada', data: { codigo: 'ROL_INSUFICIENTE' } });
    expect(completo).toHaveBeenCalledTimes(1);
  });
  it('descarta el panel pendiente cuando una comprobación periódica detecta revocación', async () => {
    const consulta = diferida(); panel.mockReturnValue(consulta.promesa); const f = abrir(); await jest.advanceTimersByTimeAsync(0);
    validar.mockRejectedValue(new UnauthorizedException()); await jest.advanceTimersByTimeAsync(intervalo);
    consulta.resolver({ datoTardio: true }); await jest.advanceTimersByTimeAsync(0);
    expect(f.datos).toHaveLength(1); expect(f.datos[0]).toMatchObject({ type: 'sesion_finalizada', data: { codigo: 'SIN_AUTENTICAR' } });
    expect(f.completo).toHaveBeenCalledTimes(1);
  });
  it('no solapa la validación periódica con la previa a emitir', async () => {
    const consulta = diferida(), comprobacion = diferida(); panel.mockReturnValue(consulta.promesa);
    const f = abrir(); await jest.advanceTimersByTimeAsync(0); validar.mockReturnValue(comprobacion.promesa);
    await jest.advanceTimersByTimeAsync(intervalo); consulta.resolver({ dato: true }); await jest.advanceTimersByTimeAsync(0);
    expect(validar).toHaveBeenCalledTimes(2); comprobacion.rechazar(new UnauthorizedException()); await jest.advanceTimersByTimeAsync(0);
    expect(f.datos).toHaveLength(1); expect(f.completo).toHaveBeenCalledTimes(1);
  });
  it('el límite del panel cierra y una resolución posterior no emite', async () => {
    const consulta = diferida(); panel.mockReturnValue(consulta.promesa); const f = abrir(); await jest.advanceTimersByTimeAsync(5000);
    expect(f.completo).toHaveBeenCalledTimes(1); consulta.resolver({ datoTardio: true }); await jest.advanceTimersByTimeAsync(0);
    expect(f.datos).toHaveLength(1); expect(f.datos[0]).toMatchObject({ data: { codigo: 'FLUJO_NO_DISPONIBLE' } });
  });
  it('desconectar durante la comprobación no inicia consultas ni deja temporizadores', async () => {
    const comprobacion = diferida(); validar.mockReturnValue(comprobacion.promesa); const f = abrir(); await jest.advanceTimersByTimeAsync(0);
    f.sub.unsubscribe(); comprobacion.resolver({}); await jest.advanceTimersByTimeAsync(intervalo * 2);
    expect(panel).not.toHaveBeenCalled(); expect(f.datos).toEqual([]);
  });
  it('cerrar el módulo completa todas las conexiones y descarta pendientes', async () => {
    const consulta = diferida(); panel.mockReturnValue(consulta.promesa); const a = abrir(), b = abrir(); await jest.advanceTimersByTimeAsync(0);
    servicio.onModuleDestroy(); consulta.resolver({ datoTardio: true }); await jest.advanceTimersByTimeAsync(intervalo * 2);
    expect(a.completo).toHaveBeenCalledTimes(1); expect(b.completo).toHaveBeenCalledTimes(1); expect([...a.datos, ...b.datos]).toEqual([]);
  });
});
