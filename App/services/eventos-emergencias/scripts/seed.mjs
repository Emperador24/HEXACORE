// Siembra los empleados y el turno demo que usa la app Flutter (mismas
// cuentas de `_accounts` en lib/main.dart, usando el email como credencial).
// Requiere el servidor corriendo (`npm run start:dev`) y la infra compartida
// (App/infra/docker-compose.yml). Es idempotente: si un empleado con esa
// credencial ya existe, lo reutiliza.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3016';
const PREFIJO = '/api/v1/logistica';

// Token de "sistema" firmado con la clave de desarrollo (RNF-06): el seed no
// pasa por el login real de Administración porque estas cuentas demo no
// existen ahí todavía — ver bitácora del 17/09. `roles` amplio para no
// depender de qué rutas terminen exigiendo qué rol.
function tokenDeSistema() {
  const rutaClave = fileURLToPath(
    new URL('../../../infra/claves-desarrollo/jwt-privada.pem', import.meta.url),
  );
  const clavePrivada = readFileSync(rutaClave, 'utf8');
  return jwt.sign(
    { roles: ['Administrador', 'Personal', 'Organizador'] },
    clavePrivada,
    {
      algorithm: 'RS256',
      issuer: 'hexacore-administracion',
      subject: randomUUID(),
      jwtid: randomUUID(),
      expiresIn: '1h',
    },
  );
}

const TOKEN = tokenDeSistema();
const CABECERAS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

const empleadosDemo = [
  {
    usuarioId: randomUUID(),
    nombre: 'Luis Ramírez',
    rol: 'Entrada',
    credencial: 'HXC-CARNET-LUIS',
  },
  {
    usuarioId: randomUUID(),
    nombre: 'Sofía Vargas',
    rol: 'Entrada',
    credencial: 'HXC-CARNET-SOFIA',
  },
  {
    usuarioId: randomUUID(),
    nombre: 'Marta Gómez',
    rol: 'Parqueadero',
    credencial: 'HXC-CARNET-MARTA',
  },
  {
    usuarioId: randomUUID(),
    nombre: 'Carlos Peña',
    rol: 'Restaurante',
    credencial: 'HXC-CARNET-CARLOS',
  },
  {
    usuarioId: randomUUID(),
    nombre: 'Isabel Rojas',
    rol: 'Jefe de personal',
    credencial: 'HXC-CARNET-ISABEL',
  },
];

async function obtenerOCrearEmpleado(datos) {
  const existentes = await fetch(`${BASE_URL}${PREFIJO}/empleados`, {
    headers: CABECERAS,
  }).then((r) => r.json());
  const encontrado = existentes.find((e) => e.credencial === datos.credencial);
  if (encontrado) {
    console.log(`= Empleado ya existe: ${datos.nombre} (${datos.credencial})`);
    return encontrado;
  }
  const creado = await fetch(`${BASE_URL}${PREFIJO}/empleados`, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify(datos),
  }).then((r) => r.json());
  console.log(`+ Empleado creado: ${datos.nombre} (${datos.credencial})`);
  return creado;
}

async function asegurarTurno(empleado) {
  const turnos = await fetch(`${BASE_URL}${PREFIJO}/turnos`, {
    headers: CABECERAS,
  }).then((r) => r.json());
  const existente = turnos.find((t) => t.empleadoId === empleado.id);
  if (existente) {
    console.log(`= Turno ya existe para ${empleado.nombre}`);
    return existente;
  }
  const ahora = Date.now();
  const creado = await fetch(`${BASE_URL}${PREFIJO}/turnos`, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify({
      empleadoId: empleado.id,
      eventoId: 'evt-1',
      zona: 'Puerta Norte',
      // Turno de 8h "de hoy" centrado en el momento de la siembra: real
      // para la validación de horas máximas y, mientras se corra la demo
      // el mismo día del seed, también vigente para el check de asistencia.
      horaInicio: new Date(ahora - 2 * 60 * 60 * 1000).toISOString(),
      horaFin: new Date(ahora + 6 * 60 * 60 * 1000).toISOString(),
    }),
  }).then((r) => r.json());
  console.log(`+ Turno creado para ${empleado.nombre}: ${creado.zona}`);
  return creado;
}

const empleados = {};
for (const datos of empleadosDemo) {
  empleados[datos.credencial] = await obtenerOCrearEmpleado(datos);
}

await asegurarTurno(empleados['HXC-CARNET-LUIS']);

console.log('\nListo. Credenciales de asistencia (QR/NFC simulado):');
for (const e of empleadosDemo) {
  console.log(`  ${e.credencial} — ${e.nombre} (${e.rol})`);
}
console.log(
  '\nNota: el login real de estas personas en la app todavía no existe en Administración',
  '\n(no hay semillas ahí para estas cuentas) — ver bitácora del 17/09.',
);
