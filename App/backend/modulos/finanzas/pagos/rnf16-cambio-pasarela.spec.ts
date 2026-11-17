import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ConfiguracionServicio } from './config/configuracion';
import { crearProcesadorPagos } from './pagos.module';
import { PasarelaHttp } from './pasarela-http.service';
import { PasarelaStripe } from './pasarela-stripe.service';
import { ProcesadorPagos, ResultadoCobro, SolicitudCobro, SolicitudReembolso } from './procesador-pagos';

/**
 * RNF-16 · La pasarela de pagos se cambia por otra sin tocar la lógica de
 * negocio. Umbral del SAD: 1 componente modificado (el adaptador) y 0 cambios
 * en Entradas.
 *
 * Tres comprobaciones, para que el umbral no dependa de que alguien lo revise
 * a mano en cada cambio:
 *
 * 1. **Se cambia por configuración**: `PAGOS_PROVEEDOR` elige el adaptador y
 *    nada más cambia.
 * 2. **El negocio no conoce al proveedor**: Entradas, Alimentos y
 *    Parqueaderos no nombran a Stripe ni a la pasarela simulada, y llegan a
 *    Pagos solo por su API pública (`finanzas/pagos/index.ts`).
 * 3. **Mismo contrato**: con la misma solicitud, los dos adaptadores dan el
 *    mismo resultado de negocio (aprobado, rechazado, sin respuesta,
 *    reembolso). Un proveedor nuevo tiene que pasar esta misma tabla.
 */

const RAIZ = join(__dirname, '..', '..', '..');
const NEGOCIO = ['modulos/entradas', 'modulos/alimentos', 'modulos/parqueaderos'];

function config(proveedor: 'simulada' | 'stripe'): ConfiguracionServicio {
  return {
    pasarelaPagos: {
      proveedor,
      url: 'http://pasarela.test',
      timeoutMs: 5000,
      stripe: { url: 'https://api.stripe.test/v1', claveSecreta: 'sk_test_123', clavePublica: 'pk_test_1', secretoWebhook: '' },
    },
  } as ConfiguracionServicio;
}

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') ? [ruta] : [];
  });
}

const archivosNegocio = NEGOCIO.flatMap((d) => fuentes(join(RAIZ, d))).map((ruta) => ({
  ruta: relative(RAIZ, ruta).replace(/\\/g, '/'),
  texto: readFileSync(ruta, 'utf8'),
}));

describe('RNF-16 · cambiar de pasarela sin tocar el negocio', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('1. se elige por configuración', () => {
    it('PAGOS_PROVEEDOR=stripe usa el adaptador de Stripe', () => {
      expect(crearProcesadorPagos(config('stripe'))).toBeInstanceOf(PasarelaStripe);
    });

    it('PAGOS_PROVEEDOR=simulada usa la pasarela HTTP simulada', () => {
      expect(crearProcesadorPagos(config('simulada'))).toBeInstanceOf(PasarelaHttp);
    });
  });

  describe('2. el negocio no conoce al proveedor', () => {
    it('hay archivos de negocio que revisar (si no, la prueba no probaría nada)', () => {
      expect(archivosNegocio.filter((a) => a.ruta.startsWith('modulos/entradas/')).length).toBeGreaterThan(50);
    });

    it('ningún archivo de Entradas, Alimentos ni Parqueaderos nombra un proveedor o un adaptador', () => {
      const proveedor = /stripe|PasarelaHttp|PasarelaStripe|pasarela-http|pasarela-stripe|PAGOS_PROVEEDOR/i;
      expect(archivosNegocio.filter((a) => proveedor.test(a.texto)).map((a) => a.ruta)).toEqual([]);
    });

    it('a Pagos se llega solo por su API pública, nunca a un archivo interno', () => {
      const profundas = archivosNegocio.flatMap((a) =>
        [...a.texto.matchAll(/from\s+'([^']*finanzas\/pagos[^']*)'/g)]
          .map((m) => m[1])
          .filter((destino) => !destino.endsWith('finanzas/pagos'))
          .map((destino) => `${a.ruta} → ${destino}`),
      );
      expect(profundas).toEqual([]);
    });
  });

  describe('3. los dos adaptadores cumplen el mismo contrato', () => {
    const cobro: SolicitudCobro = { monto: 85000, moneda: 'COP', token: 'pm_123', descripcion: 'Compra CMP-2026-000001', claveIdempotencia: 'txn-1' };
    const reembolso: SolicitudReembolso = { referenciaCobro: 'pi_1', monto: 42500, moneda: 'COP', motivo: 'Cancelación', claveIdempotencia: 'ree-1' };
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';

    /** Cómo responde cada proveedor, en su propio idioma, a cada situación. */
    const proveedores: Record<'simulada' | 'stripe', Record<'aprobado' | 'rechazado' | 'caido' | 'reembolsado', [number, object]>> = {
      simulada: {
        aprobado: [200, { referencia: `pas_${uuid}`, estado: 'APROBADO' }],
        rechazado: [200, { estado: 'RECHAZADO' }],
        caido: [503, {}],
        reembolsado: [200, { referencia: `ree_${uuid}`, estado: 'APROBADO' }],
      },
      stripe: {
        aprobado: [200, { id: 'pi_1', status: 'succeeded' }],
        rechazado: [402, { error: { type: 'card_error', code: 'card_declined' } }],
        caido: [503, { error: { message: 'Service Unavailable' } }],
        reembolsado: [200, { id: 're_1', status: 'succeeded' }],
      },
    };

    const responder = ([estado, cuerpo]: [number, object]) =>
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: estado }));

    describe.each(['simulada', 'stripe'] as const)('con PAGOS_PROVEEDOR=%s', (nombre) => {
      const pasarela = (): ProcesadorPagos => crearProcesadorPagos(config(nombre));
      const respuestas = proveedores[nombre];

      it('un cobro aprobado es APROBADO, con referencia, y viaja con la clave de idempotencia', async () => {
        const espia = responder(respuestas.aprobado);
        const r = await pasarela().cobrar(cobro);
        expect(r.resultado).toBe(ResultadoCobro.APROBADO);
        expect(r.referencia).toEqual(expect.any(String));
        const cabeceras = (espia.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
        expect(cabeceras['Idempotency-Key']).toBe('txn-1');
      });

      it('un cobro rechazado es RECHAZADO', async () => {
        responder(respuestas.rechazado);
        await expect(pasarela().cobrar(cobro)).resolves.toMatchObject({ resultado: ResultadoCobro.RECHAZADO });
      });

      it('una pasarela caída es INDETERMINADO, nunca un rechazo', async () => {
        responder(respuestas.caido);
        await expect(pasarela().cobrar(cobro)).resolves.toMatchObject({ resultado: ResultadoCobro.INDETERMINADO });
      });

      it('sin red es INDETERMINADO', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
        await expect(pasarela().cobrar(cobro)).resolves.toMatchObject({ resultado: ResultadoCobro.INDETERMINADO });
      });

      it('un reembolso aprobado es APROBADO', async () => {
        responder(respuestas.reembolsado);
        await expect(pasarela().reembolsar(reembolso)).resolves.toMatchObject({ resultado: ResultadoCobro.APROBADO });
      });
    });
  });
});
