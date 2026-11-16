const {execFileSync}=require('node:child_process');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const id=execFileSync('docker',[...require('./compose.cjs').argumentos(),'ps','-a','-q','preparacion-base'],{encoding:'utf8'}).trim();
assert.match(id,/^[a-f0-9]+$/);
assert.equal(execFileSync('docker',['wait',id],{encoding:'utf8'}).trim(),'0','Falló la preparación única');
