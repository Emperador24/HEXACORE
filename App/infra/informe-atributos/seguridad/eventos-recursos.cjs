const { execFileSync } = require('node:child_process');
const c = require('./eventos-comun.cjs'), p = require('./preparar-eventos.cjs');
async function main() {
  const nombre = process.argv[2]; c.assert(/^(desarrollo(?:-\d+)?|(?:normalizada-)?final-[123])$/.test(nombre));
  const archivo = 'eventos-' + nombre + '.json'; c.assert(!c.fs.existsSync(c.path.join(c.privado(), archivo)), 'No sobrescribir ni reintentar mediciones');
  const m = c.guarda(), f = c.leer('fixture-eventos.json'), db = await c.conexion(), snapshot = await c.capturador(db);
  const r = { nombre, inicioUTC: new Date().toISOString(), sha: execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim(), imagen: m.imagen,
    canales: [], observaciones: [], estado: 'EN_CURSO' };
  try {
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const tokens = {}; for (const a of Object.keys(f.actores)) tokens[a] = (await p.sesion(a, servidor)).token;
      const operaciones = new Set(); let conservaciones = 0;
      const falsos = { 'X-Usuario-Id': f.actores.admin.id, 'X-Usuario-Roles': 'Administrador', 'X-Rol': 'Organizador' };
      const v = (caso, condicion, categoria = 'semantica') => { r.observaciones.push({ canal, caso, categoria, ok: !!condicion }); c.assert(condicion, caso); };
      async function req(caso, metodo, ruta, actor, cuerpo, esperado = metodo === 'POST' ? 201 : 200, opciones = {}) {
        const { conservar, codigo, categoria = 'semantica', operacion, archivo, campos, cabeceras = {} } = opciones;
        const antes = conservar ? await snapshot() : null;
        const x = await c.http(ruta, { servidor, metodo, token: tokens[actor], cuerpo, archivo, campos, cabeceras });
        const o = { canal, caso, metodo, ruta, categoria, estado: x.estado, esperado, codigo: x.datos?.codigo, datos: x.datos,
          ...(x.tipo.startsWith('image/') ? { archivo: { sha256: x.hash, bytes: x.bytes.length, tipo: x.tipo } } : {}), ok: x.estado === esperado && (!codigo || x.datos?.codigo === codigo) };
        r.observaciones.push(o); c.assert(o.ok, caso + ': HTTP ' + x.estado + ' / ' + (x.datos?.codigo || ''));
        if (conservar) { const despues = await snapshot(); o.antes = antes; o.despues = despues; c.assert.deepEqual(despues, antes, caso + ': datos/historial/versiones/planos/efectos/Redis'); o.conservado = true; conservaciones++; }
        if (operacion) operaciones.add(metodo + ' ' + operacion); return x;
      }
      const ok = async (caso, metodo, ruta, actor, cuerpo, esperado, operacion) => (await req(caso, metodo, ruta, actor, cuerpo, esperado, { operacion })).datos;
      async function negarRoles(caso, metodo, ruta, cuerpo, extras = {}, actores = ['cliente','personal']) {
        for (const a of actores) await req(caso + ' / ' + a, metodo, ruta, a, cuerpo, 403, { ...extras, conservar: true, cabeceras: falsos });
      }
      const roomA = c.recinto(), roomB = c.recinto();
      const a = (await ok('alta recinto Organizador', 'POST', '/recintos', 'organizador', roomA, 201, '/recintos')).recinto;
      const b = (await ok('alta recinto Administrador', 'POST', '/recintos', 'admin', roomB, 201, '/recintos')).recinto;
      const cuerpos = c.recinto();
      await negarRoles('alta recinto', 'POST', '/recintos', cuerpos);
      const paraBorrar = (await ok('alta recinto borrable', 'POST', '/recintos', 'organizador', cuerpos, 201, '/recintos')).recinto;
      const borrarAdmin = (await ok('alta recinto borrable por Admin', 'POST', '/recintos', 'organizador', c.recinto(), 201, '/recintos')).recinto;
      for (const ruta of ['/recintos', '/recintos/' + a.id]) await negarRoles('lectura recinto', 'GET', ruta);
      for (const actor of ['organizador','admin']) {
        const lista = await ok('lista compartida recintos ' + actor, 'GET', '/recintos?todos=true', actor, undefined, 200, '/recintos');
        v('lista incluye recursos de ambos actores ' + actor, lista.some(x => x.id === a.id) && lista.some(x => x.id === b.id));
        v('detalle recinto y zonas vinculadas ' + actor, (await ok('detalle recinto ' + actor, 'GET', '/recintos/' + a.id, actor, undefined, 200, '/recintos/:id')).recinto.zonas.every(z => z.recintoId === a.id));
      }
      const editarRecinto = (original, dto, extra = {}) => ({ ...dto, zonas: original.zonas.map(z => ({ id: z.id, nombre: z.nombre, capacidad: z.capacidad })), ...extra });
      const edicion = editarRecinto(a, roomA, { ciudad: 'Medellín' });
      await negarRoles('edición recinto', 'PUT', '/recintos/' + a.id, edicion);
      await req('zona de recinto B no edita A', 'PUT', '/recintos/' + a.id, 'organizador', { ...edicion, zonas: [{ id: b.zonas[0].id, nombre: 'General', capacidad: 60 }] }, 400, { conservar: true, categoria: 'contexto' });
      const aEditado = (await req('otro Organizador edita recinto global', 'PUT', '/recintos/' + a.id, 'otroOrganizador', edicion, 200, { operacion: '/recintos/:id', cabeceras: falsos })).datos.recinto;
      await ok('Admin edita recinto global', 'PUT', '/recintos/' + b.id, 'admin', editarRecinto(b, roomB, { ciudad: 'Cali' }), 200, '/recintos/:id');
      v('auditoría recinto usa actor de sesión', aEditado.actualizadoPor === f.actores.otroOrganizador.id);
      // Regresión de creación: el id existente es solo una indicación de edición, nunca una identidad a reasignar.
      const protegidoZona = await db.ds.query('SELECT * FROM eventos_recintos.zonas_recinto WHERE recinto_id=$1 ORDER BY id', [a.id]);
      const copiaRecinto = (await ok('alta con id de zona existente crea identidad nueva', 'POST', '/recintos', 'admin', { ...c.recinto(), zonas: [{ id: a.zonas[0].id, nombre: 'Copia', capacidad: 50 }] }, 201, '/recintos')).recinto;
      c.assert.deepEqual(await db.ds.query('SELECT * FROM eventos_recintos.zonas_recinto WHERE recinto_id=$1 ORDER BY id', [a.id]), protegidoZona);
      v('zona original intacta y nueva pertenece al nuevo recinto', copiaRecinto.zonas[0].id !== a.zonas[0].id && copiaRecinto.zonas[0].recintoId === copiaRecinto.id);
      // Planos existentes, bytes diferentes y metadatos; permisos positivos de ambos roles.
      for (const [recinto, actor, archivo] of [[a, 'organizador', c.pngA], [b, 'admin', c.pngB]]) {
        await req('plano inicial propio ' + actor, 'PUT', '/recintos/' + recinto.id + '/plano', actor, undefined, 200, { archivo, operacion: '/recintos/:id/plano' });
      }
      await negarRoles('subir plano válido', 'PUT', '/recintos/' + a.id + '/plano', undefined, { archivo: c.pngB });
      await negarRoles('descargar plano existente', 'GET', '/recintos/' + a.id + '/plano');
      await negarRoles('retirar plano existente', 'DELETE', '/recintos/' + a.id + '/plano');
      const planoBAntes = (await snapshot()).planos.find(x => x.recinto_id === b.id);
      await req('subida vincula ruta e ignora query/campo de otro recinto', 'PUT', '/recintos/' + a.id + '/plano?recintoId=' + b.id, 'otroOrganizador', undefined, 200,
        { archivo: c.pngA, campos: { recintoId: b.id }, operacion: '/recintos/:id/plano' });
      for (const [recinto, actor, esperado] of [[a, 'organizador', c.pngA], [a, 'admin', c.pngA], [b, 'admin', c.pngB]]) {
        const x = await req('descarga bytes y metadatos ' + actor, 'GET', '/recintos/' + recinto.id + '/plano?recintoId=' + (recinto.id === a.id ? b.id : a.id), actor, undefined, 200, { operacion: '/recintos/:id/plano' });
        v('contenido SHA256 y tipo correctos ' + actor, x.hash === c.hash(esperado) && x.bytes.equals(esperado) && x.tipo === 'image/png' && x.cabeceras['cache-control'].startsWith('private'));
      }
      c.assert.deepEqual((await snapshot()).planos.find(x => x.recinto_id === b.id), planoBAntes); v('subir/descargar A conserva plano B', true);
      await ok('retira plano Organizador global', 'DELETE', '/recintos/' + a.id + '/plano', 'otroOrganizador', undefined, 204, '/recintos/:id/plano');
      c.assert.deepEqual((await snapshot()).planos.find(x => x.recinto_id === b.id), planoBAntes); v('retirada A conserva plano B', true);
      await ok('retira plano Administrador', 'DELETE', '/recintos/' + b.id + '/plano', 'admin', undefined, 204, '/recintos/:id/plano');
      await req('plano de recinto borrable', 'PUT', '/recintos/' + paraBorrar.id + '/plano', 'organizador', undefined, 200, { archivo: c.pngA });
      await negarRoles('eliminar recinto existente', 'DELETE', '/recintos/' + paraBorrar.id);
      await ok('eliminar recinto Organizador', 'DELETE', '/recintos/' + paraBorrar.id, 'otroOrganizador', undefined, 204, '/recintos/:id');
      await ok('eliminar recinto Administrador', 'DELETE', '/recintos/' + borrarAdmin.id, 'admin', undefined, 204, '/recintos/:id');
      // Eventos: mutaciones del Organizador, consultas compartidas con Administrador.
      const cuerpoA = c.evento(a, 30); await negarRoles('crear evento', 'POST', '/eventos', cuerpoA, {}, ['cliente','personal','admin']);
      const e = (await req('crear evento atribuye sesión pese a cabeceras', 'POST', '/eventos?creadoPor=' + f.actores.admin.id, 'organizador', cuerpoA, 201,
        { operacion: '/eventos', cabeceras: falsos })).datos.evento;
      const ajeno = (await ok('evento de otro Organizador', 'POST', '/eventos', 'otroOrganizador', c.evento(b, 32), 201, '/eventos')).evento;
      v('creadoPor e historial de sesión', e.creadoPor === f.actores.organizador.id && (await db.ds.query('SELECT realizado_por FROM eventos_recintos.historial_eventos WHERE evento_id=$1', [e.id])).every(x => x.realizado_por === f.actores.organizador.id));
      const protegidoLocal = await db.ds.query('SELECT * FROM eventos_recintos.localidades WHERE evento_id=$1 ORDER BY id', [ajeno.id]);
      const nuevo = (await ok('alta con id de localidad existente crea identidad nueva', 'POST', '/eventos', 'organizador', { ...c.evento(a, 33), localidades: [{ ...c.evento(a).localidades[0], id: ajeno.localidades[0].id }] }, 201, '/eventos')).evento;
      c.assert.deepEqual(await db.ds.query('SELECT * FROM eventos_recintos.localidades WHERE evento_id=$1 ORDER BY id', [ajeno.id]), protegidoLocal);
      v('localidad original intacta y nueva en evento correcto', nuevo.localidades[0].id !== ajeno.localidades[0].id && nuevo.localidades[0].eventoId === nuevo.id);
      const disponibilidad = '/eventos/disponibilidad?recintoId=' + a.id + '&fechaInicio=' + encodeURIComponent(e.fechaInicio) + '&fechaFin=' + encodeURIComponent(e.fechaFin);
      for (const ruta of ['/eventos', '/eventos/' + e.id, disponibilidad]) await negarRoles('consulta eventos', 'GET', ruta);
      for (const actor of ['organizador','admin']) {
        const lista = await ok('lista global eventos ' + actor, 'GET', '/eventos?estado=BORRADOR&creadoPor=' + f.actores.organizador.id, actor, undefined, 200, '/eventos');
        v('listado no inventa propiedad ' + actor, lista.some(x => x.id === e.id) && lista.some(x => x.id === ajeno.id));
        const detalle = await ok('detalle global evento ' + actor, 'GET', '/eventos/' + e.id + '?recintoId=' + b.id, actor, undefined, 200, '/eventos/:id');
        v('detalle respeta recinto/evento/zona ' + actor, detalle.evento.id === e.id && detalle.recinto.id === a.id && detalle.evento.localidades.every(x => x.zonaRecintoId === a.zonas[0].id));
        await ok('disponibilidad autorizada ' + actor, 'GET', disponibilidad, actor, undefined, 200, '/eventos/disponibilidad');
      }
      await req('disponibilidad sin sesión', 'GET', disponibilidad, 'sin', undefined, 401, { conservar: true });
      const cuerpoEditado = { ...c.editar(e), nombre: c.nombre() }; await negarRoles('editar evento válido', 'PUT', '/eventos/' + e.id, cuerpoEditado, {}, ['cliente','personal','admin']);
      await req('zona existente de otro recinto no crea evento', 'POST', '/eventos', 'organizador', { ...c.evento(a, 35), localidades: [{ nombre: 'General', precio: 1000, cantidad: 1, zonaRecintoId: b.zonas[0].id }] }, 400, { conservar: true, categoria: 'contexto', codigo: 'ZONA_AJENA' });
      await req('zona existente de otro recinto no edita evento', 'PUT', '/eventos/' + e.id, 'organizador', { ...cuerpoEditado, localidades: [{ ...cuerpoEditado.localidades[0], zonaRecintoId: b.zonas[0].id }] }, 400, { conservar: true, categoria: 'contexto', codigo: 'ZONA_AJENA' });
      await req('localidad existente de otro evento no edita A', 'PUT', '/eventos/' + e.id, 'organizador', { ...cuerpoEditado, localidades: [{ ...cuerpoEditado.localidades[0], id: ajeno.localidades[0].id }] }, 400, { conservar: true, categoria: 'contexto' });
      await req('propietario en cuerpo es DTO separado', 'POST', '/eventos', 'organizador', { ...c.evento(a, 36), creadoPor: f.actores.admin.id }, 400, { conservar: true, categoria: 'dto' });
      const editado = (await ok('otro Organizador edita evento global', 'PUT', '/eventos/' + e.id, 'otroOrganizador', cuerpoEditado, 200, '/eventos/:id')).evento;
      v('edición conserva id localidad y aumenta versión', editado.version === e.version + 1 && editado.localidades[0].id === e.localidades[0].id);
      v('historial edición usa actor actual', (await db.ds.query("SELECT realizado_por FROM eventos_recintos.historial_eventos WHERE evento_id=$1 AND accion='EDITADO'", [e.id]))[0].realizado_por === f.actores.otroOrganizador.id);
      await req('versión anterior no escribe', 'PUT', '/eventos/' + e.id, 'organizador', cuerpoEditado, 409, { conservar: true, categoria: 'estado' });
      const pub = (await ok('borrador independiente para publicar', 'POST', '/eventos', 'organizador', c.evento(a, 40), 201, '/eventos')).evento;
      await negarRoles('publicar borrador vigente', 'POST', '/eventos/' + pub.id + '/publicar', { version: pub.version }, {}, ['cliente','personal','admin']);
      const publicado = (await ok('publica Organizador global', 'POST', '/eventos/' + pub.id + '/publicar', 'otroOrganizador', { version: pub.version }, 200, '/eventos/:id/publicar')).evento;
      v('publicación y versión correctas', publicado.estado === 'PUBLICADO' && publicado.version === pub.version + 1);
      const conflicto = await ok('disponibilidad con evento publicado', 'GET', '/eventos/disponibilidad?recintoId=' + a.id + '&fechaInicio=' + encodeURIComponent(pub.fechaInicio) + '&fechaFin=' + encodeURIComponent(pub.fechaFin) + '&excluirEventoId=' + ajeno.id, 'admin', undefined, 200, '/eventos/disponibilidad');
      v('excluir id de otro recinto no oculta el conflicto de A', conflicto.conflictos.some(x => x.id === pub.id));
      const sinConflicto = await ok('exclusión propia de disponibilidad', 'GET', '/eventos/disponibilidad?recintoId=' + a.id + '&fechaInicio=' + encodeURIComponent(pub.fechaInicio) + '&fechaFin=' + encodeURIComponent(pub.fechaFin) + '&excluirEventoId=' + pub.id, 'organizador', undefined, 200, '/eventos/disponibilidad');
      v('exclusión propia funciona', sinConflicto.conflictos.length === 0);
      const cancelar = { version: publicado.version, motivo: 'Cancelación de recurso exclusivo del ensayo' };
      await negarRoles('cancelar publicado vigente', 'POST', '/eventos/' + pub.id + '/cancelar', cancelar, {}, ['cliente','personal','admin']);
      const cancelado = (await ok('cancela Organizador', 'POST', '/eventos/' + pub.id + '/cancelar', 'organizador', cancelar, 200, '/eventos/:id/cancelar')).evento;
      v('cancelación conserva localidades y aumenta versión', cancelado.estado === 'CANCELADO' && cancelado.version === publicado.version + 1 && cancelado.localidades[0].id === publicado.localidades[0].id);
      const mensajes = await db.ds.query('SELECT clave,cuerpo FROM eventos_recintos.eventos_salientes WHERE cuerpo->>\'eventoId\'=$1 ORDER BY secuencia', [pub.id]);
      v('efectos propios de publicación/cancelación íntegros', mensajes.length === 2 && mensajes[0].clave === 'evento.publicado' && mensajes[1].clave === 'evento.cancelado' && mensajes[1].cuerpo.cancelacion.requiereDevolucion === true && mensajes.every(x => x.cuerpo.localidades[0].localidadId === pub.localidades[0].id));
      const borrar = (await ok('borrador independiente eliminable', 'POST', '/eventos', 'organizador', c.evento(a, 42), 201, '/eventos')).evento;
      await negarRoles('eliminar borrador vigente', 'DELETE', '/eventos/' + borrar.id + '?version=' + borrar.version, undefined, {}, ['cliente','personal','admin']);
      await ok('elimina Organizador global', 'DELETE', '/eventos/' + borrar.id + '?version=' + borrar.version, 'otroOrganizador', undefined, 204, '/eventos/:id');
      const historia = await db.ds.query('SELECT accion,version,realizado_por FROM eventos_recintos.historial_eventos WHERE evento_id=$1 ORDER BY version', [borrar.id]);
      v('eliminar conserva historial y actor', historia.length === 2 && historia[1].accion === 'ELIMINADO' && historia[1].realizado_por === f.actores.otroOrganizador.id && (await db.ds.query('SELECT id FROM eventos_recintos.eventos WHERE id=$1', [borrar.id])).length === 0);
      v('16 operaciones con controles positivos', operaciones.size === 16);
      r.canales.push({ canal, operaciones: [...operaciones].sort(), conservaciones });
    }
    r.estado = 'APROBADO';
  } catch (e) { r.estado = 'FALLIDO'; r.error = e.message; process.exitCode = 1; }
  finally { r.finUTC = new Date().toISOString(); c.guardar(archivo, r); await db.cerrar(); console.log(JSON.stringify({ nombre, estado: r.estado, observaciones: r.observaciones.length, aprobadas: r.observaciones.filter(x => x.ok).length, canales: r.canales, error: r.error })); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
