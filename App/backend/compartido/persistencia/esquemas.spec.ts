import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import type {QueryRunner} from 'typeorm';
import {ESQUEMAS,migracionesEnEsquema,opcionesEsquema,opcionesSesion,ConexionNegocio} from './esquemas';
import {PROCEDENCIA_ORIGINAL,GRUPOS_MIGRACIONES} from './historia';
describe('Propiedad de esquemas e historia conservada',()=>{
  it.each(Object.entries(ESQUEMAS))('pool %s usa solo el esquema %s y extensiones comunes',(conexion,esquema)=>{
    expect(opcionesEsquema(conexion as ConexionNegocio)).toEqual({schema:esquema,installExtensions:false});
    expect(opcionesSesion(conexion as ConexionNegocio).options).toBe(`-c search_path=${esquema},pg_catalog,extensiones`);
  });
  it('las 18 fuentes originales conservan su SHA-256, nombre e historial',()=>{
    expect(PROCEDENCIA_ORIGINAL).toHaveLength(18);
    for(const h of PROCEDENCIA_ORIGINAL)expect(createHash('sha256').update(readFileSync(resolve(__dirname,'../..',h.ruta))).digest('hex')).toBe(h.sha256);
    expect(GRUPOS_MIGRACIONES.find(g=>g.conexion==='entradas-postventa')!.historial).toBe('migrations');
    // 18 consolidadas + 11 posteriores (incluye CU-015, CU-012, CU-013 y entrega CU-014): CU-007, CU-026, CU-029, CU-019, CU-008/009, CU-010 y CU-024/025.
    expect(GRUPOS_MIGRACIONES.reduce((n,g)=>n+g.migraciones.length,0)).toBe(29);
  });
  it('adapta la cualificación histórica sin cambiar nombres ni parámetros/filas',async()=>{
    class Original { name='Ejemplo1700000000000';async up(q:QueryRunner){await q.query('CREATE TYPE "public"."estado" AS ENUM (\'A\')');await q.query('SELECT $1',[ '"public"."dato"' ]);}async down(q:QueryRunner){await q.query('DROP TYPE "public"."estado"');} }
    const [M]=migracionesEnEsquema([Original],'personal-logistica'),m=new M(),query=jest.fn().mockResolvedValue([]);
    const q={query} as unknown as QueryRunner;await m.up(q);await m.down(q);
    expect(m.name).toBe('Ejemplo1700000000000');
    expect(query.mock.calls).toEqual([['CREATE TYPE "personal_logistica"."estado" AS ENUM (\'A\')'],['SELECT $1',['"public"."dato"']],['DROP TYPE "personal_logistica"."estado"']]);
  });
});
