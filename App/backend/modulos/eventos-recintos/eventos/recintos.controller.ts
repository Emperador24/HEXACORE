import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { CONEXION_EVENTOS } from '../persistencia/conexion';
import { Recinto } from '../persistencia/entidades/recinto.entity';

/**
 * Recintos activos con sus zonas, para elegir dónde se hace un evento.
 * Solo lectura: crearlos y editarlos es el CU-029.
 */
@Controller('recintos')
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
export class RecintosController {
  constructor(@InjectRepository(Recinto, CONEXION_EVENTOS) private readonly recintos: Repository<Recinto>) {}

  @Get()
  listar() {
    return this.recintos.find({ where: { activo: true }, order: { ciudad: 'ASC', nombre: 'ASC' } });
  }
}
