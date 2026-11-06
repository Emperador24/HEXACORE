import { UsePipes } from '@nestjs/common';
import { validacionLogistica } from '../../../compartido/validacion';
import { Body, Controller, Get, NotFoundException, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import type { PeticionDeLogistica } from './autorizacion.guard';
import { ContextoDeLogistica, SoloQuienSupervisa } from './autorizacion.guard';
import { AsistenciaService } from './asistencia.service';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto';

// El punto de control (kiosco/dispositivo) debe tener sesión propia para
// operar — pero a QUIÉN se marca entrada/salida lo decide `dto.credencial`
// (el QR/NFC del carné escaneado), no quién está logueado en el dispositivo.
@UsePipes(validacionLogistica)
@Controller('logistica/asistencia')
@UseGuards(SesionValida, ContextoDeLogistica)
export class AsistenciaController {
  constructor(private readonly asistenciaService: AsistenciaService) {}

  @Post('entrada')
  registrarEntrada(@Body() dto: RegistrarAsistenciaDto) {
    return this.asistenciaService.registrarEntrada(dto);
  }

  @Post('salida')
  registrarSalida(@Body() dto: RegistrarAsistenciaDto) {
    return this.asistenciaService.registrarSalida(dto);
  }

  /**
   * El historial de fichajes: el de todos si supervisa, el propio si no.
   *
   * Marcar entrada y salida sigue rigiéndose por la credencial escaneada (ver
   * la nota de arriba); lo que se acota aquí es **consultar** el historial,
   * que es otra cosa: antes cualquier empleado veía a qué hora entró y salió
   * cada uno de sus compañeros.
   */
  @Get()
  listarRegistros(@Req() peticion: PeticionDeLogistica) {
    if (peticion.supervisa) return this.asistenciaService.listarRegistros();
    return this.asistenciaService.registrosDeEmpleado(
      peticion.empleado?.id ?? null,
    );
  }

  /**
   * CU-009, pasos 12-13: horas trabajadas, puntualidad y estado de cada
   * empleado de un evento (`eventoId`) o de un rango (`desde`, `hasta`).
   */
  @Get('reporte')
  @UseGuards(SoloQuienSupervisa)
  reporte(
    @Query('eventoId') eventoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.asistenciaService.reporte({ eventoId, desde, hasta });
  }

  /** CU-009, post-condición 2: si quien pregunta está "En turno" o "Fuera de turno". */
  @Get('estado')
  async miEstado(@Req() peticion: PeticionDeLogistica) {
    if (!peticion.empleado) {
      throw new NotFoundException({ codigo: 'SIN_FICHA_DE_EMPLEADO', mensaje: 'Tu cuenta no está dada de alta como empleado.' });
    }
    return { empleadoId: peticion.empleado.id, estado: await this.asistenciaService.estadoDe(peticion.empleado.id) };
  }
}
