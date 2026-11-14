# Migración de portales — 13/11/2026

Referencia 7457e7b; árbol inicial limpio, feature/sebastian. Sin cambios de runtime
o dependencias backend. Node de herramientas/compilación frontend: **22.22.3**,
npm **10.9.8**. Rama activa Angular 22, soportada hasta junio de 2028 según
[política oficial](https://angular.dev/reference/releases), con
[compatibilidad Node/TypeScript](https://angular.dev/reference/versions).

## Migraciones oficiales aplicadas en ambos portales

Desde cada carpeta de portal, usando el Node fijado, sin force ni overrides:

```bash
ng update @angular/core@20.3.35 @angular/cli@20.3.43 @angular/material@20.2.14 --allow-dirty
ng update @angular/core@21.2.26 @angular/cli@21.2.30 @angular/material@21.2.14 --allow-dirty
ng update @angular/core@22.2.6 @angular/cli@22.2.7 @angular/material@22.2.7 --allow-dirty
```

Se invocó `node node_modules/@angular/cli/bin/ng.js update ...`, con
`NG_CLI_ANALYTICS=false`, `NG_BUILD_MAX_WORKERS=1` y `CI=1` solo para ese proceso.
`--allow-dirty` permite continuar con los cambios de las etapas anteriores, no
sobrescribir trabajo ajeno. Los seis comandos finalizaron correctamente.
El primer intento con `--interactive=false` se rechazó sin cambiar archivos;
se conserva privado y se retiró la opción no admitida.

Las migraciones actualizan DOCUMENT, estilos Material, configuración/tsconfig y
añaden explícitamente **ChangeDetectionStrategy.Eager**: Angular 22 cambia el
valor por defecto y se conserva el comportamiento previo. Se mantienen Zone.js,
Jasmine/Karma y sus aserciones. Las migraciones opcionales a Vitest/nuevo paquete
de builder no son necesarias para corregir los avisos y no se ejecutaron.
[Comando oficial](https://angular.dev/cli/update).

## Versiones y resolución de tooling

Framework/compiler/animations/router/common/forms/platforms **22.2.6**;
CLI/build-angular y Material/CDK **22.2.7**, TypeScript **6.0.3**. Node fijado
también en las imágenes y solo en el job CI de portales.

Puppeteer-core **23.11.1→25.17.0**, padre de la cadena vulnerable del conductor
de pruebas del Cliente; admite Node >=22.12.0 y no descarga un navegador.
Después se actualizaron `karma`, `body-parser`, `brace-expansion`, `engine.io`,
`fast-uri`, `follow-redirects`, `qs` dentro de sus rangos declarados. No se usó
`audit fix --force`, ignores o overrides.

| Componente | Inicial | Final compatible |
|---|---|---|
| piscina | 4.8.0, fijado por builder 19 | 5.3.2, builder 22 |
| proxy-addr | 2.0.7 | 2.0.8 |
| shell-quote | 1.10.0 | 1.12.0 |
| tar | 6.2.1 bajo la cadena antigua | cadena antigua eliminada |
| body-parser | <1.20.9 | 1.20.9 |
| brace-expansion | <=1.1.20 | 1.1.22 |
| engine.io | <=6.6.9 | 6.6.11 |
| fast-uri | <=3.1.8 | 3.1.9 |
| follow-redirects | 1.16.1 | 1.16.3 |
| qs | <=6.16.0 | 6.16.2 |

Se contrastaron todos los nodos auditados con package.json físicamente instalado
y lock: **67 Cliente, 58 Admin**, ninguno ausente. JSON completos, versiones,
rangos/advisories y `npm explain` de los críticos quedan privados; el resumen
publicable de comparación se incluye en la evidencia de este bloque.

Antes: producción **8** por portal; completo Cliente **67** (4 críticos), Admin
**58** (4 críticos). Tras la migración, antes de resolver transitivas/Puppeteer:
Cliente **16** (14 altos/2 moderados), Admin **6** (5 altos/1 moderado), cero
críticos. Después de la resolución compatible: **0 en ambos**. No se suman
producción y completo: el segundo ya incluye producción.

## Comprobación del hito

En serie, por portal: `npm ci --no-audit --no-fund`; TypeScript `--noEmit` con
tsconfig.app.json y tsconfig.spec.json; `npm run build`; `npm test -- --watch=false
--browsers=ChromeHeadless`, con Chrome instalado. **Cliente 30/30, Admin 16/16**.
Builds aprobados sin aumentar budgets. Se conservan advertencias de tamaño y
CommonJS cuando correspondan; no son hallazgos eliminados de audit.

La validación de imágenes, CSP y recorridos con la nueva versión se registra en
RESULTADO.md. Este hito no declara RNF-05/06 completamente aprobados.


## Alcance de los advisories contrastados

La evidencia de este bloque enumera **cada paquete afectado**, sus versiones
realmente instaladas, los rangos/IDs/URLs de advisories propios y los avisos
propagados desde dependencias. Se contrasta también el rango original contra
las versiones finales, además de repetir audit; un advisory indirecto no se
presenta como una vulnerabilidad independiente de código propio.

Los ocho nodos de producción por portal pertenecían a Angular. Core/Common y
Router se ejecutan en el navegador; DatePipe y RouterLink están presentes en las
pantallas, por lo que no se descartan sus avisos por ser una SPA. Compiler y
platform-browser-dynamic están declarados como producción, pero el arranque usa
bootstrapApplication con compilación AOT; no se usa SSR/hidratación ni compilación
de plantillas externas en ejecución. Esto acota la exposición de advisories de
esas funciones; no demuestra que una versión vulnerable sea aceptable. No se
realiza explotación activa de XSS/DoS sobre el producto en este bloque.

Los cuatro críticos estaban **solo en desarrollo/construcción**: piscina bajo
build-angular/@angular/build; proxy-addr bajo Express/webpack-dev-server;
shell-quote bajo launch-editor/webpack-dev-server; tar 6.2.1 bajo pacote/CLI.
Sus cadenas se sustituyen con CLI/builder 22 y resolución compatible. La imagen
final Nginx no contiene Node ni node_modules. No se confunde esa separación con
inmunidad del build: instalar/compilar sigue ejecutando tooling y justifica
corregirlo. Puppeteer-core es conductor de pruebas, no JavaScript servido.

El registro completo, incluidos avisos restantes de las etapas intermedias,
permanece privado; se publica una comparación saneada y reproducible en
PORTALES-CSP-EVIDENCIA.json. Los avisos históricos de backend/dev del 12/11
permanecen fuera del alcance de corrección de este bloque.
