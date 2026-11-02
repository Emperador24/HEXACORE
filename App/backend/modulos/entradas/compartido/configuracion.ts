import { cargarConfiguracionProceso } from '../../../compartido/config/configuracion';
import { cargarClavePublica } from '../../../compartido/seguridad/clave-publica';
export const CONFIGURACION_BOLETERIA = 'CONFIGURACION_BOLETERIA';
export function cargarConfiguracionBoleteria() {
  const proceso = cargarConfiguracionProceso('boleteria');
  return {
    proceso,
    reventa: {
      bloqueoTtlSegundos: Number(
        process.env.REVENTA_BLOQUEO_TTL_SEGUNDOS?.trim() || 120,
      ),
    },
    jwt: cargarClavePublica(proceso.entorno === 'production'),
    emisor: process.env.AUTH_JWT_EMISOR?.trim() || 'hexacore-administracion',
    pagos: {
      url: process.env.PAGOS_URL?.trim() || 'http://localhost:3008/api/v1',
      timeoutMs: Number(process.env.PAGOS_TIMEOUT_MS?.trim() || 12000),
    },
  };
}
export type ConfiguracionBoleteria = ReturnType<
  typeof cargarConfiguracionBoleteria
>;
