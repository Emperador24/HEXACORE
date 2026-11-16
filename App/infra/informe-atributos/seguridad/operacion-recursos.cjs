// Matriz de las 22 operaciones actuales; estados/objetos válidos y base/vhost exclusivos.
const c = require('./operacion-comun.cjs');
const { gzipSync } = require('node:zlib');
async function main() {
  const nombre = process.argv[2]; c.assert(/^(desarrollo(?:-\d+)?|(?:(?:normalizada|compacta|cierre)-)?final-[123])$/.test(nombre));
  const archivo = 'operacion-' + nombre + '.json'; c.assert(!c.fs.existsSync(c.path.join(c.privado(), archivo)));
  const meta = c.guarda(), fixture = c.leer('fixture-operacion.json'), db = await c.conexion();
  const r = { nombre, imagen: meta.imagen, inicioUTC: new Date().toISOString(), canales: [], observaciones: [], estado: 'EN_CURSO' };
  try {
    const snapshot = await c.capturador(db), carpeta = 'comparaciones-' + nombre;
    c.assert(!c.fs.existsSync(c.path.join(c.privado(), carpeta)), 'Conservar incluso instantáneas parciales');
    c.fs.mkdirSync(c.path.join(c.privado(), carpeta), { mode: 0o700 });
    const usuarios = await db.ds.query('SELECT id,email FROM identidad.usuarios ORDER BY id');
    c.assert.equal(usuarios.length, 9); c.assert(usuarios.every(u => Object.values(fixture.actores).some(a => a.id === u.id)));
    r.aislamiento = { usuariosPropios: usuarios.length, sinDestinatariosPrevios: true, baseNueva: meta.baseCreadaVacia, vhostNuevo: meta.vhostCreado,
      canales: ['PERSONAL', 'ASISTENTES', 'ALTAVOCES'], soloColaSimulada: true };
    // La pasarela multicanal solo consume la cola operacion.evacuacion del vhost nuevo;
    // no busca destinatarios globales ni llama push/SMS/altavoces externos.
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const tokens = {}; for (const a of Object.keys(fixture.actores)) tokens[a] = (await c.sesion(a, servidor)).token;
      const operaciones = new Set(), porSupervisor = {}; let conservaciones = 0;
      const falsos = { 'X-Usuario-Id': fixture.actores.admin.id, 'X-Usuario-Roles': 'Administrador', 'X-Rol': 'Organizador' };
      const verificar = (caso, ok, categoria = 'semantica') => { r.observaciones.push({ canal, caso, categoria, ok: !!ok }); c.assert(ok, caso); };
      async function req(caso, metodo, ruta, actor, cuerpo, esperado, { conservar = false, categoria = 'semantica', operacion, supervisor } = {}) {
        const antes = conservar ? await snapshot() : null; let x;
        if (ruta.endsWith('/flujo')) {
          const f = await c.abrir(servidor, ruta, tokens[actor]);
          try { x = { estado: f.estado, datos: f.cuerpo }; if (esperado === 200) { const frame = await f.siguiente(); c.assert(frame?.tipo === (ruta.startsWith('/emergencias') ? 'evacuacion' : 'panel')); x.datos = frame.datos; } }
          finally { await f.cerrar(); }
        } else x = await c.http(servidor, metodo, ruta, tokens[actor], cuerpo, falsos);
        const o = { canal, caso, metodo, ruta, categoria, estado: x.estado, esperado, codigo: x.datos?.codigo, datos: x.datos, ok: x.estado === esperado };
        r.observaciones.push(o); c.assert(o.ok, caso + ': ' + x.estado + '/' + x.datos?.codigo);
        if (conservar) {
          const despues = await snapshot(), secuencia = String(r.observaciones.length).padStart(4, '0');
          o.comparacion = { tablas: antes.filas.length };
          // Persistir contenido íntegro por comparación evita una cadena V8
          // gigante y conserva también ambas instantáneas si la aserción falla.
          for (const [fase, estado] of [['antes', antes], ['despues', despues]]) {
            const bytes = Buffer.from(JSON.stringify(estado)), relativo = carpeta + '/' + secuencia + '-' + fase + '.json.gz';
            c.fs.writeFileSync(c.path.join(c.privado(), relativo), gzipSync(bytes), { mode: 0o600 });
            o.comparacion[fase] = relativo; o.comparacion[fase + 'Sha256'] = c.hash(bytes);
          }
          o.expiracionesNaturales = c.comparar(antes, despues); o.conservado = true; conservaciones++;
        }
        if (operacion) { operaciones.add(metodo + ' ' + operacion); if (supervisor) porSupervisor[supervisor].add(metodo + ' ' + operacion); }
        return x.datos;
      }
      async function caso(titulo, metodo, ruta, cuerpo, actor, estado, operacion, campo = false) {
        const denegados = ['cliente', ...(campo ? [] : ['personal']), ...(metodo === 'GET' ? [] : ['lector'])];
        for (const a of denegados) await req(titulo + ' / rechazo ' + a, metodo, ruta, a, cuerpo, 403, { conservar: true });
        const x = await req(titulo + ' / positivo ' + actor, metodo, ruta, actor, cuerpo, estado, { operacion, supervisor: actor });
        if (metodo === 'GET') await req(titulo + ' / rol propio leer', metodo, ruta, 'lector', undefined, 200);
        return x;
      }
      for (const actor of ['organizador', 'admin']) {
        porSupervisor[actor] = new Set();
        const org = tokens.organizador, a = await c.escenario(servidor, org), b = await c.escenario(servidor, org);
        for (const e of [a, b]) await db.ds.query("INSERT INTO operacion.ingresos(id,evento_id,punto_acceso,escaneado_en) SELECT gen_random_uuid(),$1,'Norte',now() FROM generate_series(1,2)", [e.evento.id]);
        const E = '/emergencias', M = '/monitoreo', ep = '/eventos/' + a.evento.id;
        await caso('plan existente', 'GET', E + '/recintos/' + a.recinto.id + '/plan', undefined, actor, 200, E + '/recintos/:recintoId/plan');
        await caso('guardar plan válido', 'PUT', E + '/recintos/' + a.recinto.id + '/plan', a.plan, actor, 200, E + '/recintos/:recintoId/plan');
        await req('plan cruza zona existente B', 'PUT', E + '/recintos/' + a.recinto.id + '/plan', actor, { ...a.plan, rutas: [{ zonaId: b.recinto.zonas[0].id, salida: 'Norte', prioridad: 1 }] }, 400, { conservar: true, categoria: 'contexto' });
        const operables = await caso('eventos operables globales', 'GET', E + '/eventos', undefined, actor, 200, E + '/eventos');
        verificar('operables incluye ambos eventos nuevos', [a,b].every(e => operables.some(x => x.id === e.evento.id)));
        const lista = await caso('eventos monitoreables globales', 'GET', M + '/eventos', undefined, actor, 200, M + '/eventos');
        verificar('monitoreables incluye ambos eventos nuevos', [a,b].every(e => lista.some(x => x.id === e.evento.id)));
        const panel = await caso('panel del recurso A', 'GET', M + ep + '/panel', undefined, actor, 200, M + '/eventos/:id/panel');
        verificar('panel corresponde a A y alerta existente', panel.evento.id === a.evento.id && panel.alertas.length > 0);
        const panelB = await req('control positivo panel B', 'GET', M + '/eventos/' + b.evento.id + '/panel', actor, undefined, 200);
        await caso('historial de alertas', 'GET', M + ep + '/alertas', undefined, actor, 200, M + '/eventos/:id/alertas');
        const flujoPanel = await caso('SSE panel A', 'GET', M + ep + '/flujo', undefined, actor, 200, M + '/eventos/:id/flujo');
        verificar('SSE panel conserva id A', flujoPanel.evento.id === a.evento.id);
        const dto = { tipo: 'HABILITAR_ACCESO', puntoAcceso: 'Norte', descripcion: 'Decisión de ensayo', alertaId: panel.alertas[0].id };
        await req('alerta existente B no se asocia a decisión A', 'POST', M + ep + '/decisiones', actor, { ...dto, alertaId: panelB.alertas[0].id }, 400, { conservar: true, categoria: 'contexto' });
        const decision = await caso('decisión con alerta propia', 'POST', M + ep + '/decisiones', dto, actor, 201, M + '/eventos/:id/decisiones');
        verificar('auditoría de decisión toma sesión real', decision.eventoId === a.evento.id && decision.realizadoPor === fixture.actores[actor].id);
        const decisionB = await req('decisión existente B', 'POST', M + '/eventos/' + b.evento.id + '/decisiones', actor, { tipo: 'OTRA', descripcion: 'Control B' }, 201);
        await req('decisión B bajo evento A', 'PATCH', M + ep + '/decisiones/' + decisionB.id, actor, { resultado: 'No debe cambiar B' }, 404, { conservar: true, categoria: 'contexto' });
        const resultado = await caso('resultado de decisión propia', 'PATCH', M + ep + '/decisiones/' + decision.id, { resultado: 'Resultado exclusivo' }, actor, 200, M + '/eventos/:id/decisiones/:decisionId');
        verificar('resultado conserva evento y alerta', resultado.id === decision.id && resultado.alertaId === decision.alertaId && resultado.resultado === 'Resultado exclusivo');
        await req('propuesta cruza zona B', 'POST', E + ep + '/evacuaciones', actor, { ...a.propuesta, zonaOrigenId: b.recinto.zonas[0].id }, 400, { conservar: true, categoria: 'contexto' });
        const propuesta = await caso('proponer emergencia válida', 'POST', E + ep + '/evacuaciones', a.propuesta, actor, 201, E + '/eventos/:eventoId/evacuaciones');
        const id = propuesta.evacuacion.id, ruta = E + '/evacuaciones/' + id;
        verificar('propuesta corresponde evento/recinto/zona/actor', propuesta.evacuacion.eventoId === a.evento.id && propuesta.evacuacion.recintoId === a.recinto.id && propuesta.evacuacion.creadaPor === fixture.actores[actor].id && propuesta.zonas[0].zonaId === a.recinto.zonas[0].id);
        await caso('historial de propuestas', 'GET', E + ep + '/evacuaciones', undefined, actor, 200, E + '/eventos/:eventoId/evacuaciones');
        await caso('detalle existente', 'GET', ruta, undefined, actor, 200, E + '/evacuaciones/:id');
        const vista = await caso('reporte preliminar', 'GET', ruta + '/reporte', undefined, actor, 200, E + '/evacuaciones/:id/reporte'); verificar('reporte aún preliminar', vista.final === false);
        const flujo = await caso('SSE evacuación A', 'GET', ruta + '/flujo', undefined, actor, 200, E + '/evacuaciones/:id/flujo'); verificar('SSE evacuación corresponde A', flujo.evacuacion.id === id && flujo.evacuacion.eventoId === a.evento.id);
        const propuestaB = await c.proponer(servidor, org, b);
        await caso('descartar propuesta independiente B', 'POST', E + '/evacuaciones/' + propuestaB.evacuacion.id + '/descartar', {}, actor, 201, E + '/evacuaciones/:id/descartar');
        // Antes de la primera activación: solo identidades propias y canales de la cola exclusiva.
        verificar('destinatarios siguen siendo solo los nueve nuevos', (await db.ds.query('SELECT id FROM identidad.usuarios')).every(x => usuarios.some(u => u.id === x.id)));
        await caso('confirmar propuesta vigente A', 'POST', ruta + '/confirmar', {}, actor, 201, E + '/evacuaciones/:id/confirmar');
        const activa = await caso('evacuación activa en evento A', 'GET', E + ep + '/activa', undefined, actor, 200, E + '/eventos/:eventoId/activa', true); verificar('activa corresponde al evento solicitado', activa.activa.evacuacion.id === id);
        for (const aCampo of ['personal', 'otroPersonal']) verificar('Personal global ve activa sin asignación ' + aCampo, (await req('vista campo ' + aCampo, 'GET', E + ep + '/activa', aCampo, undefined, 200)).activa.evacuacion.id === id);
        const zonaA = a.recinto.zonas[0].id;
        await req('zona existente de B bajo evacuación A', 'PATCH', ruta + '/zonas/' + b.recinto.zonas[0].id, actor, { personasRestantes: 1 }, 404, { conservar: true, categoria: 'contexto' });
        await caso('reporte válido de zona', 'PATCH', ruta + '/zonas/' + zonaA, { personasRestantes: 2 }, actor, 200, E + '/evacuaciones/:id/zonas/:zonaId', true);
        for (const aCampo of ['personal', 'otroPersonal']) await req('Personal global reporta ' + aCampo, 'PATCH', ruta + '/zonas/' + zonaA, aCampo, { personasRestantes: 3 }, 200);
        await req('salida B bajo evacuación A', 'POST', ruta + '/salidas/' + b.salidas[0].id + '/bloqueo', actor, { bloqueada: true, motivo: 'Contexto B' }, 404, { conservar: true, categoria: 'contexto' });
        await caso('cambiar ruta válida', 'POST', ruta + '/zonas/' + zonaA + '/ruta', { salidaId: a.salidas.find(x => x.nombre === 'Sur').id, motivo: 'Ruta de ensayo' }, actor, 201, E + '/evacuaciones/:id/zonas/:zonaId/ruta');
        await req('ruta usa salida existente B', 'POST', ruta + '/zonas/' + zonaA + '/ruta', actor, { salidaId: b.salidas[0].id }, 400, { conservar: true, categoria: 'contexto' });
        await caso('bloqueo válido', 'POST', ruta + '/salidas/' + a.salidas[0].id + '/bloqueo', { bloqueada: true, motivo: 'Aviso propio' }, actor, 201, E + '/evacuaciones/:id/salidas/:salidaId/bloqueo', true);
        for (const aCampo of ['personal', 'otroPersonal']) await req('Personal global comunica salida ' + aCampo, 'POST', ruta + '/salidas/' + a.salidas[0].id + '/bloqueo', aCampo, { bloqueada: false }, 201);
        await req('escalar con zona existente B', 'POST', ruta + '/nivel', actor, { nivel: 2, motivo: 'Contexto B', zonasIds: [b.recinto.zonas[0].id] }, 400, { conservar: true, categoria: 'contexto' });
        const escalada = await caso('escalar vigente', 'POST', ruta + '/nivel', { nivel: 2, motivo: 'Ensayo exclusivo', zonasIds: [a.recinto.zonas[1].id] }, actor, 201, E + '/evacuaciones/:id/nivel'); verificar('escalada incluye solo zonas de A', escalada.zonas.length === 2 && escalada.zonas.every(z => a.recinto.zonas.some(x => x.id === z.zonaId)));
        await req('DTO separado, sin atribuir a autorización', 'POST', ruta + '/nivel', actor, { nivel: 4, motivo: 'Inválido' }, 400, { conservar: true, categoria: 'dto' });
        await req('estado obsoleto separado', 'POST', ruta + '/confirmar', actor, {}, 409, { conservar: true, categoria: 'estado' });
        for (const z of escalada.zonas) await req('precondición válida de finalización', 'PATCH', ruta + '/zonas/' + z.zonaId, 'personal', { estado: 'EVACUADA' }, 200);
        const finalizada = await caso('finalizar con todas las zonas evacuadas', 'POST', ruta + '/finalizar', { observaciones: 'Solo ensayo' }, actor, 201, E + '/evacuaciones/:id/finalizar'); verificar('cierre y actor auditados', finalizada.evacuacion.estado === 'FINALIZADA' && finalizada.evacuacion.finalizadaPor === fixture.actores[actor].id);
        const reporte = await req('reporte final del recurso A', 'GET', ruta + '/reporte', actor, undefined, 200); verificar('reporte, historial y avisos persistidos', reporte.final === true && reporte.bitacora.length > 0 && reporte.avisos.total > 0);
        verificar('22 operaciones con positivos de ' + actor, porSupervisor[actor].size === 22);
      }
      // La matriz vigente separa crear/actualizar. Estos controles no cubren las ocho rutas CU-028 nuevas.
      const e = await c.escenario(servidor, tokens.organizador);
      await req('leer no propone', 'POST', '/emergencias/eventos/' + e.evento.id + '/evacuaciones', 'lector', e.propuesta, 403, { conservar: true });
      await req('actualizar no crea propuesta', 'POST', '/emergencias/eventos/' + e.evento.id + '/evacuaciones', 'actualizador', e.propuesta, 403, { conservar: true });
      const creada = await req('rol propio crear propone', 'POST', '/emergencias/eventos/' + e.evento.id + '/evacuaciones', 'creador', e.propuesta, 201);
      await req('crear no confirma existente', 'POST', '/emergencias/evacuaciones/' + creada.evacuacion.id + '/confirmar', 'creador', {}, 403, { conservar: true });
      await req('rol propio actualizar confirma', 'POST', '/emergencias/evacuaciones/' + creada.evacuacion.id + '/confirmar', 'actualizador', {}, 201);
      const d = await req('rol propio crear decide', 'POST', '/monitoreo/eventos/' + e.evento.id + '/decisiones', 'creador', { tipo: 'OTRA', descripcion: 'Permiso actual' }, 201);
      await req('rol propio actualizar registra resultado', 'PATCH', '/monitoreo/eventos/' + e.evento.id + '/decisiones/' + d.id, 'actualizador', { resultado: 'Resultado propio' }, 200);
      await req('sin sesión', 'GET', '/monitoreo/eventos/' + e.evento.id + '/panel', 'sin', undefined, 401, { conservar: true });
      verificar('inventario positivo completo', operaciones.size === 22);
      r.canales.push({ canal, operaciones: [...operaciones].sort(), porSupervisor: Object.fromEntries(Object.entries(porSupervisor).map(([k,v]) => [k,v.size])), conservaciones });
    }
    r.estado = 'APROBADO';
  } catch (e) { r.estado = 'FALLIDO'; r.error = e.message; process.exitCode = 1; }
  finally { r.finUTC = new Date().toISOString(); try { c.guardar(archivo, r); } finally { await db.cerrar(); }
    console.log(JSON.stringify({ nombre, estado: r.estado, observaciones: r.observaciones.length, canales: r.canales, error: r.error })); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
