import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsultaPersonal } from '../../identidad/consulta-personal.module';
import { EstadoEstablecimiento, Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { GuardarEstablecimientoDto } from './guardar-establecimiento.dto';
import { EstablecimientosController } from './establecimientos.controller';
import { enHorario, recibePedidos } from './horario';
import { PersonalDelEstablecimiento } from './personal-establecimiento.module';

const datos = { eventoId: 'e0000001-0000-4000-8000-000000000001', nombre: ' La   Sazón ',
  contacto: '  contacto@example.test ', puntoEntrega: ' Puerta 1 ', estado: 'DISPONIBLE',
  horaApertura: '08:00', horaCierre: '22:00', zonaHoraria: 'America/Bogota' };
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validar = (d: unknown) => pipe.transform(d, { type: 'body', metatype: GuardarEstablecimientoDto });

describe('CU-015: validación y autorización', () => {
  it('normaliza espacios y exige los roles administrativos en backend', async () => {
    expect(await validar(datos)).toMatchObject({ nombre: 'La Sazón', contacto: 'contacto@example.test' });
    expect(Reflect.getMetadata('roles-permitidos', EstablecimientosController)).toEqual(['Organizador', 'Administrador']);
  });
  it.each([{ nombre: ' ' }, { contacto: '' }, { puntoEntrega: null }, { eventoId: 'inventado' },
    { horaApertura: '24:00' }, { horaCierre: '12:60' }, { estado: 'ABIERTO' }, { nombre: 123 },
    { usuarioId: 'intruso' }, { precio: '1' }, { zonaHoraria: '' }])('rechaza datos inválidos %j', async cambio => {
    await expect(validar({ ...datos, ...cambio })).rejects.toMatchObject({ status: 400 });
  });

  it('Personal exige vínculo y cuenta activa; revocar el vínculo corta acceso', async () => {
    const existsBy = jest.fn().mockResolvedValue(false);
    const cuenta = { esPersonalActivo: jest.fn().mockResolvedValue(true) };
    const guard = new PersonalDelEstablecimiento({ getRepository: () => ({ existsBy }) } as unknown as DataSource, cuenta as unknown as ConsultaPersonal);
    const r = { params: { establecimientoId: datos.eventoId }, sesion: { usuarioId: 'persona' } };
    const ctx = { switchToHttp: () => ({ getRequest: () => r }) } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    existsBy.mockResolvedValue(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    cuenta.esPersonalActivo.mockResolvedValue(false);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    r.params.establecimientoId = 'invalido';
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 400 });
  });
});

describe('Horario diario, instante UTC y zona IANA', () => {
  const local = { horaApertura: '08:00:00', horaCierre: '22:00:00', zonaHoraria: 'America/Bogota' };
  it.each([
    ['2026-11-07T12:59:59Z', false], ['2026-11-07T13:00:00Z', true],
    ['2026-11-08T02:59:59Z', true], ['2026-11-08T03:00:00Z', false],
  ])('evalúa límites en Bogotá: %s', (fecha, esperado) => {
    expect(enHorario(local, new Date(fecha))).toBe(esperado);
  });
  it('cruza medianoche con cierre exclusivo', () => {
    const nocturno = { ...local, horaApertura: '22:00', horaCierre: '02:00' };
    expect(enHorario(nocturno, new Date('2026-11-08T04:00:00Z'))).toBe(true);
    expect(enHorario(nocturno, new Date('2026-11-08T06:59:59Z'))).toBe(true);
    expect(enHorario(nocturno, new Date('2026-11-08T07:00:00Z'))).toBe(false);
  });
  it('horas iguales admiten 24 h; estado no disponible impide pedidos', () => {
    const continuo = { ...local, horaApertura: '00:00', horaCierre: '00:00' };
    expect(enHorario(continuo)).toBe(true);
    for (const estado of [EstadoEstablecimiento.CERRADO, EstadoEstablecimiento.SATURADO, EstadoEstablecimiento.DESHABILITADO]) {
      expect(recibePedidos({ ...continuo, estado } as Establecimiento)).toBe(false);
    }
  });
  it('respeta el salto estacional de la zona sin depender del TZ del proceso', () => {
    const ny = { horaApertura: '01:30', horaCierre: '02:00', zonaHoraria: 'America/New_York' };
    expect(enHorario(ny, new Date('2026-11-01T05:45:00Z'))).toBe(true);
    expect(enHorario(ny, new Date('2026-11-01T06:45:00Z'))).toBe(true);
    expect(enHorario(ny, new Date('2026-11-01T07:00:00Z'))).toBe(false);
  });
});
