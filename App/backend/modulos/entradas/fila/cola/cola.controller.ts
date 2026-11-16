import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { UsuarioActual } from '../comun/usuario-actual.decorator';
import { ColaService } from './cola.service';
import { EstadoColaDto, TurnoDto } from './dto/cola.dto';

/**
 * Cola virtual: el turno para entrar a comprar (apoya CU-001).
 *
 * Pedir turno **exige sesión**. Si fuera anónimo, cualquiera podría llenar la
 * fila con solicitudes inventadas y dejar fuera a los compradores reales: la
 * identidad es lo que hace que un usuario ocupe un sitio y no mil.
 */
@ApiTags('cola')
@ApiBearerAuth()
@UseGuards(SesionValida)
@Controller('cola')
export class ColaController {
  constructor(private readonly cola: ColaService) {}

  @Post('eventos/:eventoId/turnos')
  @ApiOperation({ summary: 'Pide turno para comprar; devuelve token o puesto en la fila' })
  @ApiOkResponse({ type: TurnoDto })
  pedirTurno(
    @Param('eventoId', ParseUUIDPipe) eventoId: string,
    @UsuarioActual() usuarioId: string,
  ): Promise<TurnoDto> {
    return this.cola.pedirTurno(eventoId, usuarioId);
  }

  @Get('eventos/:eventoId')
  @ApiOperation({ summary: 'Cuántos están comprando y cuántos esperan' })
  @ApiOkResponse({ type: EstadoColaDto })
  estado(@Param('eventoId', ParseUUIDPipe) eventoId: string): Promise<EstadoColaDto> {
    return this.cola.estado(eventoId);
  }
}
