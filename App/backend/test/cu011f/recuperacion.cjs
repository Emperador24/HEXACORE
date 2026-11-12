// Fallos controlados en el adaptador local, SQL/Redis y Finanzas reales.
// Solo fixtures propios y Núcleo previamente detenido; no modifica proveedores.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { conectar, backend } = require('../cu012/entorno.cjs');

(async () => {
  const fixtures = JSON.parse(process.argv[2]);
  assert.equal(fixtures.length, 2);
  const [nucleo] = JSON.parse(execFileSync('docker', ['inspect', 'hexacore-cu015-sebastian-nucleo-1'], { encoding: 'utf8' }));
  assert.equal(nucleo.State.Running, false); assert.equal(nucleo.Config.Labels['hexacore.uso'], 'cu015');
  const e = await conectar(); let app;
  try {
    process.env.PAGOS_PROVEEDOR = 'simulada'; process.env.PAGOS_PROVEEDOR_URL = 'http://127.0.0.1:13139';
    const { NestFactory } = require('@nestjs/core');
    const { PagosModule, PagosService } = require(resolve(backend, 'dist/modulos/finanzas/pagos'));
    app = await NestFactory.createApplicationContext(PagosModule, { logger: false });
    const { ConsultaPersonal } = require(resolve(backend, 'dist/modulos/identidad/consulta-personal.module'));
    const { ClienteReembolsos } = require(resolve(backend, 'dist/modulos/alimentos/recepcion/cliente-reembolsos.service'));
    const { CancelacionService } = require(resolve(backend, 'dist/modulos/alimentos/recepcion/cancelacion.service'));
    const real = new ClienteReembolsos(app.get(PagosService));
    const resultados = [];
    for (const f of fixtures) {
      for (const k of ['local','pedido','actor']) assert.match(f[k], /^[a-f0-9-]{36}$/);
      assert.ok(['antes_proveedor','despues_libro'].includes(f.modo));
      const [pertenece] = await e.ds.query(`SELECT p.id FROM alimentos.pedidos p JOIN alimentos.establecimientos x
        ON x.id=p.establecimiento_id WHERE p.id=$1 AND x.id=$2 AND x.nombre LIKE 'CU011F %'
        AND p.creado_en>clock_timestamp()-interval '10 minutes' AND p.estado='CONFIRMADO'`, [f.pedido,f.local]);
      assert.ok(pertenece, 'Solo un pedido fixture reciente CU011F puede usarse en este ensayo');
      let solicitudes = 0;
      const frontera = {
        async solicitar(c) {
          solicitudes++;
          // Otro backend puede adquirir el pedido: no queda un lock durante HTTP.
          const q = e.ds.createQueryRunner(); await q.connect(); await q.startTransaction();
          try { await q.query('SELECT id FROM alimentos.pedidos WHERE id=$1 FOR UPDATE NOWAIT', [f.pedido]); }
          finally { await q.rollbackTransaction(); await q.release(); }
          if (f.modo === 'despues_libro') await real.solicitar(c);
          throw new Error('RESPUESTA_PERDIDA_CONTROLADA_CU011F');
        },
        consultar: c => real.consultar(c),
      };
      const ajustes = new e.AjustesInventarioService(e.ds, e.redis);
      const servicio = new CancelacionService(e.ds, new ConsultaPersonal(e.ds), frontera, ajustes, new e.ReservasService(e.redis));
      try {
        const id = randomUUID();
        await servicio.cancelar(f.local, f.pedido, f.actor, id, { version: 0, motivo: 'Ensayo de respuesta perdida CU011F', confirmar: true });
        await servicio.procesar(f.pedido);
        const [c] = await e.ds.query('SELECT * FROM alimentos.cancelaciones_pedido WHERE pedido_id=$1', [f.pedido]);
        assert.equal(c.estado_reembolso, 'INCIERTO'); assert.equal(c.estado_inventario, 'RESTITUIDO'); assert.equal(solicitudes, 1);
        const libro = await app.get(PagosService).consultar(c.reembolso_id, 'alimentos');
        assert.equal(libro?.resultado ?? null, f.modo === 'despues_libro' ? 'APROBADO' : null);
        // La siguiente consulta recupera del libro o conserva la incertidumbre;
        // no vuelve a invocar el adaptador, tampoco si falta evidencia.
        await servicio.procesar(f.pedido); assert.equal(solicitudes, 1);
        resultados.push({ pedido: f.pedido, operacion: id, reembolso: c.reembolso_id, modo: f.modo, solicitudes,
          estadoEsperado: f.modo === 'despues_libro' ? 'APROBADO' : 'INCIERTO', sinBloqueoDuranteProveedor: true });
      } finally { await servicio.onModuleDestroy(); await ajustes.onModuleDestroy(); }
    }
    console.log(JSON.stringify({ escenarios: resultados }));
  } finally { if (app) await app.close(); await e.cerrar(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
