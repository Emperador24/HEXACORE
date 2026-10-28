import { randomUUID } from 'node:crypto';
import { cifrarContrasena } from '../../comun/contrasenas';
import fuenteDatos from '../data-source';
import { NombreRol, Rol } from '../entidades/rol.entity';
import { EstadoCuenta, Usuario } from '../entidades/usuario.entity';
import { UsuarioRol } from '../entidades/usuario-rol.entity';

/**
 * Carga de cuentas para pruebas: muchos usuarios, con roles y estados variados.
 *
 *   npm run carga                    200 cuentas
 *   npm run carga -- --usuarios 1000
 *   npm run carga -- --limpiar       borra solo las que creó esta carga
 *
 * ## En qué se diferencia de `npm run semilla`
 *
 * La semilla crea **doce cuentas con nombre y propósito**: Ana compra, Bruno
 * revende, Carla compite por la misma entrada. Cada una existe para un escenario
 * concreto y las pruebas las nombran. Esta carga crea **volumen**: cuentas
 * anónimas para probar listados, paginación, filtros por rol y estado, o carga.
 *
 * Por eso esta **no borra nada** al empezar: se suma a lo que haya. Las cuentas
 * que crea se reconocen por el correo (`carga-0007-cliente@hexacore.com`) y
 * `--limpiar` se lleva solo esas, sin tocar las de la semilla. Correrla dos
 * veces suma: la numeración continúa donde iba.
 *
 * **Cuidado con el orden.** `npm run semilla` sí hace `TRUNCATE` de `usuarios`,
 * y `App/infra/iniciar.sh` la corre en cada arranque: una carga hecha antes de
 * arrancar desaparece. Primero se levanta el sistema, después se carga.
 *
 * ## Qué distribución genera, y por qué esa
 *
 * Se parece a la de un sistema real: casi todo el mundo es cliente, hay un
 * grupo de personal, unos pocos organizadores y un puñado de administradores.
 * Un reparto uniforme entre los cuatro roles daría listados irreales y
 * escondería justo los problemas que interesan — por ejemplo, que la búsqueda
 * de administradores sea rápida cuando son 5 entre 2.000.
 *
 * Los estados incluyen a propósito cuentas que **no pueden entrar**: sin
 * verificar, desactivadas y bloqueadas por intentos fallidos (CU-027D). Una
 * carga donde todas las cuentas funcionan no sirve para probar que el login
 * rechaza a las que no debe.
 */

// Todas comparten contraseña: son cuentas de prueba y el correo ya las delata.
const CONTRASENA_CARGA = 'carga2026';

/** Prefijo por el que se reconocen —y se borran— las cuentas de esta carga. */
const PREFIJO = 'carga-';

/**
 * Reparto de roles, en porcentaje. Suma 100.
 *
 * `Personal` lleva además su ficha de empleado en el servicio de Logística
 * (CU-018); ver `carga.mjs` de `eventos-emergencias`.
 */
const REPARTO_ROLES: [NombreRol, number][] = [
  [NombreRol.CLIENTE, 70],
  [NombreRol.PERSONAL, 20],
  [NombreRol.ORGANIZADOR, 7],
  [NombreRol.ADMINISTRADOR, 3],
];

/** Reparto de estados, en porcentaje. Suma 100. */
const REPARTO_ESTADOS: [EstadoCuenta | 'BLOQUEADA', number][] = [
  [EstadoCuenta.ACTIVA, 80],
  [EstadoCuenta.PENDIENTE_VERIFICACION, 10],
  [EstadoCuenta.DESACTIVADA, 5],
  // No es un estado de la base: es una cuenta ACTIVA con el bloqueo temporal
  // del CU-027D puesto, para poder probar que el login la rechaza.
  ['BLOQUEADA', 5],
];

const NOMBRES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Felipe', 'Gabriela', 'Héctor',
  'Isabel', 'Javier', 'Karen', 'Luis', 'Marta', 'Nicolás', 'Olga', 'Pablo',
  'Quintín', 'Rocío', 'Santiago', 'Tatiana', 'Ulises', 'Valeria', 'Wilson', 'Ximena',
];

