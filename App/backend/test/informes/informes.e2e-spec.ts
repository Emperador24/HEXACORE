import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource as opcionesEventos } from '../../modulos/eventos-recintos/persistencia/data-source';
import { opcionesDataSource as opcionesParqueaderos } from '../../modulos/parqueaderos/persistencia/data-source';
import { NucleoPrueba } from '../logistica/nucleo-prueba';

/**
 * CU-032 · Gestión de Reportes y Analítica del Evento, contra el Núcleo
 * compilado. Informes no tiene esquema propio: agrega, por interfaz local,
 * lo que Eventos, Parqueaderos (ocupación), Personal/Logística (asistencia)
 * y Operación (incidentes, CU-020) ya calculan en sus propios esquemas
 * reales. Ventas/Ingresos por evento viven en Boletería, un programa
 * separado sin interfaz todavía para esto: se reportan con CU-032A.
 */
describe('CU-032 · Gestión de Reportes y Analítica del Evento (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let parqueaderos: DataSource;
  let organizador: { id: string; token: string };
  let administrador: { id: string; token: string };
  let personal: { id: string; token: string };
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const I = '/api/v1/informes';

  beforeAll(async () => {
    nucleo = new NucleoPrueba('informes');
    eventos = new DataSource(opcionesEventos());
    parqueaderos = new DataSource(opcionesParqueaderos());
    await eventos.initialize();
    await parqueaderos.initialize();
    await nucleo.iniciar();
    organizador = await nucleo.cuenta(['Organizador']);
    administrador = await nucleo.cuenta(['Administrador']);
    personal = await nucleo.cuenta();
  });
  afterAll(async () => {
    await nucleo?.cerrar();
    await eventos?.destroy();
    await parqueaderos?.destroy();
  });

  /** Evento publicado, en curso ahora mismo (mismo patrón que CU-020). */
  async function eventoEnCurso(nombre = 'Evento'): Promise<string> {
    const recinto = randomUUID(), evento = randomUUID();
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 400]);
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3, now() - interval '1 hour', now() + interval '3 hours', 400, 'PUBLICADO', $4, now())`,
      [evento, `${nombre} ${evento.slice(0, 8)}`, recinto, organizador.id],
    );
    return evento;
  }

  const dashboard = (eventoId: string, qs = '', actor = administrador) =>
    request(nucleo.url).get(`${I}/${eventoId}${qs}`).set('Authorization', como(actor));

  it('precondición 1: ni Cliente ni Personal (sin Organizador/Administrador) consultan reportes', async () => {
    const evento = await eventoEnCurso();
    await dashboard(evento, '', personal).expect(403);
  });

  it('rechaza un evento que no existe', async () => {
    await dashboard(randomUUID()).expect(404);
  });

  it('rechaza un rango donde «hasta» no es posterior a «desde»', async () => {
    const evento = await eventoEnCurso();
    const ahora = new Date().toISOString();
    const res = await dashboard(evento, `?desde=${ahora}&hasta=${ahora}`).expect(400);
    expect(res.body.codigo).toBe('RANGO_INVALIDO');
  });

  it('CU-032A: sin datos todavía, cada categoría explica su estado vacío en vez de un cero engañoso', async () => {
    const evento = await eventoEnCurso();
    const res = await dashboard(evento, '', organizador).expect(200);
    expect(res.body.evento.id).toBe(evento);

    const porCategoria = Object.fromEntries(res.body.categorias.map((c: { categoria: string }) => [c.categoria, c]));
    for (const categoria of ['VENTAS', 'INGRESOS', 'OCUPACION', 'PERSONAL', 'INCIDENTES']) {
      expect(porCategoria[categoria]).toMatchObject({ sinDatos: true });
      expect(porCategoria[categoria].mensaje).toBeTruthy();
    }
  });

  it('con datos reales de ocupación, personal e incidentes, el dashboard los refleja (y ventas/ingresos siguen pendientes)', async () => {
    const evento = await eventoEnCurso();

    // Ocupación (Parqueaderos, CU-025): una zona con un vehículo adentro.
    const zona = randomUUID();
    await parqueaderos.query(`INSERT INTO zonas_parqueadero (id, evento_id, nombre, prefijo, capacidad, creada_por) VALUES ($1,$2,'Zona Norte','N',10,$3)`, [zona, evento, organizador.id]);
    await parqueaderos.query(`INSERT INTO estancias (evento_id, zona_id, placa, ingreso_por) VALUES ($1,$2,'ABC123',$3)`, [evento, zona, organizador.id]);

    // Personal (Personal/Logística, CU-009): un empleado con un turno ya completado.
    const [emp] = await nucleo.datos.query(`INSERT INTO empleados ("usuarioId",nombre,rol,credencial) VALUES ($1,'Empleado Prueba','Logística',$2) RETURNING id`, [randomUUID(), `c-${randomUUID()}`]);
    const [turno] = await nucleo.datos.query(
      `INSERT INTO turnos ("empleadoId","eventoId",zona,"horaInicio","horaFin") VALUES ($1,$2,'Zona Norte', now() - interval '3 hours', now() - interval '1 hour') RETURNING id`,
      [emp.id, evento],
    );
    await nucleo.datos.query(`INSERT INTO registros_asistencia ("empleadoId","turnoId",tipo,"credencialUsada","timestamp","sincronizadoEn") VALUES ($1,$2,'ENTRADA','c', now() - interval '3 hours', now())`, [emp.id, turno.id]);
    await nucleo.datos.query(`INSERT INTO registros_asistencia ("empleadoId","turnoId",tipo,"credencialUsada","timestamp","sincronizadoEn") VALUES ($1,$2,'SALIDA','c', now() - interval '1 hour', now())`, [emp.id, turno.id]);

    // Incidentes (Operación, CU-020): uno real, vía su propia API.
    await request(nucleo.url).post(`/api/v1/incidentes/eventos/${evento}/incidentes`).set('Authorization', como(organizador))
      .send({ tipo: 'Objeto perdido', ubicacion: 'Entrada principal', descripcion: 'Una mochila sin dueño' }).expect(201);

    const res = await dashboard(evento, '', administrador).expect(200);
    const porCategoria = Object.fromEntries(res.body.categorias.map((c: { categoria: string }) => [c.categoria, c]));

    expect(porCategoria.VENTAS).toMatchObject({ sinDatos: true });
    expect(porCategoria.INGRESOS).toMatchObject({ sinDatos: true });
    expect(porCategoria.OCUPACION).toMatchObject({ sinDatos: false });
    expect(porCategoria.OCUPACION.datos).toMatchObject({ capacidad: 10, ocupados: 1 });
    expect(porCategoria.PERSONAL).toMatchObject({ sinDatos: false });
    expect(porCategoria.PERSONAL.datos.totales).toMatchObject({ empleados: 1 });
    expect(porCategoria.INCIDENTES).toMatchObject({ sinDatos: false });
    expect(porCategoria.INCIDENTES.datos).toMatchObject({ total: 1, abiertos: 1, cerrados: 0 });
  });

  it('CU-032B: el comparativo consolida las métricas de varios eventos', async () => {
    const a = await eventoEnCurso('A'), b = await eventoEnCurso('B');
    const res = await request(nucleo.url).get(`${I}/comparativo?eventos=${a},${b}`).set('Authorization', como(administrador)).expect(200);
    expect(res.body.eventos).toHaveLength(2);
    expect(res.body.eventos.map((e: { evento: { id: string } }) => e.evento.id).sort()).toEqual([a, b].sort());
  });

  it('rechaza el comparativo con menos de dos eventos distintos', async () => {
    const a = await eventoEnCurso();
    const res = await request(nucleo.url).get(`${I}/comparativo?eventos=${a},${a}`).set('Authorization', como(administrador)).expect(400);
    expect(res.body.codigo).toBe('COMPARATIVO_INSUFICIENTE');
  });

  it('exporta el informe en CSV, una fila por categoría', async () => {
    const evento = await eventoEnCurso();
    const res = await request(nucleo.url).get(`${I}/${evento}/exportar`).set('Authorization', como(administrador)).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain(`informe-${evento}.csv`);
    const lineas = res.text.trim().split('\n');
    expect(lineas[0]).toBe('categoria,sinDatos,resumen');
    expect(lineas).toHaveLength(6); // cabecera + 5 categorías
  });

  it('exporta el informe en JSON cuando se pide explícitamente', async () => {
    const evento = await eventoEnCurso();
    const res = await request(nucleo.url).get(`${I}/${evento}/exportar?formato=json`).set('Authorization', como(administrador)).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const cuerpo = JSON.parse(res.text);
    expect(cuerpo.evento.id).toBe(evento);
    expect(cuerpo.categorias).toHaveLength(5);
  });
});
