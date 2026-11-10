import { LecturaInventarioService } from '../inventario/lectura-inventario.service';
import { AjustesInventarioService } from '../inventario/ajustes-inventario.service';
import Redis from 'ioredis';
import { ConsultaEventos } from '../../eventos-recintos/consulta-eventos.module';
import 'reflect-metadata';
import { ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MenuService } from './menu.service';
import { MenuController } from './menu.controller';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { Producto } from '../persistencia/entidades/producto.entity';
import { CatalogoService } from '../catalogo/catalogo.service';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';

describe('Administración del menú CU-012', () => {
  const producto = { id: 'producto', establecimientoId: 'local', nombre: 'Hamburguesa',
    descripcion: null, precio: '25000.00', activo: true, cantidadInventario: 20 };
  const manager = { exists: jest.fn(), find: jest.fn(), findOne: jest.fn(), getRepository: () => repositorio };
  const consulta = { update: jest.fn(), set: jest.fn(), where: jest.fn(), returning: jest.fn(), execute: jest.fn() };
  const repositorio = { createQueryBuilder: jest.fn(() => consulta) };
  const datos = { manager, transaction: async (f: (m: typeof manager) => unknown) => f(manager), getRepository: jest.fn(() => repositorio) };
  const lectura = new LecturaInventarioService(datos as unknown as DataSource, { eval: async () => JSON.stringify({ producto: '20', otro: '20' }) } as unknown as Redis);
  const servicio = new MenuService(datos as unknown as DataSource, lectura, {} as AjustesInventarioService);
  const publicado = { ...producto, restriccionesAlimentarias: [], cantidadFisica: 20, cantidadDisponible: 20, cantidadReservada: 0, inventarioEstado: 'DISPONIBLE' };

  beforeEach(() => {
    jest.clearAllMocks();
    manager.exists.mockResolvedValue(false);
    manager.findOne.mockResolvedValue({ id: 'local' });
    manager.find.mockResolvedValue([producto]);
    for (const metodo of ['update', 'set', 'where', 'returning'] as const) consulta[metodo].mockReturnValue(consulta);
  });

  it('lista activos e inactivos, con orden estable y mediante DTO', async () => {
    manager.find.mockResolvedValue([{ ...producto, establecimiento: { privado: true } }, { ...producto, id: 'otro', activo: false }]);
    expect(await servicio.listar('local')).toEqual([publicado, { ...publicado, id: 'otro', activo: false }]);
    expect(manager.find).toHaveBeenCalledWith(Producto, {
      where: { establecimientoId: 'local' }, order: { nombre: 'ASC', id: 'ASC' }, lock: { mode: 'pessimistic_read' },
    });
  });

  it('devuelve lista vacía cuando no hay productos', async () => {
    manager.find.mockResolvedValue([]);
    expect(await servicio.listar('local')).toEqual([]);
  });

  it('rechaza un establecimiento inexistente en lectura y escritura', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(servicio.listar('ausente')).rejects.toMatchObject({ status: 404 });
    await expect(servicio.actualizar('ausente', 'producto', false)).rejects.toMatchObject({ status: 404 });
    expect(manager.find).not.toHaveBeenCalled();
    expect(consulta.execute).not.toHaveBeenCalled();
  });

  it.each([true, false])('persiste exclusivamente activo=%s y permite repetir el mismo valor', async (activo) => {
    manager.find.mockResolvedValue([{ ...producto, activo }]);
    consulta.execute.mockResolvedValue({ affected: 1, raw: [{ ...producto, activo,
      establecimiento_id: 'local', cantidad_inventario: 20 }] });
    expect(await servicio.actualizar('local', 'producto', activo)).toEqual({ ...publicado, activo });
    expect(await servicio.actualizar('local', 'producto', activo)).toEqual({ ...publicado, activo });
    expect(consulta.set).toHaveBeenCalledWith({ activo });
    expect(consulta.where).toHaveBeenCalledWith({ id: 'producto', establecimientoId: 'local' });
  });

  it('no actualiza un producto inexistente o perteneciente a otro establecimiento', async () => {
    consulta.execute.mockResolvedValue({ affected: 0, raw: [] });
    await expect(servicio.actualizar('otro-local', 'producto', false)).rejects.toMatchObject({ status: 404 });
    expect(consulta.where).toHaveBeenCalledWith({ id: 'producto', establecimientoId: 'otro-local' });
  });

  const [pipe] = Reflect.getMetadata('__pipes__', MenuController.prototype.actualizar) as ValidationPipe[];
  it.each([{}, { activo: null }, { activo: 'false' }, { activo: 0 }, { activo: true, precio: '1' },
    { activo: false, cantidadInventario: 0 }])('rechaza un body inválido: %j', async (body) => {
    await expect(pipe.transform(body, { type: 'body', metatype: ActualizarProductoDto })).rejects.toMatchObject({ status: 400 });
  });
  it.each([true, false])('acepta el booleano %s', async (activo) => {
    expect(await pipe.transform({ activo }, { type: 'body', metatype: ActualizarProductoDto })).toEqual({ activo });
  });

  it('exige sesión, rol Personal y parámetros UUID', async () => {
    expect(Reflect.getMetadata('__guards__', MenuController)).toContain(SesionValida);
    expect(Reflect.getMetadata('roles-permitidos', MenuController)).toEqual(['Personal']);
    const parametros = Reflect.getMetadata('__routeArguments__', MenuController, 'actualizar');
    for (const nombre of ['establecimientoId', 'productoId']) {
      expect(Object.values(parametros)).toEqual(expect.arrayContaining([expect.objectContaining({
        data: nombre, pipes: [ParseUUIDPipe],
      })]));
    }
    await expect(new ParseUUIDPipe().transform('incorrecto', { type: 'param' })).rejects.toMatchObject({ status: 400 });
  });

  it('el catálogo cliente conserva el filtro activo=true', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ id: 'local', estado: 'DISPONIBLE', horaApertura: '00:00', horaCierre: '00:00', zonaHoraria: 'America/Bogota' }), find: jest.fn().mockResolvedValue([]) };
    const catalogo = new CatalogoService({ getRepository: () => repo } as unknown as DataSource, { paraAlimentos: async () => ({ disponible: true }) } as unknown as ConsultaEventos, { listar: async (_id: string, activos: boolean) => { expect(activos).toBe(true); return repo.find({ where: { establecimientoId: 'local', activo: true }, order: { nombre: 'ASC', id: 'ASC' } }); } } as unknown as LecturaInventarioService);
    expect(await catalogo.listarProductos('local')).toEqual([]);
    expect(repo.find).toHaveBeenCalledWith({ where: { establecimientoId: 'local', activo: true },
      order: { nombre: 'ASC', id: 'ASC' } });
  });
});