const APELLIDOS = [
  'Gómez', 'Ramírez', 'Torres', 'Vargas', 'Peña', 'Rojas', 'Castillo', 'Mendoza',
  'Guerrero', 'Salazar', 'Ibáñez', 'Cárdenas', 'Naranjo', 'Quintero', 'Zapata',
];

/**
 * Generador con semilla fija: dos corridas con el mismo número de cuentas
 * producen exactamente las mismas, lo que hace que un fallo se pueda repetir.
 */
function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

/** Elige según los porcentajes de un reparto. */
function elegir<T>(reparto: [T, number][], azar: number): T {
  let acumulado = 0;
  for (const [valor, porcentaje] of reparto) {
    acumulado += porcentaje;
    if (azar * 100 < acumulado) return valor;
  }
  return reparto[reparto.length - 1][0];
}

interface Opciones {
  usuarios: number;
  limpiar: boolean;
}

function leerOpciones(argumentos: string[]): Opciones {
  const opciones: Opciones = { usuarios: 200, limpiar: false };
  for (let i = 0; i < argumentos.length; i++) {
    if (argumentos[i] === '--limpiar') opciones.limpiar = true;
    if (argumentos[i] === '--usuarios') {
      const valor = Number(argumentos[i + 1]);
      if (!Number.isInteger(valor) || valor < 1 || valor > 100_000) {
        throw new Error('--usuarios necesita un entero entre 1 y 100000');
      }
      opciones.usuarios = valor;
    }
  }
  return opciones;
}

async function limpiar(): Promise<void> {
  const { affected } = await fuenteDatos
    .createQueryBuilder()
    .delete()
    .from(Usuario)
    // Las filas de `usuarios_roles` y `sesiones` se van en cascada.
    .where('email LIKE :patron', { patron: `${PREFIJO}%` })
    .execute();
  console.log(`${affected ?? 0} cuentas de carga borradas. Las de la semilla siguen intactas.`);
}

/**
 * Desde qué número sigue la numeración.
 *
 * Correr la carga dos veces **suma** cuentas en vez de fallar por correo
 * repetido: es un generador de volumen, y querer más volumen es lo normal. La
 * semilla del azar se desplaza con el número inicial para que la segunda tanda
 * no sea una copia de la primera.
 */
async function siguienteNumero(): Promise<number> {
  const [fila]: { max: string | null }[] = await fuenteDatos.query(
    `SELECT MAX(SUBSTRING(email FROM '^${PREFIJO}([0-9]+)-')::int)::text AS max
       FROM usuarios WHERE email LIKE '${PREFIJO}%'`,
  );
  return Number(fila?.max ?? 0) + 1;
}

