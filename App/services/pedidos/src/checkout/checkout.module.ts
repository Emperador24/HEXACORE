import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [PersistenciaModule, AutenticacionModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
