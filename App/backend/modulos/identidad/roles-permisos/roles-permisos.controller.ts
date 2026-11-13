import { UseFilters, UsePipes } from '@nestjs/common';
import { BaseNoDisponibleFilter } from '../comun/base-no-disponible.filter';
import { validacionIdentidad } from '../../../compartido/validacion';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdministradorRequerido } from '../administracion-cuentas/administrador-requerido.guard';
import { SesionActual, SesionRequerida } from '../sesiones/sesion-requerida.guard';
import { ContenidoToken } from '../sesiones/sesiones.service';
import {
  AsignarUsuarioDto,
  CrearRolDto,
  DetalleRolDto,
  EditarRolDto,
  EliminarRolDto,
  ListaRolesDto,
  MisPermisosDto,
  RolDto,
} from './dto/roles-permisos.dto';
import { RolesPermisosService } from './roles-permisos.service';

/**
 * CU-028 · Gestión de roles y permisos. Solo para administradores,
 * comprobado contra la base en cada petición (pre-condición 1). La consume el
 * portal de administración.
 */
@ApiTags('roles y permisos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión válida' })
@ApiForbiddenResponse({ description: 'Quien llama no es un administrador activo' })
@UseGuards(SesionRequerida, AdministradorRequerido)
@UsePipes(validacionIdentidad)
@UseFilters(BaseNoDisponibleFilter)
@Controller('admin/roles')
export class RolesPermisosController {
  constructor(private readonly roles: RolesPermisosService) {}

  @Get()
  @ApiOperation({ summary: 'Roles y matriz de permisos por módulo (paso 2)' })
  @ApiResponse({ status: 200, type: ListaRolesDto })
  listar(): Promise<ListaRolesDto> {
    return this.roles.listar();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un rol: matriz, cuentas asignadas e historial' })
  @ApiResponse({ status: 200, type: DetalleRolDto })
  @ApiNotFoundResponse({ description: 'No existe ese rol' })
  detalle(@Param('id', ParseUUIDPipe) id: string): Promise<DetalleRolDto> {
    return this.roles.detalle(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un rol propio con su matriz (pasos 3 a 8)' })
  @ApiCreatedResponse({ type: RolDto })
  @ApiConflictResponse({ description: 'Ya existe un rol con ese nombre' })
  @ApiUnprocessableEntityResponse({ description: 'Sin ningún permiso (paso 5)' })
  crear(@Body() datos: CrearRolDto, @SesionActual() sesion: ContenidoToken): Promise<RolDto> {
    return this.roles.crear(datos, sesion.sub);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Editar la matriz de un rol propio',
    description:
      'Reemplaza la matriz completa. Se aplica en la petición siguiente de cada sesión abierta con ' +
      'ese rol, sin que tenga que volver a iniciar sesión (CU-028B).',
  })
  @ApiResponse({ status: 200, type: RolDto })
  @ApiConflictResponse({ description: 'Es un rol del sistema, o la versión no es la vigente' })
  @ApiUnprocessableEntityResponse({ description: 'Sin ningún permiso (paso 5)' })
  editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: EditarRolDto,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<RolDto> {
    return this.roles.editar(id, datos, sesion.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un rol propio (CU-028A)',
    description: 'Si tiene cuentas activas, exige `reasignarA`: pasan a ese rol en la misma transacción.',
  })
  @ApiConflictResponse({ description: 'Rol del sistema, versión no vigente, o tiene usuarios sin reasignar' })
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: EliminarRolDto,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<{ eliminado: string; reasignados: number }> {
    return this.roles.eliminar(id, datos, sesion.sub);
  }

  @Post(':id/usuarios')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asignar el rol a una cuenta, por su correo' })
  @ApiResponse({ status: 200, type: DetalleRolDto })
  @ApiNotFoundResponse({ description: 'No existe el rol o la cuenta' })
  asignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: AsignarUsuarioDto,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<DetalleRolDto> {
    return this.roles.asignar(id, datos.email, sesion.sub);
  }

  @Delete(':id/usuarios/:usuarioId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirar el rol a una cuenta' })
  @ApiResponse({ status: 200, type: DetalleRolDto })
  @ApiUnprocessableEntityResponse({ description: 'No lo tenía, o se quedaría sin ningún rol' })
  retirar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<DetalleRolDto> {
    return this.roles.retirar(id, usuarioId, sesion.sub);
  }
}

/**
 * Lo que puede hacer quien tiene la sesión. Cualquier cuenta lo consulta; el
 * portal lo pide al entrar y al renovar el token.
 */
@ApiTags('roles y permisos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión válida' })
@UseGuards(SesionRequerida)
@UseFilters(BaseNoDisponibleFilter)
@Controller('cuentas/permisos')
export class MisPermisosController {
  constructor(private readonly roles: RolesPermisosService) {}

  @Get()
  @ApiOperation({ summary: 'Roles y permisos vigentes de la cuenta con sesión (CU-028)' })
  @ApiResponse({ status: 200, type: MisPermisosDto })
  vigentes(@SesionActual() sesion: ContenidoToken): Promise<MisPermisosDto> {
    return this.roles.vigentesDe(sesion.sub);
  }
}
