import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UsuarioActual } from './usuario-actual.decorator';

/**
 * El decorador ya no lee cabeceras: devuelve el usuario de la sesión que
 * verificó `SesionValida`. Lo que importa probar es que **nunca** devuelve una
 * identidad que el guard no haya verificado.
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
  const UUID = 'a0000001-0000-4000-8000-000000000001';

  function contextoCon(peticion: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => peticion }),
    } as unknown as ExecutionContext;
  }

  it('devuelve el usuario de la sesión verificada', () => {
    const sesion = { usuarioId: UUID, roles: ['Cliente'], jti: 'x' };
    expect(obtener(undefined, contextoCon({ headers: {}, sesion }))).toBe(UUID);
  });

  it('falla cerrado si la ruta no pasó por el guard', () => {
    expect(() => obtener(undefined, contextoCon({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('ignora la antigua cabecera X-Usuario-Id', () => {
    // Era la puerta por la que cualquiera se hacía pasar por otra persona.
    const peticion = { headers: { 'x-usuario-id': UUID } };
    expect(() => obtener(undefined, contextoCon(peticion))).toThrow(UnauthorizedException);
  });
});
