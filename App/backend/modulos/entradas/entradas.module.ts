import { Module } from '@nestjs/common';
import { VentasModule } from './ventas/ventas.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { FilaModule } from './fila/fila.module';
import { PostventaModule } from './postventa/postventa.module';
import { AccesoQrModule } from './acceso-qr/acceso-qr.module';
@Module({imports:[VentasModule,CatalogoModule,FilaModule,PostventaModule,AccesoQrModule]})
export class EntradasModule {}
