import { baseDatosFalsa } from '../../test/dobles/base-datos';
import { ConfiguracionServicio } from '../config/configuracion';
import { Cancelacion, EstadoCancelacion } from '../persistencia/entidades/cancelacion.entity';
import { Compra, EstadoCompra } from '../persistencia/entidades/compra.entity';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { ProcesadorPagos, ResultadoCobro } from '../reventa/pagos/procesador-pagos';
import { CancelacionService } from './cancelacion.service';
import { Contadores } from './contadores';
import { NotificacionesVenta } from './notificaciones-venta.service';
import {
  CompraNoCancelable,
  CompraNoEncontrada,
  FueraDePlazo,
  MontoCambio,
  NingunaEntradaCancelable,
  ReembolsoIndeterminado,
  ReembolsoRechazado,
} from './venta.errors';

/** CU-003: cotizar y cancelar, con sus caminos alternos y de excepción. */
describe('CancelacionService — CU-003', () => {
  const ANA = 'a0000001-0000-4000-8000-000000000001';
  const BRUNO = 'a0000002-0000-4000-8000-000000000002';
  const config = {
    venta: { reservaMinutos: 10, cancelacionTotalDias: 7, cancelacionParcialHoras: 48, cancelacionParcialPorcentaje: 50 },
  } as ConfiguracionServicio;
  const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

  const compra = (cambios: Partial<Compra> = {}): Compra =>
    ({ id: 'compra-1', numeroCompra: 'CMP-1', compradorId: ANA, eventoId: 'evt-1', localidadId: 'loc-1', estado: EstadoCompra.PAGADA, referenciaPasarela: 'pas_1', ...cambios }) as Compra;
  const entrada = (id: string, cambios: Partial<Entrada> = {}): Entrada =>
    ({ id, numeroTicket: `TCK-${id}`, localidadNombre: 'General', compraId: 'compra-1', propietarioId: ANA, estado: EstadoEntrada.VALIDA, precioOriginal: 70000, ...cambios }) as Entrada;

  function construir(opciones: { compra?: Compra | null; fechaEvento?: Date; eventoCancelado?: boolean; entradas?: Entrada[] } = {}) {
    const { gestor, fuenteDatos } = baseDatosFalsa();
    const laCompra = opciones.compra === undefined ? compra() : opciones.compra;
    gestor.findOne.mockImplementation((entidad: unknown, { where }: { where: { compradorId?: string } }) => {
      if (entidad === Compra) return Promise.resolve(laCompra && (!where.compradorId || where.compradorId === laCompra.compradorId) ? laCompra : null);
      if (entidad === EventoReferencia) {
        return Promise.resolve({
          nombre: 'Stand-up',
          fechaInicio: opciones.fechaEvento ?? dias(30),
          estado: opciones.eventoCancelado ? EstadoEvento.CANCELADO : EstadoEvento.PUBLICADO,
        });
      }
      return Promise.resolve(null);
    });
    gestor.find.mockResolvedValue(opciones.entradas ?? [entrada('e1'), entrada('e2'), entrada('e3')]);
    gestor.update.mockImplementation((entidad: unknown, criterio: { id?: { _value?: string[] } }) =>
      Promise.resolve({ affected: entidad === Entrada ? (criterio.id?._value?.length ?? 1) : 1 }),
    );
    const contadores = { devolverVendidas: jest.fn().mockResolvedValue(true) };
    const pagos = { cobrar: jest.fn(), reembolsar: jest.fn().mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'ree_1', motivo: null }) };
    const notificaciones = { publicar: jest.fn().mockResolvedValue(true) };
    const servicio = new CancelacionService(
      fuenteDatos,
      contadores as unknown as Contadores,
      notificaciones as unknown as NotificacionesVenta,
      pagos as unknown as ProcesadorPagos,
      config,
    );
    return { servicio, gestor, contadores, pagos, notificaciones };
  }

  describe('cotizar (pasos 2-4)', () => {
    it('con más de 7 días, devuelve el 100 % de todas las entradas', async () => {
      const { servicio } = construir();

      const cotizacion = await servicio.cotizar(ANA, 'compra-1');

      expect(cotizacion).toMatchObject({ porcentajeReembolso: 100, montoPagado: 210000, montoReembolso: 210000, parcial: false });
    });

    it('CU-003A: a pocos días, informa el reembolso parcial antes de confirmar', async () => {
      const { servicio } = construir({ fechaEvento: dias(4) });

      const cotizacion = await servicio.cotizar(ANA, 'compra-1');

      expect(cotizacion).toMatchObject({ porcentajeReembolso: 50, montoReembolso: 105000, parcial: true, tramo: 'PARCIAL' });
      expect(cotizacion.mensaje).toContain('50 %');
    });

    it('CU-003B: solo sobre las entradas elegidas', async () => {
      const { servicio } = construir();

      const cotizacion = await servicio.cotizar(ANA, 'compra-1', ['e1']);

      expect(cotizacion.entradasCancelables).toEqual(['e1']);
      expect(cotizacion.montoReembolso).toBe(70000);
    });

    it('CU-003D: rechaza las usadas y procesa las demás', async () => {
      const { servicio } = construir({ entradas: [entrada('e1', { estado: EstadoEntrada.USADA }), entrada('e2')] });

      const cotizacion = await servicio.cotizar(ANA, 'compra-1');

      expect(cotizacion.entradasCancelables).toEqual(['e2']);
      expect(cotizacion.entradasRechazadas).toEqual([{ entradaId: 'e1', motivo: expect.stringContaining('CU-003D') }]);
    });

    it('CU-003D: si ninguna se puede, rechaza la solicitud entera', async () => {
      const { servicio } = construir({ entradas: [entrada('e1', { estado: EstadoEntrada.USADA })] });
      await expect(servicio.cotizar(ANA, 'compra-1')).rejects.toThrow(NingunaEntradaCancelable);
    });

    it.each([
      ['revendida a otra persona', { propietarioId: BRUNO }, 'ya no es tuya'],
      ['publicada en reventa', { estado: EstadoEntrada.EN_REVENTA }, 'reventa'],
    ])('no cancela una entrada %s', async (_caso, cambios, motivo) => {
      const { servicio } = construir({ entradas: [entrada('e1', cambios), entrada('e2')] });

      const cotizacion = await servicio.cotizar(ANA, 'compra-1');

      expect(cotizacion.entradasRechazadas[0].motivo).toContain(motivo);
    });

    it('ignora sin quejarse las que ya estaban anuladas si se piden todas', async () => {
      const { servicio } = construir({ entradas: [entrada('e1', { estado: EstadoEntrada.ANULADA }), entrada('e2')] });
      expect((await servicio.cotizar(ANA, 'compra-1')).entradasRechazadas).toEqual([]);
    });

    it('fuera de plazo no se puede cancelar', async () => {
      const { servicio } = construir({ fechaEvento: dias(1) });
      await expect(servicio.cotizar(ANA, 'compra-1')).rejects.toThrow(FueraDePlazo);
    });

    it('si el organizador canceló el evento, reembolsa todo aunque ya haya pasado', async () => {
      const { servicio } = construir({ fechaEvento: dias(-1), eventoCancelado: true });
      expect((await servicio.cotizar(ANA, 'compra-1')).porcentajeReembolso).toBe(100);
    });

    it('Seguridad: solo el titular de la compra', async () => {
      const { servicio } = construir();
      await expect(servicio.cotizar(BRUNO, 'compra-1')).rejects.toThrow(CompraNoEncontrada);
    });

    it('una compra sin pagar no se cancela, se deja vencer', async () => {
      const { servicio } = construir({ compra: compra({ estado: EstadoCompra.PENDIENTE }) });
      await expect(servicio.cotizar(ANA, 'compra-1')).rejects.toThrow(CompraNoCancelable);
    });
  });

  describe('cancelar (pasos 5-9)', () => {
    const datos = (montoAceptado: number, entradaIds?: string[]) => ({ motivo: 'No puedo ir', montoAceptado, entradaIds });

    it('anula primero, reembolsa con clave idempotente, devuelve el cupo y notifica', async () => {
      const { servicio, gestor, pagos, contadores, notificaciones } = construir();

      const resultado = await servicio.cancelar(ANA, 'compra-1', datos(140000, ['e1', 'e2']));

      expect(gestor.update.mock.calls[0][0]).toBe(Entrada);
      expect(gestor.update.mock.calls[0][2]).toEqual({ estado: EstadoEntrada.ANULADA });
      expect(pagos.reembolsar).toHaveBeenCalledWith(expect.objectContaining({ referenciaCobro: 'pas_1', monto: 140000 }));
      expect(contadores.devolverVendidas).toHaveBeenCalledWith(gestor, 'loc-1', 2);
      expect(resultado).toMatchObject({ estado: EstadoCancelacion.APROBADA, referenciaReembolso: 'ree_1' });
      expect(notificaciones.publicar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'COMPRA_CANCELADA', monto: 140000 }));
    });

    it('deja la compra PARCIALMENTE_CANCELADA si quedan entradas activas, CANCELADA si no', async () => {
      const parcial = construir();
      parcial.gestor.count.mockResolvedValue(1);
      await parcial.servicio.cancelar(ANA, 'compra-1', datos(70000, ['e1']));
      expect(parcial.gestor.update).toHaveBeenCalledWith(Compra, { id: 'compra-1' }, { estado: EstadoCompra.PARCIALMENTE_CANCELADA });

      const total = construir();
      total.gestor.count.mockResolvedValue(0);
      await total.servicio.cancelar(ANA, 'compra-1', datos(210000));
      expect(total.gestor.update).toHaveBeenCalledWith(Compra, { id: 'compra-1' }, { estado: EstadoCompra.CANCELADA });
    });

    it('paso 5: si el monto cambió desde la cotización, no toca nada', async () => {
      const { servicio, pagos } = construir();

      await expect(servicio.cancelar(ANA, 'compra-1', datos(1))).rejects.toThrow(MontoCambio);
      expect(pagos.reembolsar).not.toHaveBeenCalled();
    });

    it('si una entrada cambió de estado entretanto, no anula ninguna', async () => {
      const { servicio, gestor, pagos } = construir();
      gestor.update.mockResolvedValueOnce({ affected: 1 }); // pidió 3, solo 1 seguía VALIDA

      await expect(servicio.cancelar(ANA, 'compra-1', datos(210000))).rejects.toThrow(CompraNoCancelable);
      expect(pagos.reembolsar).not.toHaveBeenCalled();
    });

    it('CU-003C: con el reembolso rechazado, las entradas vuelven a ser válidas', async () => {
      const { servicio, gestor, pagos, contadores } = construir();
      pagos.reembolsar.mockResolvedValue({ resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'No admite reembolsos' });

      await expect(servicio.cancelar(ANA, 'compra-1', datos(210000))).rejects.toThrow(ReembolsoRechazado);
      expect(gestor.update).toHaveBeenCalledWith(Entrada, expect.objectContaining({ estado: EstadoEntrada.ANULADA }), { estado: EstadoEntrada.VALIDA });
      expect(gestor.update).toHaveBeenCalledWith(Cancelacion, expect.anything(), expect.objectContaining({ estado: EstadoCancelacion.RECHAZADA }));
      expect(contadores.devolverVendidas).not.toHaveBeenCalled();
    });

    it('sin respuesta de la pasarela: las entradas siguen anuladas y queda para conciliar', async () => {
      const { servicio, gestor, pagos } = construir();
      pagos.reembolsar.mockResolvedValue({ resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'timeout' });

      await expect(servicio.cancelar(ANA, 'compra-1', datos(210000))).rejects.toThrow(ReembolsoIndeterminado);
      expect(gestor.update).toHaveBeenCalledWith(Cancelacion, expect.anything(), expect.objectContaining({ estado: EstadoCancelacion.FALLIDA }));
      expect(gestor.update).not.toHaveBeenCalledWith(Entrada, expect.anything(), { estado: EstadoEntrada.VALIDA });
    });
  });
});
