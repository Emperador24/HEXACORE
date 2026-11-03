import { Module } from '@nestjs/common';
import { ComunicacionesModule } from '../../modulos/comunicaciones/comunicaciones.module';
import { SaludController } from './salud.controller';

/** Solo correo existente y salud técnica; no carga módulos de negocio. */
@Module({ imports: [ComunicacionesModule], controllers: [SaludController] })
export class TrabajadorModule {}
