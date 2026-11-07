import { cargarDestinoPostgres } from '../../../../compartido/config/postgres';
import { cargarClavePublica, ClavePublica } from '../../../../compartido/seguridad/clave-publica';

export const CONFIGURACION_PARQUEADEROS = 'CONFIGURACION_PARQUEADEROS';
export interface ConfiguracionParqueaderos {
  postgres: { host: string; puerto: number; usuario: string; contrasena: string; base: string };
  jwt: ClavePublica;
  emisorTokens: string;
}

/** Destino compartido; la propiedad se delimita por esquema. */
export function cargarConfiguracion(): ConfiguracionParqueaderos {
  return {
    postgres: cargarDestinoPostgres(),
    jwt: cargarClavePublica(process.env.NODE_ENV === 'production'),
    emisorTokens: process.env.AUTH_JWT_EMISOR || 'hexacore-administracion',
  };
}
