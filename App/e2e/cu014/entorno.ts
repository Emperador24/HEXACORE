import { APIRequestContext, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { crearEvento, gateway, loginAPI } from '../cu015/entorno';
export const h=(token:string,id?:string)=>({Authorization:`Bearer ${token}`,...(id?{'Idempotency-Key':id}:{})});
export async function entornoEntrega(api:APIRequestContext,codigo='CU014'){
 const organizador=await loginAPI(api,'organizador@hexacore.com'),personal=await loginAPI(api,'restaurante@hexacore.com'),cliente=await loginAPI(api,'cliente@hexacore.com');
 const nombre=`${codigo} ${randomUUID().slice(0,8)}`,evento=await crearEvento(api,organizador.token,`Evento ${nombre}`);
 const r=await api.post(`${gateway}/pedidos/admin/establecimientos`,{headers:h(organizador.token),data:{eventoId:evento.id,nombre,contacto:'Contacto CU014',puntoEntrega:`Puerta ${nombre}`,horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'}});expect(r.status()).toBe(201);const local=await r.json();
 expect((await api.put(`${gateway}/pedidos/admin/establecimientos/${local.id}/personal/${personal.usuario.id}`,{headers:h(organizador.token)})).status()).toBe(200);
 const alta=await api.post(`${gateway}/pedidos/establecimientos/${local.id}/productos`,{headers:h(personal.token,randomUUID()),data:{nombre:`Receta ${codigo}`,descripcion:'Receta acordada',precio:'1000.25',restriccionesAlimentarias:['leche'],activo:true,cantidadInicial:30}});expect(alta.status()).toBe(201);const a=await alta.json();expect(a.operacion.estado).toBe('APLICADA');
 return {organizador,personal,cliente,nombre,evento,local,producto:a.producto};
}
export async function comprar(api:APIRequestContext,e:Awaited<ReturnType<typeof entornoEntrega>>,tokenPago='tok_ok_cu014'){
 const r=await api.post(`${gateway}/pedidos/checkout`,{headers:h(e.cliente.token),data:{eventoId:e.evento.id,establecimientoId:e.local.id,metodoEntrega:'RECOGER',productos:[{productoId:e.producto.id,cantidad:1}]}});expect(r.status()).toBe(201);const p=await r.json();
 const clave=randomUUID();const pago=await api.post(`${gateway}/pedidos/${p.id}/pagos`,{headers:h(e.cliente.token,clave),data:{tokenPago}});expect(pago.status()).toBe(200);const pagado=await pago.json();expect(pagado.compraConfirmada).toBe(true);expect(pagado.codigoQr).toMatch(/^[a-f0-9]{64}$/);
 return {pedido:p,pago:pagado,clave};
}
export async function listo(api:APIRequestContext,e:Awaited<ReturnType<typeof entornoEntrega>>,pedidoId:string){
 for(const d of [{accion:'INICIAR',version:0,minutos:10},{accion:'LISTO',version:1}])expect((await api.post(`${gateway}/pedidos/establecimientos/${e.local.id}/pedidos/${pedidoId}/preparacion`,{headers:h(e.personal.token,randomUUID()),data:d})).status()).toBe(200);
}
