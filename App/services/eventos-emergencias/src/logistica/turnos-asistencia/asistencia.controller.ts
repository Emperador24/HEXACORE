import { Body, Controller, Get, Post } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service.js';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto.js';

@Controller('asistencia')
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
