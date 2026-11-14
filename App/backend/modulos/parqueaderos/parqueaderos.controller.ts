import { Body, Controller, Delete, Get, Header, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Sse, UseGuards, UsePipes } from '@nestjs/common';
import { Observable } from 'rxjs';
import { validacionAlimentos as validacion } from '../../compartido/validacion';
import { PeticionConSesion, RolesPermitidos, SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { AccesosService } from './accesos/accesos.service';
import { AsignacionService } from './asignacion/asignacion.service';
import { CobroService } from './cobro/cobro.service';
import {
  ActualizarEspacioDto,
  ActualizarZonaDto,
  DefinirTarifaDto,
  GuardarZonaDto,
  RedirigirDto,
  RegistrarIngresoDto,
  RegistrarSalidaDto,
  ResultadoRedireccionDto,
  SincronizarDto,
} from './dto/parqueaderos.dto';
import { OcupacionService } from './ocupacion/ocupacion.service';
import { FlujoOcupacionService } from './ocupacion/flujo-ocupacion.service';

/**
 * CU-022 (Ingreso y salida), CU-023 (Asignación de espacios), CU-024 (Cobro)
 * y CU-025 (Control de ocupación). La reserva del cliente (CU-021) está en
 * `ReservasController`.
 *
 * El operador y el supervisor del panel trabajan en el Portal Web
 * Administrativo: Organizador y Administrador. El personal de parqueadero
 * (`Personal`) registra ingresos y salidas en el punto de control, también sin
 * red, y consulta la tarifa, los espacios y la zona recomendada. La tarifa
 * solo la cambia el Administrador.
 */
@Controller('parqueaderos')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
export class ParqueaderosController {
  constructor(
    private readonly cobro: CobroService,
    private readonly ocupacion: OcupacionService,
    private readonly accesos: AccesosService,
    private readonly asignacion: AsignacionService,
    private readonly flujoOcupacion: FlujoOcupacionService,
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

  // --- Ingreso y salida (CU-022) -----------------------------------------------------

  /** Pasos 1-4: por QR de la reserva o por placa; CU-023 asigna el espacio. */
  @Post('eventos/:eventoId/ingresos')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  ingreso(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: RegistrarIngresoDto, @Req() peticion: PeticionConSesion) {
    return this.accesos.registrarIngreso(eventoId, dto, peticion.sesion!.usuarioId);
  }

  /** Pasos 5-9 y CU-024, pasos 1-6: registra la salida, libera el espacio y muestra el cobro. */
  @Post('eventos/:eventoId/salidas')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  salida(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: RegistrarSalidaDto, @Req() peticion: PeticionConSesion) {
    return this.accesos.registrarSalida(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Get('eventos/:eventoId/vehiculos')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  vehiculos(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query('enLote') enLote?: string) {
    return this.accesos.vehiculos(eventoId, enLote !== 'false');
  }

  /** Offline-first: lo que el punto de control guarda para validar sin red. */
  @Get('eventos/:eventoId/cache')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  cache(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.accesos.cache(eventoId);
  }

  /** Offline-first: lo registrado sin red, en orden e idempotente por id. */
  @Post('eventos/:eventoId/sincronizacion')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  sincronizar(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: SincronizarDto, @Req() peticion: PeticionConSesion) {
    return this.accesos.sincronizar(eventoId, dto.registros, peticion.sesion!.usuarioId);
  }

  // --- Espacios (CU-023) ------------------------------------------------------------

  @Get('eventos/:eventoId/espacios')
  @RolesPermitidos('Organizador', 'Administrador', 'Personal')
  espacios(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query('zonaId', new ParseUUIDPipe({ optional: true })) zonaId?: string) {
    return this.asignacion.espacios(eventoId, zonaId);
  }

  @Patch('eventos/:eventoId/espacios/:espacioId')
  actualizarEspacio(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Param('espacioId', ParseUUIDPipe) espacioId: string, @Body() dto: ActualizarEspacioDto) {
    return this.asignacion.actualizarEspacio(eventoId, espacioId, dto);
  }

  /** Paso 8: historial de asignaciones y liberaciones. */
  @Get('eventos/:eventoId/asignaciones')
  asignaciones(@Param('eventoId', ParseUUIDPipe) eventoId: string) {
    return this.asignacion.historial(eventoId);
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
  flujo(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Req() peticion: PeticionConSesion): Observable<MessageEvent> {
    return this.flujoOcupacion.seguir(eventoId, peticion.headers.authorization!.split(' ')[1]);
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
