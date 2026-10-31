import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { BandejaSalida } from '../comun/eventos/bandeja-salida.service';
import { Contadores } from './contadores';
import { IngresoService } from './ingreso.service';
import { IngresosController } from './ingresos.controller';
import { ProyeccionQr } from './proyeccion-qr.service';

/**
 * Acceso QR: validar la entrada en la puerta (CU-002).
 *
 * No importa nada de venta ni de reventa, y no llama a nadie: lo único que
 * necesita de fuera son los eventos de Ventas, que `ProyeccionQr` convierte en
 * su copia local de los QR, y lo único que da hacia fuera es
 * `IngresoRegistrado`, por su bandeja de salida (ADR-15).
 */
@Module({
  imports: [PersistenciaModule, AutenticacionModule],
  controllers: [IngresosController],
  providers: [IngresoService, Contadores, ProyeccionQr, BandejaSalida],
})
export class AccesoModule {}
