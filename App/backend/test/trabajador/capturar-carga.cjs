// Observa módulos cargados sin interceptar SIGTERM ni sustituir proveedores.
const fs = require('node:fs');
const capturar = () => fs.writeFileSync(process.env.PRUEBA_CARGA_ARCHIVO, JSON.stringify(Object.keys(require.cache)));
const timer = setInterval(capturar, 50);
timer.unref();
process.on('exit', capturar);
