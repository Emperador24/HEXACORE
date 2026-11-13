# Seguridad de Sebastián — RNF-05 y RNF-06

## Autorización de Alimentos — 13/11/2026, entrega posterior

**Alimentos 30/30; global 69/159; RNF-05/06 siguen parciales.** Se completan las
20 operaciones pendientes y se reejecutan las diez anteriores de Alimentos.
Las otras **39** cubiertas se reutilizan de la entrega anterior; quedan **90**
operaciones globales pendientes de ampliación semántica. No se demuestra una
brecha nueva de producto: no cambian controladores, guardas, servicios, reglas,
estados, historial, idempotencia, migraciones ni límites financieros.

Inicio limpio en `feature/sebastian` **7130d52**, sincronizada con origin. Fetch
confirma develop **41ca881** y PR **#50 abierto** hacia develop; sin integrar
ramas. [CI anterior 43454519623: 8/8](https://github.com/Emperador24/HEXACORE/actions/runs/43454519623)
confirmada por API, separada de estas ejecuciones. Se conserva el fallo anterior
de outbox y la causa desconocida de SIGTERM: esta aprobación no los corrige.

[Reproducción y contratos](AUTORIZACION-ALIMENTOS.md) ·
[Cobertura actual, método/ruta](COBERTURA-RECURSOS.md) ·
[Evidencia nueva saneada](ALIMENTOS-RECURSOS-EVIDENCIA.json).
Las secciones inferiores describen sus entregas históricas; sus 49/159 y 110
pendientes no son el corte actual. La evidencia DAST anterior no se sobrescribe.

### Contratos revisados y evidencia nueva

El inventario sigue en **178 operaciones declaradas / 173 expuestas / 159
protegidas**. Las **30** de Alimentos coinciden exactamente por método/ruta
entre inventario y controladores actuales, sin cambios en el denominador.
Checkout usa Cliente de sesión; consultas/pago filtran comprador. Personal
requiere vínculo al local; las consultas y mutaciones también acotan producto,
operación, pedido, incidencia y QR a su recurso padre. Catálogos son compartidos.
Organizador/Administrador administran globalmente según contrato: `creadoPor`
no define una frontera de organización; no se inventa una asociación nueva.

Siete cuentas nuevas exclusivas: dos clientes, dos Personal, dos Organizadores
y Administrador. Cada canal/pasada crea locales A/B y productos distintos,
asignados a Personal diferente. Se intercambian IDs de local/producto/operación/
pedido/incidencia y QR existentes. Los propietarios tienen controles positivos
200; los cuerpos/versiones/QR son válidos y las mutaciones se rechazan **antes**
de su primera ejecución autorizada. Se verifica la misma clave tras rechazar
pago, alta, ajuste, preparación, entrega y cancelación, sin consumirla con un replay.

Las consultas propias no aceptan identidad ajena desde cabeceras/query;
asignación, preparación, entrega y cancelación auditan al actor de sesión.
La eliminación de un vínculo impide la lectura siguiente y su reposición
restaura el acceso. Organizador B administra locales creados por Organizador A
y viceversa; Administrador mantiene el alcance global. No se exige propiedad
individual donde el contrato no la define.

Por final: **274 observaciones de autorización/contrato**, **dos** de validación
de `clienteId` extra y **dos** de relación producto-pedido separadas. Los cuatro
400 no se acreditan como autorización. Los 404 ocultan recursos reales,
comprobados positivamente en su local/cuenta; no se usan recursos inexistentes.
Las **30/30** rutas tienen control positivo en **cada canal**, no solo la guarda.

**142 rechazos por final** tienen capturas iguales antes/después en SQL y Redis,
incluidas las cuatro observaciones separadas. SQL cubre locales del evento
exclusivo, vínculos, productos/inventario, pedidos, detalles, reservas, ajustes,
preparación/incidencias/historial, entregas, cancelaciones y libro financiero de
cobros/reembolsos/claves intentadas. Redis compara disponibles, preparado,
reservas, vencimientos de esos pedidos y marcas de ajustes. Capturas crudas
privadas, persistidas antes de pedir y después incluso si falla la expectativa.
No se inspeccionan sesiones ni datos Redis de terceros. Cubrir una ruta no
certifica todas sus combinaciones, carreras o estados.

### Tres finales comparables

| Final, inicio UTC | Total | Autorización/contrato | Validación / relación separadas | Rechazos sin cambios SQL/Redis | Duración |
|---|---|---|---|---|---|
| 1, 22:48:47.727 | **278/278** | **274/274** | **2/2 + 2/2** | **142/142** | 22,726 s |
| 2, 22:49:13.971 | **278/278** | **274/274** | **2/2 + 2/2** | **142/142** | 22,914 s |
| 3, 22:49:40.370 | **278/278** | **274/274** | **2/2 + 2/2** | **142/142** | 24,318 s |

Cada final: 114×200, 106×403, 16×201, 28×404, 2×422, 4×400, 2×409 y 6×204.
Cero 5xx. Ejecución serial, sin reintentos HTTP ni cambios de límites/fuentes
entre esas tres finales. La consulta de convergencia asíncrona del reembolso
usa 10 s y no reenvía cancelación/cobro. Node **22.22.3** host/Núcleo/Boletería;
once imágenes/servicios saludables, Redash detenido. Los **83 compilados JS**
de Alimentos coinciden con los del contenedor. Árbol de ejecución `7130d52` más
herramientas nuevas, registradas por hash antes de publicarlas; producto intacto.
Herramientas publicadas en **8ee59fb**; exportador ampliado después únicamente
para documentar los OOM de restauración, como indica su propia evidencia.

Memoria disponible VM KiB, antes→después: **1464524→1441380**,
**1443476→1439064**, **1430512→1409476**. Swap libre: **529016→529016**,
**529272→529272**, **529272→529272**. Los otros proyectos inicialmente activos
se conservan; no se intervienen ni se atribuye capacidad/disponibilidad global.

Regresiones actuales: **210/210 unitarias, ocho suites** (checkout, pagos, menú,
establecimientos, recepción, preparación, entrega y cancelación). Sintaxis de
herramientas y diff comprobados. Se reutilizan **16/16 automático y 16/16 visible**
de `ec07de2`: `git diff ec07de2 HEAD` vacío en Alimentos, Finanzas/Pagos,
ConsultaPersonal y validación compartida. No se repiten los recorridos completos.

### Hash anterior a la primera cancelación e historial

**Seis pedidos exclusivos nuevos**, uno por canal/final, tienen captura guardada
y releída **antes de su primera cancelación**. Si falla, el caso se detiene antes
de cancelar. Los seis hashes posteriores coinciden: conserva íntegramente el
cobro de Alimentos, el libro original de Finanzas, detalles/snapshots y todos los
campos del pedido excepto `estado`, `motivo_cancelacion`, `cancelado_en` y
`actualizado_en`, que sí deben poder cambiar. Se comprueban cancelación/motivo/
fecha, restitución, un reembolso confirmado con un intento y actor correcto.
El hash ausente del ensayo histórico sigue ausente; no se reconstruye.

Se conservan tres incidencias del arnés, sin declararlas brechas de producto:

- Control inicial: **104 aprobadas / 105 observadas**, detenido por esperar 200
  con `NO_DISPONIBLE`, estado inexistente. Se corrige a `CERRADO`; el rechazo
  previo con cuerpo inválido no acredita autorización. Ya había captura correcta
  anterior a la cancelación, separada de las seis finales.
- Primera serie interrumpida: **139/139 HTTP en gateway**, pero clasificador
  asignó `cuentas-personal` a `:id` y contó 29/30. Se priorizan rutas literales;
  no se cambia la petición ni el contrato. Directo/finales 2 y 3 no ejecutados.
- Siguiente carpeta: alta inicial **409 frente a 201**, al reutilizar nombres
  de locales previos. Cero controles de autorización; se añade sufijo nuevo por
  canal/pasada. No se opera otra vez un local ya completado. Las tres finales
  completas son posteriores a esas correcciones y no sobrescriben sus archivos.

Restauración: **Docker activo al inicio y al final**, siete Redash activos y
CU-015/ZAP detenidos. Mismos 92 IDs/imágenes/montajes y estados activo/detenido,
comparando montajes por destino (el orden del array de inspect varía). La parada
de Redash tuvo cinco cierres de aplicación 0; las marcas OOMKilled iniciales
eran históricas y no se interpretan como incidentes nuevos. CU-015 cerró 0/143
por su script, sin OOM/SIGKILL. No se reconstruyeron imágenes ni ejecutó preparación.

Redash se reanudó una vez por etapas: PG listo, Redis PONG, `/ping` y `/login`
200 al incorporar cada aplicación, siete cgroups oom_kill=0 en esos controles.
El control posterior **22:53:57 UTC** agotó 15 s en ambas rutas. Después se
registran **OOM nuevos**: server **3**, worker **8**, adhoc_worker **3**,
scheduled_worker **2**; postgres/redis/scheduler **0**, frente a cero en el último
control por etapas. VM disponible **140780 KiB**, swap libre **3268 KiB**.
Se guardan logs/estado privados. **Estados restaurados, acceso HTTP pendiente**:
estar running no demuestra disponibilidad. No se repiten reinicios ni se detienen
otros proyectos. Requiere que el responsable libere capacidad autorizada o revise
concurrencia de Redash y compruebe HTTP; no es una corrección de SIGTERM/outbox.
La exportación posterior solo agrega esos contadores de restauración; no cambia
las solicitudes/aserciones de las tres finales ni exige repetir los recorridos.

Publicación se registra en PR #50. Datos, cuentas/claves anteriores y volúmenes conservados; sin semillas
destructivas ni proveedores reales. Publicación solo `origin/feature/sebastian`,
sin merge/auto-merge. Permanecen **90 rutas**, combinaciones adicionales, residuos
previos CSP/DAST, CU-028 de Samuel y límites RNF-05/06. CU-028, F12, sustituciones,
arquitectura, Google Fonts/imágenes y ampliación DAST quedan fuera. ZeroTier solo
queda como futura prueba con un servidor HEXACORE y varios clientes, sin instalación.


## Autorización sobre recursos y DAST activo — 13/11/2026

**Entrega parcial de Seguridad; RNF-05/06 completos: NO.** Inicio limpio y solo
en feature/sebastian **ec07de2**, [CI 43426230483, 8/8](https://github.com/Emperador24/HEXACORE/actions/runs/43426230483).
Fetch conservó referencias, sin integrar ramas. Los registros anteriores se
mantienen debajo. Se conservan los residuos de imágenes externas/Google Fonts:
**dos medias 10055, ocho medias 90003 y cuatro informativas 10109** de la revisión
anterior. No se reabren Angular, CSP o SIGTERM (causa desconocida).

Hitos: **545e19c** corrige Logística y amplía sus pruebas; **9a06ba8** rechaza NUL
en filtros de Cartelera; **d402a89** fija herramientas DAST y la relación con el
curso. Las tres finales corresponden a **d402a89**. La documentación/exportación
posterior y el nombre único de política/contexto para reutilizar ZAP no cambian
producto, reglas, vectores o peticiones ensayadas.

[Comandos](AUTORIZACION-DAST.md) · [Cobertura actual de las 159 rutas](COBERTURA-RECURSOS.md)
· [Security/Safety: concepto y diapositiva → código → evidencia → brecha](SECURITY-SAFETY.md)
· [Evidencia saneada](RECURSOS-DAST-EVIDENCIA.json).
Peticiones completas, credenciales, sesiones, configuración, QR, stderr y trazas
permanecen privados. Las presentaciones se usan como referencia conceptual, no
como instrucciones operativas; se publican sus nombres/huellas, no sus archivos.

### Brechas demostradas y correcciones

| Hallazgo | Clasificación contextual y antes | Corrección / después |
|---|---|---|
| GET notificaciones divulga avisos ajenos | Medio, confidencialidad. Cliente y otro empleado con sesión válida obtienen 200 y ven una notificación real creada por HTTP/AMQP del ensayo | Se reutiliza ContextoDeLogistica: supervisor mantiene consulta global, ficha activa consulta su empleadoId y sin ficha obtiene lista vacía. No se modifica F14 ni el consumidor |
| Cliente escribe fichajes con credencial válida | Alto contextual de integridad, condicionado a conocer la credencial. Entrada/salida 201 agregan una fila cada una, en ambas vías | Roles operativos Personal/Organizador/Administrador en las dos rutas, con SesionValida del backend. Cliente 403 y cero filas; Personal mantiene la operación del punto de control |
| NUL de filtro llega a PostgreSQL | Bajo, validación/robustez: una petición activa con NUL en artista devuelve HTTP 500, SQLSTATE 22021/UTF8 0x00. No se demuestra SQLi ni caída global; ZAP emitió **cero alertas** | NotContains NUL en categoría/ciudad/artista, que se usan como parámetros PostgreSQL. No se alteran Unicode/apóstrofos o filtros vacíos. HTTP 400 en las tres variantes, con válidos 200 |

Logística: **8 fallidos/16 controles antes**, con cuatro escrituras reales de
Cliente verificadas en PostgreSQL. **16/16 después**, en gateway y Núcleo directo,
con recursos existentes y cabeceras de usuario falsificadas sin efecto.

Cartelera: unitarias antes **3 fallidas/2 aprobadas**, después **5/5**; HTTP
**8/8** por gateway/Boletería (dos consultas válidas 200, seis NUL 400). El DAST
posterior conserva cero 5xx. Consultas parametrizadas se mantienen: no se cambia
SQL para aparentar protección ni se presenta un error de DTO como autorización.

### Autorización: denominador y significado

El inventario conserva **178 operaciones de controlador / 159 protegidas / 173
expuestas declaradas**, incluyendo salud propia del gateway. De las **41** rutas
originales sin metadato de rol, **41/41 tienen controles nuevos**. Al declarar
roles en las dos escrituras de asistencia quedan **39** sin ese metadato; sus
reglas de identidad/contexto se revisan, no se consideran automáticamente abiertas.

Cobertura nueva: **49/159 operaciones protegidas, en ambos canales**. Incluye
identidad/perfil/contraseña/logout, cola/catálogos compartidos según contrato,
Personal vinculado a establecimientos distintos, pedido propio/ajeno y Logística:
ficha, baja de jefatura, supervisión, turnos, solicitudes, reemplazos, asistencia,
notificaciones, asignación y auditoría. Jefe con rol de cuenta Personal, jefe
inactivo, Personal sin ficha, organizadores y administrador con supervisión global
se contrastan con Cliente/Personal ordinario. Las mutaciones usan cuerpos válidos
y objetos existentes; el actor de revisión sale de sesión pese a supervisorId falso.

Cada final registra **302 + 30 = 332 comprobaciones**. **Cuatro** de ellas son
404 por ficha inexistente/inactiva y se clasifican como contexto, **sin acreditarlas
como autorización sobre un recurso existente**. Quedan 328 observaciones de
acceso/contrato, con posibles observaciones repetidas: no son 328 permisos distintos.
El 404 de pedido ajeno es distinto: ese pedido existe y su propietario obtiene
200 antes; es ocultación de propiedad. Los ocho controles de entrada NUL son
separados, nunca pruebas de permiso.

Las otras **110/159 rutas** conservan la evidencia previa de identidad/roles, pero
su ampliación semántica por recurso está pendiente y se enumera individualmente.
Cubrir una ruta tampoco prueba todas sus combinaciones. **CU-028 dinámico sigue
pendiente de Samuel**. Organizador/Administrador son roles globales hoy; no hay
asociación organización-evento/tenant que pueda acreditarse como frontera.
`creadoPor` es auditoría, no un contrato de propiedad. Definir esa relación y sus
excepciones requiere decisión del responsable; no se implementa una regla nueva
ni se declara aislamiento de organizaciones por probar roles fijos.

### DAST activo: alcance realmente ejecutado

**Tres operaciones únicas, cuatro escenarios**, únicamente gateway local y datos
exclusivos: GET Cartelera con categoría fija de un evento nuevo; PATCH perfil sin
sesión; PATCH perfil de Cliente nuevo; GET pedidos del establecimiento propio con
Personal vinculado. **Sin Administrador de escaneo.**

Dos reglas activas de **53 disponibles**: **40018 SQL Injection** y **40012 XSS
Reflected**, fuerza/umbral MEDIUM, ambas Complete con peticiones reales en cada
escenario. No se ejecutan las otras 51 reglas; se enumeran en evidencia y no
se presentan como cero hallazgos. La política específica se definió antes de
analizar y no cambia la predeterminada ni filtra alertas; **62 pasivas conservadas**.

Contextos exactos, sin recursión/arañas, un hilo/host; solo query/cuerpo JSON.
No inyecta URI, IDs, cookies ni cabeceras. Categoría permanece fija como límite
de datos, no vector. Bearer fresco por pasada y cabecera restringida al objetivo;
**53/53 peticiones autenticadas** mantienen su token. Sesión 200 antes, durante
(con escaneo activo) y después, por cada Cliente/Personal. El escenario protegido
sin sesión devuelve 401 en 27/27 peticiones: acredita la barrera, no ejecución de
la lógica de negocio sin autenticación.

No abarca DOM/XSS persistido, todos los campos, autorización de todas las rutas,
RCE/SSRF/OOB, archivos/SSE, AMQP, correo, webhooks como objetivo activo, operaciones
financieras, administración o mutaciones generales. No es análisis de carga ni
disponibilidad global. Se excluyen por efectos/alcance no definidos, no por haber
producido una alerta que se quiera ocultar. El estudio local no usa proveedores
reales ni escanea despliegues, otros proyectos o servicios externos.

### Tres finales comparables, sin promedios

| Final — UTC de matriz | Matriz | Complemento | Filtros HTTP | DAST activo | Alertas / 5xx |
|---|---|---|---|---|---|
| 1 — 15:01:06.629 | **302/302** | **30/30** | **8/8** | **107** peticiones; 4 escenarios/3 operaciones | **0 / 0** en el alcance seleccionado |
| 2 — 15:01:37.327 | **302/302** | **30/30** | **8/8** | **107** peticiones; 4 escenarios/3 operaciones | **0 / 0** en el alcance seleccionado |
| 3 — 15:02:07.263 | **302/302** | **30/30** | **8/8** | **107** peticiones; 4 escenarios/3 operaciones | **0 / 0** en el alcance seleccionado |

Por cada final, respuestas activas: **47 HTTP 200, 33 HTTP 400, 27 HTTP 401**.
Desglose: pública 23×200/4×400; protegida sin sesión 27×401; Cliente 21×200/3×400;
Personal 3×200/26×400. Los 400 son entradas de ataque rechazadas, no prueba de
rol. Las semillas y comprobaciones adicionales de sesión no inflan el conteo de
peticiones activas. Todas las reglas seleccionadas terminan Complete, cero
pendientes pasivos. Un resultado individual no sustituye las tres pasadas ni
la cobertura pendiente.

Node real de Núcleo/Boletería **22.22.3**, ZAP **2.17.0 arm64** con digest previo
fijado, herramientas Node 22.22.3/npm 10.9.8/Python 3.14. Se reconstruyen solo
Núcleo y Boletería; tipos/builds e imágenes afectados aprobados. Tres hashes de
controladores/DTO ejecutados coinciden con sus compilados locales en las tres
pasadas, once servicios saludables y Redash detenido. Imágenes **Núcleo 0b650a46578c**
(etiqueta ec07de2/modificada) y **Boletería 81b9c6ea8b1f** (etiqueta 545e19c/modificada);
SHA completo y huellas en evidencia. No se usa la etiqueta como falsa prueba de
fuentes. Portales/CSP, gateway y demás imágenes conservan sus fuentes/imágenes.
No se crean/modifican migraciones históricas ni sus 18 procedencias, ni se siembran
datos previos.

Memoria VM disponible KiB, antes→después: **880932→844104**, **840044→852852**,
**853944→812912**. Swap libre VM: **453540→454308**, **454308→454564**,
**454564→455844** KiB; presión libre host **38→47, 45→43, 45→44 %**. Swap host
usado 2592,50 MiB en las seis lecturas, registrado individualmente. Son condiciones
de ejecución, sin conclusión de rendimiento/disponibilidad.

### Verificaciones reutilizadas y fallos del arnés conservados

- Unitarias relacionadas **3/3 Logística**, **5/5 filtros**, tipos completos y
  builds/imágenes afectados aprobados. Se añaden dos pruebas HTTP reales a las
  cinco existentes de convivencia de Logística; la CI las ejecuta con sus recursos.
- Matriz inicial **296/302**: cuatro expectativas incorrectas de 200 frente al
  contrato 204 de verificar; dos candidatos sin fechas. Se conservan resultados,
  se corrigen solo contratos del arnés y se comprueba el complemento **18/18**;
  ampliado a organizaciones/actor auditable: **30/30** antes de las finales.
- DAST: error inicial de raíz del script copiado a /tmp; luego 400 de iniciador,
  cuyo código original no quedó capturado. No se acreditan como escaneos. Semilla
  visible comprobada antes de iniciar y errores API se capturan. Un piloto público
  de 54 peticiones terminó; la guarda detectó **24 modificaciones del filtro de
  categoría**, por confundir wildcard con regex en addExcludedParam. **Cero eventos
  ajenos retornados**; no hubo mutaciones en ese piloto. Se corrige la sintaxis y
  se conserva la incidencia. Finales: categoría fija verificada en cada petición.
- El control activo posterior de 107 peticiones tuvo cero alertas pero **un 500**;
  no se declara aprobado. Esa evidencia reveló NUL/22021 y ahora el runner la
  rechaza incluso con cero alertas. La corrección demostrada antecede a las tres
  finales sin 5xx; no se repite buscando verde sin cambio de condiciones.

### Security/Safety y estado de evidencia

[La matriz del curso](SECURITY-SAFETY.md) prioriza rol/recurso, mínimo privilegio,
validación, autenticidad de mensajes y auditoría, y enlaza secuencias/interlocks
con entrega, cancelación y pagos. JWT/HMAC y guardas no se confunden con firma
AMQP extremo a extremo; auditoría SQL no equivale a no repudio criptográfico.
Autenticidad de dispositivo/reloj offline y delimitación por organización quedan
pendientes. Se conservan los mecanismos actuales y la sencillez de la arquitectura.

Control HTTP dirigido de interlocks: **siete comprobaciones acreditadas**, cero
fallos de producto conocidos: misma operación al repetir, cancelado sin QR,
preparación bloqueada con versión actual, QR original no entregable, una
cancelación/un reembolso/un intento, cobro conservado durante replay y reembolso
APROBADO consistente con libro APROBADO. **Una comprobación nueva no acreditada**:
el hash anterior a la primera cancelación no se conservó cuando el primer arnés
consultó por error columna estado en vez de resultado. Se recuperó la **misma
operación** desde su intención, sin repetir compra/cobro; no se fabrica ese hash.
La conservación durante primera cancelación/carreras/reinicio mantiene su
referencia previa con fuentes Alimentos/Finanzas sin cambios.

Se reutiliza **16/16 automático y 16/16 visible** de ec07de2 con Redash detenido;
no se repiten los conjuntos completos. Los estados inciertos y contratos
financieros anteriores se reutilizan explícitamente como históricos; no se
implementa F12 ni se declara dinero devuelto sin confirmación. RNF-05/06 siguen
incompletos por cobertura/exclusiones y residuos anteriores.

### Restauración y publicación

Motor apagado al inicio; se inició Docker Desktop existente sin cambiar recursos.
Se registraron siete Redash activos y doce contenedores CU-015 detenidos (once
servicios y preparación finita). Se detuvieron solo esos Redash: scheduler cerró
**137/OOM=false** tras la gracia de 120 s, registrado sin llamarlo ordenado.
HEXACORE y ZAP funcionaron sin Redash durante todos los análisis, en serie.

Al terminar: ZAP detenido/desconectado y CU-015 detenido por su script, ambos
código 0; datos/cuentas/volúmenes conservados. Siete IDs/imágenes/montajes Redash
reanudados una sola vez; PG listo, Redis PONG. Hubo resets y un timeout de arranque;
últimos controles **/ping 200 y /login 200**, siete cgroups oom_kill=0. Después se
restauró **Docker Desktop apagado** como al inicio; ese 200 fue anterior al apagado,
no disponibilidad actual con el motor apagado. Sin reinicios de recuperación ni
intervención manual en otros proyectos. Estado y condiciones en evidencia.

Publicación exclusivamente origin/feature/sebastian, PR #50 si continúa abierto,
sin merge/auto-merge. CI de publicación registrada en el PR y entrega final,
separada de estas pruebas locales y sin atribuir corrección de SIGTERM.

### CI de publicación: fallo conservado, 7/8

[CI 43453200930](https://github.com/Emperador24/HEXACORE/actions/runs/43453200930)
del commit **e017039** termina **7/8 trabajos aprobados**. Portales, Flutter,
gateway, artefactos, integración de autenticación y transferencia histórica /
instalación nueva aprueban. El trabajo de Backend aprueba tipos, **80 suites /
1044 unitarias**, controles de resúmenes, correo y composición financiera, y
falla en la primera integración de Boletería: **22/23**, una fallida. La segunda
integración y las etapas posteriores, incluidas las dos regresiones HTTP nuevas
de Logística, **no se ejecutan**; no se acreditan por los resultados locales.

La aserción de `App/backend/test/boleteria/flujos.e2e-spec.ts:115` observa una
fila sin marca de publicación donde espera cero, después de observar los dos QR.
No es un timeout ni SIGTERM. Test y publicador no cambian en este bloque. En
`App/backend/modulos/entradas/ventas/comun/eventos/bandeja-salida.service.ts`,
el envío/confirmación AMQP precede a la actualización de la marca y al commit
PostgreSQL; observar la proyección no garantiza por sí solo que esa marca ya
sea visible. Esto demuestra que el orden de observación del test es insuficiente,
pero **no prueba que esa fila concreta se haya vaciado después**. Su secuencia,
tipo y estado posterior no quedaron en la evidencia disponible. No se atribuye
el incidente a un SQL/DNS específico ni a estas correcciones de Seguridad.

Acción concreta pendiente, en un bloque del arnés de Boletería: conservar el
conteo/identificador técnico del pendiente y comprobar la convergencia de ambas
condiciones dentro del **mismo límite existente**, sin quitar la aserción ni
aumentar plazos. Si no converge, correlacionar confirmación y commit del mismo
evento. No se cambia el producto ni se abre disponibilidad global aquí. No se
relanza esta CI para buscar verde. El log completo se conserva privado; la
publicación posterior de este diagnóstico es documental y no corrige la causa.
Una CI posterior aprobada no sustituiría esa observación faltante.

## Historial de portales, dependencias y CSP conservado


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
