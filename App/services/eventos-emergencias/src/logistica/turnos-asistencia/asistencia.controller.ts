import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import type { PeticionDeLogistica } from './autorizacion.guard.js';
import { ContextoDeLogistica } from './autorizacion.guard.js';
import { AsistenciaService } from './asistencia.service.js';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto.js';

// El punto de control (kiosco/dispositivo) debe tener sesión propia para
// operar — pero a QUIÉN se marca entrada/salida lo decide `dto.credencial`
// (el QR/NFC del carné escaneado), no quién está logueado en el dispositivo.
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
}
