# Cierre de Alimentos — Sebastián

Revisión inicial: 7 de noviembre de 2026 (America/Bogota). Rama
`feature/sebastian`, limpia en `a2e85d5517b8cee02a83df508dd9784fbff9de28`,
coincidente con origin antes de editar. ADR-16 conserva módulos y preparación
central; no autoriza el corte de las bases habituales.

| CU | Implementación encontrada | Comportamiento comprobado en esta entrega | Pendiente |
|---|---|---|---|
| 011 | Catálogo, checkout, reserva Redis, pagos, confirmación y QR | 9/9 pruebas originales de integración, más compra real con QR en Playwright | F12 y cancelación del establecimiento CU-011F siguen pendientes; no se resuelven al deshabilitar |
| 012 | Consulta de menú y activación de productos | Playwright real: 403 sin vínculo, 200 al asignar cuenta Personal, 403 al revocar | CRUD completo, precios, restricciones e inventario coordinado con reservas |
| 013 | Recepción de confirmados, solo lectura | Recepción real 200 solo con vínculo; unitarias y guarda por cuenta/establecimiento | Preparación, tiempos, transiciones y avisos |
| 014 | QR de pedido generado por 011 | Se generó y mostró el QR real de CU-011; no certifica entrega | Validación, entrega única y registro durable |
| 015 | API administrativa, migración aditiva, contacto/horario/zona/estado, catálogo y checkout con Eventos vigente, portal real | Playwright 2/2, unitarias, migración vacía/actualización y regresión 011 aprobadas | Sin pendientes funcionales de CU-015; límites operativos descritos abajo |

Orden: **CU-015 completado** → CU-012 → CU-013 → CU-014; mantener regresión CU-011
en cada etapa. La columna de comprobaciones contiene solo resultados ejecutados y distingue código presente de comportamiento probado.

## Alcance y acuerdos

- CU-015 vigente es **Gestionar establecimientos de alimentos** (SRS, flujo
  básico y alternativos A/B/C y excepción D). Las referencias antiguas a cancelaciones/reembolsos
  no crean otro CU. CU-011F y los requisitos de pedidos cancelados de CU-013/014
  se conservan como pendientes de reglas/transiciones de negocio.
- Acuerdo verificable: `git show 5950dea54c3dcafd20fe215ee392008a4663fa30:App/services/administracion/README.md`,
  líneas 16–17: CU-027 y CU-028 los implementa Samuel por acuerdo del equipo.
  CU-027 tiene cuentas, sesiones, recuperación, renovación/revocación y portal;
  reutilizarlos. CU-028 mantiene roles estáticos y guardas; permisos dinámicos
  son dependencia pendiente de Samuel, no parte de esta entrega.
- CU-029 implementado por Samuel: módulo Eventos/Recintos, migraciones, pantallas
  y pruebas existentes. Reutilizar la fuente de eventos CU-026 y revisar su API,
  sin rehacer CU-029. CU-030–032 no se reasignan a Sebastián.
- Sebastián lidera la validación de Seguridad RNF-05/06; los resultados aquí son
  evidencia acotada, no certificación global. Documenta pantallas/navegación de
  Alimentos para Usabilidad; Daniel consolida el atributo.

## Entorno y decisiones por verificar

Docker estaba detenido; se inició y se inventariaron los recursos. Existen el
entorno habitual, revisión de arquitectura y referencias A/B. Se conservarán:
CU-015 tendrá proyecto, volúmenes, red, claves, cookies y puertos propios.
Las tareas pesadas se ejecutan secuencialmente (Mac M2, 8 GB).

Horario diario con horas locales y zona IANA explícita (`America/Bogota` inicial),
cruce de medianoche y límites documentados. El estado y horario se consultan al
crear pedidos nuevos; nunca cancelan ni reembolsan pedidos anteriores.
La existencia/disponibilidad de eventos se obtiene por interfaz del dueño vigente,
sin considerar la proyección histórica de Alimentos como autoridad.

Las cuentas de Personal se reutilizarán mediante un vínculo persistente
cuenta–establecimiento. El rol Personal por sí solo no concederá acceso global.
Esto no implementa el sistema general de permisos dinámicos CU-028.

## Hitos

1. Revisión, trazabilidad y plan (este documento).
2. Backend CU-015, migración aditiva, frontera Eventos y autorización.
3. Portal administrativo y entorno aislado reproducible.
4. Playwright TypeScript con gateway/portales reales, regresión y publicación
   exclusiva en `origin/feature/sebastian`.

