export const VARIABLES_POSTGRES_RETIRADAS = [
  'POSTGRES_BASE', 'POSTGRES_BD_ADMINISTRACION', 'POSTGRES_BD_PEDIDOS',
  'POSTGRES_BD_VENTAS', 'POSTGRES_BD_CATALOGO', 'POSTGRES_BD_POSTVENTA',
  'POSTGRES_BD_ACCESO_QR', 'POSTGRES_BD_PAGOS', 'DB_HOST', 'DB_PORT',
  'DB_USER', 'DB_PASSWORD', 'DB_NAME',
] as const;

/** Un único destino de proceso. Una variable antigua es un error, nunca una selección silenciosa. */
export function cargarDestinoPostgres() {
  const heredadas = VARIABLES_POSTGRES_RETIRADAS.filter(k => process.env[k] !== undefined);
  if (heredadas.length) throw new Error(`Configuración PostgreSQL retirada: ${heredadas.join(', ')}. Usa POSTGRES_BD y POSTGRES_* comunes`);
  const puerto = Number(process.env.POSTGRES_PUERTO || 5432);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error('POSTGRES_PUERTO inválido');
  const base = process.env.POSTGRES_BD?.trim() || 'hexacore';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(base)) throw new Error('POSTGRES_BD inválida');
  if (process.env.NODE_ENV === 'production' && !process.env.POSTGRES_CONTRASENA?.trim()) throw new Error('POSTGRES_CONTRASENA es obligatoria');
  return { host: process.env.POSTGRES_HOST?.trim() || 'localhost', puerto,
    usuario: process.env.POSTGRES_USUARIO?.trim() || 'hexacore',
    contrasena: process.env.POSTGRES_CONTRASENA || 'hexacore', base };
}
