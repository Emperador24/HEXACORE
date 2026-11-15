# Cierre de las 16 operaciones pendientes — 15/11/2026

**16/16 nuevas; global 167/167 operaciones protegidas. RNF-05/06 parciales.**
Inicio limpio `ef384d9`, PR #53 abierta y CI anterior aprobada. El plan documental
de dos servidores y un cliente se publica aparte en `34c8420`, cuya CI
43759947154 pasó 8/8 al primer intento. Las correcciones de Seguridad están en
`8eae8b9`. No se integra otra rama ni se desarrolla nuevamente CU-028.

Inventario sin variación: **186 declaradas, 181 expuestas, 167 protegidas**.
Se conservan las 151 operaciones anteriores y sus combinaciones acreditadas;
la matriz nueva no convierte esa evidencia en cobertura de todas las
combinaciones de permisos, carreras, consumidores o estados.

| Área | Operaciones nuevas | Canales |
|---|---:|---|
| Administración de cuentas | 5 | Gateway y Núcleo directo |
| Roles/permisos, CU-028 ya integrado | 8: siete administrativas y permisos propios | Gateway y Núcleo directo |
| Ingreso QR | 3 | Gateway y Boletería directa |

## Dos brechas demostradas antes de corregir

1. **Asignación no llegaba por gateway a un JWT anterior.** Cliente inicia sesión,
   un administrador le asigna un rol propio con permiso y, sin renovar, Núcleo
   responde 200 con el evento existente mientras el gateway devuelve 403. El
   borde miraba si el JWT antiguo ya tenía un rol propio. Ahora valida el JWT
   y delega las rutas con módulo dinámico al Núcleo, que comprueba los permisos
   vigentes. Las rutas sensibles sin módulo, como cuentas/roles e ingreso QR,
   conservan su restricción. Dejar llegar al backend no concede el permiso.
2. **Datos de roles ilegibles recuperaban privilegios antiguos.** Se emite un
   JWT con un rol propio, se retira por API y ambos canales pasan a 403. Una
   inyección controlada de JSON inválido o cadena vacía en el Redis exclusivo
   hacía que ambos volvieran a 200 usando el rol viejo del JWT. Ahora una clave
   presente e ilegible produce 503; clave ausente y matriz vacía conservan sus
   contratos. No se añade otro sistema de sesiones.

Las respuestas completas de referencia, imágenes anteriores, peticiones y
capturas quedan privadas. El resumen solo publica códigos, métricas y huellas:
[CIERRE-EVIDENCIA.json](CIERRE-EVIDENCIA.json).

## Contratos comprobados

**Cuentas:** positivos sobre cuentas ajenas del ensayo, búsqueda/detalle y
activación/desactivación/eliminación. Cliente, Personal, Organizador y rol propio
con la matriz completa no administran. El segundo administrador pierde acceso
cuando se retira su autoridad vigente en SQL o su cuenta queda inactiva, aunque
el JWT anterior y las cabeceras falsificadas digan Administrador. Son
precondiciones controladas sobre cuentas nuevas, no cambios en administradores
preexistentes. Auditoría usa el actor real y registra las dos sesiones cerradas.
Desactivar/eliminar revoca en SQL/Redis y bloquea Núcleo/Boletería y nuevo login;
eliminar conserva el ID y anonimiza. Auto administración da 422 sin cambios.

La protección del último administrador se prueba con **dos administradores
exclusivos que se solicitan mutuamente desactivar o eliminar**. Se retiene el
candado existente hasta que ambas guardas pasaron: una petición muta y la otra
devuelve 422 `ULTIMO_ADMINISTRADOR`; queda un administrador activo y una sola
auditoría. Se comprueban ambos verbos y ambos canales. Se reactiva o crea el
actor propio siguiente; no se toca ningún administrador anterior al ensayo.
Estas observaciones de concurrencia admiten la única mutación autorizada y se
registran aparte de las comparaciones que exigen igualdad completa.

