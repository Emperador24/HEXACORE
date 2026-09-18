import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { EntradaTransferida } from './entrada-transferida.evento';
import { EVENTO_ENTRADA_TRANSFERIDA, VERSION_ENTRADA_TRANSFERIDA } from './topologia';

/**
 * El contrato de `ENTRADA_TRANSFERIDA` existe dos veces: como JSON Schema en
 * `App/shared/eventos/` —que es el que leerán consumidores de otros
 * microservicios, quizá escritos en otro lenguaje— y como interfaz de
 * TypeScript aquí dentro.
 *
 * Dos definiciones del mismo contrato se desincronizan solas: alguien añade un
 * campo a la interfaz, el compilador no protesta, y el consumidor de otro
 * servicio recibe algo que su esquema rechaza. Estas pruebas atan las dos
 * mitades comprobando que lo que produce este servicio valida contra el
 * esquema publicado.
 */

const esquema = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../shared/eventos/entrada-transferida.schema.json'),
    'utf8',
  ),
) as Record<string, unknown>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validar = ajv.compile(esquema);

/** Un evento como el que arma `CheckoutService.construirEvento`. */
function eventoDeMuestra(): EntradaTransferida {
  return {
    evento: EVENTO_ENTRADA_TRANSFERIDA,
    version: VERSION_ENTRADA_TRANSFERIDA,
    id: '7f3c1e2a-5d4b-4c8e-9a1f-2b3c4d5e6f70',
    ocurridoEn: new Date().toISOString(),
    entrada: {
      id: '20000000-0000-4000-8000-000000000001',
      numeroTicket: 'TCK-2026-000001',
      eventoId: 'e0000001-0000-4000-8000-000000000001',
      eventoNombre: 'HEXACORE Fest 2026',
      localidadNombre: 'General',
      codigoQrNuevo: 'HXC-QR-B9eTBBwYt1tiPokz',
    },
    transferencia: {
      vendedorId: 'a0000001-0000-4000-8000-000000000001',
      compradorId: 'b4e291f2-dc20-4abd-b893-9fdaafbffe49',
      publicacionId: '202c51ef-8a1b-4c2d-9e3f-4a5b6c7d8e9f',
      transaccionId: '7f3c1e2a-5d4b-4c8e-9a1f-2b3c4d5e6f70',
      numeroTransaccion: 'TXN-2026-000008',
    },
    importes: {
      precio: 300000,
      comision: 30000,
      netoVendedor: 270000,
      moneda: 'COP',
      referenciaPasarela: 'pas_c198f612-5523-4c46-9a7b-1d2e3f4a5b6c',
    },
  };
}

describe('contrato ENTRADA_TRANSFERIDA', () => {
  it('el evento que produce este servicio valida contra el esquema publicado', () => {
    const valido = validar(eventoDeMuestra());
    expect(validar.errors ?? []).toEqual([]);
    expect(valido).toBe(true);
  });

  it('los ejemplos del propio esquema son válidos', () => {
    for (const ejemplo of esquema.examples as unknown[]) {
      expect(validar(ejemplo)).toBe(true);
    }
  });

  it('rechaza un evento al que le falta un campo obligatorio', () => {
    const incompleto = eventoDeMuestra() as Partial<EntradaTransferida>;
    delete incompleto.importes;
    expect(validar(incompleto)).toBe(false);
  });

  it('rechaza campos que el contrato no declara', () => {
    // `additionalProperties: false` no es rigor decorativo: si este servicio
    // empezara a mandar un campo extra sin actualizar el contrato, los
    // consumidores de otros microservicios lo verían fallar aquí primero.
    const conExtra = { ...eventoDeMuestra(), datosTarjeta: '4111111111111111' };
    expect(validar(conExtra)).toBe(false);
  });

  it('rechaza una versión distinta de la declarada', () => {
    const futuro = { ...eventoDeMuestra(), version: 2 };
    expect(validar(futuro)).toBe(false);
  });

  it('el id del evento es el id de la transacción, para poder descartar duplicados', () => {
    const evento = eventoDeMuestra();
    expect(evento.id).toBe(evento.transferencia.transaccionId);
  });

  it('los importes cuadran: precio = comisión + neto', () => {
    const { precio, comision, netoVendedor } = eventoDeMuestra().importes;
    expect(comision + netoVendedor).toBe(precio);
  });
});
