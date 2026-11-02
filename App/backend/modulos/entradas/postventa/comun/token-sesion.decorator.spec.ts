import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenSesion } from './token-sesion.decorator';

/**
 * El decorador que extrae el token para **reenviarlo** a Pagos y a Ventas.
 *
 * Lo que importa probar es que falla cerrado: si devolviera una cadena vacía o
 * basura en vez de lanzar, Postventa saldría a llamar a otro servicio con una
 * credencial inválida y el fallo aparecería allí, disfrazado de "el otro
 * servicio no responde".
 *
 * Los decoradores de parámetro de Nest guardan su función en los metadatos;
 * para probarla se extrae de ahí, igual que en `usuario-actual.decorator.spec`.
 */
type Factoria = (datos: unknown, ctx: ExecutionContext) => string;

function extraerFactoria(decorador: typeof TokenSesion): Factoria {
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

describe('TokenSesion', () => {
  const obtener = extraerFactoria(TokenSesion);

  function contextoCon(authorization?: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
    } as unknown as ExecutionContext;
  }

  it('devuelve el token tal como llegó', () => {
    // Tal cual, sin verificarlo: quien lo recibe tiene que volver a hacerlo por
    // su cuenta, incluida la revocación (ADR-11).
    expect(obtener(undefined, contextoCon('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('acepta el esquema en cualquier capitalización', () => {
    // RFC 7235: el esquema no distingue mayúsculas. Rechazarlo haría fallar a
    // un cliente correcto.
    expect(obtener(undefined, contextoCon('bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it.each([
    ['sin cabecera', undefined],
    ['vacía', ''],
    ['sin esquema', 'abc.def.ghi'],
    ['con otro esquema', 'Basic abc.def.ghi'],
    ['sin token', 'Bearer'],
    ['con el token vacío', 'Bearer '],
  ])('falla cerrado %s', (_caso, cabecera) => {
    expect(() => obtener(undefined, contextoCon(cabecera))).toThrow(UnauthorizedException);
  });
});
