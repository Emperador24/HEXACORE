const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const nombres=['nucleo','boleteria','trabajador','gateway','pasarela','correo','portal-cliente','portal-admin'];
function validar(directorio,revision){
  assert.match(revision||'',/^[a-f0-9]{40}$/);
  assert.deepEqual(fs.readdirSync(directorio).sort(),nombres.map(n=>n+'.json').sort(),'Se requieren exactamente ocho manifiestos de imagen');
  return nombres.map(nombre=>{
    const m=JSON.parse(fs.readFileSync(path.join(directorio,nombre+'.json'),'utf8'));
    assert.deepEqual(Object.keys(m).sort(),['nombre','imagen','digest','revision'].sort());
    assert.equal(m.revision,revision);assert.equal(m.nombre,nombre);
    assert.equal(m.imagen,'ghcr.io/emperador24/hexacore-'+nombre);assert.match(m.digest,/^sha256:[a-f0-9]{64}$/);
    return {...m,ref:m.imagen+'@'+m.digest};
  });
}
module.exports={validar,nombres};