async function cargar(cuantos: number): Promise<void> {
  const desde = await siguienteNumero();
  const azar = generador(20260918 + desde);

  // Una sola vez: scrypt tarda ~100 ms a propósito, y con 200 cuentas serían
  // 20 segundos de espera sin ganar nada — todas usan la misma contraseña.
  const hash = await cifrarContrasena(CONTRASENA_CARGA);

  const roles = await fuenteDatos.manager.find(Rol);
  const porNombre = new Map(roles.map((rol) => [rol.nombre, rol.id]));
  if (porNombre.size === 0) {
    throw new Error('No hay roles en la base; ¿se corrió la migración?');
  }

  const ahora = Date.now();
  const cuentas: Partial<Usuario>[] = [];
  const asignaciones: Partial<UsuarioRol>[] = [];
  const cuenta = new Map<string, number>();

  for (let i = desde; i < desde + cuantos; i++) {
    const rol = elegir(REPARTO_ROLES, azar());
    const estadoElegido = elegir(REPARTO_ESTADOS, azar());
    const bloqueada = estadoElegido === 'BLOQUEADA';
    const estado = bloqueada ? EstadoCuenta.ACTIVA : (estadoElegido as EstadoCuenta);

    const id = randomUUID();
    const numero = String(i).padStart(4, '0');
    const nombre = `${NOMBRES[Math.floor(azar() * NOMBRES.length)]} ` +
      `${APELLIDOS[Math.floor(azar() * APELLIDOS.length)]}`;

    cuentas.push({
      id,
      nombre,
      email: `${PREFIJO}${numero}-${rol.toLowerCase()}@hexacore.com`,
      hashContrasena: hash,
      estado,
      // La restricción `ck_usuarios_verificacion_coherente` exige fecha de
      // verificación en toda cuenta que no esté pendiente.
      verificadoEn: estado === EstadoCuenta.PENDIENTE_VERIFICACION ? null : new Date(),
      intentosFallidos: bloqueada ? 5 : 0,
      bloqueadaHasta: bloqueada ? new Date(ahora + 15 * 60_000) : null,
      // Reparte los últimos accesos en los últimos 30 días, para que los
      // listados ordenados por actividad tengan algo que ordenar.
      ultimoAccesoEn:
        estado === EstadoCuenta.ACTIVA ? new Date(ahora - azar() * 30 * 86_400_000) : null,
    });

    asignaciones.push({ usuarioId: id, rolId: porNombre.get(rol)!, asignadoPor: null });

    // Una de cada diez cuentas de Personal es además Cliente: fuera del trabajo
    // también compra entradas, y eso hay que poder probarlo.
    if (rol === NombreRol.PERSONAL && azar() < 0.1) {
      asignaciones.push({
        usuarioId: id,
        rolId: porNombre.get(NombreRol.CLIENTE)!,
        asignadoPor: null,
      });
    }

    const clave = `${rol} · ${bloqueada ? 'BLOQUEADA' : estado}`;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }

  // En lotes: un `INSERT` de 5.000 filas de golpe supera el límite de
  // parámetros del driver de PostgreSQL.
  const LOTE = 500;
  await fuenteDatos.transaction(async (gestor) => {
    for (let i = 0; i < cuentas.length; i += LOTE) {
      await gestor.insert(Usuario, cuentas.slice(i, i + LOTE));
    }
    for (let i = 0; i < asignaciones.length; i += LOTE) {
      await gestor.insert(UsuarioRol, asignaciones.slice(i, i + LOTE));
    }
  });

  console.log(
    `\n${cuantos} cuentas creadas (${PREFIJO}${String(desde).padStart(4, '0')} a ` +
      `${PREFIJO}${String(desde + cuantos - 1).padStart(4, '0')}). ` +
      `Contraseña de todas: ${CONTRASENA_CARGA}\n`,
  );
  console.log('  Rol · Estado'.padEnd(46) + 'Cuentas');
  console.log('  ' + '-'.repeat(52));
  for (const [clave, total] of [...cuenta.entries()].sort()) {
    console.log(`  ${clave.padEnd(44)}${String(total).padStart(6)}`);
  }
  console.log(`
  Los correos siguen el patrón ${PREFIJO}0001-cliente@hexacore.com, así que se
  reconocen de un vistazo y se borran con:  npm run carga -- --limpiar

  Ojo: \`npm run semilla\` borra TODAS las cuentas, y \`iniciar.sh\` la corre al
  arrancar. Si vuelves a levantar el sistema, repite esta carga.

  Para darles ficha de empleado y turno a las cuentas de Personal:
    cd ../eventos-emergencias && npm run carga
`);
}

async function principal(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La carga de pruebas no se ejecuta en producción');
  }

  const opciones = leerOpciones(process.argv.slice(2));
  await fuenteDatos.initialize();
  console.log(`Conectado a ${fuenteDatos.options.database}`);

  try {
    if (opciones.limpiar) {
      await limpiar();
      return;
    }
    await cargar(opciones.usuarios);
  } finally {
    await fuenteDatos.destroy();
  }
}

principal().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
