import { ESPACIOS_ADMITIDOS, errorPlaca, normalizarPlaca } from '../comun/vehiculos';
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

  it('cada vehículo ocupa solo espacios de su tipo', () => {
    expect(ESPACIOS_ADMITIDOS).toEqual({ AUTOMOVIL: ['AUTOMOVIL'], MOTO: ['MOTO'], DISCAPACIDAD: ['DISCAPACIDAD'] });
  });

  it.each([
    ['ABC123', 'AUTOMOVIL', true], ['ABC123', 'DISCAPACIDAD', true], ['ABC12D', 'MOTO', true],
    ['ABC12D', 'AUTOMOVIL', false], ['ABC123', 'MOTO', false], ['AB1234', 'AUTOMOVIL', false],
    ['ABCD12', 'MOTO', false], ['ABC1234', 'AUTOMOVIL', false],
  ] as const)('placa %s para %s: %s', (placa, tipo, valida) => {
    expect(errorPlaca(placa, tipo) === null).toBe(valida);
  });

  it('normaliza guiones, espacios y minúsculas antes de validar', () => {
    expect(normalizarPlaca(' abc-12d ')).toBe('ABC12D');
    expect(errorPlaca(normalizarPlaca('abc 123'), 'AUTOMOVIL')).toBeNull();
  });
});
