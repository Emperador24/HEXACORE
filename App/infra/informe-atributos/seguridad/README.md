# Reproducir Seguridad RNF-05 / RNF-06

Ensayo local de Sebastián. Resultados y límites: [RESULTADO.md](RESULTADO.md),
[INVENTARIO.md](INVENTARIO.md), [EVIDENCIA.json](EVIDENCIA.json).
El informe del 28 de octubre es histórico; estos scripts no ejecutan su arnés
de rendimiento/disponibilidad.

## Preparación

Usar `feature/sebastian`, Node **22.22.3**, dependencias bloqueadas existentes y
Docker. Seguir primero [la alternancia](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md):
registrar IDs/estados iniciales, detener solo Redash activo y reanudar el perfil
propio CU-015. Nunca mantener ambos proyectos activos para las pruebas.
El ensayo no arranca proyectos ni recupera capacidad de otros proyectos.

Si cambian fuentes, reconstruir únicamente sus componentes con `cu015.sh iniciar
--compilar ...`, sin `--datos-demo`. La preparación de esquema es idempotente;
no ejecutar semillas ni cambiar claves. Las correcciones de Ventas requieren
actualizar conjuntamente su guarda y los adaptadores de Postventa.

Desde la raíz del repositorio:

```bash
umask 077
export SEGURIDAD_SALIDA="$PWD/App/infra/informe-atributos/seguridad/.privado/ensayo-$(date -u +%Y%m%dT%H%M%SZ)"
export SEGURIDAD_DESDE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$SEGURIDAD_SALIDA"
git check-ignore "$SEGURIDAD_SALIDA/control"
npm --prefix App/backend run build
npm --prefix App/backend run build:boleteria
node App/infra/informe-atributos/seguridad/inventario.cjs "$SEGURIDAD_SALIDA/inventario-final.json"
node App/infra/informe-atributos/seguridad/preparar.cjs > "$SEGURIDAD_SALIDA/preparar.log" 2>&1
```

`preparar.cjs` valida checkout/proyecto/puertos, exige Redash detenido y proveedores
simulados. Crea seis cuentas **nuevas** `SEG-*` con contraseña aleatoria privada,
cuatro roles fijos existentes, evento/local/producto/pedido propios por API.
Solo inserta sus cuentas en Identidad; no altera las cuentas demo ni resiembra.
`fixture.json` contiene credenciales: conservarlo exclusivamente en la carpeta
ignorada. Si ya existe, se rechaza otra preparación; reutilizar esa fixture.
No configurar Stripe/SMTP real. No se necesita revelar `CU015_CLAVE_DEMO`.

## ZAP y las tres pasadas

Descargar la imagen oficial fijada antes de analizar; la descarga no escanea
servicios externos:

```bash
docker pull ghcr.io/zaproxy/zaproxy@sha256:0b8847b2c722b16f0964431aabcbb499560a1f17e8698d52326d82db29efac1d
python3 App/infra/informe-atributos/seguridad/zap-entorno.py iniciar
python3 App/infra/informe-atributos/seguridad/finales.py > "$SEGURIDAD_SALIDA/finales.log" 2>&1
node App/infra/informe-atributos/seguridad/almacenamiento.cjs > "$SEGURIDAD_SALIDA/almacenamiento.log" 2>&1
node App/infra/informe-atributos/seguridad/base-datos.cjs > "$SEGURIDAD_SALIDA/base-datos.log" 2>&1
python3 App/infra/informe-atributos/seguridad/procedencia.py
python3 App/infra/informe-atributos/seguridad/resumir.py
```

`iniciar` es solo para la primera creación del escáner. Si ya existe el escáner
conservado por esta entrega, reutilizar su estado privado sin borrar evidencias.
Crear una carpeta de salida nueva como arriba y, antes de preparar fixtures,
copiar únicamente estos dos archivos desde el ensayo previo (no imprimirlos):

```bash
cp "$SEGURIDAD_ANTERIOR/fixture.json" "$SEGURIDAD_SALIDA/fixture.json"
cp "$SEGURIDAD_ANTERIOR/zap-entorno.json" "$SEGURIDAD_SALIDA/zap-entorno.json"
python3 App/infra/informe-atributos/seguridad/zap-entorno.py reanudar
```

