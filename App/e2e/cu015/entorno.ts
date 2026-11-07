import { APIRequestContext, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const adminURL = 'http://cu015.localhost:14221';
export const clienteURL = 'http://cu015.localhost:14220';
export const gateway = 'http://127.0.0.1:18100/api/v1';
export const nucleo = 'http://127.0.0.1:13149/api/v1';
const proyecto = 'hexacore-cu015-sebastian';
export const clave = () => {
  if (!process.env.CU015_CLAVE_DEMO) throw new Error('Define CU015_CLAVE_DEMO en tu entorno local.');
  return process.env.CU015_CLAVE_DEMO;
};

export function comprobarAislamiento(): void {
  execFileSync('python3', [resolve(__dirname, '../../infra/revision/revision.py'), '--perfil', 'cu015', 'config'], { stdio: 'pipe' });
  for (const servicio of ['postgres', 'nucleo', 'api-gateway']) {
    const [c] = JSON.parse(execFileSync('docker', ['inspect', `${proyecto}-${servicio}-1`], { encoding: 'utf8' }));
    expect(c.Config.Labels['com.docker.compose.project']).toBe(proyecto);
    expect(c.Config.Labels['hexacore.uso']).toBe('cu015');
    expect(c.State.Running).toBe(true);
  }
}

export async function loginAPI(api: APIRequestContext, email: string): Promise<{ token: string; usuario: { id: string } }> {
  const r = await api.post(`${gateway}/sesiones`, { data: { email, contrasena: clave() } });
  expect(r.status(), 'Login real en Identidad').toBe(200);
  return r.json();
}

export async function loginUI(page: Page, url: string, email: string): Promise<void> {
  await page.goto(`${url}/login`);
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave()!);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export async function crearEvento(api: APIRequestContext, token: string, nombre: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.post(`${gateway}/recintos`, { headers, data: {
    nombre: `Recinto ${nombre}`, ciudad: 'Bogotá', direccion: 'Punto de prueba CU015', capacidad: 50, zonas: [],
  } });
  expect(r.status()).toBe(201);
  const recinto = await r.json();
  const e = await api.post(`${gateway}/eventos`, { headers, data: {
    nombre, categoria: 'Pruebas CU015', recintoId: recinto.recinto.id,
    fechaInicio: new Date(Date.now() + 86_400_000).toISOString(),
    fechaFin: new Date(Date.now() + 90_000_000).toISOString(),
    aforoMaximo: 50, localidades: [{ nombre: 'General', precio: 1000, cantidad: 50 }],
  } });
  expect(e.status()).toBe(201);
  const evento = (await e.json()).evento;
  const publicado = await api.post(`${gateway}/eventos/${evento.id}/publicar`, { headers, data: { version: evento.version } });
  expect(publicado.status()).toBe(200);
  return (await publicado.json()).evento as { id: string; version: number };
}

/** Solo fixtures CU-012, aún sin CRUD: inserción inicial propia, sin resembrar. */
export function productoPropio(establecimientoId: string): string {
  comprobarAislamiento();
  expect(establecimientoId).toMatch(/^[0-9a-f-]{36}$/);
  const id = randomUUID();
  sql(`INSERT INTO alimentos.productos(id,establecimiento_id,nombre,precio,activo,cantidad_inventario)
    VALUES('${id}','${establecimientoId}','Producto CU015',1000,true,5);`);
  execFileSync('docker', ['exec', `${proyecto}-nucleo-1`, 'node',
    'dist/modulos/alimentos/inventario/preparar-inventario.js', establecimientoId, '--compras-detenidas'], { stdio: 'pipe' });
  return id;
}

export function sql(consulta: string): string {
  return execFileSync('docker', ['exec', '-i', `${proyecto}-postgres-1`, 'psql', '-X', '-U', 'revision_demo',
    '-d', 'hexacore_cu015', '-At', '-v', 'ON_ERROR_STOP=1'], { input: consulta, encoding: 'utf8' }).trim();
}
