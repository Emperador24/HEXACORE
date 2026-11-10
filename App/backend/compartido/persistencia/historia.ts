import { EntregaCu0141794600000000 } from '../../modulos/alimentos/persistencia/migraciones/1794600000000-EntregaCu014';
import { MenuInventarioCu0121794400000000 } from '../../modulos/alimentos/persistencia/migraciones/1794400000000-MenuInventarioCu012';
import { PreparacionCu0131794500000000 } from '../../modulos/alimentos/persistencia/migraciones/1794500000000-PreparacionCu013';
import { GestionEstablecimientosCu0151794300000000 } from '../../modulos/alimentos/persistencia/migraciones/1794300000000-GestionEstablecimientosCu015';
import { EsquemaInicialCu0271789430400000 } from '../../modulos/identidad/persistencia/migraciones/1789430400000-EsquemaInicialCu027';
import { AdministracionCuentasCu027b1789516800000 } from '../../modulos/identidad/persistencia/migraciones/1789516800000-AdministracionCuentasCu027b';
import { RenovacionSesiones1789603200000 } from '../../modulos/identidad/persistencia/migraciones/1789603200000-RenovacionSesiones';
import { EsquemaInicialCu0111789902006180 } from '../../modulos/alimentos/persistencia/migraciones/1789902006180-EsquemaInicialCu011';
import { ReservasInventarioCu0111790000000000 } from '../../modulos/alimentos/persistencia/migraciones/1790000000000-ReservasInventarioCu011';
import { EsquemaInicialCu0181789718400000 } from '../../modulos/personal-logistica/persistencia/migraciones/1789718400000-EsquemaInicialCu018';
import { Cu017PersonalOperativo1789750000000 } from '../../modulos/personal-logistica/persistencia/migraciones/1789750000000-Cu017PersonalOperativo';
import { Cu007GestionPersonal1793664000000 } from '../../modulos/personal-logistica/persistencia/migraciones/1793664000000-Cu007GestionPersonal';
import { Cu008Cu009CambiosAsistencia1794000000000 } from '../../modulos/personal-logistica/persistencia/migraciones/1794000000000-Cu008Cu009CambiosAsistencia';
import { EsquemaInicialCu0061789257600000 } from '../../modulos/entradas/ventas/persistencia/migraciones/1789257600000-EsquemaInicialCu006';
import { SecuenciaNumeroTransaccion1789344000000 } from '../../modulos/entradas/ventas/persistencia/migraciones/1789344000000-SecuenciaNumeroTransaccion';
import { CarteleraCu0051789776000000 } from '../../modulos/entradas/ventas/persistencia/migraciones/1789776000000-CarteleraCu005';
import { VentaPrimariaCu001a0041789862400000 } from '../../modulos/entradas/ventas/persistencia/migraciones/1789862400000-VentaPrimariaCu001a004';
import { BandejaSalida1790553600000 } from '../../modulos/entradas/ventas/persistencia/migraciones/1790553600000-BandejaSalida';
import { EsquemaCatalogo1790208000000 } from '../../modulos/entradas/catalogo/persistencia/migraciones/1790208000000-EsquemaCatalogo';
import { EsquemaPostventa1790035200000 } from '../../modulos/entradas/postventa/persistencia/migraciones/1790035200000-EsquemaPostventa';
import { EsquemaAccesoQr1790467200000 } from '../../modulos/entradas/acceso-qr/persistencia/migraciones/1790467200000-EsquemaAccesoQr';
import { QrEntradas1790553600000 } from '../../modulos/entradas/acceso-qr/persistencia/migraciones/1790553600000-QrEntradas';
import { BandejaSalida1790553600001 } from '../../modulos/entradas/acceso-qr/persistencia/migraciones/1790553600001-BandejaSalida';
import { EsquemaEventosRecintos1793700000000 } from '../../modulos/eventos-recintos/persistencia/migraciones/1793700000000-EsquemaEventosRecintos';
import { Cu029RecintosZonas1793800000000 } from '../../modulos/eventos-recintos/persistencia/migraciones/1793800000000-Cu029RecintosZonas';
import { EsquemaOperacionMonitoreo1793900000000 } from '../../modulos/operacion/persistencia/migraciones/1793900000000-EsquemaOperacionMonitoreo';
import { Cu010Evacuacion1794100000000 } from '../../modulos/operacion/persistencia/migraciones/1794100000000-Cu010Evacuacion';
import { EsquemaParqueaderos1794200000000 } from '../../modulos/parqueaderos/persistencia/migraciones/1794200000000-EsquemaParqueaderos';
import { EsquemaPagos1790380800000 } from '../../modulos/finanzas/pagos/persistencia/migraciones/1790380800000-EsquemaPagos';

