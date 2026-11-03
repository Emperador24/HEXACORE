const assert = require('node:assert/strict');
const {resolve} = require('node:path');
const fs=require('node:fs');
const metadatos=resolve(__dirname,'../../.evidencia-e2e/base-unica.json');
const ESQUEMAS = { identidad:'identidad', alimentos:'alimentos', logistica:'personal_logistica',
  ventas:'entradas_ventas', catalogo:'entradas_catalogo', postventa:'entradas_postventa',
  'acceso-qr':'entradas_acceso_qr', acceso:'entradas_acceso_qr', pagos:'finanzas_pagos',libro:'finanzas_pagos',
  eventos:'eventos_recintos' };
for(const esquema of Object.values(ESQUEMAS))ESQUEMAS[esquema]=esquema;
const base = process.env.POSTGRES_BD_PRUEBAS || 'hexacore_e2e';
assert.ok(['hexacore_e2e','hexacore_vacia_e2e','hexacore_publicadas_e2e'].includes(base),'Solo bases exclusivas permitidas');
const proyecto={hexacore_e2e:'hexacore-base-unica-e2e',hexacore_vacia_e2e:'hexacore-base-vacia-e2e',hexacore_publicadas_e2e:'hexacore-publicadas-e2e'}[base];
if(base==='hexacore_publicadas_e2e')process.env.RABBITMQ_NODO_PRUEBAS='publicadas-e2e';
if(base==='hexacore_e2e'&&fs.existsSync(metadatos))process.env.RABBITMQ_NODO_PRUEBAS=JSON.parse(fs.readFileSync(metadatos,'utf8')).nodoRabbit;
if(base==='hexacore_vacia_e2e')process.env.RABBITMQ_NODO_PRUEBAS='base-vacia-e2e';
const retiradas = ['POSTGRES_BASE','DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME',
  ...['ADMINISTRACION','PEDIDOS','VENTAS','CATALOGO','POSTVENTA','ACCESO_QR','PAGOS'].map(k=>'POSTGRES_BD_'+k)];
function entorno() {
  const e={...process.env};for(const k of retiradas)delete e[k];
  return {...e,NODE_ENV:'test',POSTGRES_HOST:'127.0.0.1',POSTGRES_PUERTO:'15439',POSTGRES_USUARIO:'cu011_e2e',POSTGRES_CONTRASENA:'cu011_e2e',POSTGRES_BD:base,
    POSTGRES_MAX_CONEXIONES:'4',POSTGRES_ESPERA_MAXIMA_MS:'3000',PUERTO:'13087',PREFIJO_API:'api/v1',PREFIJO_COLAS:'nucleo-e2e.',
    REDIS_HOST:'127.0.0.1',REDIS_PUERTO:'16384',RABBITMQ_URL:'amqp://cu011_e2e:cu011_e2e@127.0.0.1:15679/cu011',
    PAGOS_PROVEEDOR_URL:'http://127.0.0.1:13105',PASARELA_TIMEOUT_MS:'3000',PASARELA_SECRETO_WEBHOOK:'backend-webhook-pruebas',
    AUTH_JWT_EMISOR:'hexacore-administracion',AUTH_JWT_CLAVE_PUBLICA_ARCHIVO:resolve(__dirname,'../claves/jwt-publica.pem'),AUTH_JWT_CLAVE_PRIVADA_ARCHIVO:resolve(__dirname,'../claves/jwt-privada.pem')};
}
function opcionesPg(modulo, extra={}) {
  assert.ok(ESQUEMAS[modulo],'Esquema de fixture desconocido');
  return {host:'127.0.0.1',port:15439,user:'cu011_e2e',password:'cu011_e2e',database:base,
    options:`-c search_path=${ESQUEMAS[modulo]},pg_catalog,extensiones`,...extra};
}
module.exports={ESQUEMAS,base,proyecto,entorno,opcionesPg,retiradas};
