import { CONEXION_IDENTIDAD } from '../persistencia/conexion';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  ACCIONES_PERMISO,
  MODULOS_PERMISO,
  ModuloPermiso,
  AccionPermiso,
  permiso,
} from '../../../compartido/seguridad/permisos';
import { CuentaNoEncontrada } from '../cuentas/cuentas.errors';
import {
  AsignacionNoValida,
  NombreRolOcupado,
  ReasignacionNoValida,
  RolConUsuarios,
  RolDelSistema,
  RolNoEncontrado,
  RolSinPermisos,
  VersionRolDesactualizada,
} from './roles-permisos.errors';
import {
  CrearRolDto,
  DetalleRolDto,
  EditarRolDto,
  EliminarRolDto,
  ListaRolesDto,
  MisPermisosDto,
  PermisoDto,
  RolDto,
} from './dto/roles-permisos.dto';
import { PermisosCompartidos } from './permisos-compartidos.service';

/** Serializa la creación de roles: el nombre se compara sin distinguir mayúsculas. */
const BLOQUEO_NOMBRES_ROL = 280_280;

type AccionAuditoria = 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'ASIGNAR' | 'RETIRAR';

type FilaRol = {
  id: string;
  nombre: string;
  descripcion: string;
  del_sistema: boolean;
  version: number;
  actualizado_en: Date;
  permisos: string[];
  usuarios: number;
};

const COLUMNAS_ROL = `
  r.id, r.nombre, r.descripcion, r.del_sistema, r.version, r.actualizado_en,
  coalesce(array(
    SELECT p.modulo || ':' || p.accion FROM permisos_roles p WHERE p.rol_id = r.id ORDER BY p.modulo, p.accion
  ), '{}') AS permisos,
  (SELECT count(*)::int FROM usuarios_roles ur JOIN usuarios u ON u.id = ur.usuario_id
    WHERE ur.rol_id = r.id AND u.estado = 'ACTIVA') AS usuarios`;

/**
 * CU-028 · Gestión de roles y permisos.
 *
 * ## Las garantías
 *
 * - **Propagación inmediata (paso 7, CU-028B).** Cada cambio publica en Redis,
 *   dentro de su transacción, la matriz del rol o los roles vigentes de las
 *   cuentas afectadas; las guardas los leen en cada petición. Restringir un
 *   permiso cierra la ruta en la petición siguiente, con la misma sesión.
 * - **Nadie se pisa.** Editar y eliminar exigen la versión que se vio; si otro
 *   administrador guardó antes, 409 con la versión vigente.
 * - **Nadie se queda sin rol en silencio (CU-028A).** Un rol con usuarios
 *   activos no se elimina sin decir a qué rol pasan.
 * - **Todo queda auditado** en la misma transacción (post-condición 2).
 */
@Injectable()
export class RolesPermisosService {
  private readonly log = new Logger(RolesPermisosService.name);

  constructor(
    @InjectDataSource(CONEXION_IDENTIDAD) private readonly fuenteDatos: DataSource,
    private readonly compartidos: PermisosCompartidos,
  ) {}

  async listar(): Promise<ListaRolesDto> {
    const filas = (await this.fuenteDatos.query(
      `SELECT ${COLUMNAS_ROL} FROM roles r ORDER BY r.del_sistema DESC, r.nombre`,
    )) as FilaRol[];
    return {
      roles: filas.map((f) => this.aDto(f)),
      catalogo: {
        modulos: Object.entries(MODULOS_PERMISO).map(([id, nombre]) => ({ id, nombre })),
        acciones: [...ACCIONES_PERMISO],
      },
    };
  }

