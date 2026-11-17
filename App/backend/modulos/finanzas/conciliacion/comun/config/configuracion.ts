import { cargarDestinoPostgres } from '../../../../../compartido/config/postgres';
import { cargarClavePublica, ClavePublica } from '../../../../../compartido/seguridad/clave-publica';

export const CONFIGURACION_CONCILIACION = 'CONFIGURACION_CONCILIACION';
export interface ConfiguracionConciliacion {
  postgres: { host: string; puerto: number; usuario: string; contrasena: string; base: string };
  jwt: ClavePublica;
  emisorTokens: string;
  /** Cada cuánto corre el job periódico (CU-031, infraestructura no trivial). */
  intervaloBatchMs: number;
}

/** Destino compartido; la propiedad se delimita por esquema. */
export function cargarConfiguracion(): ConfiguracionConciliacion {
  return {
    postgres: cargarDestinoPostgres(),
    jwt: cargarClavePublica(process.env.NODE_ENV === 'production'),
    emisorTokens: process.env.AUTH_JWT_EMISOR || 'hexacore-administracion',
    intervaloBatchMs: Number(process.env.CONCILIACION_INTERVALO_MS) || 24 * 3_600_000,
  };
}
