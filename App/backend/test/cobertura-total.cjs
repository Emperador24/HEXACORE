#!/usr/bin/env node
/**
 * Une la cobertura de las pruebas unitarias y la de las e2e, **por línea**.
 *
 * No se pueden medir con la misma herramienta:
 * - las unitarias ejecutan, dentro de la máquina virtual de Jest, el código que
 *   transforma ts-jest. c8 lee el `.ts` del disco y no coincide con lo que
 *   corrió, así que se miden con la cobertura de Jest, con su proveedor v8;
 * - las e2e ejecutan `dist/` en otro proceso, así que se miden con c8 y sus
 *   source maps.
 * Cada herramienta deriva un mapa de sentencias distinto para el mismo
 * archivo, y mezclar contadores entre mapas que no coinciden da cifras falsas.
 *
 * Aquí una línea cuenta como cubierta si **alguna** de las dos corridas la
 * ejecutó. Es exactamente la pregunta que importa: ¿alguna prueba pasa por esta
 * línea?
 *
 *   node test/cobertura-total.cjs [modulo …]
 *
 * Lee `coverage/{unitarias,e2e,boleteria}/coverage-final.json`
 * (los deja `npm run test:cov:total`), imprime el resumen por módulo y escribe
 * `coverage/total/RESUMEN.md`. Con módulos (p. ej. `modulos/parqueaderos`), solo esos.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const raiz = path.resolve(__dirname, '..');
const leer = (nombre) => {
  const archivo = path.join(raiz, 'coverage', nombre, 'coverage-final.json');
  if (!fs.existsSync(archivo)) throw new Error(`Falta ${archivo}: corre antes npm run test:cov:total`);
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
};

/** Líneas con alguna sentencia, y cuáles de ellas se ejecutaron, por archivo. */
function lineas(cobertura) {
  const resultado = new Map();
  for (const [archivo, datos] of Object.entries(cobertura)) {
    const todas = new Set();
    const cubiertas = new Set();
    for (const [id, rango] of Object.entries(datos.statementMap)) {
      todas.add(rango.start.line);
      if (datos.s[id] > 0) cubiertas.add(rango.start.line);
    }
    resultado.set(path.relative(raiz, archivo), { todas, cubiertas });
  }
  return resultado;
}

// Las e2e del Núcleo y las de Boletería son corridas distintas (dos programas).
const corridas = ['unitarias', 'e2e', 'boleteria'].map((nombre) => lineas(leer(nombre)));
const filtros = process.argv.slice(2);
const incluido = (archivo) => !filtros.length || filtros.some((f) => archivo.startsWith(f));

/**
 * Un archivo que solo declara tipos no existe en tiempo de ejecución: TypeScript
 * lo borra al compilar y ningún proceso lo carga. c8 lo cuenta entero como «sin
 * cubrir»; no hay nada que ejecutar, así que no entra en la cuenta.
 */
function soloTipos(archivo) {
  const js = ts.transpileModule(fs.readFileSync(path.join(raiz, archivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return js.replace(/"use strict";|Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);|\/\/.*$|\/\*[\s\S]*?\*\//gm, '').trim() === '';
}

const porArchivo = [];
for (const archivo of new Set(corridas.flatMap((c) => [...c.keys()]))) {
  // Un informe anterior puede nombrar un archivo que ya se borró.
  if (!incluido(archivo) || !fs.existsSync(path.join(raiz, archivo))) continue;
  const deEste = corridas.map((c) => c.get(archivo)).filter(Boolean);
  // Una línea que algún mapa considera sentencia y nadie ejecutó es una línea sin cubrir.
  const todas = new Set(deEste.flatMap((d) => [...d.todas]));
  const cubiertas = new Set(deEste.flatMap((d) => [...d.cubiertas]));
  if (cubiertas.size === 0 && soloTipos(archivo)) continue;
  const faltan = [...todas].filter((l) => !cubiertas.has(l)).sort((a, b) => a - b);
  porArchivo.push({ archivo, total: todas.size, cubiertas: todas.size - faltan.length, faltan });
}

const modulo = (archivo) => {
  const partes = archivo.split('/');
  return partes[0] === 'modulos' && ['entradas', 'finanzas', 'identidad'].includes(partes[1])
    ? partes.slice(0, 3).join('/') : partes.slice(0, 2).join('/');
};
const porModulo = new Map();
for (const f of porArchivo) {
  const m = porModulo.get(modulo(f.archivo)) ?? { total: 0, cubiertas: 0 };
  m.total += f.total;
  m.cubiertas += f.cubiertas;
  porModulo.set(modulo(f.archivo), m);
}

const pct = (c, t) => (t ? (100 * c / t).toFixed(1) : '100.0');
const filas = [...porModulo.entries()].sort(([a], [b]) => a.localeCompare(b));
const total = filas.reduce((n, [, m]) => ({ total: n.total + m.total, cubiertas: n.cubiertas + m.cubiertas }), { total: 0, cubiertas: 0 });

console.log('Cobertura por línea (unitarias ∪ e2e Núcleo ∪ e2e Boletería)\n');
for (const [nombre, m] of filas) console.log(`  ${nombre.padEnd(42)} ${pct(m.cubiertas, m.total).padStart(6)} %  (${m.cubiertas}/${m.total})`);
console.log(`\n  ${'Total'.padEnd(42)} ${pct(total.cubiertas, total.total).padStart(6)} %  (${total.cubiertas}/${total.total})`);
const pendientes = porArchivo.filter((f) => f.faltan.length);
if (pendientes.length) {
  console.log('\nLíneas sin cubrir:');
  for (const f of pendientes) console.log(`  ${f.archivo}: ${f.faltan.join(', ')}`);
}

fs.mkdirSync(path.join(raiz, 'coverage', 'total'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'coverage', 'total', 'RESUMEN.md'), [
  '# Cobertura por línea (unitarias ∪ e2e Núcleo ∪ e2e Boletería)', '',
  '| Módulo | Cobertura | Líneas |', '|---|---:|---:|',
  ...filas.map(([nombre, m]) => `| ${nombre} | ${pct(m.cubiertas, m.total)} % | ${m.cubiertas}/${m.total} |`),
  `| **Total** | **${pct(total.cubiertas, total.total)} %** | ${total.cubiertas}/${total.total} |`, '',
  ...(pendientes.length ? ['## Líneas sin cubrir', '', ...pendientes.map((f) => `- \`${f.archivo}\`: ${f.faltan.join(', ')}`), ''] : []),
].join('\n'));