Los comandos, resultados, fallos previos, limitaciones y commits se registrarán
al verificar cada hito. El archivo respaldado `publicador-pedidos.service.ts`
fuera del repositorio se conserva allí y no se reincorpora.

## Resultado ejecutado — 7 de noviembre de 2026

Comandos completos: [guía reproducible](../../App/e2e/README.md).
Host de pruebas Node **22.22.3**, compiladores Angular propios del portal,
Playwright Test **1.65.0**, Chromium **158.0.8127.18**, un trabajador.

| Comprobación ejecutada | Resultado |
|---|---|
| Backend `npm run lint` y `npm run build` | Aprobados |
| Builds Docker secuenciales Núcleo/Boletería/Trabajador, gateway y portales | Aprobados; sin sustituir destinos habituales |
| Portal administrativo `npm run build` | Aprobado |
| Angular/Karma ChromeHeadless 157, cliente y administrativo | **16/16** (incluye CU-011) y **1/1** |
| `npm run tipos` en App/e2e | Aprobado |
| Unitarias con Redis real propio (`REDIS_PUERTO=16404`, opt-in Redis inventario) | **856/856, 59 suites**, sin omitidas |
| `npm run test:cu015:migracion` | **2/2**: instalación vacía y actualización; 26 migraciones, 18 procedencias conservadas, repetición sin DDL |
| `npm run test:cu015:regresion` | **9/9 CU-011 originales**, sin eliminar aserciones; otro proyecto propio, detenido al terminar |
| `npm run verificar:infra` | Configuraciones vigentes y fronteras aprobadas; se registran solo las API públicas nuevas |
| `python3 -m unittest discover -s App/infra/revision` | **11/11** guardas de propiedad, puertos, destinos, semillas y cierre |
| `npm run test:cu015` | **2/2** recorridos integrados sin mocks, gateway y backend directo |
| `npm run test:cu015:visible`, repetición sin cambios tras el incidente DNS | **2/2** con navegador abierto; no acredita que DNS esté corregido |

La actualización se probó en `cu015_2f8300c4cdc3_actualizacion`, creada únicamente
para este ensayo en el PostgreSQL CU-015. Se conservaron exactamente los campos
anteriores del establecimiento, el pedido confirmado, el producto y su detalle.
La base vacía fue `cu015_2f8300c4cdc3_vacia`. Ambas quedaron disponibles para
inspección; no se usaron bases habituales ni las referencias A/B.
Después de parar/reiniciar el entorno CU-015 se comprobaron el establecimiento
editado, su horario UTC y el pedido confirmado anterior; la carga continuó
`COMPLETA`, sin semillas ni migraciones reaplicadas.

Playwright creó eventos propios mediante CU-026/029, registró y editó por el
portal, comprobó recarga y validaciones, deshabilitó y habilitó, cambió horario/zona
al periodo cerrado y comprobó catálogo y rechazo real de checkout. Antes compró
un producto propio mediante Redis/Pagos/pasarela y mostró su QR; tras el cierre
comparó **toda la fila del pedido confirmado**, sin cambios, y stock físico 4 de 5.
La prueba de API comprobó Organizador/Administrador, 401/403 en Núcleo y gateway,
duplicado concurrente (201/409), evento inexistente, cancelación del evento en la
fuente vigente y vínculo/revocación de Personal. No declara completados CU-012–014.

La regresión original conserva 9 escenarios: login/perfil, checkout
con reserva atómica, rechazo de sobre-reserva, pago rechazado, pago aprobado con
mensajería, repetición idempotente, renovación/cookie HttpOnly, cierre/revocación
y SIGTERM sin conexiones abandonadas. El runner conserva los recursos propios
`hexacore-cu015-regresion`; no inicia ni cambia los proyectos de referencia.

## Incidencias encontradas y corregidas

- Arranque integrado detectó una exportación Nest faltante en la nueva guarda de
  Personal. Se corrigió y el arranque real y acceso integrado pasaron. La carga
  inicial se detuvo con `EN_CURSO`, como exige la guarda. Se verificaron 12 cuentas,
  3 establecimientos, 12 productos, cero pedidos, 9 eventos y las tres marcas/stock
  Redis (4 productos por punto). Se marcó únicamente esa carga propia como
  `DATOS_VERIFICADOS`, se arrancaron apps sin semillas y se completó la fase
  idempotente de Logística (5 empleados, 1 turno). Quedó `COMPLETA`. No se repitieron
  semillas SQL/Redis ni se sobreescribieron existencias. El arranque fresco con el
  código corregido sigue usando el flujo único normal; no se añadió un bypass.
