import type { MigrationInterface, QueryRunner } from 'typeorm';

export const ESQUEMAS = {
  identidad: 'identidad', alimentos: 'alimentos', 'personal-logistica': 'personal_logistica',
  'entradas-ventas': 'entradas_ventas', 'entradas-catalogo': 'entradas_catalogo',
  'entradas-postventa': 'entradas_postventa', 'entradas-acceso-qr': 'entradas_acceso_qr',
  'finanzas-pagos': 'finanzas_pagos', 'eventos-recintos': 'eventos_recintos',
  operacion: 'operacion', parqueaderos: 'parqueaderos',
} as const;
export type ConexionNegocio = keyof typeof ESQUEMAS;
export const opcionesEsquema = (conexion: ConexionNegocio) => ({
  schema: ESQUEMAS[conexion], installExtensions: false,
});
export const opcionesSesion = (conexion: ConexionNegocio) => ({
  // Un solo dueño por pool; pg_catalog precede al homónimo de pgcrypto.
  options: `-c search_path=${ESQUEMAS[conexion]},pg_catalog,extensiones`,
});

/** Las fuentes históricas no cambian. Solo su antigua cualificación DDL public.
 * No se aplica este adaptador a consultas de aplicación, filas o respaldos. */
export function migracionesEnEsquema(originales: (new () => MigrationInterface)[], conexion: ConexionNegocio): (new () => MigrationInterface)[] {
  return originales.map(Original => class implements MigrationInterface {
    name = new Original().name || Original.name;
    transaction = new Original().transaction;
    private delegado(q: QueryRunner): QueryRunner {
      return new Proxy(q, { get(objeto, propiedad) {
        if (propiedad === 'query') return (sql: string, ...args: unknown[]) =>
          (objeto.query as Function).call(objeto, sql.replaceAll('"public".', `"${ESQUEMAS[conexion]}".`), ...args);
        const valor = Reflect.get(objeto, propiedad);
        return typeof valor === 'function' ? valor.bind(objeto) : valor;
      } });
    }
    async up(q: QueryRunner) { await new Original().up(this.delegado(q)); }
    async down(q: QueryRunner) { await new Original().down(this.delegado(q)); }
  });
}
