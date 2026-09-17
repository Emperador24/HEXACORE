import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { leerTokenRenovacion } from '../comun/tokens-renovacion';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { SesionCerradaPorSeguridad, SesionTerminada } from '../cuentas/cuentas.errors';
import { SesionRenovadaDto } from '../cuentas/dto/login.dto';
import { SesionesService } from './sesiones.service';

type FilaSesion = {
  id: string;
  jti: string;
  usuario_id: string;
  generacion_renovacion: number;
  revocada_en: Date | null;
  renovacion_expira_en: Date | null;
  motivo_revocacion: string | null;
  estado: string;
};

/**
 * Renovación de sesiones (DECISIONES.md §21).
 *
 * El token de acceso dura minutos; la sesión dura mientras se use. Cada
 * renovación:
 *
 * - **lee los roles actuales de la base**, así que un cambio de rol llega al
 *   resto de servicios en cuanto el token de acceso vigente caduca;
 * - comprueba que la cuenta sigue activa;
 * - **rota** el token de renovación: el anterior deja de valer, y si alguien lo
 *   vuelve a usar, la sesión entera se cierra (dos partes tienen copia).
 *
 * El `jti` no cambia entre renovaciones: identifica la sesión, y así la lista
 * de sesiones revocadas en Redis y la reventa funcionan igual que antes.
 *
 * ## Lo que NO cierra la renovación
 *
 * Una cuenta bloqueada por intentos fallidos (CU-027D) **sigue renovando**. Ese
 * bloqueo frena a quien prueba contraseñas desde fuera; echar por eso a la
 * persona que ya estaba dentro sería darle al atacante una forma de
 * desconectar a cualquiera.
 */
@Injectable()
export class RenovacionService {
  private readonly log = new Logger(RenovacionService.name);
  private readonly claveRenovacion: Buffer;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly sesiones: SesionesService,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.claveRenovacion = config.jwt.claveRenovacion;
  }

  async renovar(tokenRenovacion: string): Promise<SesionRenovadaDto> {
    // Un token que no es auténtico se rechaza sin tocar nada: si pudiera
    // cerrar sesiones, bastaría adivinar ids para desconectar a otros.
    const leido = leerTokenRenovacion(tokenRenovacion, this.claveRenovacion);
    if (!leido) throw new SesionTerminada();

    const sesion = await this.leerSesion(leido.sesionId);
    if (!sesion) throw new SesionTerminada();
    if (sesion.revocada_en) {
      // Si se cerró porque alguien reutilizó un token, quien llega ahora —con
      // un token auténtico de esa sesión— tiene que saberlo: puede que le
      // hayan robado el acceso y deba cambiar la contraseña.
      if (sesion.motivo_revocacion === 'REUTILIZACION') throw new SesionCerradaPorSeguridad();
      throw new SesionTerminada();
    }

    // Auténtico pero de una generación anterior: ya se había renovado con él.
    if (leido.generacion < sesion.generacion_renovacion) {
      await this.cerrarPorReutilizacion(sesion);
    }
    if (leido.generacion !== sesion.generacion_renovacion) throw new SesionTerminada();

    if (!sesion.renovacion_expira_en || new Date(sesion.renovacion_expira_en) <= new Date()) {
      throw new SesionTerminada();
    }
    if (sesion.estado !== 'ACTIVA') {
      // Una desactivación ya cierra las sesiones; esto es por si alguna quedó.
      await this.sesiones.revocar(sesion.jti);
      throw new SesionTerminada();
    }

    // Roles y firma fuera de cualquier transacción (DECISIONES.md §17).
    const roles = await this.rolesDe(sesion.usuario_id);
    const firmada = await this.sesiones.firmar({
      usuarioId: sesion.usuario_id,
      roles,
      sesionId: sesion.id,
      jti: sesion.jti,
      generacion: sesion.generacion_renovacion + 1,
    });

    // Una sola sentencia condicional: solo avanza si nadie renovó antes con este
    // mismo token, si la sesión sigue abierta y si la cuenta sigue activa.
    const [filas] = (await this.fuenteDatos.query(
      `UPDATE sesiones s SET
         generacion_renovacion = s.generacion_renovacion + 1,
         expira_en             = $3,
         renovacion_expira_en  = $4,
         renovada_en           = now()
       WHERE s.id = $1
         AND s.generacion_renovacion = $2
         AND s.revocada_en IS NULL
         AND s.renovacion_expira_en > now()
         AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = s.usuario_id AND u.estado = 'ACTIVA')
       RETURNING s.id`,
      [sesion.id, sesion.generacion_renovacion, firmada.expiraEn, firmada.renovacionExpiraEn],
    )) as [{ id: string }[], number];

    if (filas.length === 0) {
      // Algo cambió entre la lectura y la escritura. Si fue otra renovación con
      // el mismo token, es una reutilización como cualquier otra.
      const ahora = await this.leerSesion(sesion.id);
      if (ahora && !ahora.revocada_en && ahora.generacion_renovacion > sesion.generacion_renovacion) {
        await this.cerrarPorReutilizacion(ahora);
      }
      throw new SesionTerminada();
    }

    return {
      token: firmada.token,
      tipo: 'Bearer',
      expiraEn: firmada.expiraEn.toISOString(),
      tokenRenovacion: firmada.tokenRenovacion,
      renovacionExpiraEn: firmada.renovacionExpiraEn.toISOString(),
      roles,
    };
  }

  private async cerrarPorReutilizacion(sesion: FilaSesion): Promise<never> {
    this.log.warn(
      `Token de renovación reutilizado en la sesión ${sesion.id} del usuario ${sesion.usuario_id}: se cierra`,
    );
    await this.sesiones.revocar(sesion.jti, 'REUTILIZACION');
    throw new SesionCerradaPorSeguridad();
  }

  private async leerSesion(id: string): Promise<FilaSesion | undefined> {
    const [fila] = (await this.fuenteDatos.query(
      `SELECT s.id, s.jti, s.usuario_id, s.generacion_renovacion, s.revocada_en, s.renovacion_expira_en,
              s.motivo_revocacion, u.estado
         FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id = $1`,
      [id],
    )) as FilaSesion[];
    return fila;
  }

  private async rolesDe(usuarioId: string): Promise<string[]> {
    const filas = (await this.fuenteDatos.query(
      `SELECT r.nombre FROM usuarios_roles ur JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = $1 ORDER BY r.nombre`,
      [usuarioId],
    )) as { nombre: string }[];
    return filas.map((f) => f.nombre);
  }
}
