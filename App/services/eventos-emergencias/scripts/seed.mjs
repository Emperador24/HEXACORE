// Siembra los empleados y el turno demo del CU-018.
//
// A diferencia de la versión anterior, **cada empleado queda ligado a la cuenta
// real del CU-027**: se inicia sesión como administrador, se buscan las cuentas
// de ejemplo por su correo y se dan de alta con su `usuarioId`. Es exactamente
// el flujo que hará un administrador de verdad, no un atajo del guion.
//
// Todo pasa por el API Gateway, igual que la app.
//
//   node scripts/seed.mjs
//
// Es idempotente: si un empleado ya está dado de alta, lo reutiliza.

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8080/api/v1';
const ADMIN = { email: 'admin@hexacore.com', contrasena: 'hexacore2026' };

/** Cuenta de ejemplo -> área de trabajo en el evento. */
const EMPLEADOS_DEMO = [
  { correo: 'personal@hexacore.com', nombre: 'Luis Ramírez', rol: 'Entrada' },
  { correo: 'parqueadero@hexacore.com', nombre: 'Marta Gómez', rol: 'Parqueadero' },
  { correo: 'restaurante@hexacore.com', nombre: 'Carlos Peña', rol: 'Restaurante' },
  { correo: 'jefepersonal@hexacore.com', nombre: 'Isabel Rojas', rol: 'Jefe de personal' },
];

// Quien cubre el turno cuando alguien pide un cambio. Necesita cuenta propia:
// un reemplazo sin cuenta no podría entrar a la app a ver su turno nuevo.
const REEMPLAZO = {
  correo: 'reemplazo@hexacore.com',
  nombre: 'Sofía Vargas',
  rol: 'Entrada',
};

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
  const datos = texto ? JSON.parse(texto) : {};
  return { estado: respuesta.status, datos };
}

async function entrarComoAdministrador() {
  const { estado, datos } = await api('sesiones', { metodo: 'POST', cuerpo: ADMIN });
  if (estado !== 200 && estado !== 201) {
    throw new Error(
      `No se pudo iniciar sesión como administrador (${estado}). ` +
        '¿Corriste la semilla del servicio de Administración?',
    );
  }
  return datos.token;
}

/**
 * Busca cada cuenta por su correo, una por una.
 *
 * No se listan todas y se filtra después: con la carga de pruebas puede haber
 * cientos de cuentas y las de ejemplo quedarían fuera de la primera página —
 * pasó, y el seed decía «no existe esa cuenta» sobre cuentas que sí existían.
 */
async function buscarCuentas(token, correos) {
  const encontradas = new Map();
  const limite = 100;
  for (const correo of correos) {
    // La búsqueda es por texto: `personal@hexacore.com` también trae
    // `jefepersonal@…` y las `carga-0007-personal@…` de la carga de pruebas.
    // Por eso se pagina hasta dar con la coincidencia exacta.
    for (let desplazamiento = 0; ; desplazamiento += limite) {
      const { estado, datos } = await api(
        `admin/cuentas?busqueda=${encodeURIComponent(correo)}` +
          `&limite=${limite}&desplazamiento=${desplazamiento}`,
        { token },
      );
      if (estado !== 200) throw new Error(`No se pudieron buscar las cuentas (${estado}).`);
      const lista = Array.isArray(datos) ? datos : (datos.cuentas ?? datos.datos ?? []);
      const cuenta = lista.find((c) => c.email === correo);
      if (cuenta) {
        encontradas.set(correo, cuenta);
        break;
      }
      if (lista.length < limite) break;
    }
  }
  return encontradas;
}

async function darDeAlta(token, cuentas, plantilla) {
  const cuenta = cuentas.get(plantilla.correo);
  if (!cuenta) {
    console.log(`  ! ${plantilla.correo}: no existe esa cuenta, se omite`);
    return null;
  }

  const { estado, datos } = await api('logistica/empleados', {
    metodo: 'POST',
    token,
    cuerpo: {
      usuarioId: cuenta.id,
      nombre: plantilla.nombre,
      rol: plantilla.rol,
      // La credencial es lo que se escanea en el punto de control. El correo
      // sirve como valor legible mientras no haya carnés impresos.
      credencial: plantilla.correo,
    },
  });

  if (estado === 201 || estado === 200) {
    console.log(`  + ${plantilla.nombre} (${plantilla.rol}) <- ${plantilla.correo}`);
    return datos;
  }
  if (estado === 409) {
    console.log(`  = ${plantilla.nombre} ya estaba dado de alta`);
    const { datos: todos } = await api('logistica/empleados', { token });
    const lista = Array.isArray(todos) ? todos : [];
    return lista.find((e) => e.usuarioId === cuenta.id) ?? null;
  }
  console.log(`  ! ${plantilla.nombre}: ${estado} ${JSON.stringify(datos)}`);
  return null;
}

async function asegurarTurno(token, empleado) {
  const { datos: turnos } = await api('logistica/turnos', { token });
  const lista = Array.isArray(turnos) ? turnos : [];
  const vigente = lista.find(
    (t) => t.empleadoId === empleado.id && new Date(t.horaFin) > new Date(),
  );
  if (vigente) {
    console.log(`  = ${empleado.nombre} ya tiene un turno vigente`);
    return vigente;
  }

  const ahora = Date.now();
  const { estado, datos } = await api('logistica/turnos', {
    metodo: 'POST',
    token,
    cuerpo: {
      empleadoId: empleado.id,
      eventoId: 'evt-1',
      zona: 'Puerta Norte',
      // Un turno de 8 h centrado en este momento: vigente para poder registrar
      // asistencia hoy, y de duración real para que la validación de horas
      // máximas al aprobar un cambio de turno signifique algo.
      horaInicio: new Date(ahora - 2 * 60 * 60 * 1000).toISOString(),
      horaFin: new Date(ahora + 6 * 60 * 60 * 1000).toISOString(),
    },
  });
  if (estado !== 201 && estado !== 200) {
    console.log(`  ! turno de ${empleado.nombre}: ${estado} ${JSON.stringify(datos)}`);
    return null;
  }
  console.log(`  + turno de ${empleado.nombre}: ${datos.zona}`);
  return datos;
}

const token = await entrarComoAdministrador();
const cuentas = await buscarCuentas(
  token,
  [...EMPLEADOS_DEMO, REEMPLAZO].map((e) => e.correo),
);

console.log('Empleados (alta por el administrador, ligada a su cuenta):');
const altas = [];
for (const plantilla of [...EMPLEADOS_DEMO, REEMPLAZO]) {
  const empleado = await darDeAlta(token, cuentas, plantilla);
  if (empleado) altas.push({ plantilla, empleado });
}

console.log('\nTurnos:');
const conTurno = altas.find((a) => a.plantilla.correo === 'personal@hexacore.com');
if (conTurno) await asegurarTurno(token, conTurno.empleado);

console.log(`
Listo. Entra en la app móvil con cualquiera de estas cuentas (contraseña hexacore2026):

  personal@hexacore.com      -> Entrada          (turnos, asistencia, validar entradas)
  parqueadero@hexacore.com   -> Parqueadero
  restaurante@hexacore.com   -> Restaurante
  jefepersonal@hexacore.com  -> Jefe de personal (revisa las solicitudes de cambio)

Cada una verá únicamente las pantallas de su área.`);
