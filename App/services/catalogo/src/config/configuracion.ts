/**
 * Configuración del Catálogo, leída del entorno y validada al arrancar.
 *
 * Se valida en el arranque y no en el primer uso: un servicio mal configurado
 * debe negarse a arrancar, no fallar luego con una consulta a medias.
 *
 * Es notablemente más corta que la de `entradas-mercado-secundario`, y esa es
 * la señal de que la separación de ADR-14 vale: la cartelera no necesita
 * Redis, ni la pasarela de pagos, ni el broker, ni las reglas de reventa.
 */

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example)`);
  }
  return valor.trim();
}

function texto(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === '' ? porDefecto : valor.trim();
}

function entero(nombre: string, porDefecto: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n)) {
    throw new Error(`La variable ${nombre} debe ser un entero, llegó "${valor}"`);
  }
  return n;
}

export type Entorno = 'development' | 'test' | 'production';

export interface ConfiguracionServicio {
  entorno: Entorno;
  puerto: number;
  /** Prefijo de todas las rutas; el API Gateway (ADR-02) enruta por él. */
  prefijoApi: string;
  postgres: {
    host: string;
    puerto: number;
    usuario: string;
    contrasena: string;
    base: string;
  };
}

export const CONFIGURACION = Symbol('CONFIGURACION');

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;

  return {
    entorno,
    puerto: entero('PUERTO', 3004),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      // En producción no hay contraseña por defecto que valga.
      contrasena:
        entorno === 'production' ? requerido('POSTGRES_CONTRASENA') : texto('POSTGRES_CONTRASENA', 'hexacore'),
      base: texto('POSTGRES_BASE', 'catalogo'),
    },
  };
}
