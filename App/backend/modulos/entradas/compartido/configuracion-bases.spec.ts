import { cargarConfiguracionBoleteria } from './configuracion';
import { resolve } from 'node:path';
import { cargarConfiguracion as ventas } from '../ventas/config/configuracion';
import { cargarConfiguracion as catalogo } from '../catalogo/config/configuracion';
import { cargarConfiguracion as postventa } from '../postventa/config/configuracion';
import { cargarConfiguracion as acceso } from '../acceso-qr/config/configuracion';
import { VARIABLES_POSTGRES_RETIRADAS } from '../../../compartido/config/postgres';

describe('Destino único de Boletería, sin variables heredadas', () => {
  const anterior = { ...process.env };
  beforeEach(() => {
    VARIABLES_POSTGRES_RETIRADAS.forEach(k=>delete process.env[k]);
    process.env.NODE_ENV='test';process.env.POSTGRES_BD='hexacore_prueba';
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO=resolve(__dirname,'../../../test/claves/jwt-publica.pem');
  });
  afterEach(()=>{process.env={...anterior};});
  it('todos los componentes usan el mismo destino y conservan su configuración de negocio',()=>{
    expect([ventas(),catalogo(),postventa(),acceso()].map(c=>c.postgres.base)).toEqual(Array(4).fill('hexacore_prueba'));
    process.env.AUTH_JWT_EMISOR=' hexacore-administracion ';
    expect(cargarConfiguracionBoleteria()).not.toHaveProperty('pagos');
    expect(cargarConfiguracionBoleteria().emisor).toBe('hexacore-administracion');
  });
  it.each(VARIABLES_POSTGRES_RETIRADAS)('rechaza el destino heredado %s en todos los componentes',clave=>{
    process.env[clave]='base_anterior';
    for(const cargar of [ventas,catalogo,postventa,acceso])expect(cargar).toThrow('Configuración PostgreSQL retirada');
  });
});
