import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { RecepcionController } from './recepcion.controller';
import { RecepcionService } from './recepcion.service';

@Module({ imports: [PersistenciaModule, AutenticacionModule], controllers: [RecepcionController], providers: [RecepcionService] })
export class RecepcionModule {}
