import { DataSource } from 'typeorm';
import { EvacuacionService } from './evacuacion.service';

/**
 * CU-010: si la base falla al guardar la evacuación por algo que no es "ya hay
 * una abierta", el error sube tal cual: no se disfraza de conflicto.
 */
describe('EvacuacionService · proponer', () => {
  it('un fallo inesperado al guardar se propaga sin convertirse en EVACUACION_ABIERTA', async () => {
    const zona = { id: 'a0000000-0000-4000-8000-000000000001', nombre: 'A', capacidad: 100 };
    const eventos = { detalle: jest.fn().mockResolvedValue({ evento: { estado: 'PUBLICADO' }, recinto: { id: 'r', zonas: [zona] } }) };
    const m = { query: jest.fn().mockResolvedValueOnce([{ asistentes: 0 }]).mockRejectedValueOnce(new Error('disco lleno')) };
    const servicio = new EvacuacionService(
      { transaction: jest.fn((f: (m: unknown) => unknown) => f(m)) } as unknown as DataSource,
      eventos as never, {} as never, {} as never, {} as never,
    );
    jest.spyOn(servicio as never, 'salidasDe').mockResolvedValue([{ id: 's' }] as never);
    jest.spyOn(servicio as never, 'rutasDe').mockResolvedValue([{ zonaId: zona.id }] as never);
    await expect(servicio.proponer('e', { tipo: 'INCENDIO', ubicacion: 'Cocina', nivel: 1, alcance: 'PARCIAL', zonaOrigenId: zona.id } as never, 'u'))
      .rejects.toThrow('disco lleno');
  });
});
