import { BadRequestException, Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { validacionAlimentos } from '../../../compartido/validacion';
import { RolesPermitidos, SesionValida, PeticionConSesion } from '../comun/autenticacion/sesion-valida.guard';
import { PersonalDelEstablecimiento } from '../establecimientos/personal-establecimiento.module';
import { ConfirmarEntregaDto, PrevalidarEntregaDto } from './entrega.dto';
import { EntregaService } from './entrega.service';

@ApiTags('entrega de pedidos')
@ApiBearerAuth()
@Controller('pedidos/establecimientos/:establecimientoId/entregas')
@UseGuards(SesionValida, PersonalDelEstablecimiento)
@RolesPermitidos('Personal')
@UsePipes(validacionAlimentos)
export class EntregaController {
  constructor(private readonly entregas: EntregaService) {}
  @Post('prevalidar')
  @HttpCode(200)
  prevalidar(@Param('establecimientoId', ParseUUIDPipe) local: string, @Body() d: PrevalidarEntregaDto, @Req() r: PeticionConSesion) {
    return this.entregas.prevalidar(local, r.sesion!.usuarioId, d.codigoQr);
  }
  @Post('confirmar')
  @HttpCode(200)
  confirmar(@Param('establecimientoId', ParseUUIDPipe) local: string, @Headers('idempotency-key') id: string,
    @Body() d: ConfirmarEntregaDto, @Req() r: PeticionConSesion) {
    if (typeof id !== 'string' || !isUUID(id)) throw new BadRequestException('Indica Idempotency-Key con UUID.');
    return this.entregas.confirmar(local, r.sesion!.usuarioId, id, d);
  }
}
