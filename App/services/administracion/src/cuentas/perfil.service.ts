import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { cifrarContrasena, problemaDeContrasena } from '../comun/contrasenas';
import { CONFIGURACION, ConfiguracionServicio, ReglasSeguridad } from '../config/configuracion';
import { TipoCorreo } from '../notificaciones/correo-pendiente.evento';
import { PublicadorCorreos } from '../notificaciones/publicador-correos.service';
import { Usuario } from '../persistencia/entidades/usuario.entity';
import { AutenticacionService } from '../sesiones/autenticacion.service';
import { ContenidoToken, SesionesService } from '../sesiones/sesiones.service';
import {
  ContrasenaActualIncorrecta,
  ContrasenaDebil,
  CorreoNoEditable,
  CuentaBloqueadaEnSesion,
  CuentaNoEncontrada,
} from './cuentas.errors';
import { CambiarContrasenaDto, EditarPerfilDto, PerfilDto } from './dto/perfil.dto';
import { MensajeDto } from './dto/recuperacion.dto';

/**
 * Perfil del usuario — CU-027C: *"si el usuario edita su perfil, el sistema
 * valida los nuevos datos antes de guardarlos"*.
 *
 * Todo lo de aquí actúa sobre **la cuenta de la sesión**, nunca sobre un
 * identificador que llegue en la petición. No hay forma de pedir "edita el
 * perfil de X": el único X posible es quien firma el token.
 */
@Injectable()
export class PerfilService {
  private readonly log = new Logger(PerfilService.name);
  private readonly reglas: ReglasSeguridad;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly autenticacion: AutenticacionService,
    private readonly sesiones: SesionesService,
    private readonly correos: PublicadorCorreos,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.seguridad;
  }

  async consultar(sesion: ContenidoToken): Promise<PerfilDto> {
    return this.aDto(await this.cuentaDe(sesion), sesion);
  }

  async editar(sesion: ContenidoToken, datos: EditarPerfilDto): Promise<PerfilDto> {
    if (datos.email !== undefined) throw new CorreoNoEditable();

    // Los datos ya llegan validados por `NombrePersona`; aquí solo se guardan.
    await this.fuenteDatos.manager.update(Usuario, { id: sesion.sub }, { nombre: datos.nombre });
    this.log.log(`Perfil editado: ${sesion.sub}`);
    return this.consultar(sesion);
  }

  /**
   * Cambia la contraseña desde dentro de la sesión.
   *
   * Pide la actual aunque ya haya sesión: un token robado, o un móvil
   * desbloqueado en manos ajenas, no deben bastar para quedarse con la cuenta.
   */
  async cambiarContrasena(sesion: ContenidoToken, datos: CambiarContrasenaDto): Promise<MensajeDto> {
    // Las comprobaciones que no tocan la base van primero y no cuentan como
    // intento fallido: equivocarse con la política no es un ataque.
    const problema = problemaDeContrasena(datos.contrasenaNueva, this.reglas.longitudMinimaContrasena);
    if (problema) throw new ContrasenaDebil(problema);
    if (datos.contrasenaNueva === datos.contrasenaActual) {
      throw new ContrasenaDebil('La contraseña nueva debe ser distinta de la actual');
    }

    const comprobacion = await this.autenticacion.comprobarContrasenaActual(sesion.sub, datos.contrasenaActual);
    if (comprobacion === 'bloqueada') throw new CuentaBloqueadaEnSesion();
    if (comprobacion === 'incorrecta') throw new ContrasenaActualIncorrecta();

    const hashContrasena = await cifrarContrasena(datos.contrasenaNueva);
    const cuenta = await this.fuenteDatos.transaction(async (gestor) => {
      await gestor.update(Usuario, { id: sesion.sub }, { hashContrasena });
      // Las demás sesiones se cierran; la de quien hace el cambio, no.
      const cerradas = await this.sesiones.revocarTodas(sesion.sub, gestor, sesion.jti);
      this.log.log(`Contraseña cambiada por ${sesion.sub}; ${cerradas} sesiones cerradas`);
      return gestor.findOneByOrFail(Usuario, { id: sesion.sub });
    });

    await this.correos.encolar(TipoCorreo.CONTRASENA_CAMBIADA, { email: cuenta.email, nombre: cuenta.nombre });
    return { mensaje: 'Contraseña cambiada. Cerramos tus sesiones en otros dispositivos.' };
  }

  private async cuentaDe(sesion: ContenidoToken): Promise<Usuario> {
    const usuario = await this.fuenteDatos.manager.findOneBy(Usuario, { id: sesion.sub });
    if (!usuario) throw new CuentaNoEncontrada();
    return usuario;
  }

  private aDto(usuario: Usuario, sesion: ContenidoToken): PerfilDto {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      roles: sesion.roles,
      creadoEn: usuario.creadoEn.toISOString(),
      ultimoAccesoEn: usuario.ultimoAccesoEn?.toISOString() ?? null,
    };
  }
}
