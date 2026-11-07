const { base: basePruebas, opcionesPg } = require('../base-unica/conexiones.cjs');
import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { opcionesDataSource as opcionesIdentidad } from '../../modulos/identidad/persistencia/data-source';
import { cargarConfiguracion as configurarIdentidad } from '../../modulos/identidad/comun/config/configuracion';
import { opcionesDataSource as opcionesAlimentos } from '../../modulos/alimentos/persistencia/data-source';
import { cargarConfiguracion as configurarAlimentos } from '../../modulos/alimentos/comun/config/configuracion';
import { opcionesDataSource as opcionesLogistica } from '../../modulos/personal-logistica/persistencia/data-source';
import { cifrarContrasena } from '../../modulos/identidad/comun/contrasenas';

export async function esperar(condicion: () => boolean | Promise<boolean>, limiteMs = 10000): Promise<void> {
  const limite = Date.now() + limiteMs;
  while (!await condicion()) {
    if (Date.now() > limite) throw new Error(`Condición de integración no alcanzada en ${limiteMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Controla el programa compilado; no sustituye proveedores de la aplicación. */
export class NucleoPrueba {
  readonly url = 'http://127.0.0.1:13087';
  readonly identidad = new DataSource(opcionesIdentidad(configurarIdentidad()));
  readonly alimentos = new DataSource(opcionesAlimentos(configurarAlimentos()));
  readonly datos = new DataSource(opcionesLogistica());
  private proceso?: ChildProcess;
  private salida = '';
  private readonly previos = new Map<string, Set<string>>();
  private readonly cuentas: string[] = [];
  private readonly tablas = ['auditoria_personal', 'notificaciones', 'registros_asistencia', 'solicitudes_cambio_turno', 'turnos', 'zonas_evento', 'empleados'];
  private readonly redis = new Redis({ host: '127.0.0.1', port: 16384, lazyConnect: true, retryStrategy: () => null });

  constructor(private readonly nombre: string) {
    for (const [etiqueta, fuente] of [['identidad', this.identidad], ['alimentos', this.alimentos], ['logistica', this.datos]] as const) {
      fuente.setOptions({ extra: { ...(fuente.options as {extra?: Record<string,unknown>}).extra, application_name: `observador-${etiqueta}` } });
    }
  }

  async iniciar(): Promise<void> {
    expect(this.datos.options).toMatchObject({ host: '127.0.0.1', port: 15439,
      username: 'cu011_e2e', database: basePruebas, synchronize: false });
    expect(process.version).toBe('v22.22.3');
    for (const fuente of [this.identidad, this.alimentos, this.datos]) {
      await fuente.initialize();
    }
    for (const tabla of this.tablas) {
      this.previos.set(tabla, new Set((await this.datos.query(`SELECT id FROM "${tabla}"`)).map((r: { id: string }) => r.id)));
    }
    await this.redis.connect();
    this.proceso = spawn(process.execPath, [resolve(__dirname, '../../dist/apps/nucleo/main.js')],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    mkdirSync(resolve(__dirname, '../../.evidencia-e2e'), { recursive: true });
    writeFileSync(resolve(__dirname, '../../.evidencia-e2e/servidor.pid'), String(this.proceso.pid));
    let errorInicio: Error | undefined;
    this.proceso.once('error', (error) => { errorInicio = error; });
    this.proceso.stdout!.on('data', (trozo: Buffer) => { this.salida += trozo.toString(); });
    this.proceso.stderr!.on('data', (trozo: Buffer) => { this.salida += trozo.toString(); });
    await esperar(() => {
      if (errorInicio) throw errorInicio;
      if (this.proceso!.exitCode !== null || this.proceso!.signalCode !== null) throw new Error(this.salida);
      return this.salida.includes('Núcleo escuchando') && this.salida.includes('Escuchando la cola');
    }, 15000);
    const salud = await fetch(`${this.url}/api/v1/salud`);
    expect(salud.status).toBe(200);
    expect(await salud.json()).toMatchObject({ servicio: 'nucleo', dependencias: {
      postgres: { identidad: 'arriba', alimentos: 'arriba', logistica: 'arriba' } } });
    expect(this.salida).toContain(`pid=${this.proceso.pid}`);
    expect(this.salida.match(/7 topologías declaradas/g)).toHaveLength(1);
    expect(this.salida.match(/Escuchando la cola/g)).toHaveLength(1);
    await esperar(async () => (await this.conexionesRabbit()).length === 1);
    await esperar(async () => await this.consumidores() === 1);
  }

  async cuenta(roles: string[] = ['Personal']): Promise<{ id: string; token: string; email: string }> {
    const id = randomUUID(), email = `logistica-${id}@example.test`, contrasena = 'personal-integracion-nucleo';
    this.cuentas.push(id);
    await this.identidad.query(`INSERT INTO usuarios (id,nombre,email,hash_contrasena,estado,verificado_en)
      VALUES ($1,'Personal de prueba',$2,$3,'ACTIVA',now())`, [id, email, await cifrarContrasena(contrasena)]);
    await this.identidad.query(`INSERT INTO usuarios_roles (usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre=ANY($2)`, [id, roles]);
    const login = await fetch(`${this.url}/api/v1/sesiones`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, contrasena }), signal: AbortSignal.timeout(10000) });
    expect(login.status).toBe(200);
    const sesion = await login.json() as { token: string; usuario: { roles: string[]; id: string } };
    expect(sesion.usuario.id).toBe(id);
    expect(sesion.usuario.roles.sort()).toEqual([...roles].sort());
    return { id, token: sesion.token, email };
  }

  private async conexionesRabbit(): Promise<unknown[]> {
    const respuesta = await fetch('http://127.0.0.1:16779/api/connections', {
      headers: { Authorization: `Basic ${Buffer.from('cu011_e2e:cu011_e2e').toString('base64')}` }, signal: AbortSignal.timeout(3000) });
    expect(respuesta.status).toBe(200);
    return ((await respuesta.json()) as { client_properties: { connection_name?: string } }[])
      .filter((r) => r.client_properties.connection_name === 'hexacore-nucleo');
  }

  private async consumidores(): Promise<number> {
    const respuesta = await fetch('http://127.0.0.1:16779/api/queues/cu011/nucleo-e2e.turnos.cambios', {
      headers: { Authorization: `Basic ${Buffer.from('cu011_e2e:cu011_e2e').toString('base64')}` }, signal: AbortSignal.timeout(3000) });
    expect(respuesta.status).toBe(200);
    return ((await respuesta.json()) as { consumers: number }).consumers;
  }

  async cerrar(): Promise<void> {
    try {
      if (this.proceso) {
        expect(this.proceso.exitCode).toBeNull(); expect(this.proceso.signalCode).toBeNull();
        const cierre = new Promise<void>((resolve) => this.proceso!.once('exit', () => resolve()));
        let forzado = false;
        const timer = setTimeout(() => { forzado = true; this.proceso!.kill('SIGKILL'); }, 5000);
        this.proceso.kill('SIGTERM');
        try { await cierre; } finally { clearTimeout(timer); }
        expect(forzado).toBe(false);
        expect(this.proceso.signalCode === 'SIGTERM' || this.proceso.exitCode === 0).toBe(true);
        expect(this.salida).toContain('Consumidor de logística detenido');
        expect(this.salida).toContain('Sondeo de reservas detenido');
        expect(this.salida).not.toMatch(/ERROR|UnknownElementException|Cierre de RabbitMQ con incidencias/);
        const [{ total }] = await this.datos.query(`SELECT count(*)::int AS total FROM pg_stat_activity
          WHERE application_name IN ('nucleo-identidad','nucleo-alimentos','nucleo-personal-logistica','finanzas-pagos:nucleo')`);
        expect(total).toBe(0);
        await esperar(async () => (await this.conexionesRabbit()).length === 0);
        await esperar(async () => await this.consumidores() === 0);
        expect(await this.redis.client('LIST')).not.toMatch(/name=nucleo(?: |-inventario )/);
        await expect(fetch(`${this.url}/api/v1/salud`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
      }
    } finally {
      mkdirSync(resolve(__dirname, '../../.evidencia-e2e'), { recursive: true });
      writeFileSync(resolve(__dirname, `../../.evidencia-e2e/${this.nombre}.log`), this.salida);
      rmSync(resolve(__dirname, '../../.evidencia-e2e/servidor.pid'), { force: true });
      try {
        if (this.datos.isInitialized) {
          for (const tabla of this.tablas) {
            const antes = this.previos.get(tabla);
            if (!antes) continue;
            const nuevos = (await this.datos.query(`SELECT id FROM "${tabla}"`)).map((r: { id: string }) => r.id).filter((id: string) => !antes.has(id));
            if (nuevos.length) await this.datos.query(`DELETE FROM "${tabla}" WHERE id=ANY($1::uuid[])`, [nuevos]);
          }
        }
        if (this.identidad.isInitialized && this.cuentas.length) {
          const sesiones: { jti: string }[] = await this.identidad.query('SELECT jti FROM sesiones WHERE usuario_id=ANY($1::uuid[])', [this.cuentas]);
          for (const { jti } of sesiones) await this.redis.del(`sesion-revocada:${jti}`);
          await this.identidad.query('DELETE FROM usuarios WHERE id=ANY($1::uuid[])', [this.cuentas]);
        }
      } finally {
        this.redis.disconnect();
        for (const fuente of [this.identidad, this.alimentos, this.datos]) if (fuente.isInitialized) await fuente.destroy();
      }
    }
  }
}
