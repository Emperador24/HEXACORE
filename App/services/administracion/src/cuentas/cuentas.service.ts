import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { cifrarContrasena, problemaDeContrasena } from '../comun/contrasenas';
import { generarEnlace, hashDeToken } from '../comun/tokens-enlace';
import { TipoCorreo } from '../notificaciones/correo-pendiente.evento';
import { PublicadorCorreos } from '../notificaciones/publicador-correos.service';
import { TipoToken, TokenCuenta } from '../persistencia/entidades/token-cuenta.entity';
import { CONFIGURACION, ConfiguracionServicio, ReglasSeguridad } from '../config/configuracion';
import { NombreRol, Rol } from '../persistencia/entidades/rol.entity';
import { EstadoCuenta, Usuario } from '../persistencia/entidades/usuario.entity';
import { UsuarioRol } from '../persistencia/entidades/usuario-rol.entity';
import { ContrasenaDebil, EnlaceNoValido, RolNoDisponible } from './cuentas.errors';
import { RegistroAceptadoDto, RegistroDto } from './dto/registro.dto';
import { VerificacionCompletadaDto, VerificarDto } from './dto/verificacion.dto';

/** Código de PostgreSQL para violación de restricción única. */
const VIOLACION_UNICIDAD = '23505';

/**
 * Lo que el registro responde, **exista o no el correo**.
 *
 * Es una constante y no un texto construido caso por caso, precisamente para
 * que no pueda divergir por descuido: si un camino devolviera un mensaje
 * distinto, la diferencia bastaría para averiguar qué correos están
 * registrados.
 */
const RESPUESTA_REGISTRO: RegistroAceptadoDto = {
  mensaje: 'Si el correo no estaba registrado, te enviamos un enlace para verificar tu cuenta.',
};

/**
 * Gestión de cuentas (CU-027).
 *
 * Este paso cubre el registro — pasos 1 a 4 del flujo básico:
 *
 * 1. Recibe nombre, correo y contraseña.
 * 2. *"Valida el formato del correo y la fortaleza de la contraseña"*.
 * 3. *"Verifica que el correo no esté registrado previamente"*.
 * 4. *"Cifra la contraseña y crea la cuenta con el rol correspondiente
 *    ('Cliente' por defecto)"*.
 *
 * La cuenta nace en `PENDIENTE_VERIFICACION` y **no puede iniciar sesión**
 * hasta los pasos 5-7, que llegan en el paso siguiente de la implementación.
 */
