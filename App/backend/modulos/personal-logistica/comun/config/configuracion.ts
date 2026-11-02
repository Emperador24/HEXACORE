import { cargarClavePublica, ClavePublica } from '../../../../compartido/seguridad/clave-publica';

export const CONFIGURACION_LOGISTICA = 'CONFIGURACION_PERSONAL_LOGISTICA';
export interface ConfiguracionLogistica {
  postgres: { host: string; puerto: number; usuario: string; contrasena: string; base: string };
  jwt: ClavePublica;
  emisorTokens: string;
}

/** Conserva DB_* del servidor anterior y la base separada durante la transición. */
export function cargarConfiguracion(): ConfiguracionLogistica {
  const puerto = Number(process.env.DB_PORT || process.env.POSTGRES_PUERTO || 5432);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error('DB_PORT inválido');
  return {
    postgres: {
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost', puerto,
      usuario: process.env.DB_USER || process.env.POSTGRES_USUARIO || 'hexacore',
      contrasena: process.env.DB_PASSWORD || process.env.POSTGRES_CONTRASENA || 'hexacore',
      base: process.env.DB_NAME || 'eventos_emergencias',
    },
    jwt: cargarClavePublica(process.env.NODE_ENV === 'production'),
    emisorTokens: process.env.AUTH_JWT_EMISOR || 'hexacore-administracion',
  };
}
