import Redis from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource as opcionesEventos } from '../../modulos/eventos-recintos/persistencia/data-source';
import { opcionesDataSource as opcionesParqueaderos } from '../../modulos/parqueaderos/persistencia/data-source';
import { NucleoPrueba } from '../logistica/nucleo-prueba';

/**
 * CU-021 a CU-025 · Parqueaderos, contra el Núcleo compilado, con PostgreSQL,
 * Redis, RabbitMQ y la pasarela de pagos simulada reales. El evento se crea en
 * curso directamente en la base (la API no deja crearlo en el pasado); las
 * horas de ingreso y los vencimientos se adelantan en la base para no esperar.
 */
describe('CU-021 a CU-025 · Parqueaderos (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let parqueaderos: DataSource;
  let administrador: { id: string; token: string };
  let organizador: { id: string; token: string };
  let personal: { id: string; token: string };
  let cliente: { id: string; token: string };
  let otroCliente: { id: string; token: string };
  let redis: Redis;
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
    cliente = await nucleo.cuenta(['Cliente']);
    otroCliente = await nucleo.cuenta(['Cliente']);
    redis = new Redis({ host: '127.0.0.1', port: 16384, lazyConnect: true, retryStrategy: () => null });
    await redis.connect();
  });
  afterAll(async () => {
    redis?.disconnect();
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
  const espacios = (eventoId: string, zonaId?: string) =>
    request(nucleo.url).get(`${P}/eventos/${eventoId}/espacios${zonaId ? `?zonaId=${zonaId}` : ''}`).set('Authorization', como(personal)).expect(200)
      .then((r) => r.body as { id: string; codigo: string; tipo: string; estado: string; placa: string | null; zonaId: string }[]);
  const reservar = (eventoId: string, datos: Record<string, unknown>, quien = cliente, esperado = 201) =>
    request(nucleo.url).post(`${P}/eventos/${eventoId}/reservas`).set('Authorization', como(quien)).send(datos).expect(esperado).then((r) => r.body);
  const pagar = (reservaId: string, token: string, quien = cliente, esperado = 201) =>
    request(nucleo.url).post(`${P}/reservas/${reservaId}/pagar`).set('Authorization', como(quien)).send({ token }).expect(esperado).then((r) => r.body);
  const fijarTarifa = (valorHora: number) =>
    request(nucleo.url).put(`${P}/tarifa`).set('Authorization', como(administrador)).send({ valorHora }).expect(200);
  async function esperarHasta<T>(leer: () => Promise<T>, listo: (v: T) => boolean, ms = 10000): Promise<T> {
    const fin = Date.now() + ms;
    for (;;) {
      const valor = await leer();
      if (listo(valor) || Date.now() > fin) return valor;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // --- CU-024 ---------------------------------------------------------------

  it('Seguridad SSE: la revocación real cierra el flujo abierto y no entrega más paneles', async () => {
    const e = await eventoEnCurso(), propia = await nucleo.cuenta(['Organizador']);
    const abortar = new AbortController(), plazo = setTimeout(() => abortar.abort(), 10000);
    let lector: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const respuesta = await fetch(`${nucleo.url}${P}/eventos/${e}/ocupacion/flujo`, { headers: { Authorization: como(propia) }, signal: abortar.signal });
      expect(respuesta.status).toBe(200); lector = respuesta.body!.getReader();
      const decoder = new TextDecoder(); let buffer = '';
      async function siguiente(): Promise<{ tipo: string; datos: { codigo?: string; evento?: { id: string } } } | null> {
        for (;;) {
          const i = buffer.indexOf('\n\n');
          if (i >= 0) {
            const frame = buffer.slice(0, i); buffer = buffer.slice(i + 2);
            const tipo = /^event: (.+)$/m.exec(frame)?.[1], datos = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
            if (tipo && datos) return { tipo, datos: JSON.parse(datos) }; continue;
          }
          const r = await lector!.read(); if (r.done) return null;
          buffer += decoder.decode(r.value, { stream: true }).replaceAll('\r\n', '\n');
        }
      }
      expect(await siguiente()).toMatchObject({ tipo: 'ocupacion', datos: { evento: { id: e } } });
      await request(nucleo.url).delete('/api/v1/sesiones/actual').set('Authorization', como(propia)).expect(200);
      expect(await siguiente()).toMatchObject({ tipo: 'sesion_finalizada', datos: { codigo: 'SIN_AUTENTICAR' } });
      expect(await siguiente()).toBeNull();
      await request(nucleo.url).get(`${P}/eventos/${e}/ocupacion/flujo`).set('Authorization', como(propia)).expect(401);
    } finally { clearTimeout(plazo); abortar.abort(); await lector?.cancel().catch(() => undefined); lector?.releaseLock(); }
  });

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
    const ingreso = await entrar(evento, { placa: `${p.slice(0, 3)}-${p.slice(3)}`, zonaId: z.id, espacio: 'G-01' });
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
    await fijarTarifa(5000);
    const evento = await eventoEnCurso();
    const z = await zona(evento, 'Reservas', 10);
    const p = placa();
    // Quien registra el ingreso no puede declararla prepagada: lo decide la reserva pagada.
    await entrar(evento, { placa: placa(), prepagada: true }, 400);
    const reserva = await reservar(evento, { zonaId: z.id, placa: p });
    await pagar(reserva.id, 'tok_ok_e2e');
    await entrar(evento, { placa: p });
    const salida = await salir(evento, p);
    expect(salida.cobro).toEqual({ prepagada: true, pendiente: false, horas: null, valorHora: null, monto: null, mensaje: 'El servicio ya está pagado.' });
    expect(salida.estancia).toMatchObject({ prepagada: true, monto: null, horasCobradas: null, reservaId: reserva.id });
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

  // --- CU-023 ---------------------------------------------------------------

  it('CU-023: espacios numerados por zona, reglas por tipo y prioridad, reasignación (B), alternativa (A) y sin carreras', async () => {
    const evento = await eventoEnCurso();
    const norte = await zona(evento, 'Zona Norte', 4, 1);
    expect(norte).toMatchObject({ prefijo: 'N', capacidad: 4, disponibles: 4 });
    let mapa = await espacios(evento, norte.id);
    expect(mapa.map((e) => e.codigo)).toEqual(['N-01', 'N-02', 'N-03', 'N-04']);
    expect(mapa.every((e) => e.estado === 'LIBRE' && e.tipo === 'AUTOMOVIL')).toBe(true);

    // El organizador marca un espacio de movilidad reducida y uno de moto; el personal no puede.
    const [n1, n2] = mapa;
    await request(nucleo.url).patch(`${P}/eventos/${evento}/espacios/${n1.id}`).set('Authorization', como(personal)).send({ tipo: 'DISCAPACIDAD' }).expect(403);
    await request(nucleo.url).patch(`${P}/eventos/${evento}/espacios/${n1.id}`).set('Authorization', como(organizador)).send({ tipo: 'DISCAPACIDAD' }).expect(200);
    await request(nucleo.url).patch(`${P}/eventos/${evento}/espacios/${n2.id}`).set('Authorization', como(organizador)).send({ tipo: 'MOTO' }).expect(200);

    // Pasos 2-4: cada vehículo al primer espacio de su tipo, el más cercano a la entrada.
    expect((await entrar(evento, { placa: placa(), zonaId: norte.id })).asignacion).toMatchObject({ espacio: 'N-03', zona: 'Zona Norte', reasignado: false, conReserva: false });
    expect((await entrar(evento, { placa: placa(), zonaId: norte.id, tipoVehiculo: 'MOTO' })).estancia).toMatchObject({ espacio: 'N-02', tipoVehiculo: 'MOTO' });
    expect((await entrar(evento, { placa: placa(), zonaId: norte.id, tipoVehiculo: 'DISCAPACIDAD' })).estancia.espacio).toBe('N-01');
    expect((await entrar(evento, { placa: placa(), zonaId: norte.id })).estancia.espacio).toBe('N-04');
    // Un espacio con vehículo no cambia de tipo.
    await request(nucleo.url).patch(`${P}/eventos/${evento}/espacios/${n1.id}`).set('Authorization', como(organizador)).send({ tipo: 'AUTOMOVIL' }).expect(409);

    // CU-023A: la zona pedida está llena; se sugiere otra con espacio para ese tipo.
    const llena = await entrar(evento, { placa: placa(), zonaId: norte.id }, 409);
    expect(llena).toMatchObject({ codigo: 'ZONA_LLENA', alternativa: null });
    const sur = await zona(evento, 'Zona Sur', 3, 2);
    expect((await entrar(evento, { placa: placa(), zonaId: norte.id }, 409)).alternativa).toMatchObject({ id: sur.id, nombre: 'Zona Sur', disponibles: 3 });

    // CU-023B: el operador pide un espacio ya tomado y el sistema reasigna.
    const primero = await entrar(evento, { placa: placa(), zonaId: sur.id, espacio: 's-01' });
    expect(primero.estancia.espacio).toBe('S-01');
    const segundo = await entrar(evento, { placa: placa(), zonaId: sur.id, espacio: 'S-01' });
    expect(segundo.asignacion).toMatchObject({ espacio: 'S-02', reasignado: true, detalle: 'El espacio S-01 ya estaba tomado: se asignó S-02.' });
    await entrar(evento, { placa: placa(), zonaId: sur.id, espacio: 'S-99' }, 404);
    await entrar(evento, { placa: placa(), espacio: 'S-03' }, 400);

    // Paso 8: historial de la zona.
    const historial = (await request(nucleo.url).get(`${P}/eventos/${evento}/asignaciones`).set('Authorization', como(organizador)).expect(200)).body;
    expect(historial).toHaveLength(6);
    expect(historial[0]).toMatchObject({ origen: 'REASIGNACION', espacio: 'S-02', zona: 'Zona Sur' });

    // La capacidad son los espacios activos: al subirla se numeran, al bajarla se retiran los libres.
    expect((await request(nucleo.url).patch(`${P}/eventos/${evento}/zonas/${sur.id}`).set('Authorization', como(organizador)).send({ capacidad: 5 }).expect(200)).body)
      .toMatchObject({ capacidad: 5, ocupados: 2, disponibles: 3 });
    mapa = await espacios(evento, sur.id);
    expect(mapa.filter((e) => e.estado !== 'INACTIVO').map((e) => e.codigo)).toEqual(['S-01', 'S-02', 'S-03', 'S-04', 'S-05']);
    await request(nucleo.url).patch(`${P}/eventos/${evento}/zonas/${sur.id}`).set('Authorization', como(organizador)).send({ capacidad: 1 }).expect(409);
    await request(nucleo.url).patch(`${P}/eventos/${evento}/zonas/${sur.id}`).set('Authorization', como(organizador)).send({ capacidad: 2 }).expect(200);
    expect((await espacios(evento, sur.id)).filter((e) => e.estado === 'INACTIVO').map((e) => e.codigo)).toEqual(['S-03', 'S-04', 'S-05']);

    // Paso 5: veinte ingresos simultáneos a una zona de cinco ocupan cinco espacios distintos.
    const carrera = await zona(evento, 'Zona Carrera', 5, 3);
    const respuestas = await Promise.all(Array.from({ length: 20 }, () =>
      request(nucleo.url).post(`${P}/eventos/${evento}/ingresos`).set('Authorization', como(personal)).send({ placa: placa(), zonaId: carrera.id })));
    const aceptados = respuestas.filter((r) => r.status === 201);
    expect(aceptados).toHaveLength(5);
    expect(respuestas.filter((r) => r.status === 409).every((r) => r.body.codigo === 'ZONA_LLENA')).toBe(true);
    expect(new Set(aceptados.map((r) => r.body.estancia.espacio)).size).toBe(5);
  });

  // --- CU-021 ---------------------------------------------------------------

  it('CU-021: disponibilidad, bloqueo temporal en Redis, rechazo (B), pago, QR y confirmación por la cola', async () => {
    await fijarTarifa(5000);
    const evento = await eventoEnCurso();
    const vip = await zona(evento, 'Zona VIP', 2, 1);
    const general = await zona(evento, 'Zona General', 10, 2);

    // Pasos 1-2: zonas, espacios libres por tipo y precio (3 h hasta el final del evento × 5000).
    const disponibilidad = (await request(nucleo.url).get(`${P}/eventos/${evento}/disponibilidad`).set('Authorization', como(cliente)).expect(200)).body;
    expect(disponibilidad).toMatchObject({ reservable: true, tarifa: { valorHora: 5000 }, horas: 3, precio: 15000, minutosParaPagar: 10 });
    expect(disponibilidad.zonas).toEqual([
      expect.objectContaining({ id: vip.id, disponibles: { AUTOMOVIL: 2, MOTO: 2, DISCAPACIDAD: 2 } }),
      expect.objectContaining({ id: general.id, disponibles: { AUTOMOVIL: 10, MOTO: 10, DISCAPACIDAD: 10 } }),
    ]);
    // El cliente no administra el parqueadero, y el personal no reserva.
    await request(nucleo.url).get(`${P}/eventos/${evento}/ocupacion`).set('Authorization', como(cliente)).expect(403);
    await reservar(evento, { zonaId: vip.id, placa: placa() }, personal as typeof cliente, 403);
    await reservar(evento, { zonaId: vip.id, placa: placa(), llegada: new Date(Date.now() + 5 * 3_600_000).toISOString() }, cliente, 400);

    // Pasos 3-4: el espacio queda retenido mientras se paga, en la base y en Redis.
    const p = placa();
    const reserva = await reservar(evento, { zonaId: vip.id, placa: `${p.slice(0, 3)}-${p.slice(3)}` });
    expect(reserva).toMatchObject({ estado: 'PENDIENTE_PAGO', zona: 'Zona VIP', espacio: 'V-01', placa: p, monto: 15000, horas: 3, codigoQr: null });
    expect(reserva.segundosParaPagar).toBeGreaterThan(590);
    expect(await redis.get(`parqueaderos:bloqueo:${reserva.espacioId}`)).toBe(reserva.id);
    expect(await redis.pttl(`parqueaderos:bloqueo:${reserva.espacioId}`)).toBeGreaterThan(590_000);
    expect((await espacios(evento, vip.id))[0]).toMatchObject({ codigo: 'V-01', estado: 'RESERVADO', placa: p });
    expect((await panel(evento)).zonas.find((z: { id: string }) => z.id === vip.id)).toMatchObject({ ocupados: 0, reservados: 1, disponibles: 1, porcentaje: 50 });
    // Consistencia: la misma placa no reserva dos veces.
    expect(await reservar(evento, { zonaId: general.id, placa: p }, cliente, 409)).toMatchObject({ codigo: 'PLACA_CON_RESERVA' });

    // CU-021B: rechazo; la reserva sigue viva para reintentar con otro medio.
    expect(await pagar(reserva.id, 'tok_rechazo_e2e', cliente, 409)).toMatchObject({ codigo: 'CU-021B' });
    // Otro cliente no la ve ni la paga.
    await request(nucleo.url).get(`${P}/reservas/${reserva.id}`).set('Authorization', como(otroCliente)).expect(404);
    await pagar(reserva.id, 'tok_ok_e2e', otroCliente, 404);

    // Pasos 5-8: pagada, con QR; el bloqueo temporal se suelta y el espacio sigue reservado para el vehículo.
    const pagada = await pagar(reserva.id, 'tok_ok_e2e');
    expect(pagada).toMatchObject({ estado: 'CONFIRMADA', segundosParaPagar: null, evento: { id: evento } });
    expect(pagada.codigoQr).toMatch(/^HXP-[A-Z0-9]{16}$/);
    expect(pagada.referenciaPago).toMatch(/^pas_/);
    expect(await redis.exists(`parqueaderos:bloqueo:${reserva.espacioId}`)).toBe(0);
    expect((await espacios(evento, vip.id))[0].estado).toBe('RESERVADO');
    // Reintentar el pago ya confirmado no cobra otra vez.
    expect((await pagar(reserva.id, 'tok_ok_e2e')).referenciaPago).toBe(pagada.referenciaPago);
    const [{ cobros }] = await parqueaderos.query(
      `SELECT count(*)::int AS cobros FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia LIKE $1 AND resultado = 'APROBADO'`, [`parqueadero-${reserva.id}-%`]);
    expect(cobros).toBe(1);

    // Paso 9: la confirmación con el QR sale por la cola y se entrega.
    const aviso = await esperarHasta(
      async () => (await parqueaderos.query(`SELECT mensaje, entregada_en FROM notificaciones_reserva WHERE reserva_id = $1`, [reserva.id]))[0],
      (a) => !!a?.entregada_en);
    expect(aviso.entregada_en).toBeTruthy();
    expect(aviso.mensaje).toContain(pagada.codigoQr);

    // El cliente ve sus reservas.
    const mias = (await request(nucleo.url).get(`${P}/reservas`).set('Authorization', como(cliente)).expect(200)).body;
    expect(mias[0]).toMatchObject({ id: reserva.id, estado: 'CONFIRMADA', codigoQr: pagada.codigoQr });
    expect((await request(nucleo.url).get(`${P}/reservas`).set('Authorization', como(otroCliente)).expect(200)).body
      .some((r: { id: string }) => r.id === reserva.id)).toBe(false);
    expect((await request(nucleo.url).get(`${P}/eventos/${evento}/reservas`).set('Authorization', como(organizador)).expect(200)).body[0])
      .toMatchObject({ id: reserva.id, estado: 'CONFIRMADA' });
  });

  it('CU-021A y C: sin disponibilidad sugiere otras zonas; la reserva vencida libera el espacio; sin doble reserva concurrente', async () => {
    await fijarTarifa(5000);
    const evento = await eventoEnCurso();
    const unica = await zona(evento, 'Zona Única', 1, 1);
    const otra = await zona(evento, 'Zona Otra', 3, 2);

    // Diez clientes a la vez por el último espacio: solo uno lo obtiene.
    const respuestas = await Promise.all(Array.from({ length: 10 }, () =>
      request(nucleo.url).post(`${P}/eventos/${evento}/reservas`).set('Authorization', como(cliente)).send({ zonaId: unica.id, placa: placa() })));
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    const sinEspacio = respuestas.filter((r) => r.status === 409);
    expect(sinEspacio).toHaveLength(9);
    // CU-021A: las zonas alternativas.
    expect(sinEspacio[0].body).toMatchObject({ codigo: 'CU-021A', alternativas: [{ id: otra.id, nombre: 'Zona Otra', disponibles: 3 }] });
    const ganadora = respuestas.find((r) => r.status === 201)!.body;

    // CU-021C: vence sin pagar; pagar tarde no cobra y el espacio vuelve a estar libre.
    await parqueaderos.query(`UPDATE reservas SET expira_en = now() - interval '1 second' WHERE id = $1`, [ganadora.id]);
    expect(await pagar(ganadora.id, 'tok_ok_e2e', cliente, 409)).toMatchObject({ codigo: 'CU-021C' });
    expect((await request(nucleo.url).get(`${P}/reservas/${ganadora.id}`).set('Authorization', como(cliente)).expect(200)).body)
      .toMatchObject({ estado: 'EXPIRADA', codigoQr: null });
    expect((await espacios(evento, unica.id))[0].estado).toBe('LIBRE');
    expect(await redis.exists(`parqueaderos:bloqueo:${ganadora.espacioId}`)).toBe(0);

    // El barrido también libera las vencidas sin que nadie intente pagarlas.
    const otraReserva = await reservar(evento, { zonaId: unica.id, placa: placa() });
    await parqueaderos.query(`UPDATE reservas SET expira_en = now() - interval '1 second' WHERE id = $1`, [otraReserva.id]);
    await request(nucleo.url).get(`${P}/eventos/${evento}/disponibilidad`).set('Authorization', como(cliente)).expect(200);
    const [{ estado }] = await parqueaderos.query(`SELECT estado FROM reservas WHERE id = $1`, [otraReserva.id]);
    expect(estado).toBe('EXPIRADA');
    const liberaciones = (await request(nucleo.url).get(`${P}/eventos/${evento}/asignaciones`).set('Authorization', como(organizador)).expect(200)).body
      .filter((a: { origen: string }) => a.origen === 'LIBERACION');
    expect(liberaciones.map((a: { detalle: string }) => a.detalle)).toEqual(['Reserva vencida sin pagar', 'Reserva vencida sin pagar']);
  });

  // --- CU-022 ---------------------------------------------------------------

  it('CU-022: ingreso por QR o placa, QR inválido (B), sin reserva (A), lote lleno (C) y salida que libera el espacio', async () => {
    await fijarTarifa(5000);
    const evento = await eventoEnCurso();
    const z = await zona(evento, 'Zona Puerta', 3, 1);
    const p = placa();
    const reserva = await reservar(evento, { zonaId: z.id, placa: p });
    const { codigoQr } = await pagar(reserva.id, 'tok_ok_e2e');

    // CU-022B: un QR con forma válida pero que no es de una reserva pagada de este evento.
    expect(await entrar(evento, { codigoQr: 'HXP-AAAAAAAAAAAAAAAA' }, 422)).toMatchObject({ codigo: 'QR_INVALIDO' });
    await entrar(evento, { codigoQr: 'no-es-un-qr' }, 400);
    await entrar(evento, {}, 400);
    const otroEvento = await eventoEnCurso();
    await zona(otroEvento, 'Zona X', 2);
    expect(await entrar(otroEvento, { codigoQr }, 422)).toMatchObject({ codigo: 'QR_INVALIDO' });
    expect(await entrar(evento, { codigoQr, placa: placa() }, 409)).toMatchObject({ codigo: 'PLACA_NO_COINCIDE' });

    // Pasos 1-4: el QR lleva al vehículo a su espacio reservado.
    const ingreso = await entrar(evento, { codigoQr: codigoQr.toLowerCase() });
    expect(ingreso.estancia).toMatchObject({ placa: p, espacio: reserva.espacio, prepagada: true, reservaId: reserva.id });
    expect(ingreso.asignacion).toMatchObject({ conReserva: true, espacio: reserva.espacio });
    expect(await entrar(evento, { codigoQr }, 409)).toMatchObject({ codigo: 'RESERVA_YA_USADA' });
    expect((await request(nucleo.url).get(`${P}/reservas/${reserva.id}`).set('Authorization', como(cliente)).expect(200)).body.estado).toBe('USADA');

    // CU-022A: sin reserva entra si hay cupo; CU-022C: lleno, se niega.
    await entrar(evento, { placa: placa() });
    await entrar(evento, { placa: placa() });
    expect(await entrar(evento, { placa: placa() }, 409)).toMatchObject({ codigo: 'PARQUEADERO_LLENO' });
    expect((await panel(evento)).total).toMatchObject({ capacidad: 3, ocupados: 3, reservados: 0, disponibles: 0 });

    // Pasos 5-9: salida por QR, permanencia, sin cobro (prepagada) y el espacio queda libre.
    await parqueaderos.query(`UPDATE estancias SET ingreso_en = now() - interval '95 minutes' WHERE id = $1`, [ingreso.estancia.id]);
    await request(nucleo.url).post(`${P}/eventos/${evento}/salidas`).set('Authorization', como(personal)).send({}).expect(400);
    const porQr = (await request(nucleo.url).post(`${P}/eventos/${evento}/salidas`).set('Authorization', como(personal)).send({ codigoQr }).expect(201)).body;
    expect(porQr).toMatchObject({ repetida: false, permanenciaMinutos: 95, cobro: { prepagada: true }, estancia: { placa: p } });
    expect((await espacios(evento, z.id)).find((e) => e.codigo === reserva.espacio)).toMatchObject({ estado: 'LIBRE', placa: null });
    expect((await panel(evento)).total).toMatchObject({ ocupados: 2, disponibles: 1 });
  });

  it('Seguridad: los IDs offline de ingreso/salida no se pueden reenviar en otro evento', async () => {
    const a = await eventoEnCurso(), b = await eventoEnCurso();
    const za = await zona(a, 'Offline A', 3), zb = await zona(b, 'Offline B', 3);
    const pa = placa(), pb = placa();
    const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const lote = [
      { id: randomUUID(), tipo: 'INGRESO', placa: pa, zonaId: za.id, ocurridoEn: hace(2) },
      { id: randomUUID(), tipo: 'SALIDA', placa: pa, ocurridoEn: hace(1) },
    ];
    const sincronizar = (e: string, registros: unknown[]) => request(nucleo.url).post(`${P}/eventos/${e}/sincronizacion`)
      .set('Authorization', como(personal)).send({ registros }).expect(201).then(r => r.body);
    expect(await sincronizar(a, lote)).toMatchObject({ aplicados: 2, repetidos: 0, rechazados: 0 });
    await entrar(b, { placa: pb, zonaId: zb.id });
    const leer = () => parqueaderos.query('SELECT * FROM estancias WHERE evento_id = ANY($1) ORDER BY id', [[a, b]]);
    const antes = await leer();
    const rechazo = await sincronizar(b, lote.map(r => ({ ...r, placa: pb, ...(r.tipo === 'INGRESO' ? { zonaId: zb.id } : {}) })));
    expect(rechazo).toMatchObject({ aplicados: 0, repetidos: 0, rechazados: 2 });
    expect(rechazo.resultados).toEqual(lote.map(r => expect.objectContaining({ id: r.id, resultado: 'RECHAZADO', codigo: 'REGISTRO_LOCAL_INCOMPATIBLE' })));
    expect(rechazo.resultados.every((r: { estanciaId?: string }) => r.estanciaId === undefined)).toBe(true);
    expect(await leer()).toEqual(antes);
    expect(await sincronizar(a, lote)).toMatchObject({ aplicados: 0, repetidos: 2, rechazados: 0 });
    expect(await leer()).toEqual(antes);
    // Una clave nueva del evento B conserva su capacidad de cerrar la estancia.
    expect(await sincronizar(b, [{ id: randomUUID(), tipo: 'SALIDA', placa: pb, ocurridoEn: hace(0) }]))
      .toMatchObject({ aplicados: 1, repetidos: 0, rechazados: 0 });
  });

  it('CU-022: el punto de control trabaja sin red con su caché y sincroniza después sin duplicar', async () => {
    const ahora = Date.now();
    const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();
    await fijarTarifa(5000);
    // La salida simulada precede al arranque del ensayo: necesita su propia
    // tarifa desde ese instante, distinta de la actual e independiente de
    // tarifas anteriores, también en la segunda pasada sobre la misma base.
    await parqueaderos.query(
      `INSERT INTO tarifas (id, valor_hora, definida_por, vigente_desde, motivo)
       VALUES ($1, 3000, $2, $3, 'Fixture de salida offline')`,
      [randomUUID(), administrador.id, hace(5)]);
    const evento = await eventoEnCurso();
    const z = await zona(evento, 'Zona Offline', 5, 1);
    const conReserva = placa();
    const reserva = await reservar(evento, { zonaId: z.id, placa: conReserva });
    const { codigoQr } = await pagar(reserva.id, 'tok_ok_e2e');

    // La caché tiene el hash del QR (nunca el código) y la ocupación.
    const cache = (await request(nucleo.url).get(`${P}/eventos/${evento}/cache`).set('Authorization', como(personal)).expect(200)).body;
    expect(cache.reservas).toEqual([expect.objectContaining({ hashQr: createHash('sha256').update(codigoQr).digest('hex'), placa: conReserva, espacio: reserva.espacio, estado: 'CONFIRMADA' })]);
    expect(JSON.stringify(cache)).not.toContain(codigoQr);
    expect(cache.zonas).toEqual([expect.objectContaining({ id: z.id, capacidad: 5, reservados: 1, disponibles: 4 })]);
    expect(cache.tarifa).toMatchObject({ valorHora: 5000 });

    // Lo que pasó sin red llega después, desordenado, con la hora real de cada registro.
    const suelto = placa();
    const lote = [
      { id: randomUUID(), tipo: 'SALIDA', placa: suelto, ocurridoEn: hace(5) },
      { id: randomUUID(), tipo: 'INGRESO', placa: suelto, ocurridoEn: hace(70) },
      { id: randomUUID(), tipo: 'INGRESO', codigoQr, ocurridoEn: hace(40) },
      { id: randomUUID(), tipo: 'INGRESO', codigoQr: 'HXP-BBBBBBBBBBBBBBBB', ocurridoEn: hace(30) },
      { id: randomUUID(), tipo: 'INGRESO', placa: placa(), ocurridoEn: new Date(ahora + 3_600_000).toISOString() },
    ];
    const enviar = () => request(nucleo.url).post(`${P}/eventos/${evento}/sincronizacion`).set('Authorization', como(personal)).send({ registros: lote }).expect(201).then((r) => r.body);
    const primera = await enviar();
    expect(primera).toMatchObject({ aplicados: 3, repetidos: 0, rechazados: 2 });
    const por = (id: string) => primera.resultados.find((r: { id: string }) => r.id === id);
    expect(por(lote[3].id)).toMatchObject({ resultado: 'RECHAZADO', codigo: 'QR_INVALIDO' });
    expect(por(lote[4].id)).toMatchObject({ resultado: 'RECHAZADO', codigo: 'HORA_FUERA_DE_RANGO' });
    // 65 min de permanencia → 2 h, calculadas con las horas del dispositivo y la tarifa vigente cuando salió.
    const [{ valor }] = await parqueaderos.query(
      `SELECT valor_hora::float AS valor FROM tarifas WHERE vigente_desde <= $1 ORDER BY vigente_desde DESC LIMIT 1`, [lote[0].ocurridoEn]);
    expect(valor).toBe(3000);
    expect(por(lote[0].id)).toMatchObject({ resultado: 'APLICADO', cobro: { horas: 2, valorHora: valor, monto: 2 * valor } });
    const [estancia] = await parqueaderos.query(`SELECT ingreso_en, salida_en FROM estancias WHERE registro_local_id = $1`, [lote[1].id]);
    expect(Math.abs(new Date(estancia.ingreso_en).getTime() - Date.parse(lote[1].ocurridoEn))).toBeLessThan(1000);

    // Reenviar el mismo lote (se cortó la red antes de la respuesta) no duplica nada.
    expect(await enviar()).toMatchObject({ aplicados: 0, repetidos: 3, rechazados: 2 });
    const [{ n }] = await parqueaderos.query(`SELECT count(*)::int AS n FROM estancias WHERE evento_id = $1`, [evento]);
    expect(n).toBe(2);
    expect((await panel(evento)).total).toMatchObject({ ocupados: 1, reservados: 0 });
  });
});
