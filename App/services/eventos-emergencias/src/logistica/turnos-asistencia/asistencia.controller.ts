import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import { AsistenciaService } from './asistencia.service.js';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto.js';

// El punto de control (kiosco/dispositivo) debe tener sesión propia para
// operar — pero a QUIÉN se marca entrada/salida lo decide `dto.credencial`
// (el QR/NFC del carné escaneado), no quién está logueado en el dispositivo.
@Controller('logistica/asistencia')
@UseGuards(SesionValida)
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

  @Get()
  listarRegistros() {
    return this.asistenciaService.listarRegistros();
  }
}
