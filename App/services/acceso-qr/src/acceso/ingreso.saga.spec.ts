import { IngresoService } from './ingreso.service';
import { RespuestaVentas } from './cliente-ventas.service';
import { AforoCompleto, QrInvalido, QrYaUtilizado } from './acceso.errors';
import { EstadoEvento } from '../persistencia/entidades/evento-referencia.entity';

/**
 * La Saga del ingreso (CU-002) después de ADR-14.
 *
 * `Entrada` es de Ventas y los ingresos son de aquí: ya no hay una transacción
 * que abarque las dos cosas. Lo que se comprueba es que **ningún fallo deje a
 * alguien con la entrada gastada sin haber entrado**.
 */

const EVENTO = {
  eventoId: 'e1',
  nombre: 'HEXACORE Fest',
  estado: EstadoEvento.PUBLICADO,
  aforoMaximo: 100,
  asistentes: 10,
};

function construir({
  respuestaVentas = RespuestaVentas.OK,
  aforoDisponible = true,
  fallaElRegistro = false,
  evento = EVENTO as never,
} = {}) {
  const ventas = {
    marcarUsada: jest.fn().mockResolvedValue({
      respuesta: respuestaVentas,
      entradaId: respuestaVentas === RespuestaVentas.QR_DESCONOCIDO ? null : 'entrada-1',
      numeroTicket: 'TCK-1',
      localidadNombre: 'Palco',
    }),
    revertirUso: jest.fn().mockResolvedValue(true),
    qrValidos: jest.fn(),
  };
  const contadores = {
    sumarAsistente: jest.fn().mockResolvedValue(aforoDisponible),
    restarAsistente: jest.fn().mockResolvedValue(true),
  };
  const tx = {
    create: (_e: unknown, datos: unknown) => datos,
    save: jest.fn(fallaElRegistro
      ? () => Promise.reject(new Error('UNIQUE violado'))
      : (datos: object) => Promise.resolve({ ...datos, registradoEn: new Date() })),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const fuenteDatos = {
    getRepository: () => ({ findOne: jest.fn().mockResolvedValue(evento) }),
    transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  const servicio = new IngresoService(fuenteDatos as never, contadores as never, ventas as never);
  return { servicio, ventas, contadores, tx };
}

const ESCANEO = { eventoId: 'e1', codigoQr: 'HXC-QR-1', puntoAcceso: 'Puerta 3' };

describe('Saga del ingreso', () => {
  it('camino feliz: Ventas gasta el QR y el ingreso queda registrado', async () => {
    const { servicio, ventas, contadores } = construir();

    const r = await servicio.validar('personal-1', ESCANEO as never, 'tok');

    expect(r.autorizado).toBe(true);
    expect(ventas.marcarUsada).toHaveBeenCalledWith('HXC-QR-1', 'e1', 'tok');
    expect(contadores.sumarAsistente).toHaveBeenCalled();
    expect(ventas.revertirUso).not.toHaveBeenCalled();
  });

  it('si el aforo está lleno, SE COMPENSA: la entrada vuelve a VALIDA', async () => {
    // Es el caso que antes resolvía el rollback de la transacción única. Sin
    // compensar, esa persona se queda fuera con su entrada ya gastada.
    const { servicio, ventas } = construir({ aforoDisponible: false });

    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toBeInstanceOf(AforoCompleto);

    expect(ventas.revertirUso).toHaveBeenCalledWith('entrada-1', 'tok');
  });

  it('si el registro del ingreso falla, también se compensa', async () => {
    const { servicio, ventas } = construir({ fallaElRegistro: true });

    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toThrow();

    expect(ventas.revertirUso).toHaveBeenCalledWith('entrada-1', 'tok');
  });

  it('si Ventas dice que ya se usó, NO se compensa: no había nada que deshacer', async () => {
    const { servicio, ventas, contadores } = construir({ respuestaVentas: RespuestaVentas.YA_UTILIZADA });

    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toBeInstanceOf(QrYaUtilizado);

    expect(contadores.sumarAsistente).not.toHaveBeenCalled();
    expect(ventas.revertirUso).not.toHaveBeenCalled();
  });

  it('un QR desconocido no toca el aforo', async () => {
    const { servicio, contadores, ventas } = construir({ respuestaVentas: RespuestaVentas.QR_DESCONOCIDO });

    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toBeInstanceOf(QrInvalido);

    expect(contadores.sumarAsistente).not.toHaveBeenCalled();
    expect(ventas.revertirUso).not.toHaveBeenCalled();
  });

  it('si Ventas no responde, NO se deja pasar', async () => {
    // No se sabe si la entrada quedó marcada. En una puerta el error caro es
    // dejar entrar a quien no debía, así que se niega el paso.
    const { servicio, contadores } = construir({ respuestaVentas: RespuestaVentas.SIN_RESPUESTA });

    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toBeInstanceOf(QrInvalido);

    expect(contadores.sumarAsistente).not.toHaveBeenCalled();
  });

  it('un evento cancelado no admite a nadie, y ni siquiera se pregunta a Ventas', async () => {
    const { servicio, ventas } = construir({ evento: { ...EVENTO, estado: EstadoEvento.CANCELADO } as never });

    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toBeInstanceOf(QrInvalido);

    expect(ventas.marcarUsada).not.toHaveBeenCalled();
  });

  it('una entrada en reventa no entra', async () => {
    const { servicio } = construir({ respuestaVentas: RespuestaVentas.EN_REVENTA });
    await expect(servicio.validar('personal-1', ESCANEO as never, 'tok')).rejects.toBeInstanceOf(QrInvalido);
  });
});
