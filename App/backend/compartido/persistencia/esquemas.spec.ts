import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import type {QueryRunner} from 'typeorm';
import {ESQUEMAS,migracionesEnEsquema,opcionesEsquema,opcionesSesion,ConexionNegocio} from './esquemas';
import {PROCEDENCIA_ORIGINAL,GRUPOS_MIGRACIONES} from './historia';
describe('Propiedad de esquemas e historia conservada',()=>{
  it.each(Object.entries(ESQUEMAS))('pool %s usa solo el esquema %s y extensiones comunes',(conexion,esquema)=>{
    expect(opcionesEsquema(conexion as ConexionNegocio)).toEqual({schema:esquema,installExtensions:false});
    expect(opcionesSesion(conexion as ConexionNegocio).options).toBe(`-c search_path=${esquema},pg_catalog,extensiones`);
    expect(opcionesSesion(conexion as ConexionNegocio).min).toBe(1);
  });
  it('las 18 fuentes originales conservan su SHA-256, nombre e historial',()=>{
    expect(PROCEDENCIA_ORIGINAL).toHaveLength(18);
    for(const h of PROCEDENCIA_ORIGINAL)expect(createHash('sha256').update(readFileSync(resolve(__dirname,'../..',h.ruta))).digest('hex')).toBe(h.sha256);
    expect(GRUPOS_MIGRACIONES.find(g=>g.conexion==='entradas-postventa')!.historial).toBe('migrations');
    // 18 consolidadas + 18 posteriores: CU-007, CU-026, CU-029, CU-019, CU-008/009, CU-010, CU-024/025,
    // CU-021/023, CU-015, CU-012, CU-013 y entrega CU-014, más la versión del evento en las cuatro
    // copias de Boletería (consumidores de CU-026), cancelación CU-011F y roles y permisos CU-028.
    expect(GRUPOS_MIGRACIONES.find(g=>g.conexion==='alimentos')!.migraciones.map(M=>new M().name)).toEqual([
      'EsquemaInicialCu0111789902006180','ReservasInventarioCu0111790000000000',
      'GestionEstablecimientosCu0151794300000000','MenuInventarioCu0121794400000000',
      'PreparacionCu0131794500000000','EntregaCu0141794600000000','CancelacionCu011F1794700000000']);
    expect(GRUPOS_MIGRACIONES.reduce((n,g)=>n+g.migraciones.length,0)).toBe(36);
  });
  it('adapta la cualificación histórica sin cambiar nombres ni parámetros/filas',async()=>{
    class Original { name='Ejemplo1700000000000';async up(q:QueryRunner){await q.query('CREATE TYPE "public"."estado" AS ENUM (\'A\')');await q.query('SELECT $1',[ '"public"."dato"' ]);}async down(q:QueryRunner){await q.query('DROP TYPE "public"."estado"');} }
    const [M]=migracionesEnEsquema([Original],'personal-logistica'),m=new M(),query=jest.fn().mockResolvedValue([]);
    const q={query} as unknown as QueryRunner;await m.up(q);await m.down(q);
    expect(m.name).toBe('Ejemplo1700000000000');
    expect(query.mock.calls).toEqual([['CREATE TYPE "personal_logistica"."estado" AS ENUM (\'A\')'],['SELECT $1',['"public"."dato"']],['DROP TYPE "personal_logistica"."estado"']]);
  });
});
