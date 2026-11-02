export interface ConfiguracionProceso {
  entorno: 'development' | 'test' | 'production';
  puerto: number;
  prefijoApi: string;
  redis: { host: string; puerto: number };
  rabbitmq: { url: string };
}

export const CONFIGURACION_PROCESO = 'CONFIGURACION_PROCESO_NUCLEO';

export function cargarConfiguracionProceso(): ConfiguracionProceso {
  const entorno = process.env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(entorno)) throw new Error('NODE_ENV inválido');
  const puerto = Number(process.env.PUERTO || 3002);
  const puertoRedis = Number(process.env.REDIS_PUERTO || 6380);
  for (const valor of [puerto, puertoRedis]) {
    if (!Number.isInteger(valor) || valor < 1 || valor > 65535) throw new Error('Puerto de Núcleo/Redis inválido');
  }
  return {
    entorno: entorno as ConfiguracionProceso['entorno'], puerto,
    prefijoApi: process.env.PREFIJO_API || 'api/v1',
    redis: { host: process.env.REDIS_HOST || 'localhost', puerto: puertoRedis },
    rabbitmq: { url: process.env.RABBITMQ_URL || 'amqp://hexacore:hexacore@localhost:5672' },
  };
}