**Roles:** crear/listar/detalle/editar/eliminar/asignar/retirar, versión vigente,
nombre/catalogo, auditoría de sesión, protección de los cuatro roles del sistema,
asignación a cuenta activa y retirada sin dejarla sin rol. Rol con usuarios exige
destino válido; reasignación y publicación de roles se verifican en el mismo
contrato. `/cuentas/permisos` ignora identidad declarada en query/cabeceras y
deriva el usuario de la sesión. Cliente ordinario recibe el permiso en su sesión
abierta, edición lo restringe, retirada/eliminación lo quita y reasignación da el
permiso de destino. Se prueban **cinco lecturas concretas**: Eventos, asignaciones
de Logística, zonas de Parqueaderos, eventos de Emergencias y de Monitoreo. No
se atribuye esta comprobación a todos los métodos/consumidores de esos módulos.

Clave de roles ilegible o con tipo Redis incorrecto produce 503 saneado. Se
simula además rechazo de `SADD` únicamente en el Redis propio: el EXECABORT
impide aplicar la matriz y la transacción SQL revierte versión/auditoría.
Se restaura exactamente la regla original; no se acredita con este caso toda
combinación de fallos de red o commit entre PostgreSQL y Redis.

**QR:** Personal y Administrador operan sin asignaciones artificiales a eventos;
Cliente/Organizador/roles propios no pueden ingresar, sincronizar o descargar
caché. Eventos publicados por API y entradas/QR nuevos coherentes en las tablas
de Ventas y su proyección son fixtures, sin desarrollar compra/pagos. Los
rechazos no consumen el QR ni alteran aforo/ingresos/outbox. Cabeceras falsas no
suplantan al operador; campo adicional de operador se rechaza como DTO, separado
de autorización. Se cruzan códigos válidos de eventos existentes y lotes offline;
el reenvío conserva `CU-002D` sin otro efecto. Lote mixto es atómico **por entrada**
según el contrato: solo se registra la válida, no se convierte en lote indivisible.
Se conservan rechazo por aforo, estados anulada/en reventa y sesión revocada.
La caché coincide con los hashes SHA-256 válidos del evento, sin códigos QR.

## Tres finales de cierre y conservación

Serie acreditada: **precisa-final-1 a 3**, serial y congelada; producto `8eae8b9`
más arnés local identificado por huellas. Mismas 65 fuentes/JS de Núcleo y
Boletería, gateway, imágenes y arnés antes/después de cada medición. La
documentación/exportación posterior no cambia las aplicaciones medidas.

| Final | Intervalo UTC, 15/11 | Duración | Observaciones | Comparaciones |
|---|---|---:|---:|---:|
| 1 | 21:41:29.164–21:42:27.898 | 58,734 s | 560/560 | 346 |
| 2 | 21:42:30.879–21:43:31.349 | 60,470 s | 560/560 | 346 |
| 3 | 21:43:34.233–21:44:38.540 | 64,307 s | 560/560 | 346 |

Cada final: **388 observaciones semánticas, 112 de estado, 6 DTO, 16 contexto,
26 dependencia y 12 concurrencia**. Son 412 respuestas del wrapper y 148
comprobaciones/observaciones compuestas; preparación/logins y las respuestas de
las carreras quedan registradas aparte. No son 560 casos de uso ni 560 pruebas
independientes. HTTP del wrapper: 180×403, 56×401, 84×200, 44×409, 16×422,
6×400, 10×404, 2×201 y 14×503. **236 rechazos de autorización por final**;
DTO/estado/contexto/dependencia no se usan para acreditar autorización.

**1.038 pares, 2.076 instantáneas completas**: 76 tablas de once esquemas,
cuentas/sesiones/roles/auditoría, entradas/QR/ingresos/aforo, historiales/avisos,
outbox con acuses, planos, secuencias y Redis completo. Gzip y SHA-256 se validan
al exportar; no se publica ninguna fila, QR, sesión o respuesta cruda.

