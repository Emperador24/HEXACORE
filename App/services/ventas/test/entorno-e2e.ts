import { resolve } from 'node:path';

// Destinos de E2E, nunca heredar el .env de desarrollo.
// Los puertos no coinciden con los del Compose de desarrollo ni con los de pedidos-e2e.
Object.assign(process.env, {
  NODE_ENV: 'test', POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '15434',
  POSTGRES_USUARIO: 'hexacore', POSTGRES_CONTRASENA: 'hexacore', POSTGRES_BASE: 'entradas_e2e',
  REDIS_HOST: '127.0.0.1', REDIS_PUERTO: '16381',
  RABBITMQ_URL: 'amqp://hexacore:hexacore@127.0.0.1:15674',
  PASARELA_URL: 'http://127.0.0.1:13100', PASARELA_TIMEOUT_MS: '3000',
  AUTH_JWT_EMISOR: 'hexacore-administracion', PREFIJO_API: 'api/v1',
  AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: resolve(__dirname, '../../../infra/claves-desarrollo/jwt-publica.pem'),
  // La reserva debe durar mas que el timeout de la pasarela (se revisa en configuracion.ts). 
  // dos minutos y deja margen para la prueba del vencimiento
  COMPRA_RESERVA_MINUTOS: '2',
});
