import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { cifrarContrasena } from '../../modulos/identidad/comun/contrasenas';
import { NucleoPrueba } from '../logistica/nucleo-prueba';

/**
 * CU-028 · Gestión de roles y permisos, contra el Núcleo compilado con
 * PostgreSQL y Redis reales. Lo central es CU-028B: el permiso se restringe y
 * la **misma** sesión, sin renovar el token, pierde el acceso en la petición
 * siguiente.
 *
 * El administrador es una cuenta fija y no se borra al terminar: la auditoría
 * de roles es de solo inserción y la referencia, así que la cuenta debe
 * sobrevivir. Los roles creados aquí sí se eliminan.
 */
describe('CU-028 · Roles y permisos (e2e)', () => {
  const ADMIN = 'cu028-administrador@example.test';
  let nucleo: NucleoPrueba;
  let redis: Redis;
  let admin: { id: string; token: string };
  let personal: { id: string; token: string; email: string };
  const creados: string[] = [];
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const A = '/api/v1/admin/roles';

  async function administrador(): Promise<{ id: string; token: string }> {
    const contrasena = 'administrador-cu028-e2e';
    const [fila] = await nucleo.identidad.query(`SELECT id FROM usuarios WHERE email = $1`, [ADMIN]);
    const id: string = fila?.id ?? randomUUID();
    if (!fila) {
      await nucleo.identidad.query(
        `INSERT INTO usuarios (id,nombre,email,hash_contrasena,estado,verificado_en) VALUES ($1,'Administrador CU-028',$2,$3,'ACTIVA',now())`,
        [id, ADMIN, await cifrarContrasena(contrasena)]);
      await nucleo.identidad.query(`INSERT INTO usuarios_roles (usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre='Administrador'`, [id]);
    }
    const login = await request(nucleo.url).post('/api/v1/sesiones').send({ email: ADMIN, contrasena }).expect(200);
    return { id, token: login.body.token };
  }

  async function crearRol(nombre: string, permisos: { modulo: string; accion: string }[], esperado = 201) {
    const r = await request(nucleo.url).post(A).set('Authorization', como(admin)).send({ nombre, descripcion: 'Prueba e2e', permisos }).expect(esperado);
    if (esperado === 201) creados.push(r.body.id);
    return r.body;
  }

  beforeAll(async () => {
    nucleo = new NucleoPrueba('roles-permisos');
    await nucleo.iniciar();
    redis = new Redis({ host: '127.0.0.1', port: 16384, lazyConnect: true, retryStrategy: () => null });
    await redis.connect();
    admin = await administrador();
    personal = await nucleo.cuenta(['Personal']);
  });

  afterAll(async () => {
    for (const id of creados) {
      const [rol] = await nucleo.identidad.query(`SELECT nombre FROM roles WHERE id = $1`, [id]).catch(() => []);
      await nucleo.identidad.query(`DELETE FROM usuarios_roles WHERE rol_id = $1`, [id]).catch(() => undefined);
      await nucleo.identidad.query(`DELETE FROM roles WHERE id = $1`, [id]).catch(() => undefined);
      if (rol) await redis.del(`permisos-rol:${rol.nombre}`);
    }
    if (personal) await redis.del(`roles-usuario:${personal.id}`);
    redis?.disconnect();
    await nucleo?.cerrar();
  });

  it('solo un administrador activo ve y cambia los roles', async () => {
    await request(nucleo.url).get(A).set('Authorization', como(personal)).expect(403);
    const lista = await request(nucleo.url).get(A).set('Authorization', como(admin)).expect(200);
    expect(lista.body.catalogo.modulos.map((m: { id: string }) => m.id)).toEqual(['eventos', 'personal', 'parqueaderos', 'emergencias', 'reportes']);
    expect(lista.body.catalogo.acciones).toEqual(['leer', 'crear', 'actualizar', 'eliminar']);
    const sistema = lista.body.roles.filter((r: { delSistema: boolean }) => r.delSistema).map((r: { nombre: string }) => r.nombre).sort();
    expect(sistema).toEqual(['Administrador', 'Cliente', 'Organizador', 'Personal']);
  });

  it('valida el rol nuevo: al menos un permiso, catálogo cerrado y nombre único sin distinguir mayúsculas', async () => {
    const nombre = `Auditor ${randomUUID().slice(0, 8)}`;
    const vacio = await crearRol(nombre, [], 422);
    expect(vacio.codigo).toBe('ROL_SIN_PERMISOS');
    await crearRol(nombre, [{ modulo: 'pagos', accion: 'leer' }], 400);
    await crearRol(nombre, [{ modulo: 'eventos', accion: 'borrar' }], 400);
    await crearRol('Administrador', [{ modulo: 'eventos', accion: 'leer' }], 409);
    const rol = await crearRol(nombre, [{ modulo: 'eventos', accion: 'leer' }, { modulo: 'eventos', accion: 'leer' }]);
    expect(rol.permisos).toEqual([{ modulo: 'eventos', accion: 'leer' }]);
    expect(rol.version).toBe(1);
    const repetido = await crearRol(nombre.toUpperCase(), [{ modulo: 'eventos', accion: 'leer' }], 409);
    expect(repetido.codigo).toBe('NOMBRE_ROL_OCUPADO');
    expect(await redis.smembers(`permisos-rol:${nombre}`)).toEqual(['eventos:leer']);
  });

  it('los roles del sistema no se editan, no se eliminan y la base les niega matriz', async () => {
    const lista = await request(nucleo.url).get(A).set('Authorization', como(admin)).expect(200);
    const cliente = lista.body.roles.find((r: { nombre: string }) => r.nombre === 'Cliente');
    const editar = await request(nucleo.url).put(`${A}/${cliente.id}`).set('Authorization', como(admin))
      .send({ permisos: [{ modulo: 'eventos', accion: 'leer' }], version: cliente.version }).expect(409);
    expect(editar.body.codigo).toBe('ROL_DEL_SISTEMA');
    await request(nucleo.url).delete(`${A}/${cliente.id}`).set('Authorization', como(admin)).send({ version: cliente.version }).expect(409);
    await expect(nucleo.identidad.query(`INSERT INTO permisos_roles (rol_id,modulo,accion) VALUES ($1,'eventos','leer')`, [cliente.id]))
      .rejects.toThrow(/no tienen matriz/);
  });

  it('CU-028B: el permiso se concede y se retira sobre la misma sesión, sin renovar el token', async () => {
    const nombre = `Supervisor ${randomUUID().slice(0, 8)}`;
    const rol = await crearRol(nombre, [{ modulo: 'reportes', accion: 'leer' }]);

    // Sin el rol, el Personal no entra al monitoreo (es de Organizador y Administrador).
    await request(nucleo.url).get('/api/v1/monitoreo/eventos').set('Authorization', como(personal)).expect(403);

    const asignado = await request(nucleo.url).post(`${A}/${rol.id}/usuarios`).set('Authorization', como(admin))
      .send({ email: personal.email.toUpperCase() }).expect(200);
    expect(asignado.body.usuarios).toBe(1);
    expect(JSON.parse((await redis.get(`roles-usuario:${personal.id}`))!)).toEqual([nombre, 'Personal'].sort());

    // El token sigue diciendo solo "Personal": manda lo vigente en Redis.
    await request(nucleo.url).get('/api/v1/monitoreo/eventos').set('Authorization', como(personal)).expect(200);
    // `leer` no da `crear`.
    const crear = await request(nucleo.url).post(`/api/v1/monitoreo/eventos/${randomUUID()}/decisiones`)
      .set('Authorization', como(personal)).send({}).expect(403);
    expect(crear.body.codigo).toBe('ROL_INSUFICIENTE');

    const permisos = await request(nucleo.url).get('/api/v1/cuentas/permisos').set('Authorization', como(personal)).expect(200);
    expect(permisos.body).toEqual({ roles: [nombre, 'Personal'].sort(), permisos: [{ modulo: 'reportes', accion: 'leer' }] });

    // Se restringe: fuera reportes, dentro eventos.
    const editado = await request(nucleo.url).put(`${A}/${rol.id}`).set('Authorization', como(admin))
      .send({ permisos: [{ modulo: 'eventos', accion: 'leer' }], version: 1 }).expect(200);
    expect(editado.body.version).toBe(2);
    await request(nucleo.url).get('/api/v1/monitoreo/eventos').set('Authorization', como(personal)).expect(403);
    await request(nucleo.url).get('/api/v1/eventos').set('Authorization', como(personal)).expect(200);
    await request(nucleo.url).post('/api/v1/eventos').set('Authorization', como(personal)).send({}).expect(403);

    // Otro administrador con la versión vieja no pisa el cambio.
    const viejo = await request(nucleo.url).put(`${A}/${rol.id}`).set('Authorization', como(admin))
      .send({ permisos: [{ modulo: 'reportes', accion: 'leer' }], version: 1 }).expect(409);
    expect(viejo.body).toMatchObject({ codigo: 'VERSION_DESACTUALIZADA', versionActual: 2 });

    // Retirar el rol también se aplica en el acto.
    await request(nucleo.url).delete(`${A}/${rol.id}/usuarios/${personal.id}`).set('Authorization', como(admin)).expect(200);
    await request(nucleo.url).get('/api/v1/eventos').set('Authorization', como(personal)).expect(403);
    const sinRoles = await request(nucleo.url).delete(`${A}/${rol.id}/usuarios/${personal.id}`).set('Authorization', como(admin)).expect(422);
    expect(sinRoles.body.codigo).toBe('NO_ASIGNADO');
  });

  it('un rol propio con permiso sobre personal supervisa solo en la acción concedida', async () => {
    const rol = await crearRol(`Coordinación ${randomUUID().slice(0, 8)}`, [{ modulo: 'personal', accion: 'leer' }]);
    await request(nucleo.url).get(`/api/v1/logistica/asignaciones?eventoId=${randomUUID()}`).set('Authorization', como(personal)).expect(403);
    await request(nucleo.url).post(`${A}/${rol.id}/usuarios`).set('Authorization', como(admin)).send({ email: personal.email }).expect(200);
    const ver = await request(nucleo.url).get(`/api/v1/logistica/asignaciones?eventoId=${randomUUID()}`).set('Authorization', como(personal));
    expect(ver.status).not.toBe(403);
    const cancelar = await request(nucleo.url).post(`/api/v1/logistica/turnos/${randomUUID()}/cancelar`)
      .set('Authorization', como(personal)).send({ motivo: 'Prueba de permisos' }).expect(403);
    expect(cancelar.body.codigo).toBe('NO_SUPERVISA');
    await request(nucleo.url).delete(`${A}/${rol.id}/usuarios/${personal.id}`).set('Authorization', como(admin)).expect(200);
  });

  it('asignar y retirar: solo cuentas activas, nunca dejar una cuenta sin roles, y reasignar a un rol que exista', async () => {
    const rol = await crearRol(`Bodega ${randomUUID().slice(0, 8)}`, [{ modulo: 'eventos', accion: 'leer' }]);

    const inactiva = await nucleo.cuenta(['Cliente']);
    await nucleo.identidad.query(`UPDATE usuarios SET estado = 'DESACTIVADA' WHERE id = $1`, [inactiva.id]);
    const desactivada = await request(nucleo.url).post(`${A}/${rol.id}/usuarios`).set('Authorization', como(admin))
      .send({ email: inactiva.email }).expect(422);
    expect(desactivada.body.codigo).toBe('CUENTA_NO_ACTIVA');

    // Una cuenta cuyo único rol es este: retirárselo la dejaría sin ninguno.
    const solo = await nucleo.cuenta([]);
    await request(nucleo.url).post(`${A}/${rol.id}/usuarios`).set('Authorization', como(admin)).send({ email: solo.email }).expect(200);
    const sinRoles = await request(nucleo.url).delete(`${A}/${rol.id}/usuarios/${solo.id}`).set('Authorization', como(admin)).expect(422);
    expect(sinRoles.body.codigo).toBe('SIN_ROLES');

    const destino = await request(nucleo.url).delete(`${A}/${rol.id}`).set('Authorization', como(admin))
      .send({ version: 1, reasignarA: randomUUID() }).expect(422);
    expect(destino.body).toMatchObject({ codigo: 'REASIGNACION_NO_VALIDA', mensaje: 'El rol de destino no existe.' });
    await redis.del(`roles-usuario:${solo.id}`);
  });

  it('CU-028A: un rol con usuarios activos solo se elimina reasignándolos, y todo queda auditado', async () => {
    const nombre = `Taquilla ${randomUUID().slice(0, 8)}`;
    const rol = await crearRol(nombre, [{ modulo: 'eventos', accion: 'leer' }]);
    await request(nucleo.url).post(`${A}/${rol.id}/usuarios`).set('Authorization', como(admin)).send({ email: personal.email }).expect(200);

    const bloqueado = await request(nucleo.url).delete(`${A}/${rol.id}`).set('Authorization', como(admin)).send({ version: 1 }).expect(409);
    expect(bloqueado.body).toMatchObject({ codigo: 'ROL_CON_USUARIOS', usuarios: 1 });
    await request(nucleo.url).delete(`${A}/${rol.id}`).set('Authorization', como(admin)).send({ version: 1, reasignarA: rol.id }).expect(422);

    const lista = await request(nucleo.url).get(A).set('Authorization', como(admin)).expect(200);
    const cliente = lista.body.roles.find((r: { nombre: string }) => r.nombre === 'Cliente');
    const eliminado = await request(nucleo.url).delete(`${A}/${rol.id}`).set('Authorization', como(admin))
      .send({ version: 1, reasignarA: cliente.id }).expect(200);
    expect(eliminado.body).toEqual({ eliminado: nombre, reasignados: 1 });
    expect(await redis.exists(`permisos-rol:${nombre}`)).toBe(0);
    expect(JSON.parse((await redis.get(`roles-usuario:${personal.id}`))!)).toEqual(['Cliente', 'Personal']);
    await request(nucleo.url).get('/api/v1/eventos').set('Authorization', como(personal)).expect(403);
    await request(nucleo.url).get(`${A}/${rol.id}`).set('Authorization', como(admin)).expect(404);

    const auditoria = await nucleo.identidad.query(
      `SELECT accion, realizada_por, detalle FROM auditoria_roles WHERE rol_id = $1 ORDER BY fecha, accion`, [rol.id]);
    expect(auditoria.map((a: { accion: string }) => a.accion)).toEqual(['CREAR', 'ASIGNAR', 'ELIMINAR']);
    expect(auditoria.every((a: { realizada_por: string }) => a.realizada_por === admin.id)).toBe(true);
    expect(auditoria[2].detalle).toMatchObject({ reasignadosA: 'Cliente', usuarios: 1 });
    await expect(nucleo.identidad.query(`UPDATE auditoria_roles SET accion = 'EDITAR' WHERE rol_id = $1`, [rol.id]))
      .rejects.toThrow(/solo inserción/);
    await nucleo.identidad.query(`DELETE FROM usuarios_roles WHERE usuario_id = $1 AND rol_id = $2`, [personal.id, cliente.id]);
  });
});
