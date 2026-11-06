import { Body, Controller, Delete, Get, Header, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Sse, UseGuards, UsePipes } from '@nestjs/common';
import { Observable, catchError, exhaustMap, from, interval, map, of, startWith } from 'rxjs';
import { validacionAlimentos as validacion } from '../../compartido/validacion';
import { PeticionConSesion, RolesPermitidos, SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { CobroService } from './cobro/cobro.service';
import {
  ActualizarZonaDto,
  DefinirTarifaDto,
  GuardarZonaDto,
  RedirigirDto,
  RegistrarIngresoDto,
  RegistrarSalidaDto,
  ResultadoRedireccionDto,
} from './dto/parqueaderos.dto';
import { OcupacionService } from './ocupacion/ocupacion.service';

/** Cada cuánto se empuja el panel de ocupación (RNF: casi en tiempo real). */
const INTERVALO_MS = 3000;

/**
 * CU-024 (Cobro) y CU-025 (Control de ocupación).
 *
 * El operador y el supervisor del panel trabajan en el Portal Web
 * Administrativo: Organizador y Administrador. El personal de parqueadero
 * (`Personal`) registra ingresos y salidas y consulta la tarifa y la zona
 * recomendada. La tarifa solo la cambia el Administrador.
 */
@Controller('parqueaderos')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
export class ParqueaderosController {
  constructor(
    private readonly cobro: CobroService,
    private readonly ocupacion: OcupacionService,
  ) {}

  // --- Tarifa (CU-024) ---------------------------------------------------------

  @Get('tarifa')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  tarifa() {
    return this.cobro.tarifa();
  }

  @Put('tarifa')
  @RolesPermitidos('Administrador')
  definirTarifa(@Body() dto: DefinirTarifaDto, @Req() peticion: PeticionConSesion) {
    return this.cobro.definirTarifa(dto, peticion.sesion!.usuarioId);
  }

  // --- Zonas -------------------------------------------------------------------

  @Get('eventos/:eventoId/zonas')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  zonas(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.cobro.zonas(eventoId);
  }

  @Post('eventos/:eventoId/zonas')
  crearZona(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: GuardarZonaDto, @Req() peticion: PeticionConSesion) {
    return this.cobro.crearZona(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Patch('eventos/:eventoId/zonas/:zonaId')
  actualizarZona(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Param('zonaId', ParseUUIDPipe) zonaId: string, @Body() dto: ActualizarZonaDto) {
    return this.cobro.actualizarZona(eventoId, zonaId, dto);
  }

  @Delete('eventos/:eventoId/zonas/:zonaId')
  eliminarZona(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Param('zonaId', ParseUUIDPipe) zonaId: string) {
    return this.cobro.eliminarZona(eventoId, zonaId);
  }

  // --- Ingreso y salida ----------------------------------------------------------

  @Post('eventos/:eventoId/ingresos')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  ingreso(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: RegistrarIngresoDto, @Req() peticion: PeticionConSesion) {
    return this.cobro.registrarIngreso(eventoId, dto, peticion.sesion!.usuarioId);
  }

  /** CU-024, pasos 1-6: registra la salida y muestra el cobro. */
  @Post('eventos/:eventoId/salidas')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  salida(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: RegistrarSalidaDto, @Req() peticion: PeticionConSesion) {
    return this.cobro.registrarSalida(eventoId, dto.placa, peticion.sesion!.usuarioId);
  }

  @Get('eventos/:eventoId/vehiculos')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  vehiculos(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query('enLote') enLote?: string) {
    return this.cobro.vehiculos(eventoId, enLote !== 'false');
  }

  // --- Ocupación (CU-025) --------------------------------------------------------

  /** Paso 7: la zona que se indica a quien entra. */
  @Get('eventos/:eventoId/recomendacion')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  async recomendacion(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.ocupacion.panel(eventoId).then((p) => p.recomendacion);
  }

  @Get('eventos/:eventoId/ocupacion')
  panel(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.ocupacion.panel(eventoId);
  }

  @Sse('eventos/:eventoId/ocupacion/flujo')
  @Header('X-Accel-Buffering', 'no')
  flujo(@Param('eventoId', ParseUUIDPipe) eventoId: string): Observable<MessageEvent> {
    return interval(INTERVALO_MS).pipe(
      startWith(0),
      exhaustMap(() =>
        from(this.ocupacion.panel(eventoId)).pipe(
          map((datos): MessageEvent => ({ type: 'ocupacion', data: datos })),
          catchError((error: Error & { response?: unknown }) => of<MessageEvent>({ type: 'error', data: error.response ?? { mensaje: error.message } })),
        ),
      ),
    );
  }

  /** Pasos 6-8. */
  @Post('eventos/:eventoId/redirecciones')
  redirigir(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: RedirigirDto, @Req() peticion: PeticionConSesion) {
    return this.ocupacion.redirigir(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Patch('eventos/:eventoId/redirecciones/:redireccionId')
  resultado(
    @Param('eventoId', ParseUUIDPipe) eventoId: string,
    @Param('redireccionId', ParseUUIDPipe) redireccionId: string,
    @Body() dto: ResultadoRedireccionDto,
  ) {
    return this.ocupacion.resultado(eventoId, redireccionId, dto.resultado, dto.terminar ?? false);
  }
}
