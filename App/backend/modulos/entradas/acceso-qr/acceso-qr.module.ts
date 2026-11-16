import { Module } from '@nestjs/common';
import { AccesoModule } from './acceso/acceso.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';

/** Composición del componente existente de acceso QR dentro de Boletería. */
@Module({
  imports: [ConfigModule, PersistenciaModule, AccesoModule],
})
export class AccesoQrModule {}
