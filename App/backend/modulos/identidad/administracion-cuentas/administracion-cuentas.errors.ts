import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

/** La cuenta ya está en el estado pedido, o la transición no tiene sentido. */
export class TransicionNoValida extends ConflictException {
  constructor(mensaje: string) {
    super({ codigo: 'TRANSICION_NO_VALIDA', mensaje });
  }
}

/**
 * Un administrador no puede desactivarse ni eliminarse a sí mismo.
 *
 * No es cortesía: si fuera el único administrador, nadie podría deshacerlo.
 * Y si no lo es, que lo haga otro deja constancia de dos personas.
 */
export class AutoAdministracion extends UnprocessableEntityException {
  constructor() {
    super({
      codigo: 'AUTO_ADMINISTRACION',
      mensaje: 'No puedes desactivar ni eliminar tu propia cuenta. Pídeselo a otro administrador.',
    });
  }
}

/** Quedaría el sistema sin ningún administrador activo. */
export class UltimoAdministrador extends UnprocessableEntityException {
  constructor() {
    super({
      codigo: 'ULTIMO_ADMINISTRADOR',
      mensaje: 'Es el último administrador activo: el sistema quedaría sin nadie que pueda administrarlo.',
    });
  }
}
