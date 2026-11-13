import { DataSource } from 'typeorm';
import { RecintosService } from './recintos.service';

/** CU-029: el plano se valida por tamaño y por los primeros bytes, no por lo que diga el navegador. */
describe('RecintosService · plano', () => {
  const servicio = new RecintosService({} as DataSource);
  const firma = (mimetype: string, bytes: number[]) =>
    (servicio as unknown as { firmaValida(a: unknown): boolean }).firmaValida({ mimetype, buffer: Buffer.from([...bytes, ...new Array(12).fill(0)]) });

  it('rechaza un plano de más de 1,5 MB', async () => {
    await expect(servicio.subirPlano('r', { mimetype: 'image/png', size: 2_000_000, buffer: Buffer.alloc(0) } as never))
      .rejects.toMatchObject({ response: { codigo: 'PLANO_GRANDE' } });
  });

  it('reconoce JPG y WebP por su firma y rechaza lo demás', () => {
    expect(firma('image/jpeg', [0xff, 0xd8, 0xff])).toBe(true);
    expect(firma('image/jpeg', [0x89, 0x50, 0x4e])).toBe(false);
    const webp = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')];
    expect(firma('image/webp', webp)).toBe(true);
    expect(firma('image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')])).toBe(false);
    expect(firma('image/gif', [...Buffer.from('GIF89a')])).toBe(false);
  });
});
