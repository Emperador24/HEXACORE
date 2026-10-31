import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CuentaNoEncontrada } from '../cuentas/cuentas.errors';
import { AccionCuenta, AuditoriaCuenta } from '../persistencia/entidades/auditoria-cuenta.entity';
import { NombreRol } from '../persistencia/entidades/rol.entity';
import { TokenCuenta } from '../persistencia/entidades/token-cuenta.entity';
import { EstadoCuenta, Usuario } from '../persistencia/entidades/usuario.entity';
import { UsuarioRol } from '../persistencia/entidades/usuario-rol.entity';
import { SesionesService } from '../sesiones/sesiones.service';
import { AutoAdministracion, TransicionNoValida, UltimoAdministrador } from './administracion-cuentas.errors';
import {
  ConsultarCuentasDto,
  CuentaAdministradaDto,
  DetalleCuentaDto,
  PaginaCuentasDto,
} from './dto/administracion-cuentas.dto';

/**
 * Clave del bloqueo de PostgreSQL que serializa los cambios que pueden dejar
 * el sistema sin administradores. Un número cualquiera, fijo.
 */
const BLOQUEO_ADMINISTRADORES = 270_280;

type FilaCuenta = {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoCuenta;
  roles: string[];
  eliminada_en: Date | null;
  verificado_en: Date | null;
  bloqueada_hasta: Date | null;
  ultimo_acceso_en: Date | null;
  creado_en: Date;
};

const COLUMNAS_CUENTA = `
  u.id, u.nombre, u.email, u.estado, u.eliminada_en, u.verificado_en,
  u.bloqueada_hasta, u.ultimo_acceso_en, u.creado_en,
  coalesce(array(
    SELECT r.nombre FROM usuarios_roles ur JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = u.id ORDER BY r.nombre
  ), '{}') AS roles`;

/**
 * Administración de cuentas — objetivo del CU-027 (*"el administrador puede
 * además activar, desactivar o eliminar cuentas"*) y flujo alterno CU-027B.
 *
 * ## Las tres garantías
 *
 * - **Desactivar cierra la puerta de verdad.** CU-027B dice *"el usuario no
 *   puede iniciar sesión"*; pero sin más, las sesiones que ya tuviera abiertas
 *   seguirían valiendo hasta una hora. Por eso se revocan todas en la misma
 *   transacción, también en Redis, donde las consulta la reventa.
 * - **Nunca sin administradores.** Ni uno puede desactivarse a sí mismo, ni
 *   dos pueden desactivarse mutuamente a la vez: los cambios sobre cuentas de
 *   administrador se serializan con un bloqueo de PostgreSQL.
 * - **Todo queda auditado**, en la misma transacción que el cambio.
 */
@Injectable()
export class AdministracionCuentasService {
  private readonly log = new Logger(AdministracionCuentasService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly sesiones: SesionesService,
  ) {}

  async listar(filtro: ConsultarCuentasDto): Promise<PaginaCuentasDto> {
    const condiciones: string[] = [];
    const parametros: unknown[] = [];

    if (!filtro.incluirEliminadas) condiciones.push('u.eliminada_en IS NULL');
    if (filtro.estado) {
      parametros.push(filtro.estado);
      condiciones.push(`u.estado = $${parametros.length}`);
    }
    if (filtro.busqueda) {
      // Se escapan los comodines de LIKE: buscar "100%" no debe traer todo.
      parametros.push(`%${filtro.busqueda.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      condiciones.push(`(u.nombre ILIKE $${parametros.length} OR u.email ILIKE $${parametros.length})`);
    }
    const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [{ total }] = (await this.fuenteDatos.query(
      `SELECT count(*)::int AS total FROM usuarios u ${donde}`,
      parametros,
    )) as { total: number }[];

    const filas = (await this.fuenteDatos.query(
      `SELECT ${COLUMNAS_CUENTA} FROM usuarios u ${donde}
        ORDER BY u.creado_en DESC, u.id
        LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, filtro.limite ?? 20, filtro.desplazamiento ?? 0],
    )) as FilaCuenta[];

