import { Controller, Delete, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { UsuarioActual } from '../comun/usuario-actual.decorator';
import { ColaService } from './cola.service';

/**
 * Gastar un turno. **Lo pide el API Gateway, no el comprador** (ADR-15).
 *
 * El gateway exige el turno en la ruta de compra y lo gasta aquí antes de
 * dejar pasar la petición a Ventas. Por eso Ventas no llama a la Cola: el
 * diagrama de contenedores no tiene esa flecha, y no le hace falta.
 *
 * Va en su propio controlador y bajo `/interno/` para que se vea de un
 * vistazo: el gateway no enruta nada de aquí hacia fuera, así que esta ruta
 * solo es alcanzable desde dentro. Aun así autentica —con el token del
 * comprador, que el gateway reenvía—, porque la red no es un control de acceso
 * (RNF-06), y porque el turno tiene que ser de quien compra.
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

  @Delete('turnos/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gasta el turno de quien compra; devuelve su evento en X-Turno-Evento' })
  @ApiNoContentResponse({ description: 'Turno válido, de este usuario, y gastado' })
  @ApiNotFoundResponse({ description: 'No hay turno vivo de este usuario con ese token' })
  async consumir(
    @Param('token', ParseUUIDPipe) token: string,
    @UsuarioActual() usuarioId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    const eventoId = await this.cola.consumirTurnoDe(token, usuarioId);
    if (!eventoId) {
      throw new NotFoundException({ codigo: 'TURNO_INVALIDO' });
    }
    respuesta.setHeader('X-Turno-Evento', eventoId);
  }
}
