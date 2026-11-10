import { ConsultaEventosModule } from '../../eventos-recintos/consulta-eventos.module';
import { InventarioModule } from '../inventario/inventario.module';
import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [ConsultaEventosModule, PersistenciaModule, AutenticacionModule, InventarioModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