Definir `SEGURIDAD_ANTERIOR` con la carpeta privada anterior, omitir `preparar.cjs`
y sustituir `iniciar` por `reanudar`. Así se conservan cuentas/datos y los tres
resultados anteriores; `finales.py` escribe únicamente en la carpeta nueva.
No usar un estado privado de otro proyecto/checkout.

La imagen es **ZAP 2.17.0, arm64**. El contenedor tiene límite propio de 640 MiB,
heap 384 MiB y una CPU; no cambia recursos globales. Se conecta únicamente a una
red Docker **internal**, con el gateway y los dos portales propios. No tiene
salida a Internet ni acceso a redes de Redash. La API se opera por `docker exec`,
sin publicar un puerto de control. La clave aleatoria queda privada.
Tras reconstruir un objetivo existente usar `zap-entorno.py reanudar`: reconecta
solo esos tres objetivos, comprobando sus etiquetas.

Cada pasada ejecuta, en serie: memoria antes → matriz HTTP → audit de cinco
paquetes → ZAP → memoria después. No cambia fuentes, usa un único flujo y no
reintenta pruebas fallidas. El runner rechaza sobrescribir las tres pasadas.
Un fallo de control interrumpe la secuencia para diagnosticarlo. `npm audit`
con hallazgos devuelve 1; se conserva y se continúa con las mediciones restantes.
**Código final 1 no es aprobación.** El 0 de ZAP significa revisión terminada,
no ausencia de alertas; revisar siempre riesgos y cobertura.

La matriz cubre las 159 rutas protegidas en gateway/directo: sin token, inválido,
caducado, revocado; cabeceras falsas; HEAD directo; 117 rutas con rol fijo
incorrecto; internas sin credencial y con JWT de usuario; propiedad de pedido y
vínculo de Personal; renovación/replay; PAN sintético por HTTP. Usa datos propios,
no envía cuerpos válidos de mutación en las pruebas negativas de autorización.

ZAP conserva sus **62 reglas pasivas habilitadas**, sin suprimir alertas.
Recoge HTML/login/assets iniciales de ambos portales y lecturas API sin sesión
y con sesión de Cliente/Personal: perfil, pedido propio y menú propio (tres 200
autenticados fuera de login). No ejecuta JavaScript, no representa navegación
autenticada completa de las SPA y **no ejecuta scanner activo ZAP**. La matriz
HTTP es el ensayo activo acotado de autorización. Fuzzing SQLi/XSS, arañas,
mutaciones autenticadas generales, proveedores externos y datos de terceros
quedan excluidos; ampliar esa cobertura requiere contextos/fixtures adicionales.

## Regresiones y exportación

```bash
node --test --test-concurrency=1 App/infra/informe-atributos/seguridad/gateway.test.cjs App/infra/informe-atributos/seguridad/correo-stream.test.cjs App/infra/informe-atributos/seguridad/timeout.test.cjs
node App/infra/informe-atributos/seguridad/pan-contrato.cjs
npm --prefix App/backend test -- --runInBand --testPathPatterns='token-pago|finanzas/pagos|stripe.controller|autorizacion-pagos|adaptadores-pagos|alimentos/pagos|alimentos/catalogo|enviador-correo|sesion-valida.guard|cookie-renovacion'
npm --prefix App/backend test -- --runInBand --testPathPatterns='llamada-interna.guard|cliente-ventas.service|entradas-internas.service|postventa/publicacion|postventa/checkout'
npm --prefix App/backend run lint
```

La comparación de DTO evalúa únicamente los DTO de `82bac77` frente al compilado
actual, sin bases ni proveedores. El correo usa transporte real de Nodemailer
en memoria, sin red. No repetir aceptación funcional/Playwright por documentación.

`procedencia.py` obtiene versiones, revisiones de imágenes y ocho hashes de
archivos mediante lectura de los contenedores (también funciona detenidos).
Exige coincidencia con el compilado/fuentes locales. `resumir.py` selecciona los
campos de las tres pasadas: revisar siempre el diff antes de publicar. Nunca
copiar los JSON crudos de ZAP/audit, sesiones, cookies, cuerpos, QR o logs.

## Restauración obligatoria

Aunque existan fallos:

```bash
python3 App/infra/informe-atributos/seguridad/zap-entorno.py parar
./App/infra/cu015.sh parar
```

