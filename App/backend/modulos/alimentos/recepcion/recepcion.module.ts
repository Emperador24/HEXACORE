import { EntregaController } from './entrega.controller';
import { PagosModule } from '../../finanzas/pagos';
import { InventarioModule } from '../inventario/inventario.module';
import { CancelacionController } from './cancelacion.controller';
import { CancelacionService } from './cancelacion.service';
import { ClienteReembolsos } from './cliente-reembolsos.service';
import { EntregaService } from './entrega.service';
import { PersonalEstablecimientoModule } from '../establecimientos/personal-establecimiento.module';
import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { RecepcionController, SeguimientoClienteController } from './recepcion.controller';
import { RecepcionService } from './recepcion.service';
import { PreparacionService } from './preparacion.service';

@Module({ imports: [PersonalEstablecimientoModule, PersistenciaModule, AutenticacionModule, PagosModule, InventarioModule], controllers: [RecepcionController, SeguimientoClienteController, EntregaController, CancelacionController], providers: [RecepcionService, PreparacionService, EntregaService, ClienteReembolsos, CancelacionService] })
export class RecepcionModule {}
