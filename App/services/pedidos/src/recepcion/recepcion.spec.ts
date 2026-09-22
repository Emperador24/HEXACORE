import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ParseUUIDPipe } from '@nestjs/common';
import { RecepcionService } from './recepcion.service';
import { RecepcionController } from './recepcion.controller';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';

describe('Consulta de pedidos recibidos', () => {
  const manager = { exists: jest.fn(), find: jest.fn() };
  const servicio = new RecepcionService({ manager } as unknown as DataSource);
  beforeEach(() => { jest.resetAllMocks(); manager.exists.mockResolvedValue(true); });

  it('filtra por establecimiento y CONFIRMADO, ordena y proyecta snapshots sin datos privados', async () => {
    manager.find.mockResolvedValueOnce([{ id: 'p', estado: EstadoPedido.CONFIRMADO, total: '62000.00', moneda: 'COP',
      confirmadoEn: new Date('2026-09-22T00:00:00Z'), clienteId: 'privado', codigoQr: 'secreto' }])
      .mockResolvedValueOnce([{ pedidoId: 'p', nombreProducto: 'Nombre histórico', cantidad: 2, precioUnitario: '31000.00' }]);
    expect(await servicio.listar('local')).toEqual([{ id: 'p', estado: 'CONFIRMADO', total: '62000.00', moneda: 'COP',
      confirmadoEn: '2026-09-22T00:00:00.000Z', productos: [{ nombreProducto: 'Nombre histórico', cantidad: 2, precioUnitario: '31000.00' }] }]);
    expect(manager.find).toHaveBeenCalledWith(Pedido, { where: { establecimientoId: 'local', estado: EstadoPedido.CONFIRMADO },
      order: { confirmadoEn: 'DESC', id: 'ASC' } });
  });
  it('devuelve lista vacía sin consultar detalles cuando no hay confirmados', async () => {
    manager.find.mockResolvedValue([]);
    expect(await servicio.listar('local')).toEqual([]);
    expect(manager.find).toHaveBeenCalledTimes(1);
  });
  it('devuelve 404 para un establecimiento inexistente', async () => {
    manager.exists.mockResolvedValue(false);
    await expect(servicio.listar('local')).rejects.toMatchObject({ status: 404 });
    expect(manager.find).not.toHaveBeenCalled();
  });
  it('exige sesión, rol Personal y UUID válido', async () => {
    expect(Reflect.getMetadata('__guards__', RecepcionController)).toContain(SesionValida);
    expect(Reflect.getMetadata('roles-permitidos', RecepcionController)).toEqual(['Personal']);
    await expect(new ParseUUIDPipe().transform('incorrecto', { type: 'param' })).rejects.toMatchObject({ status: 400 });
  });
});
