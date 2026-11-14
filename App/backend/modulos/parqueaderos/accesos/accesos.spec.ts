import { QueryFailedError } from 'typeorm';
import { AccesosService } from './accesos.service';

describe('Autorización de reenvíos offline concurrentes', () => {
  it('no devuelve una estancia de otro evento cuando el ID se ocupa entre lectura e inserción', async () => {
    const datos = {
      query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'estancia-ajena', eventoId: 'evento-ajeno' }]),
      transaction: jest.fn().mockRejectedValue(new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate'), { code: '23505', constraint: 'UQ_estancias_registro_local' }))),
    };
    const eventos = { detalle: jest.fn().mockResolvedValue({ evento: { estado: 'PUBLICADO', fechaFin: new Date(Date.now() + 3600000) } }) };
    type Args = ConstructorParameters<typeof AccesosService>;
    const ocupacion = { recomendacion: jest.fn() };
    const servicio = new AccesosService(datos as unknown as Args[0], eventos as unknown as Args[1], ocupacion as unknown as Args[2], {} as Args[3], {} as Args[4]);
    await expect(servicio.registrarIngreso('evento-propio', { placa: 'PRUEBA1', registroLocalId: 'id-local' }, 'actor'))
      .rejects.toMatchObject({ response: { codigo: 'REGISTRO_LOCAL_INCOMPATIBLE' }, status: 409 });
    expect(datos.query).toHaveBeenCalledTimes(2);
    expect(ocupacion.recomendacion).not.toHaveBeenCalled();
  });
});
