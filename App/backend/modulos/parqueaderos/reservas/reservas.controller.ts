import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { PagarReservaDto, ReservarDto } from '../dto/parqueaderos.dto';
import { ReservasService } from './reservas.service';

/**
 * CU-021: Reservar parqueadero. El cliente lo hace desde el portal web o la
 * app móvil (RNF-14, mismo contrato); cada uno solo ve sus reservas. El
 * organizador consulta las del evento.
 */
@Controller('parqueaderos')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Cliente')
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  /** Pasos 1-2: zonas, espacios libres por tipo de vehículo y precio. */
  @Get('eventos/:eventoId/disponibilidad')
  @RolesPermitidos('Cliente', 'Organizador', 'Administrador', 'Personal')
  disponibilidad(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query('llegada') llegada?: string) {
    return this.reservas.disponibilidad(eventoId, llegada);
  }

  /** Pasos 3-4: retiene un espacio mientras se paga. */
  @Post('eventos/:eventoId/reservas')
  reservar(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: ReservarDto, @Req() peticion: PeticionConSesion) {
    return this.reservas.reservar(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Get('eventos/:eventoId/reservas')
  @RolesPermitidos('Organizador', 'Administrador')
  delEvento(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.reservas.delEvento(eventoId);
  }

  @Get('reservas')
  mias(@Req() peticion: PeticionConSesion) {
    return this.reservas.mias(peticion.sesion!.usuarioId);
  }

  @Get('reservas/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Req() peticion: PeticionConSesion) {
    return this.reservas.detalle(id, peticion.sesion!.usuarioId);
  }

  /** Pasos 5-9: cobra, genera el QR y envía la confirmación. */
  @Post('reservas/:id/pagar')
  pagar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PagarReservaDto, @Req() peticion: PeticionConSesion) {
    return this.reservas.pagar(id, dto.token, peticion.sesion!.usuarioId);
  }
}