- Playwright detectó dos enlaces válidos «Establecimientos» en el dashboard/menú.
  Se acotó el selector al elemento de navegación. Los intentos fallidos y su traza
  se conservan en `.evidencia/fallo-inicial-selector/`, privada e ignorada por Git.
- La comprobación de fronteras rechazó el nuevo import de Identidad: se amplió la
  lista únicamente para `consulta-personal.module` y se añadió la restricción de
  Alimentos a `consulta-eventos.module`, manteniendo la prohibición de internals.
- Se detectó que `RequisitosCasosUso.tex` es generado. Las correcciones se llevaron
  a su fuente `CU_eventos_completo.xlsx` y se regeneraron los **32 CU**: exactamente
  ocho celdas modificadas, solo CU-011/CU-015. La etiqueta no reconocida de excepción
  ocultaba CU-015D en el LaTeX; se normalizó y se recuperó el requisito de conservar
  pedidos activos al deshabilitar. Los requisitos de cancelación/reembolso no se
  eliminaron ni se convirtió su referencia antigua en un caso adicional.

Una repetición visible posterior al reinicio recibió 503 en el primer login.
El log del gateway identifica la causa: `nucleo could not be resolved (110:
Operation timed out)` (7/11, 03:53:52 America/Bogota), sin petición recibida por
Núcleo. La segunda prueba entró y pasó. Se conserva la traza privada en
`.evidencia/fallo-login-503/`; no se modifica DNS/timeouts ni se añaden reintentos
para ocultarlo. Es una incidencia observada del entorno Docker; no se demuestra
que sea F13 ni un defecto previo/introducido en Alimentos.

No se atribuyen los errores nuevos de código o selectores a la línea base. No se omitieron pruebas
ni aserciones para obtener los resultados aprobados.

## Límites y siguiente encargo

- RNF-05/06: evidencia concreta de validación, RS256/roles/revocación, rechazo de
  acceso directo y alcance del Personal. No sustituye auditoría global, medición
  de carga, TLS productivo ni los permisos dinámicos CU-028 pendientes de Samuel.
- La administración de cuentas, sesiones y CU-029 existentes se reutiliza. No se
  reimplementan CU-030–032 ni se cambia el reparto del equipo.
- Los cierres bloquean pedidos nuevos, no pagos de checkouts ya creados ni pedidos
  confirmados. F12, avisos, preparación, entrega única y políticas de cancelación
  siguen con sus CU/dueños; no hay reembolsos automáticos.
- Nuevos establecimientos sin productos tienen catálogo vacío. El único producto
  de Playwright es fixture propio para demostrar disponibilidad y regresión; no
  entrega el CRUD de productos/inventario de CU-012.
- Datos históricos reciben horario 24 h y contacto pendiente. Duplicados previos
  ambiguos bloquean la migración transaccionalmente para revisión de su dueño;
  no se borran/renombran. Una referencia antigua sin evento en la autoridad no
  habilita pedidos. El sistema no inventa esos eventos durante la migración.
- Pruebas/demos conservan datos propios y crecen al repetirse. No se publica
  `.estado-cu015`, tokens, contraseñas, sesiones, informes con cabeceras ni trazas.
  El respaldo externo de `publicador-pedidos.service.ts` no se tocó.

**Siguiente encargo CU-012:** completar productos (nombre, descripción, precio,
restricciones, estado) e inventario con su trazabilidad y coordinación con reservas
activas Redis. Añadir la selección/asignación de cuentas Personal desde la interfaz
usando el vínculo local ya probado. Mantener los pedidos/snapshots anteriores y
repetir CU-011/CU-015; después abordar preparación CU-013 y entrega única CU-014.

## Commits y publicación

- `6564958`: revisión, plan inicial y trazabilidad.
- `91550ff`: backend CU-015, migración, interfaces explícitas, acceso acotado y pruebas.
- `09b0199`: portal, entorno, Playwright, fuente Excel/SRS y cierre documental.

Los tres hitos se publicaron exclusivamente en `origin/feature/sebastian`.
`git ls-remote origin refs/heads/feature/sebastian` confirmó
`09b0199601d1fe87aefab69c5b2e7c0d8afc9603`, coincidente con HEAD funcional.
No se integró a develop/main. Este cierre de evidencia documental se publica
en la misma rama; no modifica el código demostrado.

Arranque final desde el hito funcional limpio: las imágenes quedaron etiquetadas
con `org.opencontainers.image.revision=09b0199601d1fe87aefab69c5b2e7c0d8afc9603`
y `hexacore.fuente.modificada=no`. Núcleo, Boletería, Trabajador, gateway y ambos
portales quedaron saludables; carga demo `COMPLETA`, sin repetir semillas.
