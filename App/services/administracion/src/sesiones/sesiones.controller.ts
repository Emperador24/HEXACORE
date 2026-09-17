import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { CuentaNoEncontrada, SinSesionQueRenovar } from '../cuentas/cuentas.errors';
import {
  LoginDto,
  RenovarSesionDto,
  SesionCerradaDto,
  SesionIniciadaDto,
  SesionRenovadaDto,
  UsuarioDeSesionDto,
} from '../cuentas/dto/login.dto';
import { Usuario } from '../persistencia/entidades/usuario.entity';
import { AutenticacionService } from './autenticacion.service';
import {
  borrarCookieRenovacion,
  esClienteWeb,
  escribirCookieRenovacion,
  leerCookieRenovacion,
  OpcionesCookie,
} from './cookie-renovacion';
import { RenovacionService } from './renovacion.service';
import { SesionActual, SesionRequerida } from './sesion-requerida.guard';
import { ContenidoToken, SesionesService } from './sesiones.service';

/**
 * Sesiones — CU-027 pasos 8-9 y CU-027D.
 *
 * El login es, con el registro, el único endpoint que no puede exigir token:
 * sirve para obtenerlo.
 */
@ApiTags('sesiones')
@Controller('sesiones')
export class SesionesController {
  private readonly cookie: OpcionesCookie;

  constructor(
    private readonly autenticacion: AutenticacionService,
    private readonly sesiones: SesionesService,
    private readonly renovacion: RenovacionService,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.cookie = { ruta: `/${config.prefijoApi}/sesiones`, segura: config.entorno === 'production' };
  }

  /**
   * A un cliente web, el token de renovación se le entrega en cookie y se quita
   * del cuerpo: JavaScript no debe poder leerlo (DECISIONES.md §22).
   */
  private entregar<T extends { tokenRenovacion?: string; renovacionExpiraEn: string }>(
    peticion: Request,
    respuesta: Response,
    datos: T,
  ): T {
    if (!esClienteWeb(peticion) || !datos.tokenRenovacion) return datos;
    escribirCookieRenovacion(respuesta, datos.tokenRenovacion, new Date(datos.renovacionExpiraEn), this.cookie);
    return { ...datos, tokenRenovacion: undefined };
  }

  @Post()
  // 200 y no 201: aunque por dentro se crea una fila en `sesiones`, para quien
  // llama esto es "entrar", no "crear un recurso" que luego vaya a consultar.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Pasos 8-9 del CU-027: valida las credenciales, emite un token de sesión y registra el ' +
      'acceso.\n\n' +
      '**Correo inexistente, contraseña incorrecta y cuenta bloqueada (CU-027D) responden igual y ' +
      'tardan lo mismo**, para no revelar qué correos están registrados.\n\n' +
      'Tras varios fallos seguidos la cuenta se bloquea unos minutos y se avisa a su dueño por ' +
      'correo.',
  })
  @ApiResponse({ status: 200, type: SesionIniciadaDto })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas o cuenta bloqueada temporalmente' })
  @ApiResponse({ status: 403, description: 'Cuenta sin verificar o desactivada (solo con la contraseña correcta)' })
  async iniciar(
    @Body() datos: LoginDto,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<SesionIniciadaDto> {
    const sesion = await this.autenticacion.iniciarSesion(datos, {
      direccionIp: peticion.ip ?? null,
      agenteUsuario: peticion.headers['user-agent'] ?? null,
    });
    return this.entregar(peticion, respuesta, sesion);
  }

  @Post('renovar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar el token de acceso',
    description:
      'Con el token de renovación, emite un token de acceso nuevo (con los roles actuales) y un ' +
      'token de renovación nuevo; el anterior deja de valer. **Usar un token de renovación ya ' +
      'gastado cierra la sesión entera**: significa que alguien más tiene copia.\n\n' +
      'No lleva `Authorization`: sirve precisamente para cuando el token de acceso caducó.\n\n' +
      'Los clientes web (`X-Hexacore-Cliente: web`) no envían el token: va en la cookie ' +
      '`HttpOnly`, y la respuesta trae la cookie nueva en vez del token.',
  })
  @ApiResponse({ status: 200, type: SesionRenovadaDto })
  @ApiResponse({
    status: 401,
    description: 'SESION_TERMINADA, o SESION_CERRADA_POR_SEGURIDAD si el token ya se había usado',
  })
  async renovar(
    @Body() datos: RenovarSesionDto,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<SesionRenovadaDto> {
    const web = esClienteWeb(peticion);
    const token = datos.tokenRenovacion ?? (web ? leerCookieRenovacion(peticion) : undefined);
    try {
      if (!token) throw new SinSesionQueRenovar();
      return this.entregar(peticion, respuesta, await this.renovacion.renovar(token));
    } catch (error) {
      // Una cookie que ya no sirve se borra: si no, el navegador la seguiría
      // enviando en cada recarga.
      if (web) borrarCookieRenovacion(respuesta, this.cookie);
      throw error;
    }
  }

  @Get('actual')
  @UseGuards(SesionRequerida)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Quién es el usuario de esta sesión',
    description:
      'Sirve al cliente para recuperar los datos de la cuenta al abrirse con un token guardado, ' +
      'y para comprobar que ese token sigue valiendo.',
  })
  @ApiResponse({ status: 200, type: UsuarioDeSesionDto })
  @ApiResponse({ status: 401, description: 'Sin token, o token caducado, falsificado o revocado' })
  async actual(@SesionActual() sesion: ContenidoToken): Promise<UsuarioDeSesionDto> {
    const usuario = await this.fuenteDatos.manager.findOneBy(Usuario, { id: sesion.sub });
    if (!usuario) throw new CuentaNoEncontrada();
    return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, roles: sesion.roles };
  }

  @Delete('actual')
  @UseGuards(SesionRequerida)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca el token en el servidor. A partir de aquí se rechaza aunque todavía no haya ' +
      'caducado: borrarlo solo en el cliente dejaría dentro a quien lo hubiera copiado.',
  })
  @ApiResponse({ status: 200, type: SesionCerradaDto })
  async cerrar(
    @SesionActual() sesion: ContenidoToken,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<SesionCerradaDto> {
    await this.sesiones.revocar(sesion.jti);
    if (esClienteWeb(peticion)) borrarCookieRenovacion(respuesta, this.cookie);
    return { mensaje: 'Sesión cerrada.' };
  }
}
