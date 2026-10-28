import { Controller, Delete, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { ColaService } from './cola.service';

/**
 * Gastar un turno. **Lo llama Ventas, no el comprador.**
 *
 * Va en su propio controlador y bajo `/interno/` para que se vea de un
 * vistazo: el gateway no enruta nada de aquí, así que esta ruta solo es
 * alcanzable desde dentro. Aun así autentica, porque la red no es un control
 * de acceso (RNF-06).
 *
 * Es `DELETE` y no `POST` a propósito: gastar el turno **lo destruye**. Un
 * token sirve una vez; si sirviera dos, el aforo que la cola protege dejaría
 * de significar nada.
 */
@ApiTags('cola')
@ApiBearerAuth()
@UseGuards(SesionValida)
@Controller('interno/cola')
export class TurnosInternosController {
  constructor(private readonly cola: ColaService) {}

  @Delete('eventos/:eventoId/turnos/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gasta el turno; falla si no existe o ya caducó' })
  @ApiNoContentResponse({ description: 'Turno válido y gastado' })
  @ApiNotFoundResponse({ description: 'No hay turno vivo con ese token' })
  async consumir(
    @Param('eventoId', ParseUUIDPipe) eventoId: string,
    @Param('token', ParseUUIDPipe) token: string,
  ): Promise<void> {
    if (!(await this.cola.consumirTurno(eventoId, token))) {
      throw new NotFoundException({ codigo: 'TURNO_INVALIDO' });
    }
  }
}
