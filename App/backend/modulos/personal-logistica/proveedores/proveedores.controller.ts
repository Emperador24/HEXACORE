import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res,
  StreamableFile, UploadedFile, UseGuards, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { validacionLogistica as validacion } from '../../../compartido/validacion';
import { ModuloPermisos, PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { ActualizarProveedorDto, DarDeBajaProveedorDto, RegistrarProveedorDto, TipoServicio } from './dto/proveedores.dto';
import { ArchivoSubido, MAX_DOCUMENTO_BYTES, ProveedoresService } from './proveedores.service';

/**
 * CU-030: Gestión de Proveedores.
 *
 * Actor «Coordinador Logístico»: el sistema no tiene ese rol de cuenta
 * (CU-027), así que lo ejercen Organizador y Administrador, igual que el
 * supervisor de CU-019/CU-010.
 */
@Controller('proveedores')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
@ModuloPermisos('personal')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  /** Paso 2: lista de proveedores disponibles que ofrece la planificación (CU-016). */
  @Get()
  listar(@Query('todos') todos?: string, @Query('tipoServicio') tipoServicio?: TipoServicio) {
    return this.proveedores.listar(todos !== 'true', tipoServicio);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.proveedores.detalle(id);
  }

  @Post()
  registrar(@Body() dto: RegistrarProveedorDto, @Req() peticion: PeticionConSesion) {
    return this.proveedores.registrar(dto, peticion.sesion!.usuarioId);
  }

  /** CU-030A. */
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarProveedorDto) {
    return this.proveedores.actualizar(id, dto);
  }

  /** CU-030B. */
  @Post(':id/baja')
  darDeBaja(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DarDeBajaProveedorDto) {
    return this.proveedores.darDeBaja(id, dto);
  }

  @Post(':id/reactivar')
  reactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.proveedores.reactivar(id);
  }

  // --- Documentos / certificaciones (paso 3) -------------------------------------

  @Post(':id/documentos')
  @UseInterceptors(FileInterceptor('documento', { limits: { fileSize: MAX_DOCUMENTO_BYTES + 1, files: 1 } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('nombre') nombre: string,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Req() peticion: PeticionConSesion,
  ) {
    return this.proveedores.subirDocumento(id, nombre ?? '', archivo, peticion.sesion!.usuarioId);
  }

  @Get(':id/documentos/:documentoId')
  async documento(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @Res({ passthrough: true }) respuesta: Response) {
    const documento = await this.proveedores.documento(id, documentoId);
    respuesta.set({ 'Content-Type': documento.tipo, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(documento.contenido);
  }

  @Delete(':id/documentos/:documentoId')
  @HttpCode(204)
  async eliminarDocumento(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) documentoId: string) {
    await this.proveedores.eliminarDocumento(id, documentoId);
  }
}