export const GRUPOS_MIGRACIONES = [
  { conexion: 'identidad' as const, esquema: 'identidad', historial: 'migraciones', migraciones: [EsquemaInicialCu0271789430400000, AdministracionCuentasCu027b1789516800000, RenovacionSesiones1789603200000] },
  { conexion: 'alimentos' as const, esquema: 'alimentos', historial: 'migraciones', migraciones: [EsquemaInicialCu0111789902006180, ReservasInventarioCu0111790000000000, GestionEstablecimientosCu0151794300000000, MenuInventarioCu0121794400000000, PreparacionCu0131794500000000, EntregaCu0141794600000000] },
  { conexion: 'personal-logistica' as const, esquema: 'personal_logistica', historial: 'migraciones', migraciones: [EsquemaInicialCu0181789718400000, Cu017PersonalOperativo1789750000000, Cu007GestionPersonal1793664000000, Cu008Cu009CambiosAsistencia1794000000000] },
  { conexion: 'entradas-ventas' as const, esquema: 'entradas_ventas', historial: 'migraciones', migraciones: [EsquemaInicialCu0061789257600000, SecuenciaNumeroTransaccion1789344000000, CarteleraCu0051789776000000, VentaPrimariaCu001a0041789862400000, BandejaSalida1790553600000] },
  { conexion: 'entradas-catalogo' as const, esquema: 'entradas_catalogo', historial: 'migraciones', migraciones: [EsquemaCatalogo1790208000000] },
  { conexion: 'entradas-postventa' as const, esquema: 'entradas_postventa', historial: 'migrations', migraciones: [EsquemaPostventa1790035200000] },
  { conexion: 'entradas-acceso-qr' as const, esquema: 'entradas_acceso_qr', historial: 'migraciones', migraciones: [EsquemaAccesoQr1790467200000, QrEntradas1790553600000, BandejaSalida1790553600001] },
  { conexion: 'finanzas-pagos' as const, esquema: 'finanzas_pagos', historial: 'migraciones', migraciones: [EsquemaPagos1790380800000] },
  // CU-026, posterior a la consolidación: noveno esquema, sin procedencia histórica.
  { conexion: 'eventos-recintos' as const, esquema: 'eventos_recintos', historial: 'migraciones', migraciones: [EsquemaEventosRecintos1793700000000, Cu029RecintosZonas1793800000000] },
  // CU-019 y CU-010, módulo del futuro programa Operación (ADR-16), hoy dentro del Núcleo.
  { conexion: 'operacion' as const, esquema: 'operacion', historial: 'migraciones', migraciones: [EsquemaOperacionMonitoreo1793900000000, Cu010Evacuacion1794100000000] },
  // CU-024 y CU-025: Parqueaderos, undécimo esquema, sin procedencia histórica.
  { conexion: 'parqueaderos' as const, esquema: 'parqueaderos', historial: 'migraciones', migraciones: [EsquemaParqueaderos1794200000000] }
];

