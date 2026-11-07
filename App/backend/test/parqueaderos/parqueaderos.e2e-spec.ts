import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource as opcionesEventos } from '../../modulos/eventos-recintos/persistencia/data-source';
import { opcionesDataSource as opcionesParqueaderos } from '../../modulos/parqueaderos/persistencia/data-source';
import { NucleoPrueba } from '../logistica/nucleo-prueba';

/**
 * CU-024 · Cobro y CU-025 · Control de ocupación, contra el Núcleo compilado.
 * El evento se crea en curso directamente en la base (la API no deja crearlo
 * en el pasado); las horas de ingreso se adelantan en la base para medir el
 * cobro por horas sin esperar.
 */
describe('CU-024 y CU-025 · Parqueaderos (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let parqueaderos: DataSource;
  let administrador: { id: string; token: string };
  let organizador: { id: string; token: string };
  let personal: { id: string; token: string };
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const P = '/api/v1/parqueaderos';
  const placa = () => `T${randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;

  beforeAll(async () => {
    nucleo = new NucleoPrueba('parqueaderos');
    eventos = new DataSource(opcionesEventos());
    parqueaderos = new DataSource(opcionesParqueaderos());
    await eventos.initialize();
    await parqueaderos.initialize();
    await nucleo.iniciar();
    administrador = await nucleo.cuenta(['Administrador']);
    organizador = await nucleo.cuenta(['Organizador']);
    personal = await nucleo.cuenta();
  });
  afterAll(async () => {
    await nucleo?.cerrar();
    await eventos?.destroy();
    await parqueaderos?.destroy();
  });

  async function eventoEnCurso() {
    const recinto = randomUUID(), id = randomUUID();
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 5000]);
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3, now() - interval '1 hour', now() + interval '3 hours', 5000, 'PUBLICADO', $4, now())`,
      [id, `Parqueo ${id.slice(0, 8)}`, recinto, organizador.id]);
    return id;
  }

  async function zona(eventoId: string, nombre: string, capacidad: number, orden = 0) {
    return (await request(nucleo.url).post(`${P}/eventos/${eventoId}/zonas`).set('Authorization', como(organizador))
      .send({ nombre, capacidad, orden }).expect(201)).body as { id: string; nombre: string };
  }

  const entrar = (eventoId: string, datos: Record<string, unknown>, esperado = 201) =>
    request(nucleo.url).post(`${P}/eventos/${eventoId}/ingresos`).set('Authorization', como(personal)).send(datos).expect(esperado).then((r) => r.body);
  const salir = (eventoId: string, p: string, esperado = 201) =>
    request(nucleo.url).post(`${P}/eventos/${eventoId}/salidas`).set('Authorization', como(personal)).send({ placa: p }).expect(esperado).then((r) => r.body);
  const panel = (eventoId: string) =>
    request(nucleo.url).get(`${P}/eventos/${eventoId}/ocupacion`).set('Authorization', como(organizador)).expect(200).then((r) => r.body);

  // --- CU-024 ---------------------------------------------------------------

  it('CU-024: el Administrador fija la tarifa; la salida cobra las horas redondeadas hacia arriba', async () => {
    await request(nucleo.url).put(`${P}/tarifa`).set('Authorization', como(organizador)).send({ valorHora: 5000 }).expect(403);
    await request(nucleo.url).put(`${P}/tarifa`).set('Authorization', como(administrador)).send({ valorHora: 0 }).expect(400);
    const tarifa = (await request(nucleo.url).put(`${P}/tarifa`).set('Authorization', como(administrador))
      .send({ valorHora: 5000, motivo: 'Tarifa del evento' }).expect(200)).body;
    expect(tarifa.vigente).toMatchObject({ valorHora: 5000, definidaPor: administrador.id });
    // El personal la consulta al cobrar.
    expect((await request(nucleo.url).get(`${P}/tarifa`).set('Authorization', como(personal)).expect(200)).body.vigente.valorHora).toBe(5000);

    const evento = await eventoEnCurso();
    const z = await zona(evento, 'General', 50);
    const p = placa();
    const ingreso = await entrar(evento, { placa: `${p.slice(0, 3)}-${p.slice(3)}`, espacio: 'G-01' });
    expect(ingreso.estancia).toMatchObject({ placa: p, zonaId: z.id, espacio: 'G-01', prepagada: false, salidaEn: null });
    await entrar(evento, { placa: p }, 409);

    // 2 h 10 min de permanencia → 3 h × 5000.
    await parqueaderos.query(`UPDATE estancias SET ingreso_en = now() - interval '2 hours 10 minutes' WHERE id = $1`, [ingreso.estancia.id]);
    const salida = await salir(evento, p);
    expect(salida.estancia.salidaEn).toBeTruthy();
    expect(salida.cobro).toMatchObject({ prepagada: false, pendiente: false, horas: 3, valorHora: 5000, monto: 15000 });
    expect(salida.cobro.mensaje).toMatch(/^Cobrar \$15.000 \(3 h/);
    // Un reintento del dispositivo no cobra dos veces ni falla.
    const otraVez = await salir(evento, p);
    expect(otraVez).toMatchObject({ repetida: true, estancia: { id: ingreso.estancia.id }, cobro: { monto: 15000 } });
    await salir(evento, placa(), 404);

    // Menos de una hora cobra una.
    const corta = placa();
    await entrar(evento, { placa: corta });
    expect((await salir(evento, corta)).cobro).toMatchObject({ horas: 1, monto: 5000 });
  });

  it('CU-024A: una reserva prepagada no calcula cobro y solo indica que ya está pagada', async () => {
    const evento = await eventoEnCurso();
    await zona(evento, 'Reservas', 10);
    const p = placa();
    await entrar(evento, { placa: p, prepagada: true, reservaId: randomUUID() });
    const salida = await salir(evento, p);
    expect(salida.cobro).toEqual({ prepagada: true, pendiente: false, horas: null, valorHora: null, monto: null, mensaje: 'El servicio ya está pagado.' });
    expect(salida.estancia).toMatchObject({ prepagada: true, monto: null, horasCobradas: null });
  });

  // --- CU-025 ---------------------------------------------------------------

  it('CU-025: ocupación por zona, tendencia, alertas, bloqueo al llenarse (A) y redirección registrada', async () => {
    const evento = await eventoEnCurso();
    const a = await zona(evento, 'Zona A', 2, 1), b = await zona(evento, 'Zona B', 10, 2);
    // El personal no ve el panel, pero sí la zona recomendada.
    await request(nucleo.url).get(`${P}/eventos/${evento}/ocupacion`).set('Authorization', como(personal)).expect(403);
    expect((await request(nucleo.url).get(`${P}/eventos/${evento}/recomendacion`).set('Authorization', como(personal)).expect(200)).body)
      .toMatchObject({ motivo: 'MENOS_OCUPADA', zona: { id: a.id } });

    // CU-025A: A se llena y bloquea nuevos ingresos, proponiendo B.
    const enA = [placa(), placa()];
    for (const p of enA) await entrar(evento, { placa: p, zonaId: a.id });
    const llena = await entrar(evento, { placa: placa(), zonaId: a.id }, 409);
    expect(llena).toMatchObject({ codigo: 'ZONA_LLENA', alternativa: { id: b.id } });

    let p1 = await panel(evento);
    expect(p1.evento.enCurso).toBe(true);
    expect(p1.zonas.find((z: { id: string }) => z.id === a.id)).toMatchObject({ ocupados: 2, disponibles: 0, porcentaje: 100, estado: 'LLENA', tendencia: { ingresos: 2, salidas: 0 } });
    expect(p1.alertas).toEqual([expect.objectContaining({ tipo: 'ZONA_LLENA', severidad: 'critica', zonaId: a.id, sugerencia: expect.objectContaining({ zonaDestinoId: b.id }) })]);
    expect(p1.recomendacion).toMatchObject({ motivo: 'MENOS_OCUPADA', zona: { id: b.id } });

    // Sin zona, el ingreso va a la recomendada. B llega al 90 %: se aproxima al límite.
    for (let i = 0; i < 9; i++) expect((await entrar(evento, { placa: placa() })).estancia.zonaId).toBe(b.id);
    p1 = await panel(evento);
    expect(p1.total).toMatchObject({ capacidad: 12, ocupados: 11, disponibles: 1 });
    expect(p1.alertas.find((x: { zonaId: string }) => x.zonaId === b.id)).toMatchObject({ tipo: 'ZONA_CASI_LLENA', severidad: 'aviso' });
    // 9 ingresos en 15 min = 0,6/min con 1 libre → se llena en 2 min.
    expect(p1.zonas.find((z: { id: string }) => z.id === b.id).tendencia).toMatchObject({ ingresos: 9, netoPorMinuto: 0.6, minutosParaLlenarse: 2 });

    // Pasos 6-8: el supervisor redirige de B a una zona nueva C; la recomendación cambia.
    const c = await zona(evento, 'Zona C', 20, 3);
    await request(nucleo.url).post(`${P}/eventos/${evento}/redirecciones`).set('Authorization', como(organizador))
      .send({ zonaOrigenId: b.id, zonaDestinoId: a.id, motivo: 'x' }).expect(409);
    const redirigido = (await request(nucleo.url).post(`${P}/eventos/${evento}/redirecciones`).set('Authorization', como(organizador))
      .send({ zonaOrigenId: b.id, zonaDestinoId: c.id, motivo: 'B al 90 %' }).expect(201)).body;
    expect(redirigido.recomendacion).toMatchObject({ motivo: 'REDIRECCION', zona: { id: c.id } });
    const redireccion = redirigido.redirecciones[0];
    expect(redireccion).toMatchObject({ zonaOrigen: 'Zona B', zonaDestino: 'Zona C', vigente: true, realizadoPor: organizador.id });
    expect((await entrar(evento, { placa: placa() })).estancia.zonaId).toBe(c.id);

    // Paso 8: resultado de la decisión; al terminarla vuelve la recomendación automática.
    const cerrada = (await request(nucleo.url).patch(`${P}/eventos/${evento}/redirecciones/${redireccion.id}`).set('Authorization', como(organizador))
      .send({ resultado: 'B dejó de recibir vehículos', terminar: true }).expect(200)).body;
    expect(cerrada.redirecciones[0]).toMatchObject({ vigente: false, resultado: 'B dejó de recibir vehículos', ingresosAlDestino: 1 });
    expect(cerrada.recomendacion.motivo).toBe('MENOS_OCUPADA');
    await request(nucleo.url).patch(`${P}/eventos/${evento}/redirecciones/${randomUUID()}`).set('Authorization', como(organizador))
      .send({ resultado: 'x' }).expect(404);

    // Al salir un vehículo de A vuelve a admitir ingresos.
    await salir(evento, enA[0]);
    await entrar(evento, { placa: placa(), zonaId: a.id });

    // La capacidad no baja de lo que hay dentro, y una zona con historial no se borra.
    await request(nucleo.url).patch(`${P}/eventos/${evento}/zonas/${a.id}`).set('Authorization', como(organizador)).send({ capacidad: 1 }).expect(409);
    await request(nucleo.url).delete(`${P}/eventos/${evento}/zonas/${a.id}`).set('Authorization', como(organizador)).expect(409);
    await request(nucleo.url).post(`${P}/eventos/${evento}/zonas`).set('Authorization', como(organizador)).send({ nombre: 'zona a', capacidad: 5 }).expect(409);

    // El panel del evento (CU-019) muestra ya el parqueadero.
    const monitoreo = (await request(nucleo.url).get(`/api/v1/monitoreo/eventos/${evento}/panel`).set('Authorization', como(organizador)).expect(200)).body;
    expect(monitoreo.parqueaderos).toMatchObject({ disponible: true, capacidad: 32, ocupados: 12 });
  });
});
