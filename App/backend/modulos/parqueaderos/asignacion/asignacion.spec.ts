import { ESPACIOS_ADMITIDOS } from '../comun/vehiculos';
import { codigoEspacio, prefijoDe } from './asignacion.service';

describe('CU-023 · códigos y reglas de espacios', () => {
  it('el prefijo sale del nombre de la zona, sin «Zona» ni tildes', () => {
    expect(prefijoDe('Zona Norte')).toBe('N');
    expect(prefijoDe('General')).toBe('G');
    expect(prefijoDe('zona única')).toBe('U');
    expect(prefijoDe('***')).toBe('Z');
  });

  it('los códigos llevan dos cifras como mínimo', () => {
    expect([1, 9, 10, 150].map((n) => codigoEspacio('A', n))).toEqual(['A-01', 'A-09', 'A-10', 'A-150']);
  });

  it('un automóvil nunca ocupa espacios de moto ni de movilidad reducida', () => {
    expect(ESPACIOS_ADMITIDOS.AUTOMOVIL).toEqual(['AUTOMOVIL']);
    expect(ESPACIOS_ADMITIDOS.MOTO[0]).toBe('MOTO');
    expect(ESPACIOS_ADMITIDOS.DISCAPACIDAD[0]).toBe('DISCAPACIDAD');
  });
});