Se reutiliza el comparador con captura Redis atómica de DUMP binario, plazo
absoluto y reloj del servidor. Solo permite desapariciones al vencer naturalmente;
valores/TTL presentes, altas y borrados prematuros permanecen estrictos. Una
corrección alinea el inicio al milisegundo entero de
[PEXPIRETIME](https://redis.io/docs/latest/commands/pexpiretime/) frente a los
microsegundos de [TIME](https://redis.io/docs/latest/commands/time/); no introduce
ventana de gracia ni altera TTL/reloj. Ocho regresiones incluyen el límite
fraccional observado y el rechazo del milisegundo anterior.

Precondición adicional: los cron de Boletería toman candados Redis aunque no
haya trabajo. El arnés exige cero reservas/publicaciones vencidas y adquiere
esos mismos candados `SET NX`, con sus TTL existentes **50/60 s**, antes de cada
comparación; los libera por testigo después. Aparecen completos en ambas
capturas. No se excluye su prefijo ni se desactiva/modifica el scheduler.
HTTP **10 s**, precondiciones **3 s**, sin ampliaciones ni reintentos automáticos.
Expiraciones naturales registradas por final: **0/4/0**. Se verifican **1.514.018.764
bytes JSON** en 2.076 gzip (240.764.826 bytes comprimidos), procesados por archivo
sin agregar todas las capturas en memoria.

## Regresiones y fallos conservados

- **85/85**, nueve suites backend: 12 unitarias nuevas y 73 existentes
  reejecutadas de guardas, roles, QR y los tres flujos. Tipos y build aprobados.
  Una nueva regresión HTTP de clave vigente ilegible queda en la suite CU-028
  de CI; la matriz HTTP real acredita además el gateway.
- Comparador **8/8**, dos regresiones nuevas de precisión y seis anteriores.
- **12/12 SSE HTTP**: tres flujos × gateway/Núcleo × revocación real/roles
  ilegibles. Evacuación detecta en 1,983–1,993 s; Monitoreo/Parqueaderos en
  2,977–3,008 s. Un terminal saneado, EOF y cero datos posteriores; nueva
  conexión 401/503 según causa. Ciclos 2/3 s intactos; no se promete detección
  instantánea. No se vuelve a ejecutar SIGTERM: se reutiliza la evidencia
  anterior de sus límites y cierres, sin cambios de apagado en este bloque.
- Las 151 operaciones previas mantienen su evidencia. No se reejecutan
  matrices históricas, los 16 recorridos, aceptación visible o DAST. La demo
  conserva 500 ms/1500 ms, foco, variantes normales, límites y cero reintentos.

Todos los intentos anteriores siguen privados y se resumen como fallidos:
adaptación WebCrypto njs/Node y su tipo TS; ACL restaurada con `+sadd` redundante
(214 observaciones) y modificador erróneo (213); precondición Monitoreo sin punto
de acceso (270); primera serie final interrumpida a las tres observaciones por
candado de cron; orquestador que sobrescribía el nombre con `swap` (cero llamadas
de negocio); serie con dos finales 560/560 y tercera interrumpida a las 444 por
precisión temporal. La comparación real de ese último par verifica dos
expiraciones naturales y SQL idéntico. **No se borran fallos ni se presentan
esas series como tres finales aprobadas.** ACL restaurada con sus reglas
[documentadas](https://redis.io/docs/latest/commands/acl-setuser/), sin resetear
credenciales/otros atributos. La comprobación parcial posterior de QR/último
administrador fue 132/132, separada de las finales completas.

## Reproducción y entorno

Usar las guardas/alternancia de
[OPERACION-LOCAL-REDASH-HEXACORE.md](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md).
Registrar estados antes de intervenir; solo un ámbito nuevo con SQL preparado
y base/Redis/vhost vacíos. `parqueaderos-entorno.cjs` conserva sus guardas y
admite omitir el gateway original; `cierre-entorno.py` añade Boletería y gateway
exclusivos. No sustituir imágenes, credenciales o montajes originales.

Orden: `preparar-cierre.cjs`, `sondear-cierre.cjs` **antes** de corregir y con las
imágenes de referencia conservadas, corrección e imágenes propias,
`cierre-recursos.cjs desarrollo`, regresiones pertinentes y `cierre-sse.cjs`.
Con el arnés verificado, `finales-cierre.py precisa` realiza tres finales sin
reintentar. `procedencia-cierre.py` valida JS/imágenes antes/después y
`resumir-cierre.py` verifica/exporta solo campos permitidos. Cada programa exige
`SEGURIDAD_SALIDA` dentro de `.privado/` ignorado y rechaza sobrescribir evidencia.
No ejecutar estos preparadores sobre bases existentes ni usar semillas.

Inicio: **105 contenedores originales**, Docker activo, once CU-015 y siete
Redash activos; preparación-base inactiva. Se detuvo Redash una vez, gracia120s;
scheduler137/OOMKilled=false se conserva con logs, sin atribuirlo a cierre
ordenado ni reabrir su causa. Los OOMKilled=true de otros cuatro eran históricos.
Seis aplicaciones CU-015 cerraron 0/143, sin OOM. Ocho cuentas iniciales nuevas,
dos administradores, y los recursos posteriores también exclusivos; cero
cuentas anteriores en la nueva base y ningún canal externo real.

Restauración única: **21:45:10.402–21:46:21.045 UTC**. Los 105 originales
conservan IDs/imágenes/montajes/estados; once CU-015 y siete Redash activos,
preparación-base inactiva. Seis contenedores nuevos detenidos **0/0/0/143/0/0**,
sin OOM; base, Redis/volumen y vhost se retienen. Docker activo; sin limpieza
global, reinicios de recuperación, reinstalación o intervención de otros proyectos.
La auditoría HTTP/cgroups posterior se conserva en la evidencia saneada:
un 200 puntual no acredita estabilidad sostenida ni elimina antecedentes OOM.
Control **21:48:03 UTC (16:48 Bogotá)**: `/ping` y `/login` timeout15s,
curl28/HTTP000. Nuevos `oom_kill`: server4, scheduled_worker2, adhoc_worker4,
worker2; scheduler/Redis/PG0. **Estados restaurados; HTTP Redash bloqueado/inestable
con OOM**, sin ciclos de recuperación. PostgreSQL listo y Redis PONG durante
la restauración. Las correcciones se publican para revisión, no se sustituyen
las imágenes/configuraciones originales al restaurar.

## Pendientes concretos de RNF-05/06

1. Ampliar DAST autenticado y de negocio fuera de los estados/rutas ya
   acreditados; confirmar combinaciones adicionales de roles/permisos,
   concurrencia y fallos de red/commit. **167/167 no significa exhaustividad.**
2. Resolver los residuos históricos de CSP: dos instancias por imágenes
   externas amplias y ocho de Google Fonts/SRI; confirmar proveedores/hosts o
   recursos locales según contrato. No se modifica CSP/fuentes/imágenes aquí.
   La auditoría actual de dependencias queda fuera; las mediciones previas
   de portales no se convierten en una auditoría nueva del backend/toolchain.
3. Conservar los límites de PAN/tokenización y flujos financieros pendientes
   (F12); este bloque no certifica todos los canales, almacenamiento, logs,
   respaldos o consumidores ni autenticidad criptográfica AMQP/offline.
4. Hallazgo funcional observado, **sin atribuirlo a autorización corregida**:
   QR acepta `puntoAcceso` omitido y registra ingreso/Ventas, pero el consumidor
   de Monitoreo exige ese dato y no proyecta el ingreso. Queda diagnosticado;
   las finales usan punto explícito. No se cambia esa regla para simplificar
   la prueba ni se acredita toda variante de proyección.

No se conoce una evasión de autorización pendiente en los casos probados de
esta matriz; eso no aprueba Seguridad global. El plan de
[dos servidores y un cliente](../../../../Documentation/Work/PLAN-DEMO-ZEROTIER.md)
queda listo para implementar cuando existan los datos de equipos/red/TLS;
VPN, destinos entre hosts y caídas siguen sin ejecutar.
