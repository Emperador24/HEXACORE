import { Establecimiento, EstadoEstablecimiento } from '../entidades/establecimiento.entity';
import { EventoReferencia } from '../entidades/evento-referencia.entity';
import { Producto } from '../entidades/producto.entity';

/** UUID fijos para repetir las pruebas de CU-011 con los mismos identificadores. */
export const EVENTOS: Pick<EventoReferencia, 'eventoId' | 'nombre' | 'disponible'>[] = [
  {
    // Mismo evento de demostración que en Entradas.
    eventoId: 'e0000001-0000-4000-8000-000000000001',
    nombre: 'HEXACORE Fest 2026',
    disponible: true,
  },
];

export const ESTABLECIMIENTOS: Pick<
  Establecimiento, 'id' | 'eventoId' | 'nombre' | 'estado' | 'puntoEntrega'
>[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    eventoId: EVENTOS[0].eventoId,
    nombre: 'Food Truck La Sazón',
    estado: EstadoEstablecimiento.DISPONIBLE,
    puntoEntrega: 'Zona gastronómica - Módulo 4',
  },
];

export const PRODUCTOS: Pick<
  Producto, 'id' | 'establecimientoId' | 'nombre' | 'descripcion' | 'precio' | 'activo' | 'cantidadInventario'
>[] = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    establecimientoId: ESTABLECIMIENTOS[0].id,
    nombre: 'Hamburguesa',
    descripcion: null,
    precio: '25000.00',
    activo: true,
    cantidadInventario: 20,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    establecimientoId: ESTABLECIMIENTOS[0].id,
    nombre: 'Gaseosa',
    descripcion: null,
    precio: '6000.00',
    activo: true,
    cantidadInventario: 30,
  },
  {
    // Solicitar dos unidades permite probar inventario insuficiente (CU-011B).
    id: '40000000-0000-4000-8000-000000000003',
    establecimientoId: ESTABLECIMIENTOS[0].id,
    nombre: 'Papas fritas',
    descripcion: null,
    precio: '12000.00',
    activo: true,
    cantidadInventario: 1,
  },
  {
    // Producto activo pero agotado (CU-011A).
    id: '40000000-0000-4000-8000-000000000004',
    establecimientoId: ESTABLECIMIENTOS[0].id,
    nombre: 'Jugo natural',
    descripcion: null,
    precio: '7000.00',
    activo: true,
    cantidadInventario: 0,
  },
];
