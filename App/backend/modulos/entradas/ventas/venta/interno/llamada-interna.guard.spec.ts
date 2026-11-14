import { ExecutionContext } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { LlamadaInterna } from './llamada-interna.guard';
import { ConfiguracionServicio } from '../../config/configuracion';
import { ApiVentasLocal } from './api-local.service';
import { EntradasInternasService } from './entradas-internas.service';
describe('RNF-06 credencial interna de Ventas', () => {
  const config = { tokenServicios: 'secreto-exclusivo-sintetico' } as ConfiguracionServicio;
  const ctx = (headers: object) => new ExecutionContextHost([{ headers }]) as ExecutionContext;
  it.each([{}, { authorization: 'Bearer sesion-de-cliente' }, { 'x-token-servicio': 'incorrecto', authorization: 'Bearer sesion-de-admin' }, { 'x-usuario-roles': 'Administrador' }])('rechaza JWT/cabeceras sin credencial de servicio: %j', async headers => {
    await expect(new LlamadaInterna(config).canActivate(ctx(headers))).rejects.toMatchObject({ status: 401 });
  });
  it('acepta solo la credencial del servicio', async () => {
    await expect(new LlamadaInterna(config).canActivate(ctx({ 'x-token-servicio': config.tokenServicios }))).resolves.toBe(true);
  });
  it('el adaptador local se acredita también en llamadas iniciadas por un usuario', async () => {
    const entradasDe = jest.fn().mockResolvedValue([]);
    const adapter = new ApiVentasLocal({ entradasDe } as unknown as EntradasInternasService, new LlamadaInterna(config), config);
    await expect(adapter.enviar('/interno/entradas/de/11111111-1111-4111-8111-111111111111', 'sesion-del-actor')).resolves.toEqual({ estadoHttp: 200, cuerpo: { entradas: [] } });
    expect(entradasDe).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });
});
