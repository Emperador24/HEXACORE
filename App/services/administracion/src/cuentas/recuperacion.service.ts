import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { cifrarContrasena, problemaDeContrasena } from '../comun/contrasenas';
import { generarEnlace, hashDeToken } from '../comun/tokens-enlace';
import { CONFIGURACION, ConfiguracionServicio, ReglasSeguridad } from '../config/configuracion';
import { TipoCorreo } from '../notificaciones/correo-pendiente.evento';
import { PublicadorCorreos } from '../notificaciones/publicador-correos.service';
import { TipoToken, TokenCuenta } from '../persistencia/entidades/token-cuenta.entity';
import { EstadoCuenta, Usuario } from '../persistencia/entidades/usuario.entity';
import { SesionesService } from '../sesiones/sesiones.service';
import { ContrasenaDebil, EnlaceNoValido } from './cuentas.errors';
import { MensajeDto, RestablecerDto, SolicitarRecuperacionDto } from './dto/recuperacion.dto';

/** Lo que responde la solicitud, exista o no la cuenta (DECISIONES.md §6). */
const RESPUESTA_SOLICITUD: MensajeDto = {
  mensaje: 'Si el correo corresponde a una cuenta, te enviamos un enlace para restablecer la contraseña.',
};

/**
 * Tiempo mínimo entre dos enlaces para la misma cuenta.
 *
 * Sin él, cualquiera podría llenar el buzón de otra persona pulsando "olvidé mi
 * contraseña" en bucle. Un minuto no molesta a quien no recibió el primero y
 * vuelve a pedirlo.
 */
const ESPERA_ENTRE_ENLACES_MS = 60_000;

/**
 * Recuperación de contraseña — CU-027A: *"el sistema envía un enlace de
 * recuperación de un solo uso con expiración"*.
 */
