// Proveedor exclusivo de prueba: no envía correo ni tiene credenciales externas.
const http = require('node:http');
const reglas = new Map(), intentos = new Map(), retenidos = new Map();
const responder = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
async function cuerpo(req) {
    const trozos = [];
    for await (const t of req)
        trozos.push(t);
    return JSON.parse(Buffer.concat(trozos).toString() || '{}');
}
const servidor = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://fixture');
        if (req.method === 'GET' && url.pathname === '/salud')
            return responder(res, 200, { servicio: 'correo-fixture', estado: 'arriba' });
        if (req.method === 'GET' && url.pathname === '/estado')
            return responder(res, 200, { intentos: intentos.get(url.searchParams.get('para')) || [] });
        if (req.method === 'POST' && url.pathname === '/control') {
            const r = await cuerpo(req);
            reglas.set(r.para, r);
            if (r.liberar) {
                for (const entregar of retenidos.get(r.para) || [])
                    entregar();
                retenidos.delete(r.para);
            }
            return responder(res, 200, { configurado: true });
        }
        if (req.method === 'POST' && url.pathname === '/correos') {
            const c = await cuerpo(req), r = reglas.get(c.para) || {};
            const a = intentos.get(c.para) || [];
            intentos.set(c.para, a);
            const status = r.estados?.[a.length] ?? r.defecto ?? 202;
            const intento = { cuerpo: c, status, aceptado: status === 202, respondido: false };
            a.push(intento);
            const entregar = () => { intento.respondido = true; if (status === -1)
                return res.destroy(); responder(res, status, { estado: status === 202 ? 'ENTREGADO' : 'ERROR_FIXTURE' }); };
            if (status === 0)
                return; // El consumidor debe aplicar su timeout real de 10 s.
            if (r.retener?.includes(a.length)) {
                const lista = retenidos.get(c.para) || [];
                lista.push(entregar);
                retenidos.set(c.para, lista);
                return;
            }
            return entregar();
        }
        responder(res, 404, { error: 'Ruta no encontrada' });
    }
    catch (e) {
        responder(res, 400, { error: e.message });
    }
});
servidor.listen(3098, '0.0.0.0');
process.on('SIGTERM', () => { servidor.closeAllConnections(); servidor.close(() => process.exit(0)); });
