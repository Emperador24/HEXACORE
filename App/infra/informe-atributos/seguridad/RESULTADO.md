# Seguridad de Sebastián — RNF-05 y RNF-06

**12/11/2026, UTC (Bogotá UTC−5). Cumplimiento completo: NO.** Se corrigen
hallazgos demostrados y se publica evidencia reproducible; permanecen bloqueos
de dependencias, CSP y cobertura semántica. No confundir una matriz de acceso
aprobada con la aprobación de todos los requisitos de Seguridad.

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
