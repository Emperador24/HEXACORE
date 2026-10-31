import Redis from 'ioredis';
import { cifrarContrasena } from '../../comun/contrasenas';
import { PREFIJO_REVOCADA } from '../../sesiones/revocaciones-compartidas.service';
import fuenteDatos from '../data-source';
import { Rol } from '../entidades/rol.entity';
import { Usuario } from '../entidades/usuario.entity';
import { UsuarioRol } from '../entidades/usuario-rol.entity';
import { CONTRASENA_DEMO, USUARIOS } from './datos-demo';

/**
 * Siembra las cuentas de demostración del CU-027.
 *
 *   npm run semilla
 *
 * Los **roles no se siembran aquí**: los crea la migración, porque sin el rol
 * `Cliente` el registro no puede asignar el rol por defecto del paso 4 y el
 * servicio quedaría inutilizable en una base recién migrada.
 */

async function sembrar(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La semilla de demostración no se ejecuta en producción');
  }

  await fuenteDatos.initialize();
  console.log(`Conectado a ${fuenteDatos.options.database}`);

  try {
    // Se cifra una sola vez y se reutiliza: scrypt tarda ~100 ms a propósito, y
    // hacerlo por cada cuenta haría la semilla notablemente más lenta sin
    // aportar nada — son todas la misma contraseña de demostración.
    const hash = await cifrarContrasena(CONTRASENA_DEMO);

    const abiertas = await fuenteDatos.transaction(async (gestor) => {
      // El TRUNCATE borra en cascada las sesiones. Las abiertas se apuntan
      // antes para anunciarlas como revocadas: si no, sus tokens dejarían de
      // valer aquí pero seguirían valiendo en la reventa hasta caducar (el
      // token que tenga guardado la app, por ejemplo).
      const filas: { jti: string; expira_en: Date }[] = await gestor.query(
        `SELECT jti, expira_en FROM sesiones WHERE revocada_en IS NULL AND expira_en > now()`,
      );

      // No se tocan los roles: son del esquema, no de la demo.
      await gestor.query(`TRUNCATE TABLE "usuarios" RESTART IDENTITY CASCADE`);

      const roles = await gestor.find(Rol);
      const porNombre = new Map(roles.map((rol) => [rol.nombre, rol.id]));

      for (const demo of USUARIOS) {
        await gestor.insert(Usuario, {
          id: demo.id,
          nombre: demo.nombre,
          email: demo.email,
          hashContrasena: hash,
          estado: demo.estado,
          // La restricción `ck_usuarios_verificacion_coherente` exige que toda
          // cuenta que no esté pendiente tenga fecha de verificación.
          verificadoEn: demo.estado === 'PENDIENTE_VERIFICACION' ? null : new Date(),
        });

        for (const nombreRol of demo.roles) {
          const rolId = porNombre.get(nombreRol);
          if (!rolId) throw new Error(`No existe el rol ${nombreRol}; ¿se corrió la migración?`);
          await gestor.insert(UsuarioRol, { usuarioId: demo.id, rolId, asignadoPor: null });
        }
      }
      return filas;
    });

    await anunciarRevocadas(abiertas);

    console.log(`\n${USUARIOS.length} cuentas sembradas. Contraseña de todas: ${CONTRASENA_DEMO}\n`);
    for (const usuario of USUARIOS) {
      console.log(
        `  ${usuario.email.padEnd(26)} ${usuario.estado.padEnd(23)} ` +
          `${usuario.roles.join('+').padEnd(22)} ${usuario.paraQue}`,
      );
    }
    console.log('');
  } finally {
    await fuenteDatos.destroy();
  }
}

/** Publica en Redis las sesiones que la semilla acaba de borrar (ver arriba). */
async function anunciarRevocadas(sesiones: { jti: string; expira_en: Date }[]): Promise<void> {
  if (sesiones.length === 0) return;
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PUERTO || 6380),
    maxRetriesPerRequest: 1,
    commandTimeout: 2000,
  });
  try {
    const lote = redis.multi();
    for (const s of sesiones) {
      const ms = new Date(s.expira_en).getTime() - Date.now() + 60_000;
      lote.set(`${PREFIJO_REVOCADA}${s.jti}`, '1', 'PX', ms);
    }
    await lote.exec();
    console.log(`${sesiones.length} sesiones abiertas anunciadas como revocadas en Redis`);
  } catch (error) {
    // No se aborta la semilla: la base ya quedó sembrada. Se avisa en claro.
    console.warn(
      `AVISO: no se pudieron anunciar ${sesiones.length} sesiones borradas en Redis ` +
        `(${(error as Error).message}); sus tokens seguirán valiendo en la reventa hasta caducar.`,
    );
  } finally {
    redis.disconnect();
  }
}

sembrar().catch((error: unknown) => {
  console.error('La semilla falló:', error);
  process.exit(1);
});
