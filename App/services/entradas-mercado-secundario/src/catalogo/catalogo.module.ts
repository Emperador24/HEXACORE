import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CarteleraController } from './cartelera.controller';
import { CarteleraService } from './cartelera.service';

/**
 * Catálogo de eventos: CU-005 (Consultar evento).
 *
 * Módulo hermano de `ReventaModule`, sin depender de él: la cartelera no
 * necesita Redis, ni la pasarela, ni RabbitMQ, así que si cualquiera de ellos
 * cae, la cartelera sigue respondiendo. Es lo que la ficha pide al llamarla
 * *"la puerta de entrada al sistema"*: alta disponibilidad.
 *
 * Aquí llegarán la compra (CU-001), las promociones (CU-004) y las
 * cancelaciones (CU-003), que comparten las localidades y su cupo.
 */
@Module({
  imports: [PersistenciaModule],
  controllers: [CarteleraController],
  providers: [CarteleraService],
})
export class CatalogoModule {}
