import { DataSource } from 'typeorm';
import { PermisosCompartidos } from './permisos-compartidos.service';
import { RolesPermisosService } from './roles-permisos.service';

/** CU-028A: un fallo al buscar el rol de destino que no es "no existe" no se disfraza de reasignación inválida. */
describe('RolesPermisosService · eliminar con reasignación', () => {
  it('propaga un fallo inesperado al leer el rol de destino', async () => {
    const servicio = new RolesPermisosService(
      { transaction: jest.fn((f: (m: unknown) => unknown) => f({})) } as unknown as DataSource,
      {} as PermisosCompartidos,
    );
    jest.spyOn(servicio as never, 'leerParaCambiar').mockResolvedValue({ id: 'r', usuarios: 2 } as never);
    jest.spyOn(servicio as never, 'leer').mockRejectedValue(new Error('base caída') as never);
    await expect(servicio.eliminar('r', { version: 1, reasignarA: 'otro' }, 'admin')).rejects.toThrow('base caída');
  });
});
