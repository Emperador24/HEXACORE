const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { migracionesOriginales } = require('./migraciones-originales.cjs');
const { PROCEDENCIA_ORIGINAL } = require('../../dist/compartido/persistencia/historia');
const { mapa, raiz } = require('./config.cjs');
const referencia = 'be57961472a0802c90a57d247fb67e96e6717b1b';

test('las 18 procedencias coinciden con el código fijado y los ocho historiales originales', () => {
  const fuentes = migracionesOriginales();
  assert.equal(fuentes.length, 18);
  for (const m of mapa) {
    assert.equal(fuentes.filter(f => f.conexion === m.conexion).length, m.cantidad);
    assert.equal(m.historial, m.conexion === 'entradas-postventa' ? 'migrations' : 'migraciones');
  }
  for (const f of fuentes) {
    const fijada = execFileSync('git', ['show', `${referencia}:App/backend/${f.ruta}`], { cwd: raiz });
    assert.equal(createHash('sha256').update(fijada).digest('hex'), f.sha256, f.ruta);
    assert.equal(/export class (\w+)/.exec(fijada.toString())?.[1], f.nombre);
  }
});

test('las migraciones posteriores de Alimentos, Logística y Entradas no amplían el corte', () => {
  const fuentes = new Set(migracionesOriginales().map(f => f.ruta));
  const posteriores = mapa.flatMap(m => readdirSync(join(raiz,m.modulo,'persistencia/migraciones'))
    .filter(f => f.endsWith('.ts')).map(f => `${m.modulo}/persistencia/migraciones/${f}`))
    .filter(ruta => !fuentes.has(ruta));
  for (const nombre of ['GestionEstablecimientosCu015','MenuInventarioCu012','PreparacionCu013','EntregaCu014',
    'Cu007GestionPersonal','Cu008Cu009CambiosAsistencia']) {
    assert.ok(posteriores.some(ruta => ruta.includes(nombre)), nombre);
  }
  for (const modulo of ['ventas','catalogo','postventa','acceso-qr']) {
    assert.ok(posteriores.some(ruta => ruta.includes(`entradas/${modulo}/`) && ruta.endsWith('-VersionEvento.ts')));
  }
});

test('rechaza una huella o propietario alterados sin modificar archivos de migración', () => {
  // Solo se perturba la copia en memoria de este proceso de prueba.
  const f = PROCEDENCIA_ORIGINAL[0], anterior = { ...f };
  try {
    f.sha256 = '0'.repeat(64);
    assert.throws(() => migracionesOriginales());
    Object.assign(f, anterior);
    f.ruta = 'modulos/alimentos/persistencia/migraciones/ajena.ts';
    assert.throws(() => migracionesOriginales(), /Propietario histórico incorrecto/);
  } finally { Object.assign(f, anterior); }
  assert.equal(migracionesOriginales().length, 18);
});
