import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, Module } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { ConsultaPersonal, ConsultaPersonalModule } from '../../identidad/consulta-personal.module';
import { PeticionConSesion } from '../comun/autenticacion/sesion-valida.guard';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { PersonalEstablecimiento } from '../persistencia/entidades/personal-establecimiento.entity';
import { PersistenciaModule } from '../persistencia/persistencia.module';

@Injectable()
export class PersonalDelEstablecimiento implements CanActivate {
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource, private readonly cuentas: ConsultaPersonal) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const r = ctx.switchToHttp().getRequest<PeticionConSesion>();
    const establecimientoId = r.params.establecimientoId;
    if (typeof establecimientoId !== 'string' || !isUUID(establecimientoId)) throw new BadRequestException('Identificador de establecimiento inválido');
    if (!r.sesion || !await this.cuentas.esPersonalActivo(r.sesion.usuarioId) ||
      !await this.datos.getRepository(PersonalEstablecimiento).existsBy({ establecimientoId, usuarioId: r.sesion.usuarioId })) {
      throw new ForbiddenException('Tu cuenta no está vinculada a este establecimiento.');
    }
    return true;
  }
}
@Module({ imports: [PersistenciaModule, ConsultaPersonalModule], providers: [PersonalDelEstablecimiento], exports: [PersonalDelEstablecimiento, ConsultaPersonalModule] })
export class PersonalEstablecimientoModule {}
