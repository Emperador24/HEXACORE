import 'reflect-metadata';
import fuenteDatos from '../data-source';
import { EstadoEvento, Evento } from '../entidades/evento.entity';
import { HistorialEvento } from '../entidades/historial-evento.entity';
import { Localidad } from '../entidades/localidad.entity';
import { Recinto } from '../entidades/recinto.entity';
import { ZonaRecinto } from '../entidades/zona-recinto.entity';
import { EVENTOS, LOCALIDADES_EVENTO } from '../../../entradas/catalogo/persistencia/semillas/datos-demo';

/** Cuenta `organizador@hexacore.com` de la semilla de Identidad. */
const ORGANIZADOR_DEMO = 'a0000012-0000-4000-8000-000000000012';

/** Un recinto por cada `lugar` de la cartelera de demostración, con su capacidad. */
const RECINTOS = [
  { id: 'f0000001-0000-4000-8000-000000000001', nombre: 'Movistar Arena', ciudad: 'Bogotá', direccion: 'Diagonal 61C # 26-36', capacidad: 14000,
    zonas: [{ id: 'f1000001-0000-4000-8000-000000000001', nombre: 'Pista', capacidad: 9000 }, { id: 'f1000001-0000-4000-8000-000000000002', nombre: 'Gradería', capacidad: 4600 }, { id: 'f1000001-0000-4000-8000-000000000003', nombre: 'Palcos', capacidad: 400 }] },
  { id: 'f0000002-0000-4000-8000-000000000002', nombre: 'Coliseo El Campín', ciudad: 'Bogotá', direccion: 'Carrera 30 # 57-60', capacidad: 36000, zonas: [] },
  { id: 'f0000003-0000-4000-8000-000000000003', nombre: 'Teatro Colón', ciudad: 'Bogotá', direccion: 'Calle 10 # 5-32', capacidad: 900, zonas: [] },
  { id: 'f0000004-0000-4000-8000-000000000004', nombre: 'Corferias', ciudad: 'Bogotá', direccion: 'Carrera 37 # 24-67', capacidad: 20000, zonas: [] },
  { id: 'f0000005-0000-4000-8000-000000000005', nombre: 'Teatro Metropolitano', ciudad: 'Medellín', direccion: 'Calle 41 # 57-30', capacidad: 1600, zonas: [] },
  { id: 'f0000006-0000-4000-8000-000000000006', nombre: 'Estadio Atanasio Girardot', ciudad: 'Medellín', direccion: 'Carrera 70 # 48-17', capacidad: 40000, zonas: [] },
  { id: 'f0000007-0000-4000-8000-000000000007', nombre: 'Plaza de Toros', ciudad: 'Cali', direccion: 'Carrera 56 # 2-00', capacidad: 14000, zonas: [] },
  { id: 'f0000008-0000-4000-8000-000000000008', nombre: 'Ágora', ciudad: 'Bogotá', direccion: 'Carrera 37 # 24-67', capacidad: 4000, zonas: [] },
  { id: 'f0000009-0000-4000-8000-000000000009', nombre: 'Teatro Pablo Tobón Uribe', ciudad: 'Medellín', direccion: 'Carrera 40 # 51-24', capacidad: 900, zonas: [] },
];

/**
 * Semilla de CU-026: recintos (precondición 2) y los eventos de la cartelera
 * de demostración como publicados, **con los mismos ids** que sus copias en
 * Boletería. Así el dueño y las copias coinciden desde el primer arranque.
 *
 * No borra nada y es idempotente: lo que ya existe se deja como está. No pasa
 * por la bandeja de salida: las copias de Boletería ya las siembran sus propias
 * semillas, y un mensaje aquí las duplicaría.
 */
async function sembrar(): Promise<void> {
  await fuenteDatos.initialize();
  try {
    const resultado = await fuenteDatos.transaction(async (m) => {
      for (const { zonas, ...recinto } of RECINTOS) {
        await m.upsert(Recinto, recinto, ['id']);
        for (const zona of zonas) await m.upsert(ZonaRecinto, { ...zona, recintoId: recinto.id }, ['id']);
      }
      let nuevos = 0;
      for (const demo of EVENTOS) {
        if (await m.existsBy(Evento, { id: demo.eventoId })) continue;
        const recinto = RECINTOS.find((r) => r.nombre === demo.lugar && r.ciudad === demo.ciudad)!;
        const evento = await m.save(m.create(Evento, {
          id: demo.eventoId,
          nombre: demo.nombre,
          descripcion: demo.descripcion,
          categoria: demo.categoria,
          artista: demo.artista,
          imagenUrl: demo.imagenUrl,
          recintoId: recinto.id,
          fechaInicio: demo.fechaInicio,
          fechaFin: demo.fechaFin ?? new Date(demo.fechaInicio.getTime() + 4 * 3_600_000),
          aforoMaximo: recinto.capacidad,
          estado: EstadoEvento.PUBLICADO,
          publicadoEn: new Date(),
          version: 1,
          creadoPor: ORGANIZADOR_DEMO,
        }));
        const localidades = LOCALIDADES_EVENTO.filter((l) => l.eventoId === demo.eventoId);
        await m.save(localidades.map((l) => m.create(Localidad, {
          id: l.localidadId, eventoId: evento.id, nombre: l.nombre, precio: l.precio, cantidad: l.aforo, orden: l.orden,
        })));
        await m.save(m.create(HistorialEvento, {
          eventoId: evento.id, version: 1, accion: 'IMPORTADO', estadoAnterior: null, estadoNuevo: EstadoEvento.PUBLICADO,
          realizadoPor: ORGANIZADOR_DEMO, cambios: { origen: 'semilla de demostración' }, instantanea: null,
        }));
        nuevos += 1;
      }
      return nuevos;
    });
    console.log(`Recintos: ${RECINTOS.length}. Eventos nuevos: ${resultado} de ${EVENTOS.length}.`);
  } finally {
    await fuenteDatos.destroy();
  }
}

void sembrar().catch((error) => {
  console.error('No se pudo sembrar:', error);
  process.exitCode = 1;
});
