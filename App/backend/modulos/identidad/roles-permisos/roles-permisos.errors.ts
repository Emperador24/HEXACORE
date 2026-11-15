import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

export class RolNoEncontrado extends NotFoundException {
  constructor() {
    super({ codigo: 'ROL_NO_ENCONTRADO', mensaje: 'No existe ese rol.' });
  }
}

/** Los cuatro roles del sistema no se editan, no se eliminan y no tienen matriz. */
export class RolDelSistema extends ConflictException {
  constructor() {
    super({
      codigo: 'ROL_DEL_SISTEMA',
      mensaje: 'Es un rol del sistema: sus permisos son fijos y no se puede editar ni eliminar.',
    });
  }
}

export class NombreRolOcupado extends ConflictException {
  constructor(nombre: string) {
    super({ codigo: 'NOMBRE_ROL_OCUPADO', mensaje: `Ya existe un rol llamado «${nombre}».` });
  }
}

/** Paso 5: *"valida que el rol tenga al menos un permiso asignado"*. */
export class RolSinPermisos extends UnprocessableEntityException {
  constructor() {
    super({ codigo: 'ROL_SIN_PERMISOS', mensaje: 'Marca al menos un permiso para el rol.' });
  }
}

/**
 * Otro administrador guardó el rol después de que lo abriste. Se devuelve la
 * versión vigente para que la pantalla muestre lo que hay y se decida de nuevo.
 */
export class VersionRolDesactualizada extends ConflictException {
  constructor(versionActual: number) {
    super({
      codigo: 'VERSION_DESACTUALIZADA',
      mensaje: 'Otro administrador cambió este rol mientras lo editabas. Revisa los cambios y vuelve a guardar.',
      versionActual,
    });
  }
}

/** CU-028A: *"el sistema exige reasignarlos primero"*. */
export class RolConUsuarios extends ConflictException {
  constructor(usuarios: number) {
    super({
      codigo: 'ROL_CON_USUARIOS',
      mensaje: `El rol tiene ${usuarios} ${usuarios === 1 ? 'usuario activo asignado' : 'usuarios activos asignados'}. Elige a qué rol reasignarlos antes de eliminarlo.`,
      usuarios,
    });
  }
}

export class ReasignacionNoValida extends UnprocessableEntityException {
  constructor(mensaje: string) {
    super({ codigo: 'REASIGNACION_NO_VALIDA', mensaje });
  }
}

export class AsignacionNoValida extends UnprocessableEntityException {
  constructor(codigo: string, mensaje: string) {
    super({ codigo, mensaje });
  }
}
