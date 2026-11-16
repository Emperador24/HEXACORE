import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { cuentaNueva, llamar, sesion } from './api';
import { ARCHIVO_DATOS, DatosDemo } from './datos';
import { ENTORNO } from './entorno';

/**
 * Prepara, por la API y sin tocar la base, lo que los casos de uso necesitan
 * y que no es lo que se demuestra: un recinto con zonas en el plano y su plan
 * de evacuación, un evento publicado para mañana y personal con credencial.
 * Todo lleva un sufijo propio, así la demostración se puede repetir.
 */
export default async function preparar() {
  const sufijo = Date.now().toString(36).slice(-5).toUpperCase();
  const organizador = await sesion(ENTORNO.cuentas.organizador);

  // Recinto con tres zonas dibujadas en el plano (CU-029), base de la evacuación (CU-010).
  const geometria = {
    Gramilla: { capacidad: 1000, x: 10, y: 30, ancho: 40, alto: 40 },
    'Tribuna Norte': { capacidad: 1200, x: 52, y: 30, ancho: 30, alto: 40 },
    'Tribuna Sur': { capacidad: 800, x: 10, y: 80, ancho: 80, alto: 15 },
  };
  const { recinto } = await llamar(organizador, 'POST', '/recintos', {
    nombre: `Coliseo Demo ${sufijo}`, ciudad: 'Bogotá', direccion: 'Av. Demostración 26', capacidad: 3000,
    zonas: Object.entries(geometria).map(([nombre, g]) => ({ nombre, ...g })),
  });
  const zonas = Object.fromEntries((recinto.zonas as { id: string; nombre: string }[]).map((z) => [z.nombre, z.id]));
  await llamar(organizador, 'PUT', `/emergencias/recintos/${recinto.id}/plan`, {
    salidas: [{ nombre: 'Salida Norte', capacidadPorMinuto: 40 }, { nombre: 'Salida Sur', capacidadPorMinuto: 60 }, { nombre: 'Salida Oriental', capacidadPorMinuto: 30 }],
    rutas: [
      { zonaId: zonas.Gramilla, salida: 'Salida Norte', prioridad: 1, descripcion: 'Por el túnel 3, seguir la señalización verde' },
      { zonaId: zonas.Gramilla, salida: 'Salida Sur', prioridad: 2 },
      { zonaId: zonas['Tribuna Norte'], salida: 'Salida Norte', prioridad: 1, descripcion: 'Escaleras B y C' },
      { zonaId: zonas['Tribuna Norte'], salida: 'Salida Oriental', prioridad: 2 },
      { zonaId: zonas['Tribuna Sur'], salida: 'Salida Sur', prioridad: 1 },
      { zonaId: zonas['Tribuna Sur'], salida: 'Salida Oriental', prioridad: 2 },
    ],
  });

  // Evento publicado para mañana (CU-026 por API; la demo de CU-026 crea otro por el portal).
  const manana = new Date(Date.now() + 24 * 3_600_000);
  manana.setHours(18, 0, 0, 0);
  const nombreEvento = `Festival HEXACORE ${sufijo}`;
  const creado = await llamar(organizador, 'POST', '/eventos', {
    nombre: nombreEvento, categoria: 'Conciertos', artista: 'Varios artistas', recintoId: recinto.id,
    fechaInicio: manana.toISOString(), fechaFin: new Date(manana.getTime() + 5 * 3_600_000).toISOString(),
    localidades: [{ nombre: 'General', precio: 120000, cantidad: 2000 }, { nombre: 'VIP', precio: 350000, cantidad: 500 }],
  });
  const evento = creado.evento ?? creado;
  await llamar(organizador, 'POST', `/eventos/${evento.id}/publicar`, { version: evento.version });

  // La asignación de personal elige entre los eventos de la cartelera (Boletería).
  const { eventos } = await llamar<{ eventos: { id: string; nombre: string; pasado: boolean }[] }>(null, 'GET', '/cartelera');
  const proximo = eventos.find((e) => !e.pasado);
  if (!proximo) throw new Error('La cartelera no tiene eventos próximos: carga los datos de demo de Boletería.');

  // Personal de seguridad con credencial (CU-007) para turnos, cambios (CU-008) y asistencia (CU-009).
  const empleados = [];
  for (const nombre of ['Laura Gómez', 'Andrés Rojas', 'Camila Díaz', 'Julián Pardo']) {
    const s = randomUUID().slice(0, 6).toUpperCase();
    const e = await llamar(organizador, 'POST', '/logistica/empleados', {
      usuarioId: randomUUID(), nombre: `${nombre} ${sufijo}`, rol: 'Seguridad', credencial: `HXC-${s}`,
      documento: `D${sufijo}${s}`, correo: `${s.toLowerCase()}.${sufijo.toLowerCase()}@demo.test`, telefono: '+57 300 000 0000',
    });
    empleados.push({ id: e.id, nombre: e.nombre, credencial: e.credencial });
  }

  const cuentaEmpleado = ENTORNO.cuentaEmpleado ?? (await cuentaNueva(`Valeria Torres ${sufijo}`));
  const salida: DatosDemo = { sufijo, recinto: { id: recinto.id, nombre: recinto.nombre, zonas }, evento: { id: evento.id, nombre: nombreEvento }, eventoCartelera: { id: proximo.id, nombre: proximo.nombre }, cuentaEmpleado, empleados };
  writeFileSync(ARCHIVO_DATOS, JSON.stringify(salida, null, 2));
  console.log(`Datos de demostración listos: ${nombreEvento} en ${recinto.nombre}.`);
}
