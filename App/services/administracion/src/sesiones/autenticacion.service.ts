import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { cifrarContrasena, verificarContrasena } from '../comun/contrasenas';
import { CONFIGURACION, ConfiguracionServicio, ReglasSeguridad } from '../config/configuracion';
import {
  CredencialesInvalidas,
  CuentaDesactivada,
  CuentaNoVerificada,
} from '../cuentas/cuentas.errors';
import { LoginDto, SesionIniciadaDto } from '../cuentas/dto/login.dto';
import { TipoCorreo } from '../notificaciones/correo-pendiente.evento';
import { PublicadorCorreos } from '../notificaciones/publicador-correos.service';
import { EstadoCuenta, Usuario } from '../persistencia/entidades/usuario.entity';
import { OrigenSesion, SesionesService, SesionFirmada } from './sesiones.service';

/** Resultado de anotar un fallo. */
type Fallo = 'contado' | 'recien-bloqueada' | 'ya-bloqueada';

/** Condición SQL de "la cuenta no está bloqueada ahora mismo". */
const NO_BLOQUEADA = '(bloqueada_hasta IS NULL OR bloqueada_hasta <= now())';

/**
 * Inicio de sesión — CU-027 pasos 8-9 y flujo alterno CU-027D.
 *
 * ## Las tres cosas que no se pueden notar desde fuera
 *
 * Que el correo no exista, que la contraseña esté mal y que la cuenta esté
 * bloqueada dan **la misma respuesta**, y además **tardan lo mismo**:
 *
 * - Sin cuenta, se verifica igualmente contra un hash señuelo. Sin ese
 *   señuelo, un correo inexistente respondería en 2 ms y uno real en 100 ms
 *   (lo que tarda scrypt), y el cronómetro revelaría quién tiene cuenta.
 * - Con la cuenta bloqueada, **no se comprueba la contraseña real**, pero sí
 *   el señuelo: el tiempo es el mismo y el atacante no aprende nada aunque
 *   acierte.
 *
 * ## scrypt fuera de la base, y el resultado con un UPDATE condicional
 *
 * scrypt tarda ~50-100 ms **a propósito**. La primera versión lo ejecutaba
 * dentro de una transacción con la fila bloqueada (`FOR UPDATE`), y eso
 * retenía una conexión del pool mientras la CPU calculaba: con un pico de
 * logins, el resto del servicio se quedaba sin conexiones (medido: una
 * consulta de 2 ms esperó 4,9 s). Ver DECISIONES.md §17.
 *
 * Ahora el orden es: leer la cuenta sin bloquearla → scrypt sin tocar la base →
 * firmar el token → anotar el resultado con **una sola sentencia** condicional
 * (`UPDATE ... WHERE <no bloqueada>`, y en el acierto también el `INSERT` de la
 * sesión). Ninguna conexión queda retenida mientras Node calcula.
 *
 * Eso conserva lo que el bloqueo de fila garantizaba ante una ráfaga de
 * intentos simultáneos sobre la misma cuenta: aunque todos lean "no bloqueada"
 * al empezar, cada resultado se anota **solo si la cuenta sigue sin bloquear en
 * ese instante**. En cuanto el quinto fallo la bloquea, los que terminen
 * después —fallos o aciertos— no cuentan ni abren sesión. PostgreSQL serializa
 * los `UPDATE` sobre la misma fila y reevalúa la condición, así que no hay
 * carrera entre ellos.
 */