    return { total, cuentas: filas.map((f) => this.aDto(f)) };
  }

  async detalle(id: string): Promise<DetalleCuentaDto> {
    const cuenta = await this.leer(this.fuenteDatos.manager, id);
    const auditoria = (await this.fuenteDatos.query(
      `SELECT a.accion, a.estado_anterior, a.estado_nuevo, a.motivo, a.sesiones_cerradas, a.fecha,
              autor.nombre AS autor
         FROM auditoria_cuentas a JOIN usuarios autor ON autor.id = a.realizada_por
        WHERE a.cuenta_id = $1
        ORDER BY a.fecha DESC, a.id
        LIMIT 20`,
      [id],
    )) as {
      accion: AccionCuenta;
      estado_anterior: EstadoCuenta;
      estado_nuevo: EstadoCuenta;
      motivo: string | null;
      sesiones_cerradas: number;
      fecha: Date;
      autor: string;
    }[];

    return {
      ...this.aDto(cuenta),
      auditoria: auditoria.map((a) => ({
        accion: a.accion,
        estadoAnterior: a.estado_anterior,
        estadoNuevo: a.estado_nuevo,
        realizadaPor: a.autor,
        motivo: a.motivo,
        sesionesCerradas: a.sesiones_cerradas,
        fecha: new Date(a.fecha).toISOString(),
      })),
    };
  }

  /**
   * Activa una cuenta: una pendiente de verificar (ACTIVAR) o una desactivada
   * (REACTIVAR, el *"hasta que sea reactivada"* de CU-027B).
   *
   * Activar una cuenta sin verificar es el administrador respondiendo por ella:
   * se le pone fecha de verificación, como exige la base, y se anulan los
   * enlaces de verificación pendientes, que ya no tienen objeto.
   */
  async activar(id: string, autorId: string, motivo?: string): Promise<CuentaAdministradaDto> {
    return this.fuenteDatos.transaction(async (gestor) => {
      const cuenta = await this.leer(gestor, id, true);
      if (cuenta.eliminada_en) {
        throw new TransicionNoValida('Esta cuenta fue eliminada y no puede reactivarse.');
      }
      if (cuenta.estado === EstadoCuenta.ACTIVA) {
        throw new TransicionNoValida('La cuenta ya está activa.');
      }

      const accion =
        cuenta.estado === EstadoCuenta.PENDIENTE_VERIFICACION ? AccionCuenta.ACTIVAR : AccionCuenta.REACTIVAR;
      await gestor.update(
        Usuario,
        { id },
        {
          estado: EstadoCuenta.ACTIVA,
          ...(accion === AccionCuenta.ACTIVAR ? { verificadoEn: new Date() } : {}),
        },
      );
      if (accion === AccionCuenta.ACTIVAR) {
        await gestor.query(
          `UPDATE tokens_cuenta SET usado_en = now()
            WHERE usuario_id = $1 AND tipo = 'VERIFICACION' AND usado_en IS NULL`,
          [id],
        );
      }
      await this.auditar(gestor, cuenta, accion, EstadoCuenta.ACTIVA, autorId, motivo ?? null, 0);
      this.log.log(`${accion}: ${cuenta.email} por ${autorId}`);
      return this.aDto(await this.leer(gestor, id));
    });
  }

  /** CU-027B: *"el usuario no puede iniciar sesión hasta que sea reactivada"*. */
  async desactivar(id: string, autorId: string, motivo: string): Promise<CuentaAdministradaDto> {
    if (id === autorId) throw new AutoAdministracion();

    return this.fuenteDatos.transaction(async (gestor) => {
      await this.protegerAdministradores(gestor);
      const cuenta = await this.leer(gestor, id, true);
      if (cuenta.eliminada_en || cuenta.estado === EstadoCuenta.DESACTIVADA) {
        throw new TransicionNoValida('La cuenta ya está desactivada.');
      }
      await this.exigirOtroAdministrador(gestor, cuenta);

      // Una cuenta pendiente de verificar no tiene fecha de verificación, y la
      // base no deja una desactivada sin ella. Se le pone: el estado previo
      // queda en la auditoría.
      await gestor.update(
        Usuario,
        { id },
        { estado: EstadoCuenta.DESACTIVADA, verificadoEn: cuenta.verificado_en ?? new Date() },
      );
      // Dentro de la transacción: si Redis no responde, no se desactiva nada, y
      // no queda una cuenta "desactivada" con sesiones vivas en la reventa.
      const cerradas = await this.sesiones.revocarTodas(id, gestor);
      await this.auditar(gestor, cuenta, AccionCuenta.DESACTIVAR, EstadoCuenta.DESACTIVADA, autorId, motivo, cerradas);
      this.log.warn(`CU-027B: ${cuenta.email} desactivada por ${autorId}; ${cerradas} sesiones cerradas`);
      return this.aDto(await this.leer(gestor, id));
    });
  }

  /**
   * Elimina una cuenta **anonimizándola**.
   *
   * La fila no se borra: su id aparece como dueño, vendedor o comprador en las
   * bases de otros servicios, sin llave foránea (ADR-01), y en transacciones
   * que deben conservarse. Borrarla dejaría esas referencias apuntando a nadie.
   *
   * Lo que se borra es todo lo que identifica a la persona: nombre, correo,
   * contraseña, roles, enlaces pendientes y la IP y el navegador de sus
   * sesiones. El correo queda libre para registrarse de nuevo.
   */
  async eliminar(id: string, autorId: string, motivo: string): Promise<CuentaAdministradaDto> {
    if (id === autorId) throw new AutoAdministracion();

    return this.fuenteDatos.transaction(async (gestor) => {
      await this.protegerAdministradores(gestor);
      const cuenta = await this.leer(gestor, id, true);
      if (cuenta.eliminada_en) throw new CuentaNoEncontrada();
      await this.exigirOtroAdministrador(gestor, cuenta);

      const cerradas = await this.sesiones.revocarTodas(id, gestor);
      await gestor.query(
        `UPDATE sesiones SET direccion_ip = NULL, agente_usuario = NULL WHERE usuario_id = $1`,
        [id],
      );
      await gestor.delete(TokenCuenta, { usuarioId: id });
      await gestor.delete(UsuarioRol, { usuarioId: id });
      await gestor.update(
        Usuario,
        { id },
        {
          nombre: 'Cuenta eliminada',
          // `.invalid` es un dominio reservado (RFC 2606): nunca recibirá correo.
          email: `eliminada-${id}@cuentas.invalid`,
          // No es un hash de scrypt: `verificarContrasena` lo rechaza siempre.
          hashContrasena: `eliminada$${randomBytes(24).toString('base64')}`,
          estado: EstadoCuenta.DESACTIVADA,
          verificadoEn: cuenta.verificado_en ?? new Date(),
          intentosFallidos: 0,
          bloqueadaHasta: null,
          eliminadaEn: new Date(),
        },
      );
      await this.auditar(gestor, cuenta, AccionCuenta.ELIMINAR, EstadoCuenta.DESACTIVADA, autorId, motivo, cerradas);
      // El correo original no va al log: es justo lo que se está borrando.
      this.log.warn(`Cuenta ${id} eliminada por ${autorId}; ${cerradas} sesiones cerradas`);
      return this.aDto(await this.leer(gestor, id));
    });
  }

  // ------------------------------------------------------------------------

  private async leer(gestor: EntityManager, id: string, bloquear = false): Promise<FilaCuenta> {
    const [fila] = (await gestor.query(
      `SELECT ${COLUMNAS_CUENTA} FROM usuarios u WHERE u.id = $1 ${bloquear ? 'FOR UPDATE OF u' : ''}`,
      [id],
    )) as FilaCuenta[];
    if (!fila) throw new CuentaNoEncontrada();
    return fila;
  }

  /**
   * Serializa los cambios que pueden afectar al número de administradores.
   *
   * Sin esto, dos administradores que se desactivan el uno al otro a la vez
   * verían cada uno "queda otro activo" y el sistema acabaría sin ninguno. El
   * bloqueo se libera solo al terminar la transacción.
   */
  private async protegerAdministradores(gestor: EntityManager): Promise<void> {
    await gestor.query('SELECT pg_advisory_xact_lock($1)', [BLOQUEO_ADMINISTRADORES]);
  }

  private async exigirOtroAdministrador(gestor: EntityManager, cuenta: FilaCuenta): Promise<void> {
    if (cuenta.estado !== EstadoCuenta.ACTIVA || !cuenta.roles.includes(NombreRol.ADMINISTRADOR)) return;
    const [{ otros }] = (await gestor.query(
      `SELECT count(*)::int AS otros FROM usuarios u
         JOIN usuarios_roles ur ON ur.usuario_id = u.id
         JOIN roles r ON r.id = ur.rol_id
        WHERE r.nombre = $1 AND u.estado = 'ACTIVA' AND u.id <> $2`,
      [NombreRol.ADMINISTRADOR, cuenta.id],
    )) as { otros: number }[];
    if (otros === 0) throw new UltimoAdministrador();
  }

  private async auditar(
    gestor: EntityManager,
    cuenta: FilaCuenta,
    accion: AccionCuenta,
    estadoNuevo: EstadoCuenta,
    autorId: string,
    motivo: string | null,
    sesionesCerradas: number,
  ): Promise<void> {
    await gestor.insert(AuditoriaCuenta, {
      cuentaId: cuenta.id,
      accion,
      estadoAnterior: cuenta.estado,
      estadoNuevo,
      realizadaPor: autorId,
      motivo,
      sesionesCerradas,
    });
  }

  private aDto(f: FilaCuenta): CuentaAdministradaDto {
    const fecha = (d: Date | null) => (d ? new Date(d).toISOString() : null);
    return {
      id: f.id,
      nombre: f.nombre,
      email: f.email,
      estado: f.estado,
      roles: f.roles,
      eliminada: f.eliminada_en !== null,
      verificadoEn: fecha(f.verificado_en),
      bloqueadaHasta: fecha(f.bloqueada_hasta),
      ultimoAccesoEn: fecha(f.ultimo_acceso_en),
      creadoEn: new Date(f.creado_en).toISOString(),
    };
  }
}
