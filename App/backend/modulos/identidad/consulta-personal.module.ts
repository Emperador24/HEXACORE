import { Injectable, Module } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CONEXION_IDENTIDAD } from './persistencia/conexion';
import { PersistenciaModule } from './persistencia/persistencia.module';

/** Consulta mínima: no exporta credenciales ni entidades privadas a Alimentos. */
@Injectable()
export class ConsultaPersonal {
  constructor(@InjectDataSource(CONEXION_IDENTIDAD) private readonly datos: DataSource) {}
  async esPersonalActivo(usuarioId: string): Promise<boolean> {
    const [r] = await this.datos.query(`SELECT EXISTS (
      SELECT 1 FROM usuarios u JOIN usuarios_roles ur ON ur.usuario_id=u.id
      JOIN roles r ON r.id=ur.rol_id WHERE u.id=$1 AND u.estado='ACTIVA'
      AND u.eliminada_en IS NULL AND r.nombre='Personal') AS autorizado`, [usuarioId]);
    return r.autorizado;
  }
  /** La política sigue en Identidad; el llamador aporta su transacción de la base común.
   * FOR SHARE impide desactivar/eliminar la cuenta o retirar el rol mientras confirma.
   */
  async bloquearPersonalActivo(usuarioId: string, transaccion: { query(sql: string, parametros: any[]): Promise<any> }): Promise<boolean> {
    const usuarios = await transaccion.query(`SELECT u.id FROM identidad.usuarios u
      WHERE u.id=$1 AND u.estado='ACTIVA' AND u.eliminada_en IS NULL FOR SHARE`, [usuarioId]);
    if (!usuarios.length) return false;
    const roles = await transaccion.query(`SELECT ur.usuario_id FROM identidad.usuarios_roles ur
      JOIN identidad.roles r ON r.id=ur.rol_id WHERE ur.usuario_id=$1 AND r.nombre='Personal' FOR SHARE OF ur,r`, [usuarioId]);
    return roles.length > 0;
  }
  async buscarActivos(busqueda: string) {
    return this.datos.query(`SELECT u.id,u.nombre,u.email FROM usuarios u
      JOIN usuarios_roles ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id
      WHERE u.estado='ACTIVA' AND u.eliminada_en IS NULL AND r.nombre='Personal'
      AND (u.nombre ILIKE $1 OR u.email ILIKE $1) ORDER BY u.nombre,u.id LIMIT 50`, [`%${busqueda}%`]);
  }
  async resumen(ids: string[]) {
    if (!ids.length) return [];
    return this.datos.query(`SELECT u.id,u.nombre,u.email,
      (u.estado='ACTIVA' AND u.eliminada_en IS NULL AND EXISTS (
       SELECT 1 FROM usuarios_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=u.id AND r.nombre='Personal')) AS activo
      FROM usuarios u WHERE u.id=ANY($1::uuid[]) ORDER BY u.nombre,u.id`, [ids]);
  }
}
@Module({ imports: [PersistenciaModule], providers: [ConsultaPersonal], exports: [ConsultaPersonal] })
export class ConsultaPersonalModule {}