@Injectable()
export class AutenticacionService implements OnModuleInit {
  private readonly log = new Logger(AutenticacionService.name);
  private readonly reglas: ReglasSeguridad;
  private hashSenuelo = '';

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly sesiones: SesionesService,
    private readonly correos: PublicadorCorreos,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.seguridad;
  }

  /**
   * Calcula el señuelo una vez al arrancar, con los mismos parámetros de coste
   * que una contraseña real — si fueran otros, tardaría distinto y no serviría.
   * La contraseña de la que sale es aleatoria y se descarta: nadie puede
   * acertarla.
   */
  async onModuleInit(): Promise<void> {
    this.hashSenuelo = await cifrarContrasena(randomBytes(32).toString('base64'));
  }

  async iniciarSesion(datos: LoginDto, origen: OrigenSesion): Promise<SesionIniciadaDto> {
    // Lectura sin bloqueo: la decisión definitiva la toma el UPDATE del final.
    const usuario = await this.fuenteDatos.manager.findOneBy(Usuario, { email: datos.email });

    // Correo inexistente: se gasta el mismo tiempo que con uno real.
    if (!usuario) {
      await verificarContrasena(datos.contrasena, this.hashSenuelo);
      throw new CredencialesInvalidas();
    }

    // CU-027D — bloqueada. La contraseña real no se mira: si se mirara, el
    // atacante seguiría probando durante el bloqueo. El señuelo iguala el
    // tiempo. El intento tampoco suma, para que el bloqueo no se alargue solo.
    if (this.estaBloqueada(usuario)) {
      await verificarContrasena(datos.contrasena, this.hashSenuelo);
      this.log.warn(`Intento de login sobre la cuenta bloqueada ${usuario.email}`);
      throw new CredencialesInvalidas();
    }

    // Paso 9 — "valida las credenciales". Sin ninguna conexión retenida.
    if (!(await verificarContrasena(datos.contrasena, usuario.hashContrasena))) {
      await this.anotarFallo(usuario);
      throw new CredencialesInvalidas();
    }

    // Roles y firma antes de escribir nada: la escritura es una sola sentencia
    // y no retiene ninguna conexión mientras Node hace otra cosa (§17).
    const roles = await this.rolesDe(this.fuenteDatos.manager, usuario.id);
    const firmada = await this.sesiones.firmar({ usuarioId: usuario.id, roles });
    const estado = await this.registrarAcceso(usuario, firmada, origen);

    // Otro intento la bloqueó (o cambió la contraseña) mientras se calculaba
    // scrypt: este acierto llega tarde y no abre sesión, ni revela que la
    // contraseña era buena. El token firmado se descarta sin salir de aquí.
    if (estado === null) throw new CredencialesInvalidas();

    // A partir de aquí la contraseña es correcta: quien la envió ya sabe que la
    // cuenta existe, así que decirle en qué estado está no filtra nada.
    if (estado === EstadoCuenta.PENDIENTE_VERIFICACION) throw new CuentaNoVerificada();
    if (estado === EstadoCuenta.DESACTIVADA) throw new CuentaDesactivada();

    const respuesta: SesionIniciadaDto = {
      token: firmada.token,
      tipo: 'Bearer',
      expiraEn: firmada.expiraEn.toISOString(),
      tokenRenovacion: firmada.tokenRenovacion,
      renovacionExpiraEn: firmada.renovacionExpiraEn.toISOString(),
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, roles },
    };
    this.log.log(`Sesión iniciada: ${usuario.email}`);
    return respuesta;
  }

  /**
   * Comprueba la contraseña de quien ya tiene sesión (cambio de contraseña,
   * CU-027C), **con el mismo contador de fallos que el login**.
   *
   * Si no compartiera el contador, un token robado permitiría probar
   * contraseñas sin límite desde aquí: el bloqueo del login no serviría de
   * nada, porque el atacante nunca pasaría por el login.
   *
   * Al llegar al bloqueo se cierran **todas** las sesiones de la cuenta, la del
   * atacante incluida.
   */
  async comprobarContrasenaActual(usuarioId: string, contrasena: string): Promise<'ok' | 'incorrecta' | 'bloqueada'> {
    const usuario = await this.fuenteDatos.manager.findOneBy(Usuario, { id: usuarioId });
    if (!usuario) return 'incorrecta';

    if (this.estaBloqueada(usuario)) {
      await this.sesiones.revocarTodas(usuario.id);
      return 'bloqueada';
    }

    if (await verificarContrasena(contrasena, usuario.hashContrasena)) {
      const estado = await this.anotarAcierto(this.fuenteDatos.manager, usuario, false);
      if (estado !== null) return 'ok';
      // Bloqueada mientras se calculaba: el acierto no cuenta.
      await this.sesiones.revocarTodas(usuario.id);
      return 'bloqueada';
    }

    const fallo = await this.anotarFallo(usuario, 'desde el cambio de contraseña');
    if (fallo === 'contado') return 'incorrecta';
    await this.sesiones.revocarTodas(usuario.id);
    return 'bloqueada';
  }

  private estaBloqueada(usuario: Usuario): boolean {
    return usuario.bloqueadaHasta !== null && usuario.bloqueadaHasta > new Date();
  }

  /**
   * Suma un fallo y, si llega al umbral, bloquea. **Todo en un solo UPDATE.**
   *
   * - Solo cuenta si la cuenta no está bloqueada en este instante: los intentos
   *   que terminan durante el bloqueo no lo alargan.
   * - Al bloquear, el contador vuelve a cero: al levantarse el bloqueo se tienen
   *   otros cinco intentos, no uno.
   *
   * En el `SET`, `intentos_fallidos` es el valor **anterior** de la fila, así
   * que las dos expresiones ven el mismo número.
   */
  private async anotarFallo(usuario: Usuario, contexto = ''): Promise<Fallo> {
    const [filas] = (await this.fuenteDatos.query(
      `UPDATE usuarios SET
         intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
         bloqueada_hasta   = CASE WHEN intentos_fallidos + 1 >= $2
                                  THEN now() + make_interval(mins => $3)
                                  ELSE bloqueada_hasta END,
         actualizado_en    = now()
       WHERE id = $1 AND ${NO_BLOQUEADA}
       RETURNING coalesce(bloqueada_hasta > now(), false) AS "bloqueada"`,
      [usuario.id, this.reglas.intentosAntesDeBloquear, this.reglas.bloqueoMinutos],
    )) as [{ bloqueada: boolean }[], number];

    if (filas.length === 0) return 'ya-bloqueada';
    if (!filas[0].bloqueada) return 'contado';

    this.log.warn(`CU-027D: cuenta ${usuario.email} bloqueada por intentos fallidos ${contexto}`.trim());
    await this.correos.encolar(TipoCorreo.CUENTA_BLOQUEADA, { email: usuario.email, nombre: usuario.nombre });
    return 'recien-bloqueada';
  }

  /**
   * Anota un acierto: limpia el contador y, si es un acceso, la fecha del
   * último. Devuelve el estado de la cuenta, o `null` si no se anotó.
   *
   * No se anota si la cuenta se bloqueó mientras tanto, **ni si la contraseña
   * cambió** desde que se leyó: el `hash_contrasena` de la condición es el que
   * se acaba de verificar. Sin esa comprobación, un login con la contraseña
   * vieja que empezara justo antes de un cambio podría abrir sesión después.
   */
  private async anotarAcierto(gestor: EntityManager, usuario: Usuario, esAcceso: boolean): Promise<EstadoCuenta | null> {
    const [filas] = (await gestor.query(
      `UPDATE usuarios SET
         intentos_fallidos = 0,
         bloqueada_hasta   = NULL,
         ultimo_acceso_en  = CASE WHEN $3 AND estado = 'ACTIVA' THEN now() ELSE ultimo_acceso_en END,
         actualizado_en    = now()
       WHERE id = $1 AND hash_contrasena = $2 AND ${NO_BLOQUEADA}
       RETURNING estado`,
      [usuario.id, usuario.hashContrasena, esAcceso],
    )) as [{ estado: EstadoCuenta }[], number];
    return filas[0]?.estado ?? null;
  }

  /**
   * Paso 9 — anota el acierto y *"registra el inicio de sesión"*, **en una
   * sola sentencia**. Devuelve el estado de la cuenta, o `null` si no se anotó.
   *
   * Con una transacción de dos sentencias, la conexión quedaba "idle in
   * transaction" entre la primera y la segunda mientras Node atendía otras
   * peticiones; en un pico se vieron hasta 8 de las 10 del pool así. Una
   * sentencia con CTE es igual de atómica y suelta la conexión al terminar.
   *
   * - El `UPDATE` tiene las condiciones de `anotarAcierto`: no bloqueada y con
   *   la misma contraseña que se acaba de verificar.
   * - La sesión solo se inserta si la cuenta está ACTIVA. Sin verificar o
   *   desactivada, el contador se limpia igual —acertar la contraseña
   *   demuestra que no es un ataque— pero no se abre sesión (paso 7, CU-027B).
   */
  private async registrarAcceso(
    usuario: Usuario,
    firmada: SesionFirmada,
    origen: OrigenSesion,
  ): Promise<EstadoCuenta | null> {
    const [fila] = (await this.fuenteDatos.query(
      `WITH acierto AS (
         UPDATE usuarios SET
           intentos_fallidos = 0,
           bloqueada_hasta   = NULL,
           ultimo_acceso_en  = CASE WHEN estado = 'ACTIVA' THEN now() ELSE ultimo_acceso_en END,
           actualizado_en    = now()
         WHERE id = $1 AND hash_contrasena = $2 AND ${NO_BLOQUEADA}
         RETURNING estado
       ), sesion AS (
         INSERT INTO sesiones (id, usuario_id, jti, emitida_en, expira_en, direccion_ip, agente_usuario,
                               generacion_renovacion, renovacion_expira_en)
         SELECT $8, $1, $3, $4, $5, $6, $7, $9, $10 FROM acierto WHERE estado = 'ACTIVA'
         RETURNING jti
       )
       SELECT (SELECT estado FROM acierto) AS "estado", (SELECT count(*) FROM sesion)::int AS "registradas"`,
      [
        usuario.id,
        usuario.hashContrasena,
        firmada.jti,
        firmada.emitidaEn,
        firmada.expiraEn,
        origen.direccionIp,
        origen.agenteUsuario?.slice(0, 255) ?? null,
        firmada.sesionId,
        firmada.generacion,
        firmada.renovacionExpiraEn,
      ],
    )) as { estado: EstadoCuenta | null; registradas: number }[];

    // Defensa: una cuenta ACTIVA sin sesión registrada no debería poder darse,
    // y si se diera, el token no tendría respaldo en la base.
    if (fila.estado === EstadoCuenta.ACTIVA && fila.registradas !== 1) {
      throw new Error(`No se registró la sesión ${firmada.jti} de una cuenta activa`);
    }
    return fila.estado;
  }

  /** Nombres de los roles de la cuenta (CU-028), en orden estable. */
  private async rolesDe(gestor: EntityManager, usuarioId: string): Promise<string[]> {
    const filas: { nombre: string }[] = await gestor.query(
      `SELECT r.nombre
         FROM usuarios_roles ur
         JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = $1
        ORDER BY r.nombre`,
      [usuarioId],
    );
    return filas.map((f) => f.nombre);
  }
}
