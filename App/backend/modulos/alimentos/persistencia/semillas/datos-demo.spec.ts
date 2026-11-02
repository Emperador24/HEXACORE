import { isUUID } from 'class-validator';
import { EVENTOS, ESTABLECIMIENTOS, PRODUCTOS } from './datos-demo';

describe('Catálogo demo de Pedidos', () => {
  it('ofrece tres establecimientos disponibles del mismo evento, con cuatro productos cada uno', () => {
    expect(ESTABLECIMIENTOS).toHaveLength(3);
    expect(PRODUCTOS).toHaveLength(12);
    for (const establecimiento of ESTABLECIMIENTOS) {
      expect(establecimiento.eventoId).toBe(EVENTOS[0].eventoId);
      expect(establecimiento.estado).toBe('DISPONIBLE');
      expect(PRODUCTOS.filter((p) => p.establecimientoId === establecimiento.id)).toHaveLength(4);
    }
    const ids = [...ESTABLECIMIENTOS, ...PRODUCTOS].map((fila) => fila.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => isUUID(id))).toBe(true);
    expect(PRODUCTOS.every((p) => /^\d+\.\d{2}$/.test(p.precio) && Number(p.precio) > 0 &&
      Number.isInteger(p.cantidadInventario) && p.cantidadInventario >= 0)).toBe(true);
  });

  it('conserva el establecimiento y los cuatro productos originales sin cambios', () => {
    expect(ESTABLECIMIENTOS[0]).toEqual({
      id: '30000000-0000-4000-8000-000000000001', eventoId: EVENTOS[0].eventoId,
      nombre: 'Food Truck La Sazón', estado: 'DISPONIBLE', puntoEntrega: 'Zona gastronómica - Módulo 4',
    });
    expect(PRODUCTOS.slice(0, 4)).toEqual([
      ['Hamburguesa', '25000.00', 20], ['Gaseosa', '6000.00', 30],
      ['Papas fritas', '12000.00', 1], ['Jugo natural', '7000.00', 0],
    ].map(([nombre, precio, cantidadInventario], i) => ({
      id: `40000000-0000-4000-8000-00000000000${i + 1}`,
      establecimientoId: ESTABLECIMIENTOS[0].id, nombre, precio, cantidadInventario, descripcion: null, activo: true,
    })));
  });
});
