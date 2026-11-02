// Entorno exclusivo compartido con la integración de referencia.
Object.assign(process.env, require('../../../backend/test/boleteria/procesos.cjs').entorno('ventas'));
