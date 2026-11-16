const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {resolve}=require('node:path');
const {conectar,nucleo,backend}=require('./entorno.cjs');

function proxyRedis(redis,evalNuevo) { return new Proxy(redis,{get(t,p){if(p==='eval')return evalNuevo;const v=t[p];return typeof v==='function'?v.bind(t):v;}}); }
(async()=>{
  const c=await conectar();const {ds,redis}=c;
  let detenido=false;
  const pendientes=[];
  try {
    nucleo('parar');detenido=true;
    const [{id:actor}]=await ds.query("SELECT id FROM identidad.usuarios WHERE email='restaurante@hexacore.com'");
    const [{id:cliente}]=await ds.query("SELECT id FROM identidad.usuarios WHERE email='cliente@hexacore.com'");
    async function local() {
      const id=randomUUID(),evento=randomUUID(),recinto=randomUUID();
      await ds.query("INSERT INTO eventos_recintos.recintos(id,nombre,ciudad,capacidad) VALUES($1,$2,'Bogotá',50)",[recinto,`CU012 fallos ${recinto}`]);
      await ds.query("INSERT INTO eventos_recintos.eventos(id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por) VALUES($1,'CU012 fallos','Pruebas',$2,now()+interval '1 day',now()+interval '2 days',50,'PUBLICADO',$3)",[evento,recinto,actor]);
      await ds.query("INSERT INTO alimentos.eventos_referencia(evento_id,nombre,disponible) VALUES($1,'CU012 fallos',true)",[evento]);
      await ds.query("INSERT INTO alimentos.establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,$3,'DISPONIBLE','Punto CU012')",[id,evento,`CU012 recuperación ${id}`]);
      return {id,evento};
    }
    const servicio=new c.AjustesInventarioService(ds,redis);
    async function producto(e,n=10) {
      const op=await servicio.solicitar(e.id,actor,randomUUID(),{registro:{nombre:`Producto ${randomUUID()}`,descripcion:'Fixture propio',precio:'1000.25',restriccionesAlimentarias:[],activo:true,cantidadInicial:n}});
      assert.equal(op.estado,'APLICADA');return op.productoId;
    }
    async function cantidades(local,producto) {
      const [p]=await ds.query('SELECT cantidad_inventario FROM alimentos.productos WHERE id=$1',[producto]);
      return [p.cantidad_inventario,Number(await redis.hget(c.clavesReserva(local,'')[0],producto))];
    }

    const e=await local(),p=await producto(e);
    const perdida=new c.AjustesInventarioService(ds,proxyRedis(redis,async(...args)=>{
      await redis.eval(...args);throw new Error('Respuesta Redis perdida después de aplicar');
    }));
    const id=randomUUID();
    const op=await perdida.solicitar(e.id,actor,id,{productoId:p,delta:4,motivo:'Respuesta Redis perdida'});
    assert.equal(op.estado,'PENDIENTE');assert.deepEqual(await cantidades(e.id,p),[10,14]);
    pendientes.push({local:e.id,producto:p,id,fisico:14});
    console.log('Respuesta Redis perdida: intención PENDIENTE durable, físico sin alterar y delta Redis aplicado una vez.');

    const ea=await local(),pa=await producto(ea);
    const sinAof=new Proxy(redis,{get(t,k){if(k==='call')return async()=>[0,0];const v=t[k];return typeof v==='function'?v.bind(t):v;}});
    const aof=await new c.AjustesInventarioService(ds,sinAof).solicitar(ea.id,actor,randomUUID(),{productoId:pa,delta:2,motivo:'AOF local sin confirmar'});
    assert.equal(aof.estado,'PENDIENTE');assert.deepEqual(await cantidades(ea.id,pa),[10,12]);
    pendientes.push({local:ea.id,producto:pa,id:aof.id,fisico:12});
    console.log('AOF no confirmado: no confirma físico pese al resultado Lua; conserva intención para recuperación.');

    const er=await local(),pr=await producto(er);
    const reconectado=new Proxy(redis,{get(t,k){if(k==='call')return async(...args)=>{
      const cierre=once(t,'end');t.disconnect();await cierre;await t.connect();
      return t.call(...args);
    };const v=t[k];return typeof v==='function'?v.bind(t):v;}});
    const reconexion=await new c.AjustesInventarioService(ds,reconectado).solicitar(er.id,actor,randomUUID(),{productoId:pr,delta:2,motivo:'Reconexión entre Lua y WAITAOF'});
    assert.equal(reconexion.estado,'PENDIENTE');assert.deepEqual(await cantidades(er.id,pr),[10,12]);
    pendientes.push({local:er.id,producto:pr,id:reconexion.id,fisico:12});
    console.log('Reconexión real entre Lua y WAITAOF: no usa el offset de otra sesión; conserva intención pendiente.');

    const e2=await local(),p2=await producto(e2);
    const commitPerdido=new Proxy(ds,{get(t,k){if(k==='transaction')return async(f)=>{
      const r=await t.transaction(f);if(r===true)throw new Error('Confirmación de commit perdida');return r;
    };const v=t[k];return typeof v==='function'?v.bind(t):v;}});
    const op2=await new c.AjustesInventarioService(commitPerdido,redis).solicitar(e2.id,actor,randomUUID(),{productoId:p2,delta:3,motivo:'Commit confirmado sin respuesta'});
    assert.equal(op2.estado,'APLICADA');assert.deepEqual(await cantidades(e2.id,p2),[13,13]);
    await servicio.recuperarEstablecimiento(e2.id);assert.deepEqual(await cantidades(e2.id,p2),[13,13]);
    console.log('Confirmación SQL perdida: el registro APLICADA identifica el commit y evita repetir físico o Redis.');

    const e6=await local(),p6=await producto(e6),Redis=require('ioredis');
    const desconectado=new Redis({host:'127.0.0.1',port:16404,lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0});
    await desconectado.connect();desconectado.disconnect();
    const sinConexion=await new c.AjustesInventarioService(ds,desconectado).solicitar(e6.id,actor,randomUUID(),{productoId:p6,delta:3,motivo:'Conexión Redis interrumpida'});
    assert.equal(sinConexion.estado,'PENDIENTE');assert.deepEqual(await cantidades(e6.id,p6),[10,10]);
    pendientes.push({local:e6.id,producto:p6,id:sinConexion.id,fisico:13});
    console.log('Conexión Redis cerrada: intención conservada y existencias sin cambios hasta recuperar conectividad.');

    // Estados técnicos reales en SQL/Redis: el ajuste no usa un COUNT de ACTIVA.
    const e3=await local(),p3=await producto(e3),reserva=new c.ReservasService(redis);
    async function pedido(e,p,cantidad) {
      const pedido=randomUUID();
      await ds.query("INSERT INTO alimentos.pedidos(id,cliente_id,establecimiento_id,estado,total,moneda,metodo_entrega,expira_en) VALUES($1,$2,$3,'PENDIENTE_PAGO',$4::numeric*1000.25,'COP','RECOGER',now()+interval '10 minutes')",[pedido,cliente,e.id,cantidad]);
      await ds.query("INSERT INTO alimentos.detalles_pedido(pedido_id,producto_id,nombre_producto,precio_unitario,cantidad) VALUES($1,$2,'Snapshot propio',1000.25,$3)",[pedido,p,cantidad]);
      await ds.query("INSERT INTO alimentos.reservas_inventario(pedido_id,estado) VALUES($1,'ACTIVA')",[pedido]);
      await reserva.reservar({pedidoId:pedido,establecimientoId:e.id,productos:[{productoId:p,cantidad}],expiraEn:new Date(Date.now()+600000)});return pedido;
    }
    const liberacion=await pedido(e3,p3,4);
    await ds.query("UPDATE alimentos.pedidos SET estado='EXPIRADO',creado_en=now()-interval '20 minutes',expira_en=now()-interval '1 minute' WHERE id=$1",[liberacion]);
    await ds.query("UPDATE alimentos.reservas_inventario SET estado='LIBERACION_PENDIENTE' WHERE pedido_id=$1",[liberacion]);
    const rechazo=await servicio.solicitar(e3.id,actor,randomUUID(),{productoId:p3,delta:-7,motivo:'No retirar la liberación todavía comprometida'});
    assert.equal(rechazo.estado,'RECHAZADA');assert.deepEqual(await cantidades(e3.id,p3),[10,6]);
    await reserva.liberar(e3.id,liberacion); // Respuesta SQL de cierre aún pendiente.
    const ajuste=await servicio.solicitar(e3.id,actor,randomUUID(),{productoId:p3,delta:-8,motivo:'Liberación Redis ya aplicada'});
    assert.equal(ajuste.estado,'APLICADA');assert.deepEqual(await cantidades(e3.id,p3),[2,2]);
    await ds.query("UPDATE alimentos.reservas_inventario SET estado='LIBERADA' WHERE pedido_id=$1",[liberacion]);
    console.log('LIBERACION_PENDIENTE antes/después de Lua: respeta compromiso real y no cuenta dos veces la devolución.');

    const e4=await local(),p4=await producto(e4),pagado=await pedido(e4,p4,3),clave=randomUUID();
    const {PagosService}=require(resolve(backend,'dist/modulos/alimentos/pagos/pagos.service'));
    await ds.query("INSERT INTO alimentos.transacciones_pedido(id,pedido_id,monto,moneda,estado,referencia_pasarela) SELECT $1,id,total,moneda,'APROBADA','fixture de punto de fallo' FROM alimentos.pedidos WHERE id=$2",[clave,pagado]);
    const consumoFallido=new c.ReservasService(proxyRedis(redis,async(...args)=>{if(args.at(-1)==='CONSUMIDA')throw new Error('Consumo pendiente');return redis.eval(...args);}));
    const publicador={publicarPedidoConfirmado:async()=>{}};
    const pagos=new PagosService(ds,{},consumoFallido,publicador);
    assert.equal((await pagos.pagar(cliente,pagado,clave,'no reenviar cobro','sin token requerido por replay')).compraConfirmada,true);
    assert.equal((await ds.query('SELECT estado FROM alimentos.reservas_inventario WHERE pedido_id=$1',[pagado]))[0].estado,'CONSUMO_PENDIENTE');
    assert.deepEqual(await cantidades(e4.id,p4),[7,7]);
    assert.equal((await servicio.solicitar(e4.id,actor,randomUUID(),{productoId:p4,delta:-7,motivo:'Físico ya descontado, consumo técnico pendiente'})).estado,'APLICADA');
    await new PagosService(ds,{},reserva,publicador).pagar(cliente,pagado,clave,'no reenviar cobro','sin token requerido por replay');
    assert.deepEqual(await cantidades(e4.id,p4),[0,0]);
    console.log('CONSUMO_PENDIENTE: el físico ya estaba descontado; cerrar la marca no descuenta ni devuelve otra vez.');

    const e5=await local(),p5=await producto(e5),interrumpida=randomUUID();
    const hijo=spawn(process.execPath,[resolve(__dirname,'interrumpir.cjs'),e5.id,p5,actor,interrumpida],{stdio:['ignore','pipe','pipe']});
    let salida='';
    await new Promise((ok,fallo)=>{
      const limite=setTimeout(()=>{hijo.kill('SIGKILL');fallo(new Error('No alcanzó el punto de interrupción'));},15000);
      hijo.once('error',e=>{clearTimeout(limite);fallo(e);});
      hijo.stdout.on('data',b=>{salida+=b.toString();if(salida.includes('INTENCION_DURABLE')){clearTimeout(limite);ok();}});
      hijo.once('exit',()=>{clearTimeout(limite);if(!salida.includes('INTENCION_DURABLE'))fallo(new Error('Hijo terminó antes del punto de fallo'));});
    });
    const cierre=once(hijo,'exit');hijo.kill('SIGKILL');await cierre;
    assert.equal((await ds.query('SELECT estado FROM alimentos.operaciones_inventario WHERE id=$1',[interrumpida]))[0].estado,'PENDIENTE');
    assert.deepEqual(await cantidades(e5.id,p5),[10,10]);pendientes.push({local:e5.id,producto:p5,id:interrumpida,fisico:12});
    console.log('Proceso SIGKILL: intención confirmada antes de Lua, sin cambios parciales del físico.');

    nucleo('iniciar');detenido=false;
    // El sondeo de la aplicación real recupera todas las intenciones tras reiniciar.
    const limite=Date.now()+15000;
    for(const o of pendientes) {
      while((await ds.query('SELECT estado FROM alimentos.operaciones_inventario WHERE id=$1',[o.id]))[0].estado!=='APLICADA') {
        if(Date.now()>limite)throw new Error('El Núcleo no recuperó la intención');
        await new Promise(r=>setTimeout(r,25));
      }
      assert.deepEqual(await cantidades(o.local,o.producto),[o.fisico,o.fisico]);
      await servicio.recuperarEstablecimiento(o.local);assert.deepEqual(await cantidades(o.local,o.producto),[o.fisico,o.fisico]);
    }
    console.log('Reinicio real de Núcleo: cinco operaciones inciertas recuperadas, sin doble ajuste ni reinicializar Redis.');
  } finally { if(detenido)nucleo('iniciar');await c.cerrar(); }
})().catch(e=>{console.error(e.stack ?? e.message);process.exitCode=1;});
