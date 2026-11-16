import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { EstadoEvento } from '../persistencia/entidades/evento.entity';
import { BandejaEventos } from './bandeja-eventos.service';
import { EventosService } from './eventos.service';

/**
 * Las validaciones de CU-026 que la API no deja alcanzar porque el DTO ya las
 * filtra antes; el servicio las repite porque también lo llaman otros módulos.
 */
describe('EventosService (CU-026, defensas del servicio)', () => {
  const servicio = (datos: Partial<DataSource> = {}) => new EventosService(datos as DataSource, {} as BandejaEventos);
  const horario = (s: EventosService, a: string, b: string) => (s as unknown as { horario(a: string, b: string): unknown }).horario(a, b);
  const codigo = (f: () => unknown) => {
    try { f(); } catch (e) { return ((e as BadRequestException).getResponse() as { codigo?: string; message?: string }).codigo ?? 'SIN_CODIGO'; }
    return null;
  };

  it('el horario debe ser ISO, terminar después de empezar y durar como mucho 30 días', () => {
    const s = servicio();
    expect(codigo(() => horario(s, 'mañana', '2027-01-01T00:00:00Z'))).toBe('SIN_CODIGO');
    expect(codigo(() => horario(s, '2027-01-02T00:00:00Z', '2027-01-01T00:00:00Z'))).toBe('HORARIO_INVALIDO');
    expect(codigo(() => horario(s, '2027-01-01T00:00:00Z', '2027-03-01T00:00:00Z'))).toBe('HORARIO_INVALIDO');
    expect(horario(s, '2027-01-01T00:00:00Z', '2027-01-01T05:00:00Z')).toEqual({
      fechaInicio: new Date('2027-01-01T00:00:00Z'), fechaFin: new Date('2027-01-01T05:00:00Z'),
    });
  });

  it('el listado rechaza un estado que no existe', async () => {
    await expect(servicio().listar('ARCHIVADO')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paso 7: no publica un borrador incompleto y dice qué falta', async () => {
    const m = { find: jest.fn().mockResolvedValue([]) };
    const s = servicio({ transaction: jest.fn((f: (m: unknown) => unknown) => f(m)) as never });
    jest.spyOn(s as never, 'bloquearEvento').mockResolvedValue({ estado: EstadoEvento.BORRADOR, nombre: ' ', categoria: '' } as never);
    await expect(s.publicar('e', 1, 'u')).rejects.toMatchObject({
      response: { codigo: 'EVENTO_INCOMPLETO', campos: ['nombre', 'categoría', 'tipos de entrada'] },
    });
  });

  it('la bandeja de salida no revienta si la base falla: deja el envío para el siguiente ciclo', async () => {
    const bandeja = new BandejaEventos(
      { transaction: jest.fn().mockRejectedValue(new Error('base caída')) } as unknown as DataSource,
      { obtenerCanal: () => ({}) } as unknown as ConexionRabbitMq,
    );
    await expect(bandeja.publicarPendientes()).resolves.toBe(0);
    await expect(bandeja.publicarPendientes()).resolves.toBe(0);
  });
});
