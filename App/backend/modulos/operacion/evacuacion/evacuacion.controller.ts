import { Body, Controller, Get, Header, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Put, Req, Sse, UseGuards, UsePipes } from '@nestjs/common';
import { Observable, catchError, exhaustMap, from, interval, map, of, startWith } from 'rxjs';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import {
  ActivarEvacuacionDto,
  BloqueoSalidaDto,
  CambiarNivelDto,
  CambiarRutaDto,
  FinalizarEvacuacionDto,
  GuardarPlanDto,
  ReporteZonaDto,
} from './dto/evacuacion.dto';
import { EvacuacionService } from './evacuacion.service';

/** Cada cuánto se empuja el estado por el flujo (RNF: propagación en segundos). */
const INTERVALO_MS = 2000;

/**
 * CU-010: Gestionar evacuación ante emergencias.
 *
 * Seguridad (RNF): solo el supervisor de emergencia activa, escala, cambia
 * rutas y finaliza. El sistema no tiene ese rol de cuenta (CU-027), así que lo
 * ejercen Organizador y Administrador, igual que en el monitoreo. El personal
 * operativo (`Personal`) ve la evacuación activa, reporta el avance de su zona
 * y avisa de una salida bloqueada (CU-010A), que es la información de campo
 * del paso 10.
 */
@Controller('emergencias')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
export class EvacuacionController {
  constructor(private readonly evacuacion: EvacuacionService) {}

  @Get('recintos/:recintoId/plan')
  plan(@Param('recintoId', ParseUUIDPipe) recintoId: string) {
    return this.evacuacion.plan(recintoId);
  }

  @Put('recintos/:recintoId/plan')
  guardarPlan(@Param('recintoId', ParseUUIDPipe) recintoId: string, @Body() dto: GuardarPlanDto, @Req() peticion: PeticionConSesion) {
    return this.evacuacion.guardarPlan(recintoId, dto, peticion.sesion!.usuarioId);
  }

  @Get('eventos')
  eventos() {
    return this.evacuacion.eventosOperables();
  }

  @Get('eventos/:eventoId/evacuaciones')
  historial(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.evacuacion.historialDeEvento(eventoId);
  }

  @Get('eventos/:eventoId/activa')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  activa(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.evacuacion.activaDeEvento(eventoId);
  }

  /** Pasos 1-6: registra la emergencia y devuelve la propuesta. */
  @Post('eventos/:eventoId/evacuaciones')
  proponer(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: ActivarEvacuacionDto, @Req() peticion: PeticionConSesion) {
    return this.evacuacion.proponer(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Get('evacuaciones/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.evacuacion.detalle(id);
  }

  /** Pasos 10-11 en tiempo real, por Server-Sent Events. */
  @Sse('evacuaciones/:id/flujo')
  @Header('X-Accel-Buffering', 'no')
  flujo(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return interval(INTERVALO_MS).pipe(
      startWith(0),
      exhaustMap(() =>
        from(this.evacuacion.detalle(id)).pipe(
          map((datos): MessageEvent => ({ type: 'evacuacion', data: datos })),
          catchError((error: Error & { response?: unknown }) => of<MessageEvent>({ type: 'error', data: error.response ?? { mensaje: error.message } })),
        ),
      ),
    );
  }

  /** Paso 7. */
  @Post('evacuaciones/:id/confirmar')
  confirmar(@Param('id', ParseUUIDPipe) id: string, @Req() peticion: PeticionConSesion) {
    return this.evacuacion.confirmar(id, peticion.sesion!.usuarioId);
  }

  @Post('evacuaciones/:id/descartar')
  descartar(@Param('id', ParseUUIDPipe) id: string, @Req() peticion: PeticionConSesion) {
    return this.evacuacion.descartar(id, peticion.sesion!.usuarioId);
  }

  /** Paso 10: el personal reporta cuánta gente queda en su zona. */
  @Patch('evacuaciones/:id/zonas/:zonaId')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  reportarZona(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
    @Body() dto: ReporteZonaDto,
    @Req() peticion: PeticionConSesion,
  ) {
    return this.evacuacion.reportarZona(id, zonaId, dto, peticion.sesion!.usuarioId);
  }

  /** CU-010B. */
  @Post('evacuaciones/:id/zonas/:zonaId/ruta')
  cambiarRuta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
    @Body() dto: CambiarRutaDto,
    @Req() peticion: PeticionConSesion,
  ) {
    return this.evacuacion.cambiarRuta(id, zonaId, dto.salidaId, dto.motivo, peticion.sesion!.usuarioId);
  }

  /** CU-010A. */
  @Post('evacuaciones/:id/salidas/:salidaId/bloqueo')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  bloqueo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('salidaId', ParseUUIDPipe) salidaId: string,
    @Body() dto: BloqueoSalidaDto,
    @Req() peticion: PeticionConSesion,
  ) {
    return this.evacuacion.bloqueoSalida(id, salidaId, dto.bloqueada, dto.motivo, peticion.sesion!.usuarioId);
  }

  /** CU-010D. */
  @Post('evacuaciones/:id/nivel')
  nivel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarNivelDto, @Req() peticion: PeticionConSesion) {
    return this.evacuacion.escalar(id, dto.nivel, dto.motivo, dto.zonasIds, peticion.sesion!.usuarioId);
  }

  /** Pasos 12-13. */
  @Post('evacuaciones/:id/finalizar')
  finalizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FinalizarEvacuacionDto, @Req() peticion: PeticionConSesion) {
    return this.evacuacion.finalizar(id, dto.observaciones, peticion.sesion!.usuarioId);
  }

  @Get('evacuaciones/:id/reporte')
  reporte(@Param('id', ParseUUIDPipe) id: string) {
    return this.evacuacion.reporte(id);
  }
}
