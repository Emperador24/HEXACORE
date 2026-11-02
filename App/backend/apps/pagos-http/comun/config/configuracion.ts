import { cargarClavePublica } from '../../../../compartido/seguridad/clave-publica';

export const CONFIGURACION = 'CONFIGURACION_PAGOS_HTTP';

export function cargarConfiguracion() {
  const texto = (nombre: string, defecto: string) => process.env[nombre]?.trim() || defecto;
  const entero = (nombre: string, defecto: number) => {
    const n = Number(texto(nombre, String(defecto)));
    if (!Number.isInteger(n)) throw new Error(`La variable ${nombre} debe ser un entero, llegó "${process.env[nombre]}"`);
    return n;
  };
  const entorno = texto('NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(entorno)) throw new Error(`NODE_ENV inválido: "${entorno}"`);
  if (entorno === 'production' && !process.env.PASARELA_SECRETO_WEBHOOK?.trim()) {
    throw new Error('Falta la variable de entorno PASARELA_SECRETO_WEBHOOK (ver .env.example)');
  }
  return {
    entorno,
    puerto: entero('PUERTO', 3008),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    redis: { host: texto('REDIS_HOST', 'localhost'), puerto: entero('REDIS_PUERTO', 6380) },
    jwt: cargarClavePublica(entorno === 'production'),
    emisorTokens: texto('AUTH_JWT_EMISOR', 'hexacore-administracion'),
    pasarelaPagos: { secretoWebhook: texto('PASARELA_SECRETO_WEBHOOK', 'secreto-webhook-desarrollo') },
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
  };
}
export type ConfiguracionServicio = ReturnType<typeof cargarConfiguracion>;
