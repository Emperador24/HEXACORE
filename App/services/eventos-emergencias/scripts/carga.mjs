// Carga de empleados y turnos para pruebas (CU-018).
//
// Da de alta como empleado a cada cuenta de Personal creada por la carga del
// servicio de Administración (`carga-NNNN-personal@hexacore.com`), repartiendo
// áreas, y le pone turnos: unos vigentes, otros pasados y otros por venir.
//
//   cd ../administracion && npm run carga        # primero, las cuentas
//   npm run carga                                 # después, sus fichas
//   npm run carga -- --limpiar                    # deshacerlo
//
// Todo pasa por el API Gateway y con sesión de administrador: es el mismo
// camino que seguiría una persona dando de alta al personal, no un atajo por la
// base de datos.

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8080/api/v1';
const ADMIN = { email: 'admin@hexacore.com', contrasena: 'hexacore2026' };
const PREFIJO = 'carga-';

/**
 * Áreas que se reparten, con su peso. Refleja un evento real: la mayor parte
 * del personal está en las puertas, y hay un jefe por cada bastantes personas.
 */
const AREAS = [
  ['Entrada', 50],
  ['Parqueadero', 20],
  ['Restaurante', 25],
  ['Jefe de personal', 5],
];

const limpiar = process.argv.includes('--limpiar');

async function api(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const respuesta = await fetch(`${GATEWAY}/${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, datos: texto ? JSON.parse(texto) : {} };
}

async function entrar() {
  const { estado, datos } = await api('sesiones', { metodo: 'POST', cuerpo: ADMIN });
  if (estado !== 200 && estado !== 201) {
    throw new Error(`No se pudo entrar como administrador (${estado}). ¿Corriste npm run semilla?`);
  }
  return datos.token;
}

/** Todas las cuentas de Personal de la carga, paginando el listado. */
async function cuentasDeCarga(token) {
  const encontradas = [];
  const limite = 100;
  for (let desplazamiento = 0; ; desplazamiento += limite) {
    const { estado, datos } = await api(
      `admin/cuentas?busqueda=${PREFIJO}&limite=${limite}&desplazamiento=${desplazamiento}`,
      { token },
    );
    if (estado !== 200) throw new Error(`No se pudieron listar las cuentas (${estado})`);
    const pagina = datos.cuentas ?? datos.datos ?? [];
    encontradas.push(...pagina.filter((c) => c.email.includes('-personal@')));
    if (pagina.length < limite) break;
  }
  return encontradas;
}

/** Mismo generador con semilla que la carga de cuentas: resultados repetibles. */
function generador(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

function elegirArea(azar) {
  let acumulado = 0;
  for (const [area, peso] of AREAS) {
    acumulado += peso;
    if (azar * 100 < acumulado) return area;
  }
  return AREAS[0][0];
}

const token = await entrar();

if (limpiar) {
  // No hay endpoint para borrar empleados —dar de baja a alguien es
  // desactivarlo, no borrarlo—, así que se avisa en vez de fingir que se hizo.
  console.log(`Para deshacer la carga, borra las cuentas en Administración:

  cd ../administracion && npm run carga -- --limpiar

y luego las fichas huérfanas de este servicio:

  docker exec hexacore-postgres psql -U hexacore -d eventos_emergencias \\
    -c "DELETE FROM registros_asistencia; DELETE FROM solicitudes_cambio_turno;
        DELETE FROM turnos WHERE empleado_id IN (SELECT id FROM empleados WHERE credencial LIKE '${PREFIJO}%');
        DELETE FROM empleados WHERE credencial LIKE '${PREFIJO}%';"`);
  process.exit(0);
}

const cuentas = await cuentasDeCarga(token);
if (cuentas.length === 0) {
  console.log(
    `No hay cuentas ${PREFIJO}*-personal@hexacore.com.\n` +
      'Corre primero: cd ../administracion && npm run carga',
  );
  process.exit(0);
}

console.log(`${cuentas.length} cuentas de Personal encontradas. Dando de alta sus fichas...\n`);

const azar = generador(20260918);
const ahora = Date.now();
const HORA = 60 * 60 * 1000;

const porArea = new Map();
let conTurno = 0;
let yaEstaban = 0;
let fallidas = 0;

for (const cuenta of cuentas) {
  const area = elegirArea(azar());

  const alta = await api('logistica/empleados', {
    metodo: 'POST',
    token,
    cuerpo: {
      usuarioId: cuenta.id,
      nombre: cuenta.nombre,
      rol: area,
      credencial: cuenta.email,
    },
  });

  if (alta.estado === 409) {
    yaEstaban++;
    continue;
  }
  if (alta.estado !== 201 && alta.estado !== 200) {
    fallidas++;
    if (fallidas <= 3) console.log(`  ! ${cuenta.email}: ${alta.estado} ${JSON.stringify(alta.datos)}`);
    continue;
  }

  porArea.set(area, (porArea.get(area) ?? 0) + 1);

  // Tres turnos de cada cuatro empleados, repartidos en el tiempo: uno vigente
  // (se puede marcar asistencia), uno que ya terminó (aparece en el historial)
  // y uno por venir. Un empleado sin ningún turno también hace falta: es el
  // caso de quien acaba de ser contratado.
  const cuando = azar();
  if (cuando >= 0.25) {
    const desplazamiento = cuando < 0.6 ? -2 : cuando < 0.85 ? -30 : 24;
    const inicio = new Date(ahora + desplazamiento * HORA);
    const fin = new Date(inicio.getTime() + 8 * HORA);
    const turno = await api('logistica/turnos', {
      metodo: 'POST',
      token,
      cuerpo: {
        empleadoId: alta.datos.id,
        eventoId: 'evt-1',
        zona: ['Puerta Norte', 'Puerta Sur', 'Zona VIP', 'Parqueadero P1'][
          Math.floor(azar() * 4)
        ],
        horaInicio: inicio.toISOString(),
        horaFin: fin.toISOString(),
      },
    });
    if (turno.estado === 201 || turno.estado === 200) conTurno++;
  }
}

console.log('  Área'.padEnd(28) + 'Empleados');
console.log('  ' + '-'.repeat(36));
for (const [area, total] of [...porArea.entries()].sort()) {
  console.log(`  ${area.padEnd(26)}${String(total).padStart(6)}`);
}

console.log(`
  Con turno asignado: ${conTurno}
  Ya estaban dados de alta: ${yaEstaban}${fallidas ? `\n  Fallidas: ${fallidas}` : ''}

  Entra en la app con cualquiera de esas cuentas (contraseña carga2026) y verás
  únicamente las pantallas de su área. Para saber el área de una en concreto:

    docker exec hexacore-postgres psql -U hexacore -d eventos_emergencias \\
      -c "select credencial, rol from empleados where credencial like '${PREFIJO}%' limit 10;"
`);
