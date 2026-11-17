import { Module } from '@nestjs/common';
import { PlanificacionModule } from './planificacion/planificacion.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { TurnosAsistenciaModule } from './turnos-asistencia/turnos-asistencia.module';

/** API pública de CU-007/008/009/017/018 (turnos y asistencia), CU-016 (planificación) y CU-030 (proveedores). */
@Module({
  imports: [TurnosAsistenciaModule, ProveedoresModule, PlanificacionModule],
  exports: [TurnosAsistenciaModule],
})
export class PersonalLogisticaModule {}
