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
  {
    id: '30000000-0000-4000-8000-000000000002',
    eventoId: EVENTOS[0].eventoId,
    nombre: 'Taquería El Comal',
    estado: EstadoEstablecimiento.DISPONIBLE,
    puntoEntrega: 'Zona gastronómica - Módulo 5',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    eventoId: EVENTOS[0].eventoId,
    nombre: 'Pizzería Masa y Fuego',
    estado: EstadoEstablecimiento.DISPONIBLE,
    puntoEntrega: 'Plazoleta central - Módulo 2',
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
  {
    id: '40000000-0000-4000-8000-000000000005',
    establecimientoId: ESTABLECIMIENTOS[1].id,
    nombre: 'Tacos al pastor',
    descripcion: 'Tres tacos con piña y cilantro.',
    precio: '22000.00',
    activo: true,
    cantidadInventario: 18,
  },
  {
    id: '40000000-0000-4000-8000-000000000006',
    establecimientoId: ESTABLECIMIENTOS[1].id,
    nombre: 'Quesadilla de queso',
    descripcion: 'Tortilla a la plancha con queso fundido.',
    precio: '16000.00',
    activo: true,
    cantidadInventario: 8,
  },
  {
    id: '40000000-0000-4000-8000-000000000007',
    establecimientoId: ESTABLECIMIENTOS[1].id,
    nombre: 'Nachos con guacamole',
    descripcion: 'Totopos de maíz con guacamole.',
    precio: '14000.00',
    activo: true,
    cantidadInventario: 2,
  },
  {
    id: '40000000-0000-4000-8000-000000000008',
    establecimientoId: ESTABLECIMIENTOS[1].id,
    nombre: 'Agua de jamaica',
    descripcion: 'Bebida fría de flor de jamaica.',
    precio: '6500.00',
    activo: true,
    cantidadInventario: 0,
  },
  {
    id: '40000000-0000-4000-8000-000000000009',
    establecimientoId: ESTABLECIMIENTOS[2].id,
    nombre: 'Pizza margarita personal',
    descripcion: 'Tomate, mozzarella y albahaca.',
    precio: '24000.00',
    activo: true,
    cantidadInventario: 12,
  },
  {
    id: '40000000-0000-4000-8000-000000000010',
    establecimientoId: ESTABLECIMIENTOS[2].id,
    nombre: 'Pizza de pepperoni personal',
    descripcion: 'Mozzarella y pepperoni sobre masa artesanal.',
    precio: '28000.00',
    activo: true,
    cantidadInventario: 6,
  },
  {
    id: '40000000-0000-4000-8000-000000000011',
    establecimientoId: ESTABLECIMIENTOS[2].id,
    nombre: 'Pan de ajo',
    descripcion: 'Porción de pan al horno con mantequilla de ajo.',
    precio: '9000.00',
    activo: true,
    cantidadInventario: 15,
  },
  {
    id: '40000000-0000-4000-8000-000000000012',
    establecimientoId: ESTABLECIMIENTOS[2].id,
    nombre: 'Limonada natural',
    descripcion: 'Limonada recién preparada.',
    precio: '8000.00',
    activo: true,
    cantidadInventario: 25,
  },
];
