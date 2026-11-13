import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsultarCarteleraDto } from './cartelera.dto';

describe('Filtros de Cartelera antes de alcanzar PostgreSQL', () => {
  it.each(['categoria', 'ciudad', 'artista'])('rechaza NUL en %s sin ejecutar una consulta', async campo => {
    const dto = plainToInstance(ConsultarCarteleraDto, { [campo]: 'Ensayo\u0000texto' });
    const errores = await validate(dto);
    expect(errores.map(e => e.property)).toContain(campo);
  });
  it('conserva Unicode, apóstrofos y texto legítimo', async () => {
    const dto = plainToInstance(ConsultarCarteleraDto, { categoria: 'Música', ciudad: 'Bogotá', artista: "O’Connor O'Connor 🎵" });
    expect(await validate(dto)).toEqual([]);
  });
  it('conserva filtros opcionales vacíos', async () => {
    const dto = plainToInstance(ConsultarCarteleraDto, { categoria: ' ', ciudad: '', artista: ' ' });
    expect(await validate(dto)).toEqual([]);
  });
});
