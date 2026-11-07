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
}
@Module({ imports: [PersistenciaModule], providers: [ConsultaPersonal], exports: [ConsultaPersonal] })
export class ConsultaPersonalModule {}
