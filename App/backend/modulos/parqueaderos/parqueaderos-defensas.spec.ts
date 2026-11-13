import { BadRequestException, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource, QueryFailedError } from 'typeorm';
import { ResultadoCobro } from '../finanzas/pagos';
import { AccesosService } from './accesos/accesos.service';
import { AsignacionService } from './asignacion/asignacion.service';
import { CobroService } from './cobro/cobro.service';
import { OcupacionService } from './ocupacion/ocupacion.service';
import { ReservasService } from './reservas/reservas.service';

/**
 * CU-021 a CU-025: las ramas que la e2e no alcanza sin provocar una carrera o
 * un fallo de infraestructura en el instante justo. Cada servicio se arma con
 * dobles y se lleva directo a la rama.
 */
const unico = (constraint: string) =>
  Object.assign(new QueryFailedError('INSERT', [], new Error('duplicada')), { driverError: { code: '23505', constraint } });
const enTransaccion = (m: unknown) => ({ transaction: jest.fn((f: (m: unknown) => unknown) => f(m)) });
const EVENTO = { evento: { estado: 'PUBLICADO', fechaFin: new Date(Date.now() + 3_600_000) } };

describe('Parqueaderos · defensas', () => {
  describe('AccesosService (CU-022)', () => {
    const armar = (datos: unknown, asignacion: Partial<AsignacionService> = {}) =>
      new AccesosService(datos as DataSource, { detalle: jest.fn().mockResolvedValue(EVENTO) } as never, {} as never, asignacion as AsignacionService, {} as never);

    it('el mismo registro sin red llega dos veces a la vez: el segundo responde el ingreso del primero', async () => {
      const servicio = armar({ transaction: jest.fn().mockRejectedValue(unico('UQ_estancias_registro_local')) });
      const porRegistro = jest.spyOn(servicio as never, 'porRegistroLocal').mockResolvedValueOnce(null as never).mockResolvedValueOnce('estancia-1' as never);
      jest.spyOn(servicio as never, 'respuestaIngreso').mockResolvedValue({ id: 'estancia-1' } as never);
      await expect(servicio.registrarIngreso('e', { placa: 'ABC123', registroLocalId: 'r1' } as never, 'u'))
        .resolves.toEqual({ id: 'estancia-1', repetida: true });
      expect(porRegistro).toHaveBeenCalledTimes(2);
    });

    it('otro fallo al registrar el ingreso no se disfraza de repetido', async () => {
      const servicio = armar({ transaction: jest.fn().mockRejectedValue(new Error('base caída')) });
      jest.spyOn(servicio as never, 'porRegistroLocal').mockResolvedValue(null as never);
      await expect(servicio.registrarIngreso('e', { placa: 'ABC123', registroLocalId: 'r1' } as never, 'u')).rejects.toThrow('base caída');
    });

    it('CU-022B: el QR de una reserva vencida no abre la barrera', async () => {
      const servicio = armar({});
      const m = { query: jest.fn().mockResolvedValue([{ eventoId: 'e', estado: 'EXPIRADA', placa: 'ABC123' }]) };
      const ingresar = (servicio as unknown as { ingresar(...a: unknown[]): Promise<unknown> }).ingresar.bind(servicio);
      await expect(ingresar(m, 'e', { codigoQr: 'hxp-1' }, 'u')).rejects.toMatchObject({ response: { codigo: 'QR_INVALIDO' } });
    });

    it('un fallo inesperado al guardar la estancia se propaga', async () => {
      const asignar = jest.fn().mockResolvedValue({ zona: { id: 'z' }, espacio: { id: 's', codigo: 'A-01' } });
      const servicio = armar({}, { asignar } as never);
      const m = { query: jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('disco lleno')) };
      const ingresar = (servicio as unknown as { ingresar(...a: unknown[]): Promise<unknown> }).ingresar.bind(servicio);
      await expect(ingresar(m, 'e', { placa: 'ABC123' }, 'u')).rejects.toThrow('disco lleno');
    });
  });

  describe('AsignacionService (CU-023)', () => {
    it('si al bajar la capacidad otro ocupó un espacio entretanto, no retira menos de lo pedido en silencio', async () => {
      const servicio = new AsignacionService({} as DataSource, {} as OcupacionService);
      const m = { query: jest.fn().mockResolvedValueOnce([{ activos: 5, maximo: 5 }]).mockResolvedValueOnce([[], 1]) };
      await expect(servicio.ajustarCapacidad(m as never, { id: 'z', nombre: 'Norte' } as never, 2))
        .rejects.toMatchObject({ response: { codigo: 'CAPACIDAD_MENOR_A_OCUPACION' } });
    });
  });

  describe('CobroService (CU-024)', () => {
    const bloquearZona = jest.fn().mockResolvedValue({ id: 'z' });

    it('elimina una zona sin historial', async () => {
      const m = { query: jest.fn().mockResolvedValueOnce([{ usadas: '0' }]).mockResolvedValueOnce([]) };
      const servicio = new CobroService(enTransaccion(m) as never, {} as never, {} as never, { bloquearZona } as never);
      await expect(servicio.eliminarZona('e', 'z')).resolves.toEqual({ eliminada: 'z' });
      expect(m.query).toHaveBeenLastCalledWith(expect.stringContaining('DELETE FROM zonas_parqueadero'), ['z']);
    });

    it('un fallo que no es nombre repetido se propaga', async () => {
      const servicio = new CobroService({} as DataSource, {} as never, {} as never, {} as never);
      const conNombreUnico = (servicio as unknown as { conNombreUnico(f: () => Promise<unknown>): Promise<unknown> }).conNombreUnico.bind(servicio);
      await expect(conNombreUnico(() => Promise.reject(new Error('base caída')))).rejects.toThrow('base caída');
    });
  });

  describe('OcupacionService (CU-025)', () => {
    it('no redirige desde una zona que no es del evento', async () => {
      const servicio = new OcupacionService(enTransaccion({}) as never, {} as never);
      jest.spyOn(servicio as never, 'estadoZonas').mockResolvedValue([{ id: 'a' }, { id: 'b' }] as never);
      await expect(servicio.redirigir('e', { zonaOrigenId: 'x', zonaDestinoId: 'b' } as never, 'u')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('ReservasService (CU-021)', () => {
    const reserva = { id: 'r', eventoId: 'e', espacioId: 's', estado: 'PENDIENTE_PAGO', monto: 6000, placa: 'ABC123', intentosRechazados: 0, expiraEn: new Date() };
    const armar = (datos: unknown, extra: { redis?: unknown; pagos?: unknown; cobro?: unknown; asignacion?: unknown } = {}) =>
      new ReservasService(datos as DataSource, (extra.redis ?? {}) as Redis, {} as never, (extra.asignacion ?? {}) as never,
        (extra.cobro ?? {}) as never, (extra.pagos ?? {}) as never, {} as never);

    it('un fallo al guardar la reserva que no es "placa con reserva" se propaga', async () => {
      const m = { query: jest.fn().mockRejectedValue(new Error('base caída')) };
      const servicio = armar(enTransaccion(m), {
        cobro: { tarifaVigente: jest.fn().mockResolvedValue({ id: 't', valorHora: 3000 }) },
        asignacion: { bloquearZona: jest.fn().mockResolvedValue({ id: 'z' }), elegir: jest.fn().mockResolvedValue({ id: 's' }) },
      });
      jest.spyOn(servicio, 'expirarVencidas').mockResolvedValue(0);
      jest.spyOn(servicio as never, 'eventoReservable').mockResolvedValue({ fechaFin: new Date(Date.now() + 7_200_000) } as never);
      jest.spyOn(servicio as never, 'llegada').mockReturnValue(new Date() as never);
      await expect(servicio.reservar('e', { zonaId: 'z', placa: 'ABC123' } as never, 'c')).rejects.toThrow('base caída');
    });

    it('PAGO_INDETERMINADO: si la pasarela no confirma, la reserva queda en conciliación y se puede reintentar', async () => {
      const datos = { transaction: jest.fn().mockResolvedValue({ reserva, vencida: false }), query: jest.fn().mockResolvedValue([]) };
      const servicio = armar(datos);
      jest.spyOn(servicio as never, 'cobrar').mockResolvedValue({ resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'TIMEOUT' } as never);
      await expect(servicio.pagar('r', 'tok', 'c')).rejects.toMatchObject({ response: { codigo: 'PAGO_INDETERMINADO', requiereConciliacion: true } });
      expect(datos.query).toHaveBeenCalledWith(expect.stringContaining('SET motivo'), ['r', 'TIMEOUT']);
    });

    it('cobrar: un medio de pago inválido devuelve la reserva a pendiente; otro fallo es indeterminado', async () => {
      const datos = { query: jest.fn().mockResolvedValue([]) };
      const cobrarCon = (pagos: unknown) =>
        (armar(datos, { pagos }) as unknown as { cobrar(r: unknown, t: string): Promise<unknown> }).cobrar(reserva, 'tok_valido');
      await expect(cobrarCon({ cobrar: jest.fn().mockRejectedValue(new BadRequestException('token')) }))
        .rejects.toMatchObject({ response: { codigo: 'TOKEN_INVALIDO' } });
      expect(datos.query).toHaveBeenCalledWith(expect.stringContaining("estado = 'PENDIENTE_PAGO'"), ['r']);
      await expect(cobrarCon({ cobrar: jest.fn().mockRejectedValue(new Error('pasarela caída')) }))
        .resolves.toMatchObject({ resultado: ResultadoCobro.INDETERMINADO, motivo: 'PAGOS_ERROR' });
    });

    it('el barrido de vencidas y el bloqueo en Redis no tumban nada si fallan', async () => {
      const servicio = armar({ transaction: jest.fn().mockRejectedValue(new Error('base caída')) },
        { redis: { del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) } });
      await expect(servicio.expirarVencidas()).resolves.toBe(0);
      const conRedis = (servicio as unknown as { conRedis(f: (r: Redis) => Promise<unknown>): Promise<void> }).conRedis.bind(servicio);
      await expect(conRedis((r) => r.del('x'))).resolves.toBeUndefined();
    });
  });
});