// Procedencia de las 18 fuentes que venían de los servicios anteriores. Las
// migraciones posteriores a la consolidación (CU-007 y el esquema de CU-026) no tienen
// procedencia que conservar y solo figuran en GRUPOS_MIGRACIONES.
export const PROCEDENCIA_ORIGINAL = [
  {
    "conexion": "identidad",
    "ruta": "modulos/identidad/persistencia/migraciones/1789430400000-EsquemaInicialCu027.ts",
    "nombre": "EsquemaInicialCu0271789430400000",
    "sha256": "1528fad72f1107caff4c3c177e7591fbc226b1c76a070a9c17333f63d1482d62"
  },
  {
    "conexion": "identidad",
    "ruta": "modulos/identidad/persistencia/migraciones/1789516800000-AdministracionCuentasCu027b.ts",
    "nombre": "AdministracionCuentasCu027b1789516800000",
    "sha256": "aa982af7e993db93fe6cd4605827865b47e1d3e354371823276886aee33620ed"
  },
  {
    "conexion": "identidad",
    "ruta": "modulos/identidad/persistencia/migraciones/1789603200000-RenovacionSesiones.ts",
    "nombre": "RenovacionSesiones1789603200000",
    "sha256": "64d6744d6447d96ec88eebde63474159b4f8a32b11be91d35df9e57a4d4dcc7d"
  },
  {
    "conexion": "alimentos",
    "ruta": "modulos/alimentos/persistencia/migraciones/1789902006180-EsquemaInicialCu011.ts",
    "nombre": "EsquemaInicialCu0111789902006180",
    "sha256": "15d10694d2d52ceed7ec29eb77dad581ab5bc15075740daee348917978e0713d"
  },
  {
    "conexion": "alimentos",
    "ruta": "modulos/alimentos/persistencia/migraciones/1790000000000-ReservasInventarioCu011.ts",
    "nombre": "ReservasInventarioCu0111790000000000",
    "sha256": "3fece02eda8f59eb4c8aa8e258c6fc991f2bc3a06cbb8ea6fbcebcce9aa81fd7"
  },
  {
    "conexion": "personal-logistica",
    "ruta": "modulos/personal-logistica/persistencia/migraciones/1789718400000-EsquemaInicialCu018.ts",
    "nombre": "EsquemaInicialCu0181789718400000",
    "sha256": "c269b86ff1debb3a33fc79e63eb846b22bc85faa8a72585217ad948b6a5ac50b"
  },
  {
    "conexion": "personal-logistica",
    "ruta": "modulos/personal-logistica/persistencia/migraciones/1789750000000-Cu017PersonalOperativo.ts",
    "nombre": "Cu017PersonalOperativo1789750000000",
    "sha256": "b8896b72bd90cc5ce3b918c68ec7635616bd27a41d8040eabbcf07b8b8073444"
  },
  {
    "conexion": "entradas-ventas",
    "ruta": "modulos/entradas/ventas/persistencia/migraciones/1789257600000-EsquemaInicialCu006.ts",
    "nombre": "EsquemaInicialCu0061789257600000",
    "sha256": "e27b18e19c121ab4c705ba46c69c3d8f97c2fcb5fb6d6292c7c5090bcd470ffd"
  },
  {
    "conexion": "entradas-ventas",
    "ruta": "modulos/entradas/ventas/persistencia/migraciones/1789344000000-SecuenciaNumeroTransaccion.ts",
    "nombre": "SecuenciaNumeroTransaccion1789344000000",
    "sha256": "65fcebb1fd1c0cdb46b532109b0a346949740bf84059fcafd8eb49593f5e3451"
  },
  {
    "conexion": "entradas-ventas",
    "ruta": "modulos/entradas/ventas/persistencia/migraciones/1789776000000-CarteleraCu005.ts",
    "nombre": "CarteleraCu0051789776000000",
    "sha256": "4240373982300f65ad608c15385e4a669cecf07119f53a2e9d0a71c06a62f2fd"
  },
  {
    "conexion": "entradas-ventas",
    "ruta": "modulos/entradas/ventas/persistencia/migraciones/1789862400000-VentaPrimariaCu001a004.ts",
    "nombre": "VentaPrimariaCu001a0041789862400000",
    "sha256": "ac69d83110d0ec6b8905b482f72d421f458dc37089897f6dfa3bf6a28385fb96"
  },
  {
    "conexion": "entradas-ventas",
    "ruta": "modulos/entradas/ventas/persistencia/migraciones/1790553600000-BandejaSalida.ts",
    "nombre": "BandejaSalida1790553600000",
    "sha256": "0665cd9b3be3eefffea2051e6ae3d9ed22ba089af144521df6c04a5870aed7a4"
  },
  {
    "conexion": "entradas-catalogo",
    "ruta": "modulos/entradas/catalogo/persistencia/migraciones/1790208000000-EsquemaCatalogo.ts",
    "nombre": "EsquemaCatalogo1790208000000",
    "sha256": "6fdc469d2d5652310cf142ed4578ed162f9cba9a8eeb7d9a86d75fe610b4fa7a"
  },
  {
    "conexion": "entradas-postventa",
    "ruta": "modulos/entradas/postventa/persistencia/migraciones/1790035200000-EsquemaPostventa.ts",
    "nombre": "EsquemaPostventa1790035200000",
    "sha256": "f169a8522bf90643aa3133037cb73ae831c28c2b27c18f652d0a4423379aa005"
  },
  {
    "conexion": "entradas-acceso-qr",
    "ruta": "modulos/entradas/acceso-qr/persistencia/migraciones/1790467200000-EsquemaAccesoQr.ts",
    "nombre": "EsquemaAccesoQr1790467200000",
    "sha256": "4afbde6183058add3159e72b461a71fe40c85a1889c2e9681e16a622903f42b1"
  },
  {
    "conexion": "entradas-acceso-qr",
    "ruta": "modulos/entradas/acceso-qr/persistencia/migraciones/1790553600000-QrEntradas.ts",
    "nombre": "QrEntradas1790553600000",
    "sha256": "51fe15743d071d21fa6dd503ea8394baa79f76459860ef7ebf45abd28686bdbc"
  },
  {
    "conexion": "entradas-acceso-qr",
    "ruta": "modulos/entradas/acceso-qr/persistencia/migraciones/1790553600001-BandejaSalida.ts",
    "nombre": "BandejaSalida1790553600001",
    "sha256": "a91fcb58642b77e18708aafc2d3b5ff68fbb5d6818a390f94731316a7aed4b43"
  },
  {
    "conexion": "finanzas-pagos",
    "ruta": "modulos/finanzas/pagos/persistencia/migraciones/1790380800000-EsquemaPagos.ts",
    "nombre": "EsquemaPagos1790380800000",
    "sha256": "53959b6c193f8df8193395faa482bfd984dbd7d98cf24a901badf6df040421d2"
  }
] as const;
