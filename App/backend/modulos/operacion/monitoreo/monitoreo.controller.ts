import { Body, Controller, Get, Header, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Req, Sse, UseGuards, UsePipes } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FlujoOperacionService } from '../comun/flujo-operacion.service';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { ModuloPermisos, PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { RegistrarDecisionDto, ResultadoDecisionDto } from './dto/decision.dto';
import { PanelService } from './panel.service';

/** Cada cuánto se recalcula el panel que se empuja por el flujo (RNF de rendimiento: "casi en tiempo real"). */
const INTERVALO_MS = 3000;

/**
 * CU-019: Monitorear el evento. El actor es el supervisor; como el sistema no
 * tiene ese rol de cuenta (CU-027), lo ejercen Organizador y Administrador.
 */
@Controller('monitoreo')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
@ModuloPermisos('reportes')
export class MonitoreoController {
  constructor(private readonly flujos: FlujoOperacionService, private readonly panel: PanelService) {}

  @Get('eventos')
  eventos() {
    return this.panel.eventosMonitoreables();
  }

  /** Paso 2, una vez. El portal lo usa si el flujo no está disponible. */
  @Get('eventos/:id/panel')
  estado(@Param('id', ParseUUIDPipe) id: string) {
    return this.panel.panel(id);
  }

  /**
   * Paso 2 en tiempo real: Server-Sent Events con el panel completo cada
   * `INTERVALO_MS`. La sesión y el permiso se revalidan durante la conexión
   * y antes de emitir. Un fallo saneado termina el flujo.
   */
  @Sse('eventos/:id/flujo')
  @Header('X-Accel-Buffering', 'no') // que el gateway no retenga los eventos
  flujo(@Param('id', ParseUUIDPipe) id: string, @Req() peticion: PeticionConSesion): Observable<MessageEvent> {
    const token = peticion.headers.authorization!.split(' ')[1];
    return this.flujos.seguir(() => this.panel.panelParaFlujo(id), token,
      { roles: ['Organizador', 'Administrador'], modulo: 'reportes', accion: 'leer' }, INTERVALO_MS, 'panel');
  }

  @Get('eventos/:id/alertas')
  alertas(@Param('id', ParseUUIDPipe) id: string) {
    return this.panel.historialAlertas(id);
  }

  @Post('eventos/:id/decisiones')
  decidir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrarDecisionDto, @Req() peticion: PeticionConSesion) {
    return this.panel.registrarDecision(id, dto, peticion.sesion!.usuarioId);
  }

  @Patch('eventos/:id/decisiones/:decisionId')
  resultado(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
    @Body() dto: ResultadoDecisionDto,
  ) {
    return this.panel.registrarResultado(id, decisionId, dto.resultado);
  }
}
