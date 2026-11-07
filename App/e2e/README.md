# Demostración integrada de CU-015

Desde `feature/sebastian`, después de revisar `git status --short --branch`.
Requiere Docker local y Node 22.22.3 para las pruebas. Los builds pesados y las
suites se ejecutan en serie; Playwright usa un trabajador y no reintenta fallos.

Desde la raíz:

```bash
./App/infra/cu015.sh iniciar --datos-demo   # solo primera carga, sobre recursos nuevos vacíos
./App/infra/cu015.sh estado
```

Siguientes arranques: `./App/infra/cu015.sh iniciar`, sin semillas. Detener con
`./App/infra/cu015.sh parar` conserva contenedores y volúmenes. Reutiliza el
preparador central, los Dockerfiles y las guardas de revisión; no reutiliza los
datos de la revisión de arquitectura ni de las referencias A/B.

| Recurso propio | Destino |
|---|---|
| Proyecto, imágenes, volúmenes y red | `hexacore-cu015-sebastian` (prefijo) |
| Portal administrativo | http://cu015.localhost:14221/admin/establecimientos |
| Portal cliente | http://cu015.localhost:14220/pedidos |
| Gateway | http://cu015.localhost:18100/api/v1 |
| Núcleo, prueba directa de autorización | `127.0.0.1:13149` |
| PostgreSQL | `127.0.0.1:15459`, base `hexacore_cu015` |
| Redis | `127.0.0.1:16404` |
| AMQP / consola | `127.0.0.1:15699` / `:16799` |
| Boletería / Trabajador / pasarela / correo | `:13147` / `:13140` / `:13139` / `:13138` |
| Claves, bloqueo y configuración privados | `App/infra/revision/.estado-cu015/`, ignorado por Git |

Los puertos son solo loopback. Las cookies de `cu015.localhost` quedan separadas
de `revision.localhost` y `localhost`. Portales administrativo y cliente usan
contextos de navegador independientes. Se verifican rama, checkout propietario,
redes, volúmenes, montajes, SQL, Redis, broker, proveedores y puertos antes de actuar.
Una carga parcial `EN_CURSO` bloquea escritores; no se repiten semillas sobre ella.

## Navegador visible y ejecución automática

Desde `App/e2e`, con las cuentas demo existentes de Identidad y su contraseña
indicada en la [guía de revisión](../infra/revision/README.md). La contraseña se
lee localmente; no guardar tokens, contraseñas ni storageState en el repositorio.

```bash
npm ci
npx playwright install chromium
read -s CU015_CLAVE_DEMO
export CU015_CLAVE_DEMO
npm run tipos
npm run test:cu015:visible     # navegador abierto
npm run test:cu015            # ejecución automática
npm run informe              # informe HTML local
```

El runner rechaza destinos ajenos: URLs y proyecto están fijados, valida las
etiquetas y la configuración efectiva del entorno CU-015. Crea un recinto y un
evento propio mediante las API reales de CU-029/026, luego registra/edita el
establecimiento mediante la interfaz. Valida persistencia al recargar, duplicados,
datos inválidos, horario, estado, catálogo y checkout desde un menú abierto antes
del cierre. No hay mocks ni interceptores de la API de negocio, ni pausas fijas.

Para probar el efecto en un pedido se inserta **un producto propio** como fixture:
CU-012 aún no tiene CRUD completo. Se prepara por primera vez el inventario de ese
nuevo establecimiento y se usa el checkout, Redis, pasarela, confirmación y QR
reales de CU-011. No se sobrescribe stock de otros establecimientos. Al cerrar,
el pedido confirmado se compara íntegramente y permanece idéntico. Cada ejecución
usa nombres/UUID nuevos; conserva sus datos y no borra los de nadie.

La segunda prueba comprueba Organizador/Administrador, 401/403 por gateway y
Núcleo, duplicados concurrentes, datos inválidos, evento inexistente/cancelado y
la asignación/revocación de Personal por establecimiento.

Informe en `.evidencia/informe/index.html`, capturas en `.evidencia/resultados/`
y trazas retenidas cuando falla una prueba. Las trazas pueden contener respuestas
de login y cabeceras: son privadas y todo `.evidencia/` está excluido de Git.
Para inspeccionar una: `npx playwright show-trace RUTA_PRIVADA/trace.zip`.
Configuración basada en la [documentación de Playwright Test](https://playwright.dev/docs/test-configuration)
y su [visor de trazas](https://playwright.dev/docs/trace-viewer-intro).

## Persistencia, regresión y verificaciones

Desde `App/backend`, después de `npm ci`:

```bash
npm run lint
npm run build
npm run test:cu015:migracion
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16404 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16404 npm test -- --runInBand
npm run verificar:infra
```

En cada portal Angular se puede ejecutar además `npm test -- --watch=false
--browsers=ChromeHeadless`, con `CHROME_BIN` apuntando al ejecutable local de Chrome.

La prueba de migración crea dos bases nuevas de nombre aleatorio en el PostgreSQL
propio, tras validar propietario, etiquetas y puerto. Una instala las 26
migraciones; la otra instala primero las 25 anteriores, inserta establecimiento,
producto, pedido y detalle propios, aplica CU-015 y compara las filas anteriores.
En ambas comprueba repetición sin DDL, 18 procedencias originales y cero tablas
en public. Las bases quedan para inspección; nunca toca las referencias A/B.

La regresión original de CU-011 se ejecuta sobre **otro proyecto nuevo**,
reutilizando su suite completa y las definiciones de recursos existentes:

```bash
# Desde la raíz, liberar memoria de las apps propias antes de la regresión:
./App/infra/cu015.sh parar
cd App/backend
npm run build
npm run test:cu015:regresion
cd ../..
./App/infra/cu015.sh iniciar
```

`hexacore-cu015-regresion` usa su propia red, volúmenes y PostgreSQL/Redis/broker;
los puertos `15439/16384/15679/16779/13105/13106/13087` deben estar libres.
El runner valida propietario/checkout, puertos y destinos, no adopta recursos de
otros proyectos y solo hace stop al terminar. No inicia los proyectos de referencia.
La suite crea y elimina únicamente sus fixtures y prueba pagos, compensaciones,
idempotencia, sesiones, revocación, HMAC, mensajería y cierre SIGTERM. Su fixture
ahora crea también un evento en la autoridad vigente; no se quitan aserciones.

Resultados realmente ejecutados, incidencias y alcance:
[PLAN-CIERRE-SEBASTIAN](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

## Pantallas y navegación para Usabilidad

Login Organizador/Administrador → menú Operación → **Establecimientos** → elegir
evento → listado completo → Nuevo establecimiento / Editar → guardar → confirmación
visible. Cada fila conserva contacto, entrega, horario/zona, estado y recepción
efectiva. Deshabilitar/Habilitar no borra la ficha. El selector de evento queda en
la URL para conservar la navegación al recargar. Las etiquetas de formulario,
botones deshabilitados, errores `role=alert` y confirmaciones `role=status` permiten
usar teclado y lectores de pantalla. En móvil el formulario pasa a una columna y
la tabla admite desplazamiento horizontal.

Cliente autenticado → `/pedidos?eventoId=UUID` → establecimientos disponibles → menú
→ checkout → pago → QR. Un menú abierto antes del cierre informa el rechazo sin
crear un pedido nuevo. Sebastián documenta estas pantallas; Daniel consolida la
validación global de Usabilidad. No se afirma cumplimiento global RNF con este recorrido.