@Injectable()
export class CuentasService {
  private readonly log = new Logger(CuentasService.name);
  private readonly reglas: ReglasSeguridad;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly correos: PublicadorCorreos,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.seguridad;
  }

  /**
   * Registra una cuenta nueva.
   *
   * ## Por qué responde lo mismo cuando el correo ya existe
   *
   * Si devolviera "ese correo ya está registrado", el formulario de registro
   * serviría para averiguar quién tiene cuenta en el sistema: bastaría probar
   * correos y leer la respuesta. El CU-027 lo prohíbe en su atributo de
   * Usabilidad, así que ambos casos devuelven exactamente `RESPUESTA_REGISTRO`.
   *
   * Lo que sí cambia es lo que ocurre por dentro, y el correo que se enviará en
   * el paso siguiente: a quien ya tiene cuenta se le avisa de que alguien
   * intentó registrarse con su dirección, en lugar de un enlace de
   * verificación. Esa asimetría es invisible desde fuera y visible para la
   * persona legítima, que es justo el objetivo.
   *
   * ## Por qué se valida la contraseña antes de mirar el correo
   *
   * Una contraseña débil se rechaza siempre, exista el correo o no. Si se
   * comprobara después, el orden de los errores filtraría información: con una
   * contraseña deliberadamente débil, recibir `CONTRASENA_DEBIL` significaría
   * "el correo estaba libre" y la respuesta genérica, "ya existe".
   */
  async registrar(datos: RegistroDto): Promise<RegistroAceptadoDto> {
    // Paso 2 — fortaleza de la contraseña. El formato del correo ya lo validó
    // el DTO con `@IsEmail`.
    const problema = problemaDeContrasena(datos.contrasena, this.reglas.longitudMinimaContrasena);
    if (problema) throw new ContrasenaDebil(problema);

    // Paso 4 — se cifra ANTES de mirar si el correo existe, y a propósito.
    //
    // scrypt tarda ~100 ms por diseño. Si solo se cifrara cuando el correo está
    // libre, un registro con correo existente respondería mucho más rápido que
    // uno nuevo, y medir ese tiempo revelaría qué correos están registrados:
    // exactamente lo que el CU-027 quiere evitar. Cifrando siempre, ambos
    // caminos tardan lo mismo.
    const hash = await cifrarContrasena(datos.contrasena);

    try {
      const { usuario, token } = await this.crearCuenta(datos, hash);
      this.log.log(`Cuenta registrada para ${datos.email}`);

      // Paso 5: "envía un correo de verificación de cuenta". Va por la cola,
      // fuera del camino de respuesta.
      await this.correos.encolar(
        TipoCorreo.VERIFICACION,
        { email: usuario.email, nombre: usuario.nombre },
        token,
      );
    } catch (error) {
      if (!this.esCorreoDuplicado(error)) throw error;

      // Paso 3: el correo ya estaba registrado. Hacia fuera no se nota, pero a
      // quien de verdad tiene la cuenta se le avisa — es lo que permite no
      // revelar nada en la respuesta sin dejar a la persona a oscuras.
      this.log.warn(`Intento de registro con un correo ya existente: ${datos.email}`);
      const existente = await this.fuenteDatos.manager.findOneBy(Usuario, { email: datos.email });
      if (existente) {
        await this.correos.encolar(TipoCorreo.REGISTRO_DUPLICADO, {
          email: existente.email,
          nombre: existente.nombre,
        });
      }
    }

    return RESPUESTA_REGISTRO;
  }

  /**
   * Pasos 6 y 7 del CU-027: *"el usuario confirma su cuenta desde el enlace
   * recibido"* y *"activa la cuenta y permite el inicio de sesión"*.
   *
   * ## Se busca por el hash, no por el token
   *
   * En la base solo está el SHA-256, así que se calcula el hash de lo que llega
   * y se busca por él. Eso tiene un efecto útil además del evidente: la
   * consulta usa el índice único sobre `hash_token`, de modo que no hay que
   * recorrer los enlaces vigentes comparando uno a uno.
   *
   * ## Todo en una transacción, con el token marcado como usado
   *
   * Activar la cuenta y quemar el enlace van juntos. Si solo pasara lo primero,
   * el enlace seguiría sirviendo; si solo lo segundo, la persona se quedaría
   * con una cuenta sin activar y sin enlace para volver a intentarlo.
   */
  async verificar(datos: VerificarDto): Promise<VerificacionCompletadaDto> {
    const hash = hashDeToken(datos.token);

    await this.fuenteDatos.transaction(async (gestor) => {
      const enlace = await gestor.findOneBy(TokenCuenta, { hashToken: hash });

      // Las cuatro razones por las que un enlace no sirve dan el mismo error:
      // no existe, es de otro tipo, ya se usó, o caducó.
      if (
        !enlace ||
        enlace.tipo !== TipoToken.VERIFICACION ||
        enlace.usadoEn !== null ||
        enlace.expiraEn <= new Date()
      ) {
        throw new EnlaceNoValido();
      }

      const usuario = await gestor.findOneBy(Usuario, { id: enlace.usuarioId });
      if (!usuario) throw new EnlaceNoValido();

      // Verificar una cuenta que un administrador desactivó (CU-027B) no debe
      // reactivarla: la desactivación es una decisión posterior y más fuerte.
      if (usuario.estado === EstadoCuenta.DESACTIVADA) {
        this.log.warn(`Se intentó verificar una cuenta desactivada: ${usuario.email}`);
        throw new EnlaceNoValido();
      }

      // Paso 7 — la cuenta queda activa y ya puede iniciar sesión.
      // El `verificadoEn` no es decorativo: la restricción
      // `ck_usuarios_verificacion_coherente` exige que toda cuenta que no esté
      // pendiente tenga fecha de verificación.
      await gestor.update(
        Usuario,
        { id: usuario.id, estado: EstadoCuenta.PENDIENTE_VERIFICACION },
        { estado: EstadoCuenta.ACTIVA, verificadoEn: new Date() },
      );

      // El enlace queda quemado: de un solo uso.
      await gestor.update(TokenCuenta, { id: enlace.id }, { usadoEn: new Date() });

      this.log.log(`Cuenta verificada: ${usuario.email}`);
    });

    return { mensaje: 'Tu cuenta quedó activada. Ya puedes iniciar sesión.' };
  }

  /**
   * Crea la cuenta y le asigna su rol, en una sola transacción.
   *
   * Van juntas porque una cuenta sin rol no puede hacer nada y nadie se
   * enteraría de que le falta: sería una cuenta rota, silenciosamente.
   */
  private async crearCuenta(
    datos: RegistroDto,
    hashContrasena: string,
  ): Promise<{ usuario: Usuario; token: string }> {
    return this.fuenteDatos.transaction(async (gestor) => {
      const rol = await this.rolPorDefecto(gestor);

      const usuario = await gestor.save(
        gestor.create(Usuario, {
          nombre: datos.nombre,
          // El DTO ya lo normalizó; se repite aquí porque este método también
          // lo usarán otros caminos (alta por administrador) que no pasan por
          // ese DTO, y el CHECK de la base rechaza cualquier mayúscula.
          email: datos.email.trim().toLowerCase(),
          hashContrasena,
          // Paso 4: la cuenta nace sin verificar. Los pasos 5-7 la activan;
          // hasta entonces no puede iniciar sesión.
          estado: EstadoCuenta.PENDIENTE_VERIFICACION,
          verificadoEn: null,
        }),
      );

      await gestor.insert(UsuarioRol, {
        usuarioId: usuario.id,
        rolId: rol.id,
        // Nadie la asignó: es la que da el sistema al registrarse.
        asignadoPor: null,
      });

      // El enlace de verificación se crea en la MISMA transacción que la
      // cuenta: una cuenta sin token sería una cuenta que nadie puede activar.
      const enlace = generarEnlace(this.reglas.verificacionHoras * 60);
      await gestor.insert(TokenCuenta, {
        usuarioId: usuario.id,
        tipo: TipoToken.VERIFICACION,
        // Solo el hash. El token viaja en el correo y no se guarda.
        hashToken: enlace.hash,
        expiraEn: enlace.expiraEn,
      });

      return { usuario, token: enlace.token };
    });
  }

  /** El rol `Cliente`, que el paso 4 exige asignar por defecto. */
  private async rolPorDefecto(gestor: EntityManager): Promise<Rol> {
    const rol = await gestor.findOneBy(Rol, { nombre: NombreRol.CLIENTE });
    if (!rol) throw new RolNoDisponible(NombreRol.CLIENTE);
    return rol;
  }

  /**
   * Si el error es el índice único del correo.
   *
   * Se comprueba el error de la base en vez de consultar antes si el correo
   * existe, porque entre la consulta y la inserción caben dos registros
   * simultáneos con el mismo correo. El índice único es lo único que decide de
   * verdad; esto solo traduce su veredicto.
   */
  private esCorreoDuplicado(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const codigo = (error.driverError as { code?: string })?.code;
    return codigo === VIOLACION_UNICIDAD;
  }
}
