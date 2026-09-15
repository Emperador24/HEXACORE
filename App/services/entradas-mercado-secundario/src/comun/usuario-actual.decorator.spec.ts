import { ExecutionContext } from '@nestjs/common';
import { CABECERA_USUARIO, UsuarioActual } from './usuario-actual.decorator';

/**
 * La identidad es provisional —la aportará el API Gateway (ADR-02, RNF-06)—
 * pero mientras tanto es la única puerta, y una cabecera mal validada dejaría
 * pasar cualquier cosa como identificador de usuario.
 *
 * Los decoradores de parámetro de Nest guardan su función en los metadatos;
 * para probarla se extrae de ahí, que es la forma habitual de hacerlo.
 */
type Factoria = (datos: unknown, ctx: ExecutionContext) => string;

function extraerFactoria(decorador: typeof UsuarioActual): Factoria {
  // El decorador se aplica sobre un objetivo ficticio para que Nest registre
  // su factoría, y luego se lee de los metadatos del parámetro.
  class Objetivo {
    metodo(_parametro: string): void {
      // Solo existe para recibir el decorador.
    }
  }
  decorador()(Objetivo.prototype, 'metodo', 0);
  const metadatos = Reflect.getMetadata('__routeArguments__', Objetivo, 'metodo') as Record<
    string,
    { factory: Factoria }
  >;
  return Object.values(metadatos)[0].factory;
}

describe('UsuarioActual', () => {
  const obtener = extraerFactoria(UsuarioActual);

  function contextoCon(cabeceras: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: cabeceras }) }),
    } as unknown as ExecutionContext;
  }

  const UUID = 'a0000001-0000-4000-8000-000000000001';

  it('devuelve el identificador cuando la cabecera es un UUID válido', () => {
    expect(obtener(undefined, contextoCon({ [CABECERA_USUARIO]: UUID }))).toBe(UUID);
  });

  /** Ejecuta y devuelve el cuerpo de la excepción que lanzó Nest. */
  function errorDe(cabeceras: Record<string, unknown>): { codigo: string; mensaje: string } {
    try {
      obtener(undefined, contextoCon(cabeceras));
    } catch (error) {
      return (error as { response: { codigo: string; mensaje: string } }).response;
    }
    throw new Error('se esperaba una excepción');
  }

  it('rechaza una petición sin cabecera de identidad', () => {
    expect(errorDe({}).codigo).toBe('SIN_IDENTIDAD');
  });

  it('rechaza una cabecera vacía', () => {
    expect(errorDe({ [CABECERA_USUARIO]: '' }).codigo).toBe('SIN_IDENTIDAD');
  });

  it.each([['no-es-uuid'], ['12345'], ["' OR 1=1 --"], ['a0000001-0000-4000-8000']])(
    'rechaza un identificador que no es UUID (%s)',
    (valor) => {
      // Sin esto, cualquier cadena llegaría hasta una consulta como si fuera un
      // identificador de usuario.
      expect(errorDe({ [CABECERA_USUARIO]: valor }).codigo).toBe('IDENTIDAD_INVALIDA');
    },
  );

  it('toma el primer valor si la cabecera llega repetida', () => {
    expect(obtener(undefined, contextoCon({ [CABECERA_USUARIO]: [UUID, 'otro'] }))).toBe(UUID);
  });
});
