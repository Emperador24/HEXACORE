// Siembra los empleados y el turno demo que usa la app Flutter (mismas
// cuentas de `_accounts` en lib/main.dart, usando el email como credencial).
// Requiere el servidor corriendo (`npm run start:dev`). Es idempotente:
// si un empleado con esa credencial ya existe, lo reutiliza.
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3016';

const empleadosDemo = [
  { nombre: 'Luis Ramírez', rol: 'Entrada', credencial: 'personal@hexacore.com' },
  { nombre: 'Sofía Vargas', rol: 'Entrada', credencial: 'reemplazo-entrada@hexacore.com' },
  { nombre: 'Marta Gómez', rol: 'Parqueadero', credencial: 'parqueadero@hexacore.com' },
  { nombre: 'Carlos Peña', rol: 'Restaurante', credencial: 'restaurante@hexacore.com' },
  {
    nombre: 'Isabel Rojas',
    rol: 'Jefe de personal',
    credencial: 'jefepersonal@hexacore.com',
  },
];

async function obtenerOCrearEmpleado(datos) {
  const existentes = await fetch(`${BASE_URL}/empleados`).then((r) => r.json());
  const encontrado = existentes.find((e) => e.credencial === datos.credencial);
  if (encontrado) {
    console.log(`= Empleado ya existe: ${datos.nombre} (${datos.credencial})`);
    return encontrado;
  }
  const creado = await fetch(`${BASE_URL}/empleados`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  }).then((r) => r.json());
  console.log(`+ Empleado creado: ${datos.nombre} (${datos.credencial})`);
  return creado;
}

async function asegurarTurno(empleado) {
  const turnos = await fetch(`${BASE_URL}/turnos`).then((r) => r.json());
  const existente = turnos.find((t) => t.empleadoId === empleado.id);
  if (existente) {
    console.log(`= Turno ya existe para ${empleado.nombre}`);
    return existente;
  }
  const ahora = Date.now();
  const creado = await fetch(`${BASE_URL}/turnos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empleadoId: empleado.id,
      eventoId: 'evt-1',
      zona: 'Puerta Norte',
      // Turno de 8h "de hoy" centrado en el momento de la siembra: real
      // para la validación de horas máximas y, mientras se corra la demo
      // el mismo día del seed, también vigente para el check de asistencia.
      // (Una ventana artificialmente amplia rompía la validación de
      // horas máximas al aprobar un cambio de turno — la duración del
      // turno se calcula con esta misma horaInicio/horaFin.)
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

await asegurarTurno(empleados['personal@hexacore.com']);

console.log('\nListo. Login demo: personal@hexacore.com / 1234 (Turnos+Asistencia)');
console.log('                    jefepersonal@hexacore.com / 1234 (Solicitudes)');
