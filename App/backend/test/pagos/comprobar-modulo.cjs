'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
// Conexión fija al proyecto exclusivo. No se acepta una base del entorno habitual.
Object.assign(process.env, { NODE_ENV: 'test', POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '15435', POSTGRES_USUARIO: 'cu011_e2e', POSTGRES_CONTRASENA: 'cu011_e2e', POSTGRES_BD_PAGOS: 'pagos_e2e', POSTGRES_BASE: 'base_ajena_no_usar', AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: '/clave-que-no-existe', REDIS_PUERTO: '1', RABBITMQ_URL: 'amqp://127.0.0.1:1' });
const { NestFactory, ModulesContainer } = require('@nestjs/core');
const { getDataSourceToken } = require('@nestjs/typeorm');
const { PagosModule, PagosService } = require('../../dist/modulos/finanzas/pagos');
(async () => {
  assert.equal(process.version, 'v22.22.3');
  const app = await NestFactory.createApplicationContext(PagosModule, { logger: ['error'] });
  try {
    assert.ok(app.get(PagosService));
    for (const modulo of app.get(ModulesContainer).values()) assert.equal(modulo.controllers.size, 0, 'El módulo reutilizable publica controladores');
    const datos = app.get(getDataSourceToken('finanzas-pagos'));
    assert.notEqual(getDataSourceToken('finanzas-pagos'), getDataSourceToken());
    assert.throws(() => app.get(getDataSourceToken()), /could not find/i);
    assert.equal(datos.options.name, 'finanzas-pagos');
    assert.equal(datos.options.synchronize, false);
    assert.equal(datos.options.migrationsRun, false);
    assert.equal((await datos.query('SELECT current_database() AS base'))[0].base, 'pagos_e2e');
    console.log('Módulo real: cero controladores, sin JWT/Redis/AMQP, conexión finanzas-pagos y base exclusiva correctas.');
  } finally {
    await app.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
