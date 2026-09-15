import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/** Cabecera con la que, por ahora, el cliente dice quién es. */
export const CABECERA_USUARIO = 'x-usuario-id';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Identidad del usuario que hace la petición.
 *
 * **Esto es un sustituto temporal, no el mecanismo definitivo.** Según ADR-02
 * y RNF-06 (*"endpoints de negocio alcanzables sin token válido: 0 %"*), quien
 * autentica y autoriza es el **API Gateway**, y este servicio debería recibir
 * la identidad ya verificada. Como el gateway todavía no existe, se lee de la
 * cabecera `X-Usuario-Id`.
 *
 * Que esa cabecera sea falsificable por cualquiera es precisamente el motivo
 * por el que el gateway existe. Cuando esté, lo único que cambia es el cuerpo
 * de este decorador —pasa a leer el *claim* del token ya validado— y ni los
 * controladores ni el dominio se enteran.
 *
 * Lo que sí se hace desde ya es **no confiar en el cliente para la
 * autorización**: el `usuarioId` que llega aquí solo dice *quién dice ser*. Que
 * esa persona sea la dueña de la entrada que intenta publicar lo comprueba el
 * Servicio de Publicación contra la base de datos, nunca el cliente.
 */
export const UsuarioActual = createParamDecorator((_datos: unknown, contexto: ExecutionContext): string => {
  const peticion = contexto.switchToHttp().getRequest<Request>();
  const valor = peticion.headers[CABECERA_USUARIO];
  const usuarioId = Array.isArray(valor) ? valor[0] : valor;

  if (!usuarioId) {
    throw new UnauthorizedException({
      codigo: 'SIN_IDENTIDAD',
      mensaje: `Falta la cabecera ${CABECERA_USUARIO} (la sustituirá el API Gateway, ADR-02)`,
    });
  }
  if (!ES_UUID.test(usuarioId)) {
    throw new UnauthorizedException({
      codigo: 'IDENTIDAD_INVALIDA',
      mensaje: `${CABECERA_USUARIO} debe ser un UUID`,
    });
  }
  return usuarioId;
});