Después seguir la guía de alternancia para arrancar **solo** los contenedores
Redash que estaban activos inicialmente: PostgreSQL/Redis y luego aplicaciones,
comprobando `/ping` y `/login`. No repetir reinicios ante OOM. Conservar los
volúmenes, las salidas privadas y los estados inicialmente detenidos. ZAP queda
detenido y desconectado de los objetivos. La red aislada y el contenedor del
escáner se conservan; no se borran datos. Informar por separado estados Docker
y accesibilidad HTTP.


## Bloque portales y CSP — 13/11/2026

La migración y exposición por dependencia están en [MIGRACION-ANGULAR.md](MIGRACION-ANGULAR.md);
la política y configuración de despliegue, en [CSP.md](CSP.md). Usar el Node
22.22.3 fijado, sin cambiar el backend. En cada portal, en serie:

```bash
npm ci --no-audit --no-fund
npx tsc --noEmit --project tsconfig.app.json
npx tsc --noEmit --project tsconfig.spec.json
NG_BUILD_MAX_WORKERS=1 npm run build
CHROME_BIN="/ruta/al/chrome" npm test -- --watch=false --browsers=ChromeHeadless
```

Tras alternar y conservar el estado inicial como indica la guía, reconstruir
solo lo necesario (sin semillas):

```bash
./App/infra/cu015.sh iniciar --compilar portal-web-cliente portal-web-admin api-gateway
```

Para la regresión normal instrumentada, con salida nueva e ignorada, cuentas
existentes en `App/e2e/.env.local` y proveedores simulados:

```bash
export HEXACORE_COMPROBAR_CSP=1
export CSP_EJECUCION=negocio-automatico
node --env-file=App/e2e/.env.local App/e2e/node_modules/@playwright/test/cli.js test --config=App/e2e/playwright.csp.config.ts
export CSP_EJECUCION=negocio-visible
node --env-file=App/e2e/.env.local App/e2e/node_modules/@playwright/test/cli.js test --config=App/e2e/playwright.csp.config.ts --headed
```

`SEGURIDAD_SALIDA` debe estar definida como arriba. No publicar los informes ni
su consola: pueden contener identificadores/URLs de ensayo. Se descubren los
mismos 16 casos; no hay modo demo, plazos ampliados o reintentos. La prueba
histórica de reventa de `portal-web-cliente/pruebas/reventa-portal.mjs` no se
invoca: resembra y borra reservas; sus supuestos no son adecuados a este ensayo.
La navegación de lectura de Reventa/Entradas/Parqueadero sí se comprueba abajo;
no equivale a sus procesos de negocio completos.

Reutilizar fixture/scanner como arriba, sin resembrar ni sobrescribir anteriores.
Para las tres mediciones **solo de portales/CSP**, con Redash detenido:

```bash
python3 App/infra/informe-atributos/seguridad/zap-entorno.py reanudar
python3 App/infra/informe-atributos/seguridad/portales-finales.py
```

El runner verifica Node, imagen/configuración y huella de todos los assets en
cada pasada; mantiene las imágenes iguales. Ejecuta memoria → salud/login →
audit producción y completo de ambos portales → control CSP/browser con 13
rutas autenticadas/renovación → ZAP pasivo HTTP → memoria. Renueva credenciales
privadas de prueba, no cambia contraseñas. ZAP conserva reglas/alertas y las tres
lecturas autenticadas 200 fuera de login; no se ejecuta DAST activo. La espera
de disponibilidad de su API al arrancar es acotada a 30 s, sin repetir escaneos.

No ejecutar `finales.py` para este bloque: repetiría matrices ajenas al cambio.
Al terminar detener/desconectar el scanner con `zap-entorno.py parar`, detener
CU-015 por su script y restaurar únicamente los estados iniciales de Redash.
Si Docker Desktop estaba apagado inicialmente, restaurar también ese estado.


La exportación de esta sesión, que conserva también las pasadas fallidas y los
advisories anteriores, se genera con `resumir-portales.py` a partir de los
archivos privados originales. Publica exclusivamente campos seleccionados en
`PORTALES-CSP-EVIDENCIA.json`; no reemplaza `EVIDENCIA.json` histórico. Las tres
mediciones futuras de `portales-finales.py` son reproducibles por separado;
no hace falta recrear los fallos históricos para comparar sus resultados.
