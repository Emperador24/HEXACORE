import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CarteleraController } from './cartelera.controller';
import { CarteleraService } from './cartelera.service';

/**
 * Cartelera pública: CU-005 (Consultar evento).
 *
 * Es todo el dominio de este servicio. Sus tres rutas son públicas —no llevan
 * guardia de sesión— porque la cartelera es la puerta de entrada al sistema:
 * se consulta antes de tener cuenta.
 */
@Module({
  imports: [PersistenciaModule],
  controllers: [CarteleraController],
  providers: [CarteleraService],
})
export class CarteleraModule {}
