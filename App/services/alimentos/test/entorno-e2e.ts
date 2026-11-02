import { resolve } from 'node:path';

// Destinos fijos del proyecto hexacore-cu011-e2e. Sobrescribir antes de importar
// AppModule/DataSource: dotenv no puede redirigir esta suite al ambiente habitual.
Object.assign(process.env, {
  NODE_ENV: 'test', PUERTO: '13087', POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '15435',
  POSTGRES_USUARIO: 'cu011_e2e', POSTGRES_CONTRASENA: 'cu011_e2e',
  POSTGRES_BD_PEDIDOS: 'alimentos_cu011_e2e',
  POSTGRES_MAX_CONEXIONES: '4', POSTGRES_ESPERA_MAXIMA_MS: '3000',
  REDIS_HOST: '127.0.0.1', REDIS_PUERTO: '16382',
  RABBITMQ_URL: 'amqp://cu011_e2e:cu011_e2e@127.0.0.1:15675/cu011',
  PAGOS_URL: 'http://127.0.0.1:13088/api/v1', PAGOS_TIMEOUT_MS: '5000',
  AUTH_JWT_EMISOR: 'hexacore-administracion', PREFIJO_API: 'api/v1',
  AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: resolve(__dirname, 'claves/jwt-publica.pem'),
});