  async detalle(id: string): Promise<DetalleRolDto> {
    const rol = await this.leer(this.fuenteDatos.manager, id);
    const asignados = (await this.fuenteDatos.query(
      `SELECT u.id, u.nombre, u.email, u.estado, ur.asignado_en
         FROM usuarios_roles ur JOIN usuarios u ON u.id = ur.usuario_id
        WHERE ur.rol_id = $1 AND u.eliminada_en IS NULL
        ORDER BY u.nombre, u.id
        LIMIT 200`,
      [id],
    )) as { id: string; nombre: string; email: string; estado: string; asignado_en: Date }[];
    const auditoria = (await this.fuenteDatos.query(
      `SELECT a.accion, a.detalle, a.fecha, autor.nombre AS autor
         FROM auditoria_roles a JOIN usuarios autor ON autor.id = a.realizada_por
        WHERE a.rol_id = $1
        ORDER BY a.fecha DESC, a.id
        LIMIT 30`,
      [id],
    )) as { accion: string; detalle: Record<string, unknown>; fecha: Date; autor: string }[];
    return {
      ...this.aDto(rol),
      asignados: asignados.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        estado: u.estado,
        asignadoEn: new Date(u.asignado_en).toISOString(),
      })),
      auditoria: auditoria.map((a) => ({
        accion: a.accion,
        realizadaPor: a.autor,
        detalle: a.detalle,
        fecha: new Date(a.fecha).toISOString(),
      })),
    };
  }

  /**
   * Roles y permisos vigentes de quien llama, leídos de la base. Los usa el
   * portal para decidir qué secciones mostrar; quien decide de verdad es la
   * guarda de cada módulo, en cada petición.
   */
  async vigentesDe(usuarioId: string): Promise<MisPermisosDto> {
    const [fila] = (await this.fuenteDatos.query(
      `SELECT coalesce(array(
                SELECT r.nombre FROM usuarios_roles ur JOIN roles r ON r.id = ur.rol_id
                 WHERE ur.usuario_id = $1 ORDER BY r.nombre), '{}') AS roles,
              coalesce(array(
                SELECT DISTINCT p.modulo || ':' || p.accion
                  FROM usuarios_roles ur JOIN permisos_roles p ON p.rol_id = ur.rol_id
                 WHERE ur.usuario_id = $1 ORDER BY 1), '{}') AS permisos`,
      [usuarioId],
    )) as { roles: string[]; permisos: string[] }[];
    return {
      roles: fila.roles,
      permisos: fila.permisos.map((p) => {
        const [modulo, accion] = p.split(':') as [ModuloPermiso, AccionPermiso];
        return { modulo, accion };
      }),
    };
  }

  /** Pasos 3 a 8 para un rol nuevo. */
  async crear(datos: CrearRolDto, autorId: string): Promise<RolDto> {
    const permisos = this.normalizar(datos.permisos);
    return this.fuenteDatos.transaction(async (gestor) => {
      await gestor.query('SELECT pg_advisory_xact_lock($1)', [BLOQUEO_NOMBRES_ROL]);
      const [ocupado] = (await gestor.query(`SELECT nombre FROM roles WHERE lower(nombre) = lower($1)`, [
        datos.nombre,
      ])) as { nombre: string }[];
      if (ocupado) throw new NombreRolOcupado(ocupado.nombre);

      const [{ id }] = (await gestor.query(
        `INSERT INTO roles (nombre, descripcion, del_sistema) VALUES ($1, $2, false) RETURNING id`,
        [datos.nombre, datos.descripcion ?? ''],
      )) as { id: string }[];
      await this.guardarMatriz(gestor, id, permisos);
      await this.auditar(gestor, id, datos.nombre, 'CREAR', autorId, { permisos });
      await this.compartidos.publicarMatriz(datos.nombre, permisos);
      this.log.log(`CU-028: rol «${datos.nombre}» creado por ${autorId} con ${permisos.length} permisos`);
      return this.aDto(await this.leer(gestor, id));
    });
  }

  /** Pasos 3 a 8 para un rol existente. Reemplaza la matriz completa. */
  async editar(id: string, datos: EditarRolDto, autorId: string): Promise<RolDto> {
    const permisos = this.normalizar(datos.permisos);
    return this.fuenteDatos.transaction(async (gestor) => {
      const rol = await this.leerParaCambiar(gestor, id, datos.version);
      const antes = new Set(rol.permisos);
      const agregados = permisos.filter((p) => !antes.has(p));
      const retirados = rol.permisos.filter((p) => !permisos.includes(p));
      const descripcion = datos.descripcion ?? rol.descripcion;

      await gestor.query(`DELETE FROM permisos_roles WHERE rol_id = $1`, [id]);
      await this.guardarMatriz(gestor, id, permisos);
      await gestor.query(
        `UPDATE roles SET descripcion = $2, version = version + 1, actualizado_en = now() WHERE id = $1`,
        [id, descripcion],
      );
      await this.auditar(gestor, id, rol.nombre, 'EDITAR', autorId, {
        agregados,
        retirados,
        ...(descripcion !== rol.descripcion ? { descripcion: { antes: rol.descripcion, despues: descripcion } } : {}),
      });
      await this.compartidos.publicarMatriz(rol.nombre, permisos);
      this.log.log(
        `CU-028: rol «${rol.nombre}» editado por ${autorId}: +${agregados.length} −${retirados.length} permisos`,
      );
      return this.aDto(await this.leer(gestor, id));
    });
  }

  /** CU-028A: con usuarios activos, solo reasignándolos a otro rol en la misma transacción. */
  async eliminar(id: string, datos: EliminarRolDto, autorId: string): Promise<{ eliminado: string; reasignados: number }> {
    return this.fuenteDatos.transaction(async (gestor) => {
      const rol = await this.leerParaCambiar(gestor, id, datos.version);
      if (rol.usuarios > 0 && !datos.reasignarA) throw new RolConUsuarios(rol.usuarios);

      let destino: FilaRol | null = null;
      if (datos.reasignarA) {
        if (datos.reasignarA === id) throw new ReasignacionNoValida('No puedes reasignar los usuarios al mismo rol que eliminas.');
        destino = await this.leer(gestor, datos.reasignarA, true).catch((e) => {
          if (e instanceof RolNoEncontrado) throw new ReasignacionNoValida('El rol de destino no existe.');
          throw e;
        });
      }

      const afectados = (
        (await gestor.query(`SELECT usuario_id FROM usuarios_roles WHERE rol_id = $1`, [id])) as { usuario_id: string }[]
      ).map((f) => f.usuario_id);
      if (destino && afectados.length > 0) {
        await gestor.query(
          `INSERT INTO usuarios_roles (usuario_id, rol_id, asignado_por)
           SELECT usuario_id, $2, $3 FROM usuarios_roles WHERE rol_id = $1
           ON CONFLICT DO NOTHING`,
          [id, destino.id, autorId],
        );
      }
      await gestor.query(`DELETE FROM usuarios_roles WHERE rol_id = $1`, [id]);
      await gestor.query(`DELETE FROM roles WHERE id = $1`, [id]);
      await this.auditar(gestor, id, rol.nombre, 'ELIMINAR', autorId, {
        permisos: rol.permisos,
        ...(destino ? { reasignadosA: destino.nombre, usuarios: afectados.length } : {}),
      });
      await this.compartidos.publicarMatriz(rol.nombre, []);
      await this.compartidos.publicarRoles(await this.rolesDe(gestor, afectados));
      this.log.warn(
        `CU-028: rol «${rol.nombre}» eliminado por ${autorId}` +
          (destino ? `; ${afectados.length} usuarios pasan a «${destino.nombre}»` : ''),
      );
      return { eliminado: rol.nombre, reasignados: destino ? afectados.length : 0 };
    });
  }

  /** *"usuarios a asignar"*: el rol llega en la petición siguiente, sin cerrar su sesión. */
  async asignar(id: string, email: string, autorId: string): Promise<DetalleRolDto> {
    await this.fuenteDatos.transaction(async (gestor) => {
      const rol = await this.leer(gestor, id, true);
      if (rol.del_sistema) throw new RolDelSistema();
      const [cuenta] = (await gestor.query(
        `SELECT id, estado FROM usuarios WHERE lower(email) = $1 AND eliminada_en IS NULL FOR UPDATE`,
        [email],
      )) as { id: string; estado: string }[];
      if (!cuenta) throw new CuentaNoEncontrada();
      if (cuenta.estado !== 'ACTIVA') {
        throw new AsignacionNoValida('CUENTA_NO_ACTIVA', 'Solo se asignan roles a cuentas activas.');
      }
      const insertadas = (await gestor.query(
        `INSERT INTO usuarios_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING usuario_id`,
        [cuenta.id, id, autorId],
      )) as unknown[];
      if (insertadas.length === 0) return;
      await this.auditar(gestor, id, rol.nombre, 'ASIGNAR', autorId, { usuarioId: cuenta.id });
      await this.compartidos.publicarRoles(await this.rolesDe(gestor, [cuenta.id]));
    });
    return this.detalle(id);
  }

  /** Retirar un rol propio de una cuenta. Su sesión lo pierde en la petición siguiente. */
  async retirar(id: string, usuarioId: string, autorId: string): Promise<DetalleRolDto> {
    await this.fuenteDatos.transaction(async (gestor) => {
      const rol = await this.leer(gestor, id, true);
      if (rol.del_sistema) throw new RolDelSistema();
      await gestor.query(`SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE`, [usuarioId]);
      const [{ otros }] = (await gestor.query(
        `SELECT count(*)::int AS otros FROM usuarios_roles WHERE usuario_id = $1 AND rol_id <> $2`,
        [usuarioId, id],
      )) as { otros: number }[];
      // En un DELETE, TypeORM devuelve `[filas, cuántas]`, no solo las filas.
      const [borradas] = (await gestor.query(
        `DELETE FROM usuarios_roles WHERE usuario_id = $1 AND rol_id = $2 RETURNING usuario_id`,
        [usuarioId, id],
      )) as [unknown[], number];
      if (borradas.length === 0) {
        throw new AsignacionNoValida('NO_ASIGNADO', 'Esa cuenta no tiene este rol.');
      }
      if (otros === 0) {
        throw new AsignacionNoValida('SIN_ROLES', 'La cuenta se quedaría sin ningún rol. Asígnale otro antes.');
      }
      await this.auditar(gestor, id, rol.nombre, 'RETIRAR', autorId, { usuarioId });
      await this.compartidos.publicarRoles(await this.rolesDe(gestor, [usuarioId]));
    });
    return this.detalle(id);
  }

  // ------------------------------------------------------------------------

  /** Paso 5, y los repetidos una sola vez, en orden estable. */
  private normalizar(permisos: PermisoDto[]): string[] {
    const unicos = [...new Set(permisos.map((p) => permiso(p.modulo, p.accion)))].sort();
    if (unicos.length === 0) throw new RolSinPermisos();
    return unicos;
  }

  private async guardarMatriz(gestor: EntityManager, rolId: string, permisos: string[]): Promise<void> {
    const pares = permisos.map((p) => p.split(':') as [ModuloPermiso, AccionPermiso]);
    await gestor.query(
      `INSERT INTO permisos_roles (rol_id, modulo, accion)
       SELECT $1, m, a FROM unnest($2::varchar[], $3::varchar[]) AS t(m, a)`,
      [rolId, pares.map(([m]) => m), pares.map(([, a]) => a)],
    );
  }

  private async leer(gestor: EntityManager, id: string, bloquear = false): Promise<FilaRol> {
    const [fila] = (await gestor.query(
      `SELECT ${COLUMNAS_ROL} FROM roles r WHERE r.id = $1 ${bloquear ? 'FOR UPDATE OF r' : ''}`,
      [id],
    )) as FilaRol[];
    if (!fila) throw new RolNoEncontrado();
    return fila;
  }

  private async leerParaCambiar(gestor: EntityManager, id: string, version: number): Promise<FilaRol> {
    const rol = await this.leer(gestor, id, true);
    if (rol.del_sistema) throw new RolDelSistema();
    if (rol.version !== version) throw new VersionRolDesactualizada(rol.version);
    return rol;
  }

  private async rolesDe(gestor: EntityManager, usuarios: string[]): Promise<{ usuarioId: string; roles: string[] }[]> {
    if (usuarios.length === 0) return [];
    const filas = (await gestor.query(
      `SELECT u.id, coalesce(array(
          SELECT r.nombre FROM usuarios_roles ur JOIN roles r ON r.id = ur.rol_id
           WHERE ur.usuario_id = u.id ORDER BY r.nombre
        ), '{}') AS roles
         FROM usuarios u WHERE u.id = ANY($1::uuid[])`,
      [usuarios],
    )) as { id: string; roles: string[] }[];
    return filas.map((f) => ({ usuarioId: f.id, roles: f.roles }));
  }

  private async auditar(
    gestor: EntityManager,
    rolId: string,
    rolNombre: string,
    accion: AccionAuditoria,
    autorId: string,
    detalle: Record<string, unknown>,
  ): Promise<void> {
    await gestor.query(
      `INSERT INTO auditoria_roles (rol_id, rol_nombre, accion, detalle, realizada_por) VALUES ($1, $2, $3, $4, $5)`,
      [rolId, rolNombre, accion, JSON.stringify(detalle), autorId],
    );
  }

  private aDto(f: FilaRol): RolDto {
    return {
      id: f.id,
      nombre: f.nombre,
      descripcion: f.descripcion,
      delSistema: f.del_sistema,
      version: f.version,
      permisos: f.permisos.map((p) => {
        const [modulo, accion] = p.split(':') as [ModuloPermiso, AccionPermiso];
        return { modulo, accion };
      }),
      usuarios: f.usuarios,
      actualizadoEn: new Date(f.actualizado_en).toISOString(),
    };
  }
}
