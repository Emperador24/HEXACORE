import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PeticionConSesion } from '../../comun/autenticacion/sesion-valida.guard.js';
import { Empleado } from './entities/empleado.entity.js';
import {
  JEFE_DE_PERSONAL,
  ROLES_DE_CUENTA_QUE_SUPERVISAN,
} from './turnos-asistencia.constants.js';

/**
 * Quién puede hacer qué en logística.
 *
 * ## Por qué no basta con los roles del token
 *
 * El token solo distingue los cuatro roles de cuenta del sistema (CU-027):
 * `Cliente`, `Personal`, `Organizador`, `Administrador`. Un empleado de
 * entrada y el Jefe de personal llevan **exactamente el mismo** rol de
 * cuenta, `Personal` — se puede comprobar descifrando los dos tokens.
 *
 * La jefatura no es un rol de cuenta: es el campo `rol` de la ficha de
 * `Empleado`, que vive en la base de datos *de este servicio* (ADR-01, una
 * base por servicio). Así que la decisión se toma aquí, cruzando el `sub` del
 * token con la ficha local, y no en el gateway ni en Administración, que no
 * saben nada de áreas de trabajo.
 */
export interface PeticionDeLogistica extends PeticionConSesion {
  /** Ficha del solicitante, o `null` si su cuenta no está dada de alta. */
  empleado?: Empleado | null;
  /** Si puede ver y tocar el trabajo de los demás, y no solo el suyo. */
  supervisa?: boolean;
}

/**
 * Resuelve quién hace la petición. No rechaza a nadie: solo deja la ficha y
 * la respuesta a "¿supervisa?" colgadas de la petición, para que cada ruta
 * decida. Va a nivel de controlador, después de `SesionValida`.
 */
@Injectable()
export class ContextoDeLogistica implements CanActivate {
  constructor(
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionDeLogistica>();
    const { usuarioId, roles } = peticion.sesion!;

    // Solo la ficha activa cuenta: a quien se da de baja se le retira el
    // mando junto con el acceso.
    const empleado = await this.empleados.findOneBy({ usuarioId, activo: true });

    peticion.empleado = empleado;
    peticion.supervisa =
      empleado?.rol === JEFE_DE_PERSONAL ||
      roles.some((rol) => ROLES_DE_CUENTA_QUE_SUPERVISAN.includes(rol));

    return true;
  }
}

/**
 * Cierra una ruta a quien no supervisa. Exige que `ContextoDeLogistica` haya
 * corrido antes — por eso aquel va en el controlador y este en el método:
 * Nest ejecuta los guardias de clase antes que los de ruta.
 */
@Injectable()
export class SoloQuienSupervisa implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionDeLogistica>();
    if (!peticion.supervisa) {
      throw new ForbiddenException({
        codigo: 'NO_SUPERVISA',
        mensaje: 'Esta operación es solo para el Jefe de personal.',
      });
    }
    return true;
  }
}
