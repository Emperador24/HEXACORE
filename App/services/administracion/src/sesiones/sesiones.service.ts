import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { emitirTokenRenovacion } from '../comun/tokens-renovacion';
import { CONFIGURACION, ConfiguracionServicio, ReglasSeguridad } from '../config/configuracion';
import { Sesion } from '../persistencia/entidades/sesion.entity';
import { RevocacionesCompartidas, SesionRevocada } from './revocaciones-compartidas.service';

/**
 * Lo que va dentro del token de sesión.
 *
 * ## Lo que NO va
 *
 * Ni el nombre, ni el correo, ni nada personal. Un JWT **no está cifrado**:
 * cualquiera que lo intercepte —o que lo encuentre en un log, en el
 * almacenamiento del navegador o en una captura de red— puede leer su
 * contenido con decodificarlo en base64. Solo está *firmado*, que garantiza
 * que nadie lo altere, no que nadie lo lea.
 *
 * Por eso lleva únicamente lo que hace falta para autorizar: quién es y qué
 * puede hacer. El correo y el nombre se consultan cuando se necesitan.
 */
export interface ContenidoToken {
  /** Identificador del usuario. `sub` es el nombre estándar en JWT. */
  sub: string;
  /** Roles, para que el resto de servicios autoricen sin consultar a este. */
  roles: string[];
  /**
   * Identificador de **la sesión**, no de este token: se mantiene igual en
   * todas sus renovaciones. Es lo que permite revocarla (ver el contrato en
   * `App/shared/seguridad/token-sesion.md`).
   */
  jti: string;
}

/** Tokens recién firmados que todavía no se han registrado en la base. */
export interface SesionFirmada {
  /** Token de acceso (JWT). */
  token: string;
  jti: string;
  emitidaEn: Date;
  expiraEn: Date;
  usuarioId: string;
  /** Id de la fila de `sesiones`. Va dentro del token de renovación. */
  sesionId: string;
  generacion: number;
  tokenRenovacion: string;
  renovacionExpiraEn: Date;
}

export interface ParametrosFirma {
  usuarioId: string;
  roles: string[];
  /** Al renovar: la sesión existente. Al iniciar sesión se genera. */
  sesionId?: string;
  jti?: string;
  generacion?: number;
}

/** Datos de dónde se inició la sesión, para la auditoría del paso 9. */
export interface OrigenSesion {
  direccionIp: string | null;
  agenteUsuario: string | null;
}

/**
 * Emisión y revocación de sesiones (CU-027 paso 9).
 *
 * ## Por qué el token se firma Y se guarda
 *
 * Un JWT firmado se valida sin consultar la base: esa es su gracia y la razón
 * de que el resto de microservicios puedan autorizar sin llamar a este. Pero
 * tiene un problema conocido — **no se puede invalidar antes de que expire**.
 *
 * La tabla `sesiones` lo resuelve guardando el `jti` de cada token emitido: al
 * cerrar sesión se marca revocado y, aunque el token siga siendo
 * criptográficamente válido, deja de aceptarse.
 *
 * El coste es que validar exige una consulta. Es el precio de poder cerrar
 * sesión de verdad; sin él, "cerrar sesión" solo borraría el token del cliente
 * y quien lo hubiera copiado seguiría dentro hasta la expiración.
 */
