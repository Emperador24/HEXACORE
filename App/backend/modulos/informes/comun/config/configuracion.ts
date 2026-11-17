import { cargarClavePublica, ClavePublica } from '../../../../compartido/seguridad/clave-publica';

export const CONFIGURACION_INFORMES = 'CONFIGURACION_INFORMES';

/**
 * Informes (CU-032) no tiene esquema propio: solo lee, por interfaz local,
 * lo que ya existe en Eventos, Parqueaderos, Personal/Logística y Operación.
 * Por eso su configuración no lleva `postgres`, a diferencia del resto.
 */
export interface ConfiguracionInformes {
  jwt: ClavePublica;
  emisorTokens: string;
}

export function cargarConfiguracion(): ConfiguracionInformes {
  return {
    jwt: cargarClavePublica(process.env.NODE_ENV === 'production'),
    emisorTokens: process.env.AUTH_JWT_EMISOR || 'hexacore-administracion',
  };
}
