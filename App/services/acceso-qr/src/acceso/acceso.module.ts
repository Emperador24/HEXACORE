import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { ClienteVentas } from './cliente-ventas.service';
import { Contadores } from './contadores';
import { IngresoService } from './ingreso.service';
import { IngresosController } from './ingresos.controller';

/**
 * Acceso QR: validar la entrada en la puerta (CU-002).
 *
 * No importa nada de venta ni de reventa. Lo único que necesita de fuera es
 * que Ventas gaste el QR, y eso entra por `ClienteVentas` —un puerto, no una
 * dependencia de código—.
 */
@Module({
  imports: [PersistenciaModule, AutenticacionModule],
  controllers: [IngresosController],
  providers: [IngresoService, Contadores, ClienteVentas],
})
export class AccesoModule {}
