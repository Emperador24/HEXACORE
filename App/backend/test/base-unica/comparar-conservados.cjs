const fs=require('node:fs');const {resolve,join}=require('node:path');const assert=require('node:assert/strict');
const {Client}=require('pg');const {opcionesPg,base}=require('./conexiones.cjs');const {q,cliente,guardas}=require('../consolidacion/config.cjs');
(async()=>{
  assert.equal(base,'hexacore_e2e');guardas();
  const meta=JSON.parse(fs.readFileSync(resolve(__dirname,'../../.evidencia-e2e/base-unica.json'),'utf8'));
  const m=JSON.parse(fs.readFileSync(join(meta.salida,'manifiesto.json'),'utf8'));
  const fixtures=JSON.parse(fs.readFileSync(join(meta.salida,'fixtures.json'),'utf8'));
  const original=await cliente('destino','hexacore'),copia=new Client(opcionesPg('identidad'));await copia.connect();
  const cambios=[];
  try{
    for(const modulo of m.modulos)for(const tabla of Object.keys(modulo.inventario.filas)){
      const columnas=(await original.query(`SELECT a.attname FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey) WHERE i.indisprimary AND n.nspname=$1 AND c.relname=$2 ORDER BY a.attnum`,[modulo.esquema,tabla])).rows.map(r=>r.attname);
      assert.ok(columnas.length,'Tabla sin PK requiere comparación explícita: '+tabla);
      const leer=async cliente=>(await cliente.query(`SELECT row_to_json(t)::text fila FROM ${q(modulo.esquema)}.${q(tabla)} t`)).rows;
      const key=f=>JSON.stringify(columnas.map(k=>JSON.parse(f)[k]));
      const actuales=new Map((await leer(copia)).map(r=>[key(r.fila),r.fila]));
      for(const r of await leer(original)){
        const actual=actuales.get(key(r.fila));assert.ok(actual,'Registro conservado eliminado: '+modulo.esquema+'.'+tabla);
        if(actual!==r.fila){
          const a=JSON.parse(r.fila),b=JSON.parse(actual);const campos=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
          // Únicamente transiciones existentes de vencimiento/contadores sobre registros previos.
          const permitidos={ 'identidad.usuarios': [fixtures.cuentas.cliente,fixtures.cuentas.personal].includes(a.id)?['ultimo_acceso_en','actualizado_en']:[],
            'alimentos.pedidos':['estado','actualizado_en'], 'alimentos.reservas_inventario':['estado','actualizada_en'],
            'entradas_ventas.compras':['estado','motivo','actualizada_en'], 'entradas_ventas.localidades_evento':['reservadas','actualizada_en'] };
          assert.ok(campos.every(k=>(permitidos[modulo.esquema+'.'+tabla]||[]).includes(k)),`Cambio no previsto: ${modulo.esquema}.${tabla} (${campos})`);
          if(tabla==='compras'){assert.equal(a.estado,'PENDIENTE');assert.equal(b.estado,'EXPIRADA');assert.equal(b.motivo,'La reserva venció sin pagarse (CU-001B)');}
          if(tabla==='pedidos'){assert.equal(a.estado,'PENDIENTE_PAGO');assert.equal(b.estado,'EXPIRADO');}
          if(tabla==='reservas_inventario'){assert.equal(a.estado,'ACTIVA');assert.ok(['LIBERACION_PENDIENTE','LIBERADA'].includes(b.estado));}
          if(tabla==='localidades_evento')assert.ok(b.reservadas<=a.reservadas&&b.reservadas>=0);
          cambios.push({esquema:modulo.esquema,tabla,campos});
        }
      }
    }
    fs.writeFileSync(resolve(__dirname,'../../.evidencia-e2e/cambios-esperados.json'),JSON.stringify({referencia:meta.referencia,cambios},null,2),{mode:0o600});
    console.log('Todos los registros originales siguen presentes. Cambios de temporizadores existentes: '+JSON.stringify(cambios.reduce((r,c)=>(r[c.esquema+'.'+c.tabla]=(r[c.esquema+'.'+c.tabla]||0)+1,r),{})));
  }finally{await original.end();await copia.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
