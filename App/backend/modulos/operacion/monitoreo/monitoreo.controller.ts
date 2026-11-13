import { Body, Controller, Get, Header, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Req, Sse, UseGuards, UsePipes } from '@nestjs/common';
import { Observable, catchError, exhaustMap, from, interval, map, of, startWith } from 'rxjs';
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
  constructor(private readonly panel: PanelService) {}

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
   * `INTERVALO_MS`. `exhaustMap` evita apilar cálculos si uno tarda más que el
   * intervalo; un error se envía como evento y el flujo sigue.
   */
  @Sse('eventos/:id/flujo')
  @Header('X-Accel-Buffering', 'no') // que el gateway no retenga los eventos
  flujo(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return interval(INTERVALO_MS).pipe(
      startWith(0),
      exhaustMap(() =>
        from(this.panel.panel(id)).pipe(
          map((datos): MessageEvent => ({ type: 'panel', data: datos })),
          catchError((error: Error & { response?: unknown }) => of<MessageEvent>({ type: 'error', data: error.response ?? { mensaje: error.message } })),
        ),
      ),
    );
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
