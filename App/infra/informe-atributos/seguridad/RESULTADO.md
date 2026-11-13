# Seguridad de Sebastián — RNF-05 y RNF-06


## Portales, dependencias y CSP — 13/11/2026

**Bloque comprobado con residuos explícitos; RNF-05/06 completos: NO.**
Referencia **7457e7b**, [CI 43214215628, 8/8](https://github.com/Emperador24/HEXACORE/actions/runs/43214215628).
Inicio limpio en feature/sebastian, referencias remotas contrastadas; develop
41ca881, PR #50 abierto, sin integrar ramas. Se conserva íntegro el registro del
12/11 debajo. No se reabre SIGTERM: su causa sigue desconocida.

Hitos: **ca413fc**, migración coordinada y resolución compatible; **4487b16**,
CSP efectiva/configuración y regresión comprobada. Las tres finales usan **4487b16**.
Las modificaciones posteriores de resumen/documentación no cambian fuentes de
las aplicaciones ni justifican repetir negocio. Solo se publican fuentes y
[evidencia saneada del bloque](PORTALES-CSP-EVIDENCIA.json); informes, sesiones,
configuración local, capturas/QR y trazas quedan ignorados.

### Versiones, exposición y comparación de dependencias

Angular framework/core/compiler **22.2.6**; CLI/build-angular, Material/CDK
**22.2.7**; TypeScript **6.0.3**. Node de herramientas/imágenes frontend conserva
**22.22.3**, npm **10.9.8**. No se cambia el runtime ni las dependencias backend.
Se elige la rama estable activa soportada y se ejecutan migraciones oficiales
**19→20→21→22**, con versiones compatibles intermedias. Se conservan Zone.js,
Jasmine/Karma y la detección anterior mediante `ChangeDetectionStrategy.Eager`.
[Compatibilidad oficial](https://angular.dev/reference/versions),
[soporte](https://angular.dev/reference/releases),
[migraciones y cadenas concretas](MIGRACION-ANGULAR.md).

| Portal | Producción inicial | Completo inicial (incluye producción) | Producción final, cada pasada | Completo final, cada pasada |
|---|---|---|---|---|
| Cliente | 4 altos + 4 moderados | 4 críticos + 32 altos + 29 moderados + 2 bajos = 67 | **0** | **0** |
| Admin | 4 altos + 4 moderados | 4 críticos + 23 altos + 29 moderados + 2 bajos = 58 | **0** | **0** |

Los 67/58 paquetes auditados se contrastaron con instalación y lock, sin nodos
ausentes. La evidencia enumera advisories propios con ID/URL/rango, propagados,
versiones instaladas y condición dev/producción. **154 comparaciones** de los
rangos originales contra versiones finales: **cero coincidencias vulnerables**;
no se depende solamente de que el registro siga publicando el mismo advisory.
Son conteos de paquetes npm, no incidentes independientes ni demostraciones de
explotación. Core/Common/Router tienen uso en navegador; compilador/AOT y
funciones no usadas como SSR acotan exposición, sin justificar conservar una
rama sin soporte. Los avisos dev del backend del 12/11 no se eliminan ni se
reanotan como medidos en este bloque.

Críticos de construcción/desarrollo corregidos por sus padres o rangos compatibles:
piscina **4.8.0→5.3.2**, proxy-addr **2.0.7→2.0.8**, shell-quote
**1.10.0→1.12.0**; tar **6.2.1** y su cadena antigua desaparecen. No queda tar en
los locks finales. Puppeteer-core del Cliente **23.11.1→25.17.0** y transitivas
Karma/HTTP se resuelven de forma dirigida. No hay `audit fix --force`, ignores u
overrides. Nginx final no contiene Node/node_modules; eso no exime al tooling del
build. Antes de resolver transitivas tras migrar: Cliente 16/Admin 6 avisos,
conservados como etapa intermedia, sin presentarlos como resultado final.

### CSP aplicada y hallazgos residuales

Ambos portales envían **Content-Security-Policy efectiva**, sin Report-Only,
unsafe-inline/unsafe-eval o comodines para ejecución/conexión. Nonce de 128 bits
por respuesta, compartido con `ngCspNonce`; HTML no-store, nuevo nonce al recargar.
Se desactiva CSS crítico/fuentes inline de build y se trasladan colores estáticos
a clases, conservando el aspecto comprobado. Material/CDK usa nonce; estilos
Angular dinámicos se comprueban en negocio. Gateway protege también sus errores
propios. Orígenes API/buzón exactos por perfil, fuentes existentes y doble local
de SDK/iframe de tokenización. [Política y despliegue](CSP.md).

| Familia ZAP | Referencia Angular 19 | Cada final Angular 22 | Clasificación / acción |
|---|---:|---:|---|
| 10003, componente vulnerable | 2 altos | **0** | Angular soportado/corregido servido en ambos portales |
| 10038, CSP ausente | 4 medios | **0** | Cabecera efectiva y bloqueo comprobado en navegador |
| 10055, fuente amplia CSP | 0 | **2 medios** | `img-src` Cliente admite imágenes HTTP/HTTPS del contrato de eventos. No habilita scripts/conexiones. Acordar hosts o proxy antes de reducir esa amplitud |
| 90003, falta SRI | 0 | **8 medios** | Dos hojas Google Fonts × raíz/login × dos portales. Se vuelven visibles al dejar de insertarse en build. Confianza residual en CSS externo: versionar fuentes locales/licencias o recursos inmutables con SRI real |
| 10109, SPA moderna | 4 informativos | **4 informativos** | Detección estructural, no una aprobación ni vulnerabilidad demostrada |

**Cero altos/críticos en estas finales ZAP; diez instancias medias y cuatro
informativas permanecen.** No se suprime ninguna de las 62 reglas ni se añaden
permisos para aparentar cierre. No se coloca SRI ficticio sobre CSS variable por
agente. Los orígenes amplios de imágenes se documentan como residuo, no como CSP
sin limitaciones. El doble del SDK prueba permiso de script/iframe y token opaco
sintético; no acredita Stripe real, productos adicionales o todos sus dominios.
No se activa Stripe/Gmail ni se escanean proveedores o despliegues remotos.

### Tres mediciones finales comparables, sin promedios

Playwright **1.65.0**, Chromium/headless-shell **158.0.8127.18**, revisión 1254
(binarios comprobados); ZAP **2.17.0 arm64**, digest fijado anterior. Python
**3.14.0**, Docker **29.7.2**. Cada pasada usa las mismas tres imágenes y huellas
de todos los assets/Nginx. Cliente imagen **9a11f99348c6**, Admin **6835120c95f0**,
gateway **6b4afcd4892f**; IDs completos y hashes en evidencia. Sus etiquetas dicen
**ca413fc/fuente modificada=si** porque se construyeron antes del commit CSP;
no se usan esas etiquetas como falsa prueba de correspondencia con 4487b16.
Se contrastan Nginx ejecutado y fuentes, assets idénticos entre pasadas y versión
Angular real del DOM. Backend conserva sus imágenes funcionales anteriores.

| Final — inicio UTC | Audit producción/completo, Cliente y Admin | Navegación / renovación | ZAP | Resultado del bloque |
|---|---|---|---|---|
| 1 — 12:21:47.528594 | **0/0 en ambos** | 13 rutas / 13 renovaciones 200; cero CSP inesperadas/errores JS | 0 altos; 10 medios; 4 informativos | Con residuos, sin cumplimiento RNF completo |
| 2 — 12:22:17.880301 | **0/0 en ambos** | 13 rutas / 13 renovaciones 200; cero CSP inesperadas/errores JS | 0 altos; 10 medios; 4 informativos | Con residuos, sin cumplimiento RNF completo |
| 3 — 12:22:43.366687 | **0/0 en ambos** | 13 rutas / 13 renovaciones 200; cero CSP inesperadas/errores JS | 0 altos; 10 medios; 4 informativos | Con residuos, sin cumplimiento RNF completo |

Por pasada: **23 solicitudes ZAP**, **tres 200 autenticados fuera de login**,
62 reglas habilitadas y cero pendientes. Mismo alcance que referencia: cuatro
HTML raíz/login, todas las referencias JS/CSS iniciales locales y ocho lecturas
API con/sin sesión. Los assets iniciales pasan de 21 a 11 por el build nuevo;
por eso cambia el total 33→23, no por quitar rutas/reglas. ZAP no ejecuta JS ni
navega todos los chunks lazy; el control browser separado carga siete rutas
Cliente y seis Admin, pero tampoco acredita negocio completo de todas ellas.
DAST activo y ampliación semántica de autorización quedan separados.

Las dos sondas inline se bloquean **por portal/pasada** y se registran aparte de
las violaciones inesperadas. Cliente muestra 401 de renovación antes de login
sin cookie (comportamiento inicial); después hay siete renovaciones 200. Admin
registra seis 200. Consola y respuestas HTTP completas quedan privadas.

Memoria VM KiB, antes→después: final 1 **955.120→943.008**, final 2
**941.068→923.812**, final 3 **928.744→924.196** disponibles. Swap libre VM:
**473.572→468.400**, **468.400→466.988**, **466.988→461.428** KiB. Porcentajes
libres de memory_pressure host: **50→43, 42→45, 45→44**; swap host y fechas
individuales se conservan en evidencia. Esto describe condiciones, no un ensayo
de rendimiento/disponibilidad.

### Instalación, regresión y fallos conservados

- Ambos portales: `npm ci` reproducible; tipos app/spec; builds y nuevas imágenes
  aprobados; `nginx -t` **3/3**. Unitarias **30/30 Cliente y 16/16 Admin** con
  ChromeHeadless 157.0.0.0. Se conservan budgets y advertencias de tamaño/CommonJS.
- Guarda infraestructura **14/14**, tipos E2E y sintaxis de herramientas aprobados.
- Primera ejecución automática **15/16**, sin omisiones: CU-029 no muestra plano,
  **tres violaciones img-src blob**. Causa comprobada: Object URLs existentes
  del plano/previsualización. Se permite blob solamente en imágenes Admin, sin
  tocar script/frame/worker. Nueva imagen Admin; CU-029 específico **1/1**.
- Después de esa corrección: **16/16 automático**, 12:12:53.530 UTC, 132,066 s;
  **16/16 visible**, 12:15:06.088 UTC, 151,574 s. **27 contextos en cada uno,
  cero violaciones CSP y cero errores JavaScript**. 16 descubiertos en siete
  archivos; un trabajador, cero reintentos, límites normales 120 s/15 s.
  Incluye compra, preparación, cancelación, entrega, QR/avisos, recuperación,
  cuentas y recintos. El modo demo y su presupuesto no se usan ni se cambian.
- El control adicional inicialmente esperaba networkidle en Parqueaderos y
  agotó 15 s por su SSE. Se corrige **solo el arnés**: pantalla visible y flujo
  activo, mismo plazo. Aprobó; no se repite el negocio por esa modificación.
- Primer ZAP de referencia encontró API aún sin escuchar al arrancar; se conserva
  fallo privado. Tras comprobar disponibilidad se obtuvo referencia completa.
  El helper ahora espera API hasta 30 s al arrancar, sin reintentar escaneos.
- La prueba antigua de Reventa resembra y borra reservas: **no ejecutada**.
  Lectura de Reventa/Entradas/Parqueadero bajo CSP sí comprobada; no se declara
  aceptación de sus procesos completos ni renovación financiera global/F12.

### Alternancia y restauración

Docker Desktop estaba **apagado** al inicio. Tras iniciarlo sin cambiar recursos,
se registraron CU-015 detenido y siete Redash activos. Se detuvieron solo esos
siete: scheduler terminó **137/OOM=false** tras 120 s; no se presenta como cierre
ordenado. Su marca no es el OOM histórico del worker; no se investigó ni reinició
repetidamente. HEXACORE se reanudó con proveedores simulados; se reconstruyeron
solo portales/gateway y se aplicó preparación idempotente sin semillas. Datos,
cuentas, contraseñas, volúmenes y 18 procedencias históricas intactos.

Al finalizar ZAP se detuvo/desconectó y CU-015 se detuvo por su script (código 0).
Se reanudaron una sola vez los **siete IDs originales Redash**, primero PG/Redis,
listos/PONG; durante arranque hubo resets y un timeout. Últimos controles con
los siete activos: **/ping 200 y /login 200**, cgroup `oom_kill=0` en los siete.
Se comprobaron imágenes y montajes iguales a los iniciales, sin reinicios de
recuperación. Después **Docker Desktop se apagó correctamente para restaurar
el estado inicial**. Por ello Redash no se ofrece activo al final con el motor
apagado: el HTTP 200 corresponde al último control previo, no disponibilidad
continua. No se intervienen otros proyectos o recursos globales.
[Guía de alternancia](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md).

Pendientes: imágenes externas/SRI concretados arriba; cobertura semántica y DAST
activo más amplios, CU-028 Samuel, correspondencia RNF-05/CU-024 y F12 separados.
No se añaden funcionalidades ni se presenta este bloque como RNF-05/06 global
aprobado. CI del nuevo commit se informa en PR #50, separada de estos resultados
locales y de la intermitencia SIGTERM desconocida.

## Registro histórico conservado — 12/11/2026

**12/11/2026, UTC (Bogotá UTC−5). Cumplimiento completo: NO.** Se corrigen
hallazgos demostrados y se publica evidencia reproducible; permanecen bloqueos
de dependencias, CSP y cobertura semántica. No confundir una matriz de acceso
aprobada con la aprobación de todos los requisitos de Seguridad.

## CI posterior y ajuste de contrato de prueba

[CI 43211225540](https://github.com/Emperador24/HEXACORE/actions/runs/43211225540)
en **3c9e0b4**: siete trabajos aprobados y fallo del octavo en contratos financieros.
**12/13 contratos aprobados** en la primera pasada; segunda no ejecutada. Causa
comprobada: la aserción esperaba `/TimeoutError/`, pero RNF-05 ahora devuelve el
mensaje propio **“No hubo respuesta de la pasarela (tiempo agotado)”**, observado
en la respuesta real. Estado INDETERMINADO y contadores de intentos pasaban.
Se cambia únicamente esa expectativa a igualdad exacta, conservando los demás
controles; no se cambia comportamiento, plazos, reintentos o estado del producto.

Dos controles adicionales **1/1 + 1/1** verifican la categoría propia y ausencia de
PAN/CVV en respuesta/log: Error sintético del contexto Jest y DOMException nativo
en Node real, sin proveedor/red. El primer intento usando el DOMException nativo
desde otro contexto V8 de Jest se conserva como fallo del doble: se clasificó
como comunicación. No se cambia el producto por ese artefacto; el caso nativo se
comprueba en el proceso Node correspondiente. Las ocho pruebas previas ya
verificadas no se repitieron localmente; se filtró solo el caso nuevo.

En esa misma CI aprobaron **1.038/1.038 unitarias**, Boletería **23/23 en cada una
de dos pasadas** y Núcleo **122/122 en cada una de dos pasadas**. Esto no demuestra
resuelta la intermitencia SIGTERM. La nueva CI del ajuste se registra en el PR;
no sustituye ni las finales de Seguridad con bloqueos ni este fallo histórico.

## Referencia, fuentes y entorno

- Inicio limpio en `feature/sebastian`, local/remoto **82bac776abe0566483d7a8641aa293c1fa5ab322**;
  fetch conservó develop en **41ca881b1248970b226aef789efec353f41feecf**. Sin integrar ramas.
- Referencia GitHub: [43144806561](https://github.com/Emperador24/HEXACORE/actions/runs/43144806561),
  **8/8** en 82bac77. Referencia funcional independiente: **16/16 automático y
  16/16 visible con Redash detenido**. No se repitió Playwright.
- Correcciones: **4aad53f** (catálogo/datos de pagos/dependencias), **e5c6ba7**
  (credencial interna, adaptación de llamantes, cabeceras y traducción 401).
  Las tres finales usan fuentes funcionales **e5c6ba7**, SHA completo en
  [EVIDENCIA.json](EVIDENCIA.json). El commit posterior de herramientas/documentación
  no cambia esas fuentes funcionales.
- Perfil único `hexacore-cu015-sebastian`: once servicios, preparación finita
  adicional detenida. Proveedores de pago/correo **simulados**; seis cuentas y
  evento/local/producto/pedido `SEG-*` exclusivos. No se alteraron cuentas demo,
  contraseñas, dependencias de otros proyectos, volúmenes o recursos globales.
- Node **22.22.3**, npm **10.9.8**, Python **3.14.0**, Docker **29.7.2**,
  ZAP **2.17.0** arm64, Angular servido **19.2.25**. Imagen ZAP fijada por digest
  en la guía y evidencia. Ocho hashes de archivos ejecutados coinciden con el
  compilado/configuración actuales. Núcleo/Trabajador/portales/gateway conservan
  etiqueta de construcción 4aad53f; Boletería e5c6ba7. Las cabeceras/njs se
  construyeron con cambios locales después incorporados a e5c6ba7: la etiqueta
  sola no acredita igualdad; se publican los hashes comprobados.

El informe de atributos del **28 de octubre es histórico**, no evidencia de esta
arquitectura. Tampoco se reabrió SIGTERM: siguen registrados el 7/8 y el posterior
8/8, con causa desconocida. No se modifican su arnés, cinco segundos o hooks.

## Hallazgos y comparación

| Hallazgo confirmado | Riesgo contextual | Antes | Después / pendiente |
|---|---|---|---|
| Catálogo Alimentos sin guarda propia | Medio; acceso directo al backend y lectura con sesión revocada por gateway | Dos GET devolvían 200 sin token/cabeceras falsas; revocado también 200 | `SesionValida` en catálogo, sin restringir roles de consulta. Ambos canales rechazan credenciales inválidas/revocadas |
| API interna Ventas acepta cualquier JWT de usuario | Alto si se alcanza Boletería directamente; el cuerpo declara propietario | Cliente distinto obtiene 200 en `GET /interno/entradas/de/:propietarioId`; el controlador no liga ese propietario al JWT | Las cuatro operaciones exigen credencial de servicio. Cliente/Administrador y cabeceras falsas no la sustituyen; adaptación HTTP/local de Postventa |
| Cinco DTO admiten PAN como token | Alto como ingreso indebido de datos sensibles | Comparación ejecutable de 82bac77: 5/5 admiten PAN sintético | 0/5 lo admiten. Solo formatos opacos `tok_*`/`pm_*`; se rechazan PAN, CVV/JSON y campos adicionales |
| Texto remoto de pagos pasa a logs/resultados persistibles | Alto si el proveedor repite datos de tarjeta | 6/7 controles sintéticos fallaron: cuerpos HTTP, motivo/estado/excepción/referencia se propagaban | 8/8 controles del adaptador dentro de la regresión aprobada; mensajes propios, referencias con formato y motivos webhook cerrados. Mismos estados financieros |
| Revocación durante consumo de turno se convierte en caída | Bajo; fallo de clasificación, sin permitir compra | Con turno válido: backend 401, gateway 503 `COLA_NO_DISPONIBLE` | Gateway conserva 401; no cambian rechazo de turno inexistente ni fallos de proveedor |
| Clickjacking, MIME y divulgación de versión/capa | Medio/bajo según alerta | ZAP 10020: 4; 10021: 30; 10036: 31; 10037: 6 instancias | `DENY`, `nosniff`, política de referente, ocultación de versión/X-Powered-By. Esas cuatro familias no aparecen en finales |
| CSP ausente | Medio | ZAP 10038, cuatro instancias | **Pendiente**: diseñar CSP compatible con estilos Angular, fuentes y tokenización; no insertar una política que rompa flujos ni una permisiva para silenciar ZAP |
| Componentes Angular vulnerables servidos | Alto por versión; explotación concreta de cada advisory no demostrada | ZAP 10003 en ambos portales y npm audit coinciden en Angular 19.2.25 | **Bloqueo**: migración coordinada a rama soportada y validación de ambos portales; no se suprimen alertas |

La evidencia de la API interna inicial devuelve una colección vacía de la cuenta
fixture: no se afirma exfiltración real ni se probaron mutaciones sobre datos
ajenos. La falta de autorización se confirma además en guarda/controlador. El
control final exige 401 para JWT de Cliente/Administrador en las cuatro rutas y
200 para una lectura con la credencial interna válida. La cola interna conserva
su contrato distinto de sesión y propietario del turno.

## RNF-06: denominador y cobertura

[Inventario completo](INVENTARIO.md), obtenido del grafo real de módulos Nest y
sus controladores compilados, contrastado con `locations`/upstreams del gateway:

| Denominador | Cantidad |
|---|---:|
| Operaciones de controladores (programa + método + plantilla de ruta) | 178 |
| Protegidas | 159 |
| Públicas justificadas | 10 |
| Internas | 5 |
| Webhooks con autenticación propia | 2 |
| Salud de controladores | 2 |
| Operaciones de controlador efectivamente enrutadas por gateway | 172 |
| Expuestas declaradas incluyendo `GET /salud` del propio gateway | **173** |

Las seis no enrutadas son cinco internas y salud directa de Boletería.
`OPTIONS` global es preflight público sin negocio y se registra aparte;
HEAD implícito no duplica GET. `/_auth` es interno de Nginx; Swagger directo
solo no productivo es diagnóstico, no se publica por gateway. No hay rutas sin
clasificar en este inventario.

Login/registro/verificación/recuperación/restablecimiento/renovación, cartelera y
configuración pública de pasarela mantienen sus contratos. No se cerraron para
fabricar cero rutas abiertas. Los webhooks requieren firma propia; el de Stripe
está desactivado localmente (404). Firma Stripe se verifica con dobles unitarios,
no se declara ensayo dinámico del proveedor.

Por **cada** final:

| Control | Comprobaciones |
|---|---:|
| Sin token, inválido, caducado y revocado: 159 rutas × dos canales × cuatro condiciones | 1.272 |
| Cabeceras de usuario falsas en backend directo | 159 |
| HEAD sin token directo | 73 |
| Rol fijo incorrecto: 117 rutas × dos canales | 234 |
| Internas sin credencial y no publicadas por gateway | 10 |
| JWT Cliente/Administrador y credencial de servicio incorrecta en cuatro internas | 12 |
| **Total de la matriz** | **1.760** |

Se observó **0/159** rutas protegidas accesibles con las credenciales negativas
comprobadas. Ese cociente no usa como denominador todas las 173 rutas para
ocultar las excepciones públicas. En rutas con rol previo en gateway, un token
revocado puede recibir 403 antes de llegar al backend; el backend directo exige
401 en las 159. La compra también se prueba con turno válido, sin enmascararla
con la precondición 428.

Adicionales separados, no sumados engañosamente a la matriz: **11/11** controles
positivos/propiedad (Cliente propio/ajeno, Personal propio/otro establecimiento,
perfil y lectura interna acreditada), **8/8** rechazos HTTP de PAN y dos controles
de webhook (HMAC inválido 401 / Stripe desactivado 404).

Cookies: login web 200, HttpOnly, SameSite=Strict, Path=/api/v1/sesiones, sin
refresh en cuerpo; renovación 200 y cookie rotada, replay 401 y revocación del
acceso nuevo 401, cookie sola no sustituye Bearer (401). `Secure=false` corresponde
a HTTP local; la opción de producción `Secure=true` y borrado con el mismo ámbito
se comprueban unitariamente. Ambos portales conservan acceso solo en memoria;
no se introdujo almacenamiento web de tokens.

**Límite de roles:** una ruta permite los cuatro roles fijos y no tiene un rol
fijo incorrecto posible. Otras **41** no tienen metadato explícito de rol: seis
sesión/perfil, cinco con guarda de sesión y treinta con contexto/supervisión de
Logística. Están enumeradas en el inventario. No se cuenta un error de DTO como
prueba de permiso. Las combinaciones de organización/supervisor y propiedad de
todos los demás recursos requieren ampliar fixtures; los dos controles de
propiedad de Alimentos no prueban todas las autorizaciones del sistema.
**CU-028 dinámico sigue pendiente de Samuel**, no queda cubierto por roles fijos.

## RNF-05: recorrido de datos y almacenamiento

Se inspeccionaron DTO, adaptadores, guardado y logs, además de las columnas:

- **Alimentos:** UI web/Flutter usan token de simulador. DTO → PagosService de
  Alimentos → API local de Finanzas → procesador. `transacciones_pedido` conserva
  importe/moneda/resultado/referencia/motivo, no token/PAN/CVV. Pedido/productos,
  precio y cobro originales se conservan.
- **Entradas y reventa:** DTO de pago → cliente de Finanzas → procesador. Compras
  y entradas guardan estado, importes, referencia e historial; no el medio
  completo. En web, el componente Stripe monta el campo del proveedor y obtiene
  un PaymentMethod; se revisó el código y se usaron dobles, sin cargar Stripe real.
- **Parqueaderos:** reserva CU-021 delega el token a Finanzas; CU-024 **liquida
  horas/tarifa/monto**, no implementa captura de tarjeta ni un pago electrónico
  adicional al salir. No se afirma haber verificado un circuito de tarjeta
  inexistente en CU-024; esa correspondencia del requisito queda pendiente de
  aclaración con el responsable, sin añadir un caso de Finanzas.
- **Finanzas:** el libro no guarda el DTO/token de cobro. Se cerraron los campos
  por los que una respuesta remota arbitraria podía terminar en ese libro o
  logs. No se alteran idempotencia, conservación de cobros, incertidumbre o F12.

Pruebas: cinco DTO contra PAN con/sin espacios, CVV y JSON, campos extra;
adaptadores HTTP/Stripe con respuestas y excepciones sintéticas que repiten
PAN/CVV; referencias inválidas y válidas; motivos permitidos del simulador y
rechazo de texto arbitrario de webhook. El Stripe de estos ensayos es un doble,
sin solicitud al proveedor real.

La consulta SQL original de las tres finales revisó **24 tablas / 5.828 filas**,
con cero coincidencias, pero solo cubría Alimentos y Parqueaderos: el arnés usaba
nombres antiguos para Ventas, Postventa y Finanzas. **Se conserva ese resultado
como parcial**, no se atribuye cobertura a esos tres esquemas.

Se corrigió el arnés para derivar los nombres de `GRUPOS_MIGRACIONES` y exigir
presencia de los cinco propietarios/esquemas. El helper compartido por la matriz
y `base-datos.cjs` se ejecutó tres veces contra la misma base, sin escritores,
con únicamente PostgreSQL CU-015 activo y Redash detenido: **43 tablas / 6.441 filas / cero coincidencias en cada una de las tres lecturas**. Resultados exactos,
por esquema y fecha: `complementoSQL` en [EVIDENCIA.json](EVIDENCIA.json). Esta
comprobación posterior complementa las tres finales, no cambia sus matrices ni
borra la observación incompleta. No se repitieron negocio/Playwright/ZAP.

También cero coincidencias del canario en la clave Redis de la fixture y en logs
de los seis componentes propios inspeccionados. La comparación DTO de
82bac77/actual es ejecutable. Esto complementa inspección de código; no es un
detector exhaustivo de PAN ni certifica todos los registros históricos o datos
codificados/almacenamientos posibles.

## Dependencias: producción separada de desarrollo

Cinco paquetes vigentes: backend, ambos portales, E2E de Sebastián y demo
Playwright de Samuel. PoC-04 es histórico, no se instala/ejecuta en esta arquitectura
y se excluye expresamente. Flutter usa pub, no npm; no se mezcla en estos conteos.
`completo` incluye producción: no se suman ambas columnas como hallazgos distintos.

| Paquete | Producción antes | Producción final | Completo final | Solo nodos dev según lock |
|---|---|---|---|---|
| Backend | 3 altos + 2 moderados | **0** | 20 moderados + 2 bajos | 20 moderados + 2 bajos |
| Portal Cliente | 4 altos + 4 moderados | 4 altos + 4 moderados | 4 críticos + 32 altos + 29 moderados + 2 bajos | 4 críticos + 28 altos + 25 moderados + 2 bajos |
| Portal Admin | 4 altos + 4 moderados | 4 altos + 4 moderados | 4 críticos + 23 altos + 29 moderados + 2 bajos | 4 críticos + 19 altos + 25 moderados + 2 bajos |
| E2E Sebastián | 0 | 0 | 0 | 0 |
| Demo Samuel | No medido inicialmente | 0 | 0 | 0 |

Conteos de paquetes afectados de npm, no número de incidentes independientes.
Las tres mediciones finales coinciden; sus resultados individuales/lock hashes
se conservan en la evidencia, sin promedios.

Actualización dirigida: `@nestjs/platform-express` **11.2.8→11.2.9**, Multer
**2.4.0→2.5.0**, Swagger **11.4.7→11.4.8**, js-yaml **5.3.0→5.5.0** y sus
dependencias declaradas; sin cambio mayor de Nest. No hay carga multipart/async
fileFilter en las rutas revisadas; se elimina igualmente el componente afectado
por [el advisory de Multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).
Nodemailer **6.10.1→10.5.0** es una migración mayor **específica**: su rama antigua
carece de parches soportados; el código usa únicamente createTransport/sendMail.
Se retiraron los tipos externos porque la rama nueva los incluye, con Node 22
compatible. Regresión del adaptador y transporte real en memoria aprobados, sin
SMTP/Gmail. [Soporte y migración](https://nodemailer.com/about/),
[versión elegida](https://github.com/nodemailer/nodemailer/releases/tag/v10.5.0).

**Bloqueos concretos:**

1. Angular 19.2.25 está instalado y servido en ambos portales; auditoría y ZAP
   coinciden. El advisory de [hidratación](https://github.com/angular/angular/security/advisories/GHSA-rgjc-h3x7-9mwg)
   requiere SSR/hidratación, que esta distribución estática no usa; no se declara
   explotación de ese vector. El [advisory de sanitización](https://github.com/angular/angular/security/advisories/GHSA-hh8m-fm6v-7cvg)
   tampoco tiene parche para 19.2.25. Existen además avisos de common/compiler/router.
   La versión vulnerable es real; falta demostrar alcance de cada sink y migrar
   coordinadamente core/compiler/CLI/Material a una rama soportada, compilar y
   validar ambos portales. No se aplicó un salto indiscriminado ni se aceptó como
   falso positivo todo lo que requiere condiciones no ensayadas.
2. Críticos de tooling: **piscina, proxy-addr, shell-quote y tar** en cada portal.
   Los paths del lock son dev y no se despliegan en las imágenes Nginx, pero sí
   afectan construcción/servidor de desarrollo. `build-angular` fija piscina
   4.8.0; hay padres con tar ^6.1.11. No se forzaron overrides fuera del contrato
   del padre. Acción: remediar toolchain/overrides compatibles de forma revisada,
   comprobar procedencias/versions finales y construir ambos portales; no basta
   excluir dev para declarar segura la cadena de construcción.
3. CSP y ampliación DAST/autorización semántica siguen pendientes como se detalla
   abajo. Ninguna de estas justificaciones elimina un hallazgo ni aprueba el requisito.

## ZAP y las tres finales comparables

Revisión **pasiva**: dos portales (HTML/login/assets iniciales), API pública y
protegida sin token, y API con Cliente/Personal en perfil/pedido/menú propios.
**33 solicitudes**, **tres 200 autenticados fuera de login**, **62 reglas pasivas
habilitadas**, cero reglas desactivadas y cola pasiva vacía por pasada. Sin
scanner activo ZAP, arañas, navegación JS completa ni análisis autenticado de
todas las pantallas. La matriz de acceso HTTP sí es activa, acotada a las fixtures.
No se escanearon Redash, despliegues remotos, Stripe o Gmail. La red `internal`
del escáner impide su salida; enlaces externos de los portales no se siguieron.

| Pasada final / instante UTC de matriz | Matriz | Propiedad / PAN HTTP | ZAP por riesgo | Audit / resultado global |
|---|---|---|---|---|
| 1 — 11:15:51.926 | **1.760/1.760** | **11/11; 8/8** | 2 altos + 4 medios + 4 informativos | Hallazgos; **no aprobado** |
| 2 — 11:16:34.227 | **1.760/1.760** | **11/11; 8/8** | 2 altos + 4 medios + 4 informativos | Hallazgos; **no aprobado** |
| 3 — 11:17:02.032 | **1.760/1.760** | **11/11; 8/8** | 2 altos + 4 medios + 4 informativos | Hallazgos; **no aprobado** |

Los altos son 10003 (Angular, dos portales); medios 10038 (CSP, cuatro
respuestas HTML); informativos 10109 (SPA moderna). No se silenció ninguna alerta.
Código de cada matriz 0; ZAP 0 significa terminó; audit 1 conserva hallazgos y
el runner global devuelve **1**. No se promedian ni se convierten en aceptación
de Seguridad. Las tres pasadas previas a cerrar la credencial interna se
conservan privadamente como **intermedias**, no sustituyen estas finales.

Memoria, en serie y con Redash detenido, sin cambiar el presupuesto de Docker:

| Final | VM disponible antes/después (kB) | Swap VM libre antes/después (kB) | Swap host usado antes/después (MiB reportados por sysctl) |
|---|---:|---:|---:|
| 1 | 1.273.864 / 968.160 | 456.876 / 430.812 | 4.061,75 / 4.051,88 |
| 2 | 970.632 / 949.632 | 430.812 / 421.348 | 4.051,88 / 4.027,88 |
| 3 | 948.028 / 940.100 | 421.348 / 422.116 | 4.027,88 / 4.060,69 |

Presión host reportó porcentajes libres 39→37%, 38→44%, 44→41% respectivamente;
son muestras puntuales, no una prueba de rendimiento/disponibilidad.

## Regresiones, comandos y restauración

[README](README.md) contiene comandos completos y exclusiones. Se ejecutaron:
matriz `comprobar.cjs`, `npm audit --omit=dev --json` y `--include=dev --json`
en **cinco paquetes** por cada final; `zap.py`, memoria y procedencias. No se
usó `audit fix --force`.

- Regresión inicial del cambio de pagos: **267/267**, 16 suites; tipos aprobados.
  Se conserva una pasada previa **266 aprobadas / 1 fallida** por el texto remoto
  que ahora se sustituye deliberadamente por mensaje propio; se actualizó esa
  expectativa sin retirar la aserción de rechazo.
- Regresión de guarda/adaptadores internos y Postventa: **87/87**, cuatro suites;
  tipos aprobados después del cambio.
- Contratos adicionales de cookie/webhook: **4/4**, dos suites.
- Gateway: **1/1** control con cuatro respuestas de Cola. Nodemailer real sin red:
  **1/1**. Comparación de los cinco DTO con 82bac77: **5/5**.
- Builds Núcleo, Boletería, Trabajador y ambos Angular aprobados en Docker;
  gateway/configuraciones arrancan saludables. Sin cambios Dart ni lógica Angular;
  no se repiten sus suites ni los 16 recorridos funcionales por cabeceras/docs.

Se alternaron dos ventanas: la principal de aplicación y un complemento SQL
necesario por el error de nombres del arnés. Se conserva la primera restauración
(200 en `/ping`, desconexión en `/login` y OOM nuevos). En la segunda ventana
solo se reanudó PostgreSQL propio, sin aplicaciones/escritores, y luego se paró
CU-015 mediante su script. No se repitieron negocio, la matriz de acceso o ZAP.

**Estado final, 11:36:33 UTC:** ZAP detenido y desconectado; CU-015 detenido con
montajes de datos conservados; los siete IDs Redash originales activos. En cada
ventana se arrancaron una sola vez los servicios inicialmente activos, sin
reinicios de recuperación ni otros proyectos. PostgreSQL listo y Redis PONG.
Tras cada incorporación `/ping` y `/login` respondieron 200; la comprobación
final agotó **10 s en ambos**. Los cgroups de este último arranque registran
**server: 2, scheduled_worker: 1 oom_kill**, nuevos y distintos de las marcas OOM
históricas del estado inicial. **Estados restaurados, accesibilidad de Redash
bloqueada al último control.** No se hicieron más reinicios ni cambios globales.
Acción concreta: disponer de capacidad autorizada/revisar concurrencia de Redash
y verificar ambos HTTP; no intervenir otros proyectos desde esta entrega.

Salidas crudas, cookies, credenciales, tokens, QR y logs permanecen en la carpeta
ignorada del ensayo. Solo se publican scripts/resúmenes con campos permitidos.
No se modifican migraciones históricas, no se añade F12, CU-028 o funciones.
