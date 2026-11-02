import { Module } from '@nestjs/common';
import { TurnosAsistenciaModule } from './turnos-asistencia/turnos-asistencia.module';

/** API pública del código existente de CU-017/018; no implementa Operación. */
@Module({ imports: [TurnosAsistenciaModule] })
export class PersonalLogisticaModule {}