@Injectable()
export class RecuperacionService {
  private readonly log = new Logger(RecuperacionService.name);
  private readonly reglas: ReglasSeguridad;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly correos: PublicadorCorreos,
    private readonly sesiones: SesionesService,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.seguridad;
  }

  /**
   * Pide un enlace. **Responde sin esperar a nada.**
   *
   * El trabajo real —buscar la cuenta, crear el enlace, encolar el correo— solo
   * existe cuando la cuenta existe. Si se hiciera antes de responder, la
   * respuesta tardaría más con un correo registrado que con uno inventado, y el
   * cronómetro revelaría lo que el mensaje calla. Haciéndolo después, el tiempo
   * de respuesta es el mismo por construcción, no por casualidad.
   *
   * El coste: si el proceso muere justo en ese instante, el correo no sale. La
   * persona no recibe nada y vuelve a pedirlo, que es lo mismo que haría si el
   * correo se perdiera por el camino.
   */
  solicitar(datos: SolicitarRecuperacionDto): MensajeDto {
    setImmediate(() => {
      this.procesarSolicitud(datos.email).catch((error: Error) =>
        this.log.error(`No se pudo procesar la recuperación de ${datos.email}: ${error.message}`),
      );
    });
    return RESPUESTA_SOLICITUD;
  }

  private async procesarSolicitud(email: string): Promise<void> {
    const creado = await this.fuenteDatos.transaction(async (gestor) => {
      const usuario = await gestor.findOne(Usuario, { where: { email }, lock: { mode: 'pessimistic_write' } });
      if (!usuario) return null;

      // CU-027B: una cuenta desactivada no se recupera. Restablecer la
      // contraseña no debe ser una puerta trasera para volver a entrar.
      if (usuario.estado === EstadoCuenta.DESACTIVADA) {
        this.log.warn(`Recuperación pedida para la cuenta desactivada ${email}; se ignora`);
        return null;
      }

      // El bloqueo de fila de arriba hace que dos solicitudes simultáneas no
      // pasen ambas esta comprobación.
      const reciente = await gestor.findOneBy(TokenCuenta, {
        usuarioId: usuario.id,
        tipo: TipoToken.RECUPERACION,
        creadoEn: MoreThan(new Date(Date.now() - ESPERA_ENTRE_ENLACES_MS)),
      });
      if (reciente) {
        this.log.warn(`Recuperación repetida para ${email} en menos de un minuto; se ignora`);
        return null;
      }

      // Solo vale el último enlace: pedir otro invalida los anteriores. Si no,
      // cada solicitud dejaría otro enlace vivo esperando en el buzón.
      await gestor.update(
        TokenCuenta,
        { usuarioId: usuario.id, tipo: TipoToken.RECUPERACION, usadoEn: IsNull() },
        { usadoEn: new Date() },
      );

      const enlace = generarEnlace(this.reglas.recuperacionMinutos);
      await gestor.insert(TokenCuenta, {
        usuarioId: usuario.id,
        tipo: TipoToken.RECUPERACION,
        hashToken: enlace.hash,
        expiraEn: enlace.expiraEn,
      });
      return { usuario, token: enlace.token };
    });

    if (!creado) return;
    this.log.log(`Enlace de recuperación creado para ${email}`);
    await this.correos.encolar(
      TipoCorreo.RECUPERACION,
      { email: creado.usuario.email, nombre: creado.usuario.nombre },
      creado.token,
    );
  }

  /**
   * Usa el enlace para poner una contraseña nueva.
   *
   * ## Lo que hace además de cambiar la contraseña
   *
   * - **Cierra todas las sesiones.** Quien restablece la contraseña a menudo lo
   *   hace porque sospecha que se la robaron: dejar las sesiones abiertas
   *   dejaría dentro a quien se quiere echar.
   * - **Levanta el bloqueo de CU-027D.** Abrir el enlace demuestra que se
   *   controla el correo, que es más de lo que demuestra esperar 15 minutos.
   * - **Activa la cuenta si estaba sin verificar**, por la misma razón: el
   *   enlace llegó a ese correo. Es lo que saca del atasco a quien se registró,
   *   dejó caducar el enlace de verificación y ya no puede volver a
   *   registrarse (DECISIONES.md §8).
   */
  async restablecer(datos: RestablecerDto): Promise<MensajeDto> {
    // La política primero: un enlace válido no debe gastarse en una
    // contraseña que se va a rechazar.
    const problema = problemaDeContrasena(datos.contrasenaNueva, this.reglas.longitudMinimaContrasena);
    if (problema) throw new ContrasenaDebil(problema);

    // scrypt fuera de la transacción: son ~100 ms que no tienen por qué
    // mantener filas bloqueadas.
    const hashContrasena = await cifrarContrasena(datos.contrasenaNueva);

    const usuario = await this.fuenteDatos.transaction(async (gestor) => {
      // FOR UPDATE: dos usos simultáneos del mismo enlace no pueden pasar los
      // dos la comprobación de "no usado". El segundo espera y lo ve usado.
      const enlace = await gestor.findOne(TokenCuenta, {
        where: { hashToken: hashDeToken(datos.token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !enlace ||
        enlace.tipo !== TipoToken.RECUPERACION ||
        enlace.usadoEn !== null ||
        enlace.expiraEn <= new Date()
      ) {
        throw new EnlaceNoValido();
      }

      const cuenta = await gestor.findOne(Usuario, {
        where: { id: enlace.usuarioId },
        lock: { mode: 'pessimistic_write' },
      });
      // Una cuenta desactivada después de pedir el enlace tampoco se recupera.
      if (!cuenta || cuenta.estado === EstadoCuenta.DESACTIVADA) throw new EnlaceNoValido();

      // Segunda barrera, por si el bloqueo de fila faltara algún día: el enlace
      // se quema con un UPDATE condicional, y solo sigue quien lo quemó. Es la
      // misma técnica que cierra la reventa del CU-006.
      const quemado = await gestor.update(TokenCuenta, { id: enlace.id, usadoEn: IsNull() }, { usadoEn: new Date() });
      if (!quemado.affected) throw new EnlaceNoValido();

      const activar = cuenta.estado === EstadoCuenta.PENDIENTE_VERIFICACION;
      await gestor.update(
        Usuario,
        { id: cuenta.id },
        {
          hashContrasena,
          intentosFallidos: 0,
          bloqueadaHasta: null,
          ...(activar ? { estado: EstadoCuenta.ACTIVA, verificadoEn: new Date() } : {}),
        },
      );

      // Y cualquier otro enlace de recuperación que quedara vivo.
      await gestor.update(
        TokenCuenta,
        { usuarioId: cuenta.id, tipo: TipoToken.RECUPERACION, usadoEn: IsNull() },
        { usadoEn: new Date() },
      );

      const cerradas = await this.sesiones.revocarTodas(cuenta.id, gestor);
      this.log.log(
        `Contraseña restablecida para ${cuenta.email}; ${cerradas} sesiones cerradas` +
          (activar ? '; cuenta activada' : ''),
      );
      return cuenta;
    });

    await this.correos.encolar(TipoCorreo.CONTRASENA_CAMBIADA, {
      email: usuario.email,
      nombre: usuario.nombre,
    });

    return { mensaje: 'Tu contraseña quedó cambiada. Ya puedes iniciar sesión con la nueva.' };
  }
}
