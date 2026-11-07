import { InventarioModule } from '../inventario/inventario.module';
import { ConsultaEventosModule } from '../../eventos-recintos/consulta-eventos.module';
import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

@Module({
  imports: [InventarioModule, ConsultaEventosModule, PersistenciaModule],
  controllers: [CatalogoController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
