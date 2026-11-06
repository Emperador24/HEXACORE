import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UploadedFile,
  UseGuards, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { GuardarRecintoDto } from './dto/guardar-recinto.dto';
import { ArchivoSubido, MAX_PLANO_BYTES, RecintosService } from './recintos.service';

/**
 * CU-029: Gestión de recintos y zonas. Organizador y Administrador
 * (precondición 1). `GET recintos` sin parámetros devuelve solo los activos:
 * es lo que usa el formulario de eventos (CU-026).
 */
@Controller('recintos')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
export class RecintosController {
  constructor(private readonly recintos: RecintosService) {}

  @Get()
  listar(@Query('todos') todos?: string) {
    return this.recintos.listar(todos === 'true');
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.recintos.detalle(id);
  }

  @Post()
  crear(@Body() dto: GuardarRecintoDto, @Req() peticion: PeticionConSesion) {
    return this.recintos.crear(dto, peticion.sesion!.usuarioId);
  }

  @Put(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarRecintoDto, @Req() peticion: PeticionConSesion) {
    return this.recintos.actualizar(id, dto, peticion.sesion!.usuarioId);
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Param('id', ParseUUIDPipe) id: string) {
    await this.recintos.eliminar(id);
  }

  // Paso 5: plano. Multipart con un campo `plano`; el tope va también en Multer
  // para no cargar en memoria un archivo enorme antes de rechazarlo.
  @Put(':id/plano')
  @UseInterceptors(FileInterceptor('plano', { limits: { fileSize: MAX_PLANO_BYTES + 1, files: 1 } }))
  subirPlano(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() archivo?: ArchivoSubido) {
    return this.recintos.subirPlano(id, archivo);
  }

  @Get(':id/plano')
  async plano(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) respuesta: Response) {
    const plano = await this.recintos.plano(id);
    respuesta.set({ 'Content-Type': plano.tipo, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(plano.contenido);
  }

  @Delete(':id/plano')
  @HttpCode(204)
  async quitarPlano(@Param('id', ParseUUIDPipe) id: string) {
    await this.recintos.quitarPlano(id);
  }
}
