import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { NucleoPrueba } from './nucleo-prueba';

/**
 * CU-030 · Gestión de Proveedores, contra el Núcleo compilado. El actor
 * «Coordinador Logístico» lo ejerce Organizador (igual que el supervisor de
 * CU-019/CU-010, el sistema no tiene ese rol de cuenta).
 */
describe('CU-030 · Gestión de Proveedores (e2e)', () => {
  let nucleo: NucleoPrueba;
  let coordinador: { id: string; token: string };
  let cliente: { id: string; token: string };
  const RUTA = '/api/v1/proveedores';
  const como = (cuenta: { token: string }) => `Bearer ${cuenta.token}`;
  const sufijo = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    nucleo = new NucleoPrueba('proveedores');
    await nucleo.iniciar();
    coordinador = await nucleo.cuenta(['Organizador']);
    cliente = await nucleo.cuenta(['Cliente']);
  });
  afterAll(async () => { await nucleo?.cerrar(); });

  const registrar = (datos: Record<string, unknown> = {}) => {
    const s = sufijo();
    return request(nucleo.url).post(RUTA).set('Authorization', como(coordinador)).send({
      nombre: `Sonidos del Valle ${s}`, tipoServicio: 'SONIDO', nombreContacto: 'Marta Ríos',
      telefono: '+57 300 000 0000', correo: `contacto.${s}@example.test`, costoReferencia: 1200000, ...datos,
    });
  };

  it('un Cliente no puede gestionar proveedores (precondición 1: rol Coordinador Logístico o Administrador)', async () => {
    await request(nucleo.url).get(RUTA).set('Authorization', como(cliente)).expect(403);
    await request(nucleo.url).post(RUTA).set('Authorization', como(cliente)).send({ nombre: 'X', tipoServicio: 'SONIDO' }).expect(403);
  });

  it('pasos 1-8: registra un proveedor con estado ACTIVO y queda en el listado', async () => {
    const res = await registrar().expect(201);
    expect(res.body).toMatchObject({ tipoServicio: 'SONIDO', estado: 'ACTIVO' });
    const listado = await request(nucleo.url).get(RUTA).set('Authorization', como(coordinador)).expect(200);
    expect(listado.body.find((p: { id: string }) => p.id === res.body.id)).toBeTruthy();
  });

  it('rechaza un tipo de servicio que no está en el catálogo', async () => {
    await registrar({ tipoServicio: 'MAGIA' }).expect(400);
  });

  it('CU-030B: dar de baja sin asignaciones activas no pide confirmación', async () => {
    const { body: proveedor } = await registrar().expect(201);
    const baja = await request(nucleo.url).post(`${RUTA}/${proveedor.id}/baja`).set('Authorization', como(coordinador)).send({}).expect(201);
    expect(baja.body.estado).toBe('INACTIVO');

    const reactivado = await request(nucleo.url).post(`${RUTA}/${proveedor.id}/reactivar`).set('Authorization', como(coordinador)).expect(201);
    expect(reactivado.body.estado).toBe('ACTIVO');
  });

  it('certificaciones (paso 3): sube, descarga y elimina un documento PDF', async () => {
    const { body: proveedor } = await registrar().expect(201);
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('contenido de prueba')]);

    const subida = await request(nucleo.url).post(`${RUTA}/${proveedor.id}/documentos`).set('Authorization', como(coordinador))
      .field('nombre', 'Certificado de manipulación de alimentos')
      .attach('documento', pdf, { filename: 'certificado.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(subida.body.tipo).toBe('application/pdf');

    const descarga = await request(nucleo.url).get(`${RUTA}/${proveedor.id}/documentos/${subida.body.id}`).set('Authorization', como(coordinador)).expect(200);
    expect(Buffer.from(descarga.body).equals(pdf)).toBe(true);

    const detalle = await request(nucleo.url).get(`${RUTA}/${proveedor.id}`).set('Authorization', como(coordinador)).expect(200);
    expect(detalle.body.documentos).toHaveLength(1);

    await request(nucleo.url).delete(`${RUTA}/${proveedor.id}/documentos/${subida.body.id}`).set('Authorization', como(coordinador)).expect(204);
    await request(nucleo.url).get(`${RUTA}/${proveedor.id}/documentos/${subida.body.id}`).set('Authorization', como(coordinador)).expect(404);
  });

  it('un documento que no es realmente un PDF se rechaza aunque diga serlo', async () => {
    const { body: proveedor } = await registrar().expect(201);
    await request(nucleo.url).post(`${RUTA}/${proveedor.id}/documentos`).set('Authorization', como(coordinador))
      .field('nombre', 'Falso')
      .attach('documento', Buffer.from('esto no es un pdf de verdad'), { filename: 'falso.pdf', contentType: 'application/pdf' })
      .expect(400);
  });
});
