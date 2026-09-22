import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El contrato OpenAPI publicado en `App/shared/api/` es lo que el portal y la
 * app móvil usan para saber qué endpoints existen y qué devuelven. Un contrato
 * desactualizado es peor que no tenerlo: describe un servicio que ya no es.
 *
 * Estas pruebas no regeneran el contrato —eso requiere levantar la aplicación
 * entera— pero sí comprueban que sigue describiendo el CU-006 y que no filtra
 * lo que no debe. Si alguien añade un endpoint y olvida `npm run contrato:api`,
 * la prueba de cobertura de rutas lo detecta.
 */
describe('contrato OpenAPI publicado', () => {
  const contrato = JSON.parse(
    readFileSync(join(__dirname, '../../../../shared/api/entradas-mercado-secundario.openapi.json'), 'utf8'),
  ) as {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, Record<string, { summary?: string; security?: unknown[] }>>;
    components: { schemas: Record<string, unknown>; securitySchemes?: Record<string, { scheme?: string }> };
  };

  it('es una especificación OpenAPI 3 válida en lo esencial', () => {
    expect(contrato.openapi).toMatch(/^3\./);
    expect(contrato.info.title).toBeTruthy();
    expect(contrato.info.version).toBeTruthy();
  });

  it.each([
    ['/cartelera', 'get', 'CU-005 pasos 1-5: consultar la cartelera'],
    ['/cartelera/{id}', 'get', 'CU-005 pasos 6-8: detalle del evento'],
    ['/cartelera/filtros', 'get', 'CU-005: valores de los filtros'],
    ['/compras', 'post', 'CU-001 pasos 3-4: reservar'],
    ['/compras/{id}/pagar', 'post', 'CU-001 pasos 5-8: pagar y recibir los QR'],
    ['/compras/{id}/cupon', 'put', 'CU-004: aplicar un código'],
    ['/compras/{id}/cupon', 'delete', 'CU-004B: quitar el código'],
    ['/compras/{id}/cancelacion/cotizacion', 'post', 'CU-003 pasos 2-4: cotizar'],
    ['/compras/{id}/cancelaciones', 'post', 'CU-003 pasos 5-9: cancelar'],
    ['/ingresos', 'post', 'CU-002: validar un QR'],
    ['/ingresos/sincronizacion', 'post', 'CU-002E: sincronizar ingresos sin conexión'],
    ['/reventa/mis-entradas', 'get', 'paso 1: las entradas del vendedor'],
    ['/reventa/publicaciones', 'post', 'pasos 2-4: publicar'],
    ['/reventa/publicaciones', 'get', 'paso 5: consultar el mercado'],
    ['/reventa/publicaciones/{id}', 'patch', 'CU-006A: cambiar el precio'],
    ['/reventa/publicaciones/{id}', 'delete', 'CU-006B: retirar'],
    ['/reventa/publicaciones/{id}/checkout', 'post', 'paso 6: reservar'],
    ['/reventa/checkout/{id}/pagar', 'post', 'pasos 7-11: pagar y transferir'],
    ['/reventa/checkout/{id}', 'delete', 'CU-006C: cancelar'],
  ])('publica %s %s (%s)', (ruta, metodo) => {
    expect(contrato.paths[ruta]?.[metodo]).toBeDefined();
  });

  it('cada operación lleva un resumen legible', () => {
    // El contrato lo leen personas además de generadores de código.
    const sinResumen = Object.entries(contrato.paths).flatMap(([ruta, metodos]) =>
      Object.entries(metodos)
        .filter(([, operacion]) => !operacion.summary)
        .map(([metodo]) => `${metodo.toUpperCase()} ${ruta}`),
    );

    expect(sinResumen).toEqual([]);
  });

  it('no expone ningún campo de datos de tarjeta', () => {
    // RNF-05: "el cobro se delega íntegramente a la pasarela". Si un DTO
    // empezara a aceptar un número de tarjeta, aparecería aquí.
    const crudo = JSON.stringify(contrato).toLowerCase();
    for (const prohibido of ['"pan"', 'cvv', 'cvc', 'numerotarjeta']) {
      expect(crudo).not.toContain(prohibido);
    }
  });

  it('no expone el identificador del vendedor en las publicaciones del mercado', () => {
    // Quien compra necesita saber qué se vende y a qué precio, no quién lo
    // vende. El vendedor sí ve el suyo en `mis-entradas`.
    const mercado = contrato.components.schemas.PublicacionMercadoDto as { properties: Record<string, unknown> };
    expect(Object.keys(mercado.properties)).not.toContain('vendedorId');
  });

  it('el DTO de pago recibe un token, nunca datos de tarjeta', () => {
    const pagar = contrato.components.schemas.PagarDto as { properties: Record<string, unknown> };
    expect(Object.keys(pagar.properties).sort()).toEqual(['metodoPago', 'token']);
  });

  /** La cartelera (CU-005) es la única ruta de negocio pública; DECISIONES.md §12. */
  const esCartelera = (ruta: string): boolean => ruta === '/cartelera' || ruta.startsWith('/cartelera/');

  it('la cartelera pública es de solo lectura', () => {
    // La excepción a RNF-06 se sostiene porque no escribe nada ni expone datos
    // de nadie. Si alguien añade un POST aquí, deja de sostenerse.
    const publicas = Object.entries(contrato.paths).filter(([ruta]) => esCartelera(ruta));
    expect(publicas.length).toBeGreaterThan(0);
    for (const [ruta, metodos] of publicas) {
      expect([ruta, Object.keys(metodos)]).toEqual([ruta, ['get']]);
      expect(metodos.get.security).toBeUndefined();
    }
  });

  // RNF-06: el contrato debe decirle a los clientes que hace falta un token, y
  // no seguir anunciando la cabecera que permitía hacerse pasar por otro.
  it('exige token Bearer en todas las rutas de negocio y ya no menciona X-Usuario-Id', () => {
    expect(contrato.components.securitySchemes?.bearer?.scheme).toBe('bearer');
    // `/salud` queda fuera a propósito: la consulta el balanceador (ADR-02),
    // que no tiene sesión, y no expone nada de negocio. La cartelera, porque
    // es pública por diseño (prueba de arriba).
    const deNegocio = Object.entries(contrato.paths).filter(([ruta]) => ruta !== '/salud' && !esCartelera(ruta));
    expect(deNegocio.length).toBeGreaterThan(0);
    for (const [ruta, metodos] of deNegocio) {
      for (const [metodo, operacion] of Object.entries(metodos)) {
        expect([ruta, metodo, operacion.security]).toEqual([ruta, metodo, [{ bearer: [] }]]);
      }
    }
    expect(JSON.stringify(contrato).toLowerCase()).not.toContain('x-usuario-id');
  });
});
