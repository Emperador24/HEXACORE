import { resolve } from 'node:path';

// Destinos exclusivos del Compose E2E: nunca heredar .env de desarrollo/producción.
Object.assign(process.env, {
  NODE_ENV: 'test', POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '15433',
  POSTGRES_USUARIO: 'hexacore', POSTGRES_CONTRASENA: 'hexacore', POSTGRES_BASE: 'pedidos_e2e',
  REDIS_HOST: '127.0.0.1', REDIS_PUERTO: '16380',
  RABBITMQ_URL: 'amqp://hexacore:hexacore@127.0.0.1:15673',
  PAGOS_PROVEEDOR_URL: 'http://127.0.0.1:13099', PASARELA_TIMEOUT_MS: '3000',
  AUTH_JWT_EMISOR: 'hexacore-administracion', PREFIJO_API: 'api/v1',
  AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: resolve(__dirname, '../../../infra/claves-desarrollo/jwt-publica.pem'),
});
