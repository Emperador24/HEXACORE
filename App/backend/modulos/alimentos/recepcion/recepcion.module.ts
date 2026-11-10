import { EntregaController } from './entrega.controller';
import { EntregaService } from './entrega.service';
import { PersonalEstablecimientoModule } from '../establecimientos/personal-establecimiento.module';
import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { RecepcionController, SeguimientoClienteController } from './recepcion.controller';
import { RecepcionService } from './recepcion.service';
import { PreparacionService } from './preparacion.service';

@Module({ imports: [PersonalEstablecimientoModule, PersistenciaModule, AutenticacionModule], controllers: [RecepcionController, SeguimientoClienteController, EntregaController], providers: [RecepcionService, PreparacionService, EntregaService] })
export class RecepcionModule {}