@Injectable()
export class SesionesService {
  private readonly log = new Logger(SesionesService.name);
  private readonly reglas: ReglasSeguridad;
  private readonly claveRenovacion: Buffer;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly jwt: JwtService,
    private readonly revocaciones: RevocacionesCompartidas,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.seguridad;
    this.claveRenovacion = config.jwt.claveRenovacion;
  }

  /**
   * Firma un token nuevo. **No toca la base.**
   *
   * Va separado de `registrar` para que la firma —RS256, trabajo de CPU en el
   * hilo principal— no ocurra con una transacción abierta. Dentro de ella
   * retenía conexiones del pool durante los picos de login (se vieron las 10
   * "idle in transaction" a la vez). Ver DECISIONES.md §17.
   *
   * El paso 9 del CU-027 —*"genera un token de sesión y **registra el inicio
   * de sesión**"*— queda así repartido: aquí se genera, allí se registra.
   *
   * El registro lo hace `AutenticacionService` en la misma sentencia que anota
   * el acierto. Un token firmado y no registrado nunca sale de este proceso:
   * si no llega a registrarse, se descarta.
   */
  async firmar(p: ParametrosFirma): Promise<SesionFirmada> {
    const sesionId = p.sesionId ?? randomUUID();
    const jti = p.jti ?? randomUUID();
    const generacion = p.generacion ?? 0;
    const emitidaEn = new Date();
    const expiraEn = new Date(emitidaEn.getTime() + this.reglas.sesionMinutos * 60_000);

    const contenido: ContenidoToken = { sub: p.usuarioId, roles: p.roles, jti };
    const token = await this.jwt.signAsync(contenido, {
      // La expiración va también dentro del token, no solo en la base: así un
      // token caducado se rechaza sin necesidad de consultar nada.
      expiresIn: `${this.reglas.sesionMinutos}m`,
    });
    return {
      token,
      jti,
      emitidaEn,
      expiraEn,
      usuarioId: p.usuarioId,
      sesionId,
      generacion,
      tokenRenovacion: emitirTokenRenovacion(sesionId, generacion, this.claveRenovacion),
      renovacionExpiraEn: new Date(emitidaEn.getTime() + this.reglas.renovacionDias * 86_400_000),
    };
  }

  /**
   * Comprueba un token y devuelve su contenido, o `null` si no vale.
   *
   * Dos comprobaciones, y hacen falta las dos:
   *
   * 1. **La firma y la expiración**, que dependen solo del token.
   * 2. **Que la sesión no esté revocada**, que depende de la base.
   *
   * Sin la segunda, cerrar sesión no serviría de nada.
   */
  async validar(token: string): Promise<ContenidoToken | null> {
    let contenido: ContenidoToken;
    try {
      contenido = await this.jwt.verifyAsync<ContenidoToken>(token);
    } catch {
      // Firma inválida, expirado, o basura. Da igual cuál: no vale.
      return null;
    }

    const sesion = await this.fuenteDatos.manager.findOneBy(Sesion, {
      jti: contenido.jti,
      revocadaEn: IsNull(),
    });
    if (!sesion) return null;

    return contenido;
  }

  /**
   * Cierra una sesión. El token deja de aceptarse aunque no haya expirado,
   * aquí y —a través de Redis— en el resto de microservicios.
   */
  async revocar(jti: string, motivo: 'REUTILIZACION' | null = null): Promise<void> {
    await this.fuenteDatos.transaction(async (gestor) => {
      const cerradas = await this.marcarRevocadas(gestor, 'jti = :jti', { jti }, motivo);
      await this.revocaciones.anunciar(cerradas);
    });
    this.log.log(`Sesión ${jti} revocada`);
  }

  /**
   * Cierra todas las sesiones abiertas de una cuenta.
   *
   * Se usa al cambiar la contraseña (CU-027A): si alguien la cambió porque
   * sospecha que se la robaron, dejar vivas las sesiones abiertas dejaría
   * dentro precisamente a quien se quiere echar.
   *
   * `excepto` conserva una sesión: la de quien cambia su contraseña desde el
   * perfil, que no tiene por qué volver a entrar por haberlo hecho.
   *
   * Si llega un `gestor`, el anuncio en Redis ocurre dentro de su transacción:
   * si Redis falla, se deshace todo, cambio de contraseña incluido.
   */
  async revocarTodas(usuarioId: string, gestor?: EntityManager, excepto?: string): Promise<number> {
    const ejecutar = async (g: EntityManager): Promise<number> => {
      const cerradas = await this.marcarRevocadas(
        g,
        excepto ? 'usuario_id = :usuarioId AND jti <> :excepto' : 'usuario_id = :usuarioId',
        { usuarioId, excepto },
      );
      await this.revocaciones.anunciar(cerradas);
      return cerradas.length;
    };
    return gestor ? ejecutar(gestor) : this.fuenteDatos.transaction(ejecutar);
  }

  /** Marca como revocadas las sesiones abiertas que cumplan el filtro y las devuelve. */
  private async marcarRevocadas(
    gestor: EntityManager,
    filtro: string,
    parametros: Record<string, unknown>,
    motivo: 'REUTILIZACION' | null = null,
  ): Promise<SesionRevocada[]> {
    const resultado = await gestor
      .createQueryBuilder()
      .update(Sesion)
      .set({ revocadaEn: () => 'now()', motivoRevocacion: motivo })
      .where(`${filtro} AND revocada_en IS NULL`, parametros)
      // En texto SQL y no como lista: con `['jti', 'expira_en']` TypeORM espera
      // nombres de propiedad y descarta en silencio los que no reconoce. Así
      // pasó: `expira_en` desaparecía, la fecha quedaba inválida y ninguna
      // revocación llegaba a Redis.
      .returning('"jti", "expira_en"')
      .execute();
    const filas = resultado.raw as { jti: string; expira_en: Date }[];
    return filas.map((f) => ({ jti: f.jti, expiraEn: new Date(f.expira_en) }));
  }
}
