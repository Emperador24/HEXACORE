import { cargarConfiguracionBoleteria } from './configuracion';
import { resolve } from 'node:path';
import { cargarConfiguracion as ventas } from '../ventas/config/configuracion';
import { cargarConfiguracion as catalogo } from '../catalogo/config/configuracion';
import { cargarConfiguracion as postventa } from '../postventa/config/configuracion';
import { cargarConfiguracion as acceso } from '../acceso-qr/config/configuracion';

// Impide que el antiguo POSTGRES_BASE común mezcle las cuatro bases al arrancar.
describe('Configuración independiente de las bases de Boletería', () => {
  const claves = ['VENTAS', 'CATALOGO', 'POSTVENTA', 'ACCESO_QR'];
  const anterior = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.POSTGRES_BASE = 'base_ajena';
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = resolve(__dirname, '../../../test/claves/jwt-publica.pem');
    for (const clave of claves) delete process.env[`POSTGRES_BD_${clave}`];
  });
  afterEach(() => { process.env = { ...anterior }; });
  const bases = () => [ventas(), catalogo(), postventa(), acceso()].map(c => c.postgres.base);
  it('conserva cuatro defaults distintos aunque exista una variable genérica antigua', () => {
    expect(bases()).toEqual(['entradas_mercado_secundario', 'catalogo', 'postventa', 'acceso_qr']);
  });
  it('cada variable cambia solo la base de su componente', () => {
    claves.forEach((clave, i) => { process.env[`POSTGRES_BD_${clave}`] = `prueba_${i}`; });
    expect(bases()).toEqual(['prueba_0', 'prueba_1', 'prueba_2', 'prueba_3']);
    process.env.AUTH_JWT_EMISOR = ' hexacore-administracion ';
    const comun = cargarConfiguracionBoleteria();
    expect(comun).not.toHaveProperty('pagos');
    expect(comun.emisor).toBe('hexacore-administracion');
  });
});
