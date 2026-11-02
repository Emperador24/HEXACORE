import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
const procesos = require('./procesos.cjs');
const { Client } = require('pg');
const dias = (n: number) => new Date(Date.now() + n * 86400000);

// Se conserva el mismo contrato antes y después del traslado. Los JWT son fixtures;
// esta suite no prueba login, interfaces ni una invalidación QR inmediata.
describe('Referencia real de Boletería: CU-001–006', () => {
  let app: any;
  const db: Record<string, any> = {};
  let redis: Redis;
  const evento = randomUUID(), localidad = randomUUID(), localidadCarrera = randomUUID();
  const vendedor = randomUUID(), portero = randomUUID(), comprador = randomUUID();
  const cupom = `BOL${randomUUID().slice(0,8).toUpperCase()}`;
  const sesiones = new Map<string, { token: string; jti: string }>();
  let compra: any, transferencia: any, checkout: any, nuevaCompra: any;
  let publicacion: any, ganador: string;
  const hash = (qr: string) => createHash('sha256').update(qr).digest('hex');
  function sesion(id: string, roles = ['Cliente']) {
    if (!sesiones.has(id)) {
      const jti = randomUUID();
      const token = new JwtService().sign({ sub: id, roles, jti }, { algorithm: 'RS256', issuer: 'hexacore-administracion',
        expiresIn: '15m', privateKey: readFileSync(resolve(__dirname, '../claves/jwt-privada.pem'), 'utf8') });
      sesiones.set(id, { token, jti });
    }
    return sesiones.get(id)!;
  }
  async function pedir(n: string, metodo: string, ruta: string, usuario?: string, cuerpo?: unknown, headers: Record<string,string> = {}) {
    const r = await fetch(`${app.urls[n]}/api/v1${ruta}`, { method: metodo,
      headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${sesion(usuario).token}` } : {}), ...headers },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000) });
    const texto = await r.text(); return { status: r.status, body: texto ? JSON.parse(texto) : null, headers: r.headers };
  }
  async function sql(n: string, consulta: string, valores: unknown[] = []) { return (await db[n].query(consulta, valores)).rows; }
  async function comprar(usuario = vendedor, cantidad = 1) {
    const r = await pedir('ventas', 'POST', '/compras', usuario, { localidadId: localidad, cantidad });
    expect(r.status).toBe(201);
    const p = await pedir('ventas', 'POST', `/compras/${r.body.id}/pagar`, usuario, { metodoPago: 'TARJETA', token: 'tok_ok_boleteria' });
    expect(p.status).toBe(200); return p.body;
  }
  beforeAll(async () => {
    app = await procesos.iniciar();
    redis = new Redis({host:'127.0.0.1',port:16382}); await procesos.esperar(() => redis.status === 'ready');
    for (const [n, base] of Object.entries({ ...procesos.bases, pagos: 'pagos_e2e' })) {
      db[n] = new Client({host:'127.0.0.1',port:15435,user:'cu011_e2e',password:'cu011_e2e',database:base}); await db[n].connect();
    }
    for (const n of ['ventas','catalogo','acceso-qr','postventa']) {
      const extra = n === 'postventa' ? ',permite_reventa' : `,estado${n==='acceso-qr'?',aforo_maximo':',categoria'}`;
      const valor = n === 'postventa' ? ',true' : `,'PUBLICADO'${n==='acceso-qr'?',100':",'Conciertos'"}`;
      await sql(n, `INSERT INTO eventos_referencia(evento_id,nombre,fecha_inicio,lugar,ciudad${extra}) VALUES($1,$2,$3,'Recinto E2E','Bogotá'${valor})`, [evento,`Boletería ${evento}`,dias(30)]);
      if (n === 'ventas' || n === 'catalogo') {
        await sql(n, 'INSERT INTO localidades_evento(localidad_id,evento_id,nombre,precio,aforo) VALUES($1,$2,\'General\',100000,20)', [localidad,evento]);
      }
    }
    await sql('ventas', 'INSERT INTO localidades_evento(localidad_id,evento_id,nombre,precio,aforo) VALUES($1,$2,\'Carrera\',100000,2)', [localidadCarrera,evento]);
    await sql('ventas', 'INSERT INTO codigos_promocionales(codigo,descripcion,porcentaje,limite_usos,usos,activo,vigente_desde,vigente_hasta,evento_id) VALUES($1,\'E2E\',10,1,0,true,$2,$3,$4)', [cupom,dias(-1),dias(40),evento]);
    sesion(portero,['Personal']);
  });
  afterAll(async () => {
    try { if (app) await procesos.cerrar(app); }
    finally {
      if (redis) { for (const s of sesiones.values()) await redis.del(`sesion-revocada:${s.jti}`); redis.disconnect(); }
      for (const c of Object.values(db)) await c.end();
    }
    // Historial financiero y de propietarios inmutable: UUID nuevos, sin truncar.
  });
  it('conserva las cuatro bases y sus diez migraciones', async () => {
    const esperadas = { ventas:5, catalogo:1, postventa:1, 'acceso-qr':3 };
    for (const [n,cantidad] of Object.entries(esperadas)) expect((await sql(n,`SELECT count(*)::int n FROM ${n === 'postventa' ? 'migrations' : 'migraciones'}`))[0].n).toBe(cantidad);
  });
  it('consulta cartelera pública y filtra el evento real', async () => {
    const detalle = await pedir('catalogo','GET',`/cartelera/${evento}`);
    expect(detalle.status).toBe(200); expect(JSON.stringify(detalle.body)).toContain(`Boletería ${evento}`);
    expect((await pedir('catalogo','GET','/cartelera?filtroInexistente=1')).status).toBe(400);
  });
  it('el turno se consume una vez y solo por su dueño', async () => {
    const t = await pedir('cola-virtual','POST',`/cola/eventos/${evento}/turnos`,vendedor);
    expect(t.status).toBe(201); expect(t.body.token).toEqual(expect.any(String));
    const ruta = `/interno/cola/turnos/${t.body.token}`;
    expect((await pedir('cola-virtual','DELETE',ruta,comprador)).status).toBe(404);
    const consumido=await pedir('cola-virtual','DELETE',ruta,vendedor);
    expect(consumido.status).toBe(204); expect(consumido.headers.get('X-Turno-Evento')).toBe(evento);
    expect((await pedir('cola-virtual','DELETE',ruta,vendedor)).status).toBe(404);
  });
  it('reserva, aplica promoción y conserva rechazo/aprobación y repetición sin doble efecto', async () => {
    const r=await pedir('ventas','POST','/compras',vendedor,{localidadId:localidad,cantidad:2});expect(r.status).toBe(201);
    const descuento=await pedir('ventas','PUT',`/compras/${r.body.id}/cupon`,vendedor,{codigo:cupom});
    expect(descuento.status).toBe(200);expect(descuento.body.total).toBe(180000);
    const pago={metodoPago:'TARJETA',token:'tok_rechazo_boleteria'};
    const rechazo=await pedir('ventas','POST',`/compras/${r.body.id}/pagar`,vendedor,pago);
    expect(rechazo.status).toBe(409);expect(rechazo.body.codigo).toBe('CU-001C');
    const aprobado=await pedir('ventas','POST',`/compras/${r.body.id}/pagar`,vendedor,{...pago,token:'tok_ok_boleteria'});
    expect(aprobado.status).toBe(200);compra=aprobado.body;expect(compra.entradas).toHaveLength(2);
    const antes=(await sql('pagos','SELECT count(*)::int n FROM transacciones_pago'))[0].n;
    expect((await pedir('ventas','POST',`/compras/${compra.id}/pagar`,vendedor,{...pago,token:'tok_ok_boleteria'})).status).toBe(409);
    expect((await sql('pagos','SELECT count(*)::int n FROM transacciones_pago'))[0].n).toBe(antes);
    expect((await sql('ventas','SELECT usos FROM codigos_promocionales WHERE codigo=$1',[cupom]))[0].usos).toBe(1);
  });
  it('outbox publica y la proyección QR converge, sin afirmar disponibilidad inmediata', async () => {
    await procesos.esperar(async()=> (await sql('acceso-qr','SELECT count(*)::int n FROM qr_entradas WHERE evento_id=$1',[evento]))[0].n===2);
    expect((await sql('ventas','SELECT count(*)::int n FROM eventos_salientes WHERE publicado_en IS NULL'))[0].n).toBe(0);
  });
  it('reconecta una sola conexión AMQP y recupera sus cinco consumidores y el outbox', async () => {
    const headers={Authorization:`Basic ${Buffer.from('cu011_e2e:cu011_e2e').toString('base64')}`};
    const r=await fetch('http://127.0.0.1:16775/api/connections',{headers});expect(r.status).toBe(200);
    const conexiones=(await r.json() as {name:string;client_properties:{connection_name?:string}}[]).filter(c=>c.client_properties.connection_name==='hexacore-boleteria');
    expect(conexiones).toHaveLength(1);
    const cerrada=await fetch('http://127.0.0.1:16775/api/connections/'+encodeURIComponent(conexiones[0].name),{method:'DELETE',headers});expect(cerrada.status).toBe(204);
    await procesos.esperar(()=> (app.procesos[0].salida.match(/Conectado a RabbitMQ/g)||[]).length===2);
    await procesos.esperar(async()=>{const m=await procesos.metricasRabbit();return m.conexiones===1&&m.consumidores===5;});
    const c=await comprar();
    await procesos.esperar(async()=> (await sql('acceso-qr','SELECT count(*)::int n FROM qr_entradas WHERE entrada_id=$1',[c.entradas[0].id]))[0].n===1);
    expect((await procesos.metricasRabbit()).consumidores).toBe(5);
  });
  it('cotiza cancelación parcial de compra y ejecuta un reembolso real', async () => {
    const entrada=compra.entradas[0];
    const q=await pedir('ventas','POST',`/compras/${compra.id}/cancelacion/cotizacion`,vendedor,{entradaIds:[entrada.id]});
    expect(q.status).toBe(200);expect(q.body.montoReembolso).toBe(90000);
    const cancelada=await pedir('ventas','POST',`/compras/${compra.id}/cancelaciones`,vendedor,{entradaIds:[entrada.id],motivo:'Cancelación E2E',montoAceptado:90000});
    expect(cancelada.status).toBe(200);expect(cancelada.body.estado).toBe('APROBADA');
    expect((await sql('ventas','SELECT estado FROM entradas WHERE id=$1',[entrada.id]))[0].estado).toBe('ANULADA');
    expect((await sql('pagos',"SELECT count(*)::int n FROM transacciones_pago WHERE tipo='REEMBOLSO' AND referencia=$1",[cancelada.body.referenciaReembolso]))[0].n).toBe(1);
  });
  it('reservas concurrentes por dos cupos nunca sobrevenden', async () => {
    const rs=await Promise.all(Array.from({length:8},()=>pedir('ventas','POST','/compras',vendedor,{localidadId:localidadCarrera,cantidad:1})));
    expect(rs.filter(r=>r.status===201)).toHaveLength(2);expect(rs.filter(r=>r.status===409)).toHaveLength(6);
    const [c]=await sql('ventas','SELECT vendidas,reservadas,aforo FROM localidades_evento WHERE localidad_id=$1',[localidadCarrera]);
    expect(c.vendidas+c.reservadas).toBe(c.aforo);
  });
  it('una publicación de reventa concurrente tiene un solo checkout ganador', async () => {
    nuevaCompra=await comprar();
    const p=await pedir('postventa','POST','/reventa/publicaciones',vendedor,{entradaId:nuevaCompra.entradas[0].id,precio:110000});
    expect(p.status).toBe(201);publicacion=p.body;
    const usuarios=Array.from({length:8},()=>randomUUID());
    const rs=await Promise.all(usuarios.map(async id=>({id,...await pedir('postventa','POST',`/reventa/publicaciones/${publicacion.id}/checkout`,id)})));
    expect(rs.filter(r=>r.status===201)).toHaveLength(1);expect(rs.filter(r=>r.status===409)).toHaveLength(7);
    const g=rs.find(r=>r.status===201)!;checkout=g.body;ganador=g.id;
  });
  it('paga reventa, transfiere propietario y rota QR conservando auditoría', async () => {
    const p=await pedir('postventa','POST',`/reventa/checkout/${checkout.id}/pagar`,ganador,{metodoPago:'TARJETA',token:'tok_ok_boleteria'});
    expect(p.status).toBe(200);transferencia=p.body;expect(transferencia.transferida).toBe(true);
    expect(transferencia.codigoQr).not.toBe(nuevaCompra.entradas[0].codigoQr);
    const [e]=await sql('ventas','SELECT propietario_id,codigo_qr FROM entradas WHERE id=$1',[transferencia.entradaId]);
    expect(e.propietario_id).toBe(ganador);expect(e.codigo_qr).toBe(transferencia.codigoQr);
    expect((await sql('ventas','SELECT count(*)::int n FROM historial_propietarios WHERE entrada_id=$1',[transferencia.entradaId]))[0].n).toBe(2);
    const movimientos=(await sql('pagos','SELECT count(*)::int n FROM transacciones_pago'))[0].n;
    expect((await pedir('postventa','POST',`/reventa/checkout/${checkout.id}/pagar`,ganador,{metodoPago:'TARJETA',token:'tok_ok_boleteria'})).status).toBe(409);
    expect((await sql('pagos','SELECT count(*)::int n FROM transacciones_pago'))[0].n).toBe(movimientos);
  });
  it('tras converger la proyección rechaza QR anterior y doble ingreso concurrente', async () => {
    const inicio=Date.now();
    const inmediata=await sql('acceso-qr','SELECT hash_qr,estado FROM qr_entradas WHERE entrada_id=$1',[transferencia.entradaId]);
    console.log('Observación QR tras transferencia:',JSON.stringify({proyeccionInmediata:inmediata[0]?.hash_qr===hash(transferencia.codigoQr),entradaId:transferencia.entradaId}));
    await procesos.esperar(async()=> (await sql('acceso-qr','SELECT hash_qr FROM qr_entradas WHERE entrada_id=$1',[transferencia.entradaId]))[0]?.hash_qr===hash(transferencia.codigoQr));
    console.log('Convergencia QR observada (ms):',Date.now()-inicio);
    expect((await pedir('acceso-qr','POST','/ingresos',portero,{eventoId:evento,codigoQr:nuevaCompra.entradas[0].codigoQr})).status).toBe(404);
    const rs=await Promise.all(Array.from({length:2},()=>pedir('acceso-qr','POST','/ingresos',portero,{eventoId:evento,codigoQr:transferencia.codigoQr})));
    expect(rs.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await sql('acceso-qr','SELECT count(*)::int n FROM ingresos WHERE entrada_id=$1',[transferencia.entradaId]))[0].n).toBe(1);
    await procesos.esperar(async()=> (await sql('ventas','SELECT estado FROM entradas WHERE id=$1',[transferencia.entradaId]))[0].estado==='USADA');
  });
  it('cron real libera una reserva vencida; las rutas internas siguen protegidas', async () => {
    const r=await pedir('ventas','POST','/compras',vendedor,{localidadId:localidad,cantidad:1});expect(r.status).toBe(201);
    await sql('ventas',"UPDATE compras SET expira_en=now()-interval '1 minute' WHERE id=$1",[r.body.id]);
    await procesos.esperar(async()=> (await sql('ventas','SELECT estado FROM compras WHERE id=$1',[r.body.id]))[0].estado==='EXPIRADA');
    expect((await pedir('ventas','GET',`/interno/entradas/de/${vendedor}`)).status).toBe(401);
    expect((await pedir('acceso-qr','POST','/ingresos',vendedor,{eventoId:evento,codigoQr:'inventado'})).status).toBe(403);
  });
  it('el scheduler único expira la publicación y devuelve la entrada mediante la API local de servicio', async () => {
    const c = await comprar();
    const p = await pedir('postventa','POST','/reventa/publicaciones',vendedor,{entradaId:c.entradas[0].id,precio:100000});
    expect(p.status).toBe(201);
    await sql('postventa',"UPDATE publicaciones_reventa SET fecha_expiracion=now()-interval '1 minute' WHERE id=$1",[p.body.id]);
    await procesos.esperar(async()=> (await sql('postventa','SELECT estado FROM publicaciones_reventa WHERE id=$1',[p.body.id]))[0].estado==='EXPIRADA');
    const antes = Date.now();
    console.log('Estado de entrada al observar publicación EXPIRADA:', (await sql('ventas','SELECT estado FROM entradas WHERE id=$1',[c.entradas[0].id]))[0].estado);
    // Saga entre bases: EXPIRADA se escribe antes de devolver la entrada.
    await procesos.esperar(async()=> (await sql('ventas','SELECT estado FROM entradas WHERE id=$1',[c.entradas[0].id]))[0].estado==='VALIDA');
    console.log('Finalización observada de devolución (ms):', Date.now()-antes);
    expect((await sql('ventas','SELECT estado FROM entradas WHERE id=$1',[c.entradas[0].id]))[0].estado).toBe('VALIDA');
  });
  it('aplica el reembolso temporal parcial existente y deja el movimiento real', async () => {
    const c = await comprar();
    await sql('ventas',"UPDATE eventos_referencia SET fecha_inicio=now()+interval '4 days' WHERE evento_id=$1",[evento]);
    const q = await pedir('ventas','POST',`/compras/${c.id}/cancelacion/cotizacion`,vendedor,{});
    expect(q.status).toBe(200);expect(q.body.parcial).toBe(true);expect(q.body.porcentajeReembolso).toBe(50);expect(q.body.montoReembolso).toBe(50000);
    const r = await pedir('ventas','POST',`/compras/${c.id}/cancelaciones`,vendedor,{motivo:'Reembolso parcial E2E',montoAceptado:50000});
    expect(r.status).toBe(200);expect(r.body.estado).toBe('APROBADA');
    expect((await sql('pagos',"SELECT monto::numeric FROM transacciones_pago WHERE tipo='REEMBOLSO' AND referencia=$1",[r.body.referenciaReembolso]))[0].monto).toBe('50000.00');
  });
  it('revocación compartida bloquea todas las rutas privadas de los componentes', async () => {
    await redis.set(`sesion-revocada:${sesion(vendedor).jti}`,'1','EX',300);
    for(const [n,ruta] of [['ventas','/compras'],['postventa','/reventa/mis-entradas'],['cola-virtual',`/cola/eventos/${evento}`]]) {
      expect((await pedir(n,'GET',ruta,vendedor)).status).toBe(401);
    }
  });
});
