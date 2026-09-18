import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NombreRol } from '../persistencia/entidades/rol.entity';
import { PeticionAutenticada } from '../sesiones/sesion-requerida.guard';

/**
 * Exige que quien llama sea **ahora** Administrador y tenga la cuenta activa.
 *
 * Va detrás de `SesionRequerida`. No se fía de los roles del token: el token
 * los congela al iniciar sesión y dura una hora, así que a alguien a quien le
 * quitaron el rol de administrador hace cinco minutos le seguiría abriendo
 * estas rutas. Para acciones que desactivan o eliminan cuentas, se pregunta a
 * la base en cada petición; es una consulta por el índice de la clave.
 */
@Injectable()
export class AdministradorRequerido implements CanActivate {
  constructor(@InjectDataSource() private readonly fuenteDatos: DataSource) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const { sesion } = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const [fila] = (await this.fuenteDatos.query(
      `SELECT 1 FROM usuarios u
         JOIN usuarios_roles ur ON ur.usuario_id = u.id
         JOIN roles r ON r.id = ur.rol_id
        WHERE u.id = $1 AND u.estado = 'ACTIVA' AND r.nombre = $2
        LIMIT 1`,
      [sesion.sub, NombreRol.ADMINISTRADOR],
    )) as unknown[];
    if (!fila) {
      throw new ForbiddenException({
        codigo: 'ROL_INSUFICIENTE',
        mensaje: 'Esta operación es solo para administradores.',
      });
    }
    return true;
  }
}
