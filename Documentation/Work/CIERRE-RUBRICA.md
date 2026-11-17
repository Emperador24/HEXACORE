# Preparación de la sustentación y cierre frente a la rúbrica

**Corte vigente 16/11 — tres atributos de Sebastián:** Seguridad RNF-05/06;
Safety monetario RNF-01/02/11; Modificabilidad RNF-13, conforme a
[DISTRIBUCION-ATRIBUTOS](DISTRIBUCION-ATRIBUTOS.md). [Guion ejecutable de 8 min y
límites](PLAN-CIERRE-SEBASTIAN.md#entrega-vigente--seguridad-safety-monetario-y-modificabilidad-16112026).
Se integra PR #60 y #62, sin operar ZeroTier. El temario completo sigue por
contrastar. [PR #64](https://github.com/Emperador24/HEXACORE/pull/64).

**Aclaración del entorno (Samuel, 16/11):** el servidor de presentación nunca
se creó; los nombres de terceros de la antigua guía no son destinos del equipo.
Se conserva [CI111 temporal, 9/9](https://github.com/Emperador24/HEXACORE/actions/runs/44000569216)
sobre `d32f582`, sin repetir escaneos por esta corrección documental.
[Guion de navegación y descarga de informes](PLAN-CIERRE-SEBASTIAN.md#mostrar-el-escaneo-aprobado-en-actions).
La conexión/validación externa de Diego sigue pendiente separada. Se mantienen
los límites RNF de las fichas y la falta de temario completo contrastado.

| Atributo | Diseño/implementación nueva | Comprobado | Resultado/pendiente |
|---|---|---|---|
| Seguridad | ZAP reutilizado tras despliegue temporal y workflow posterior al despliegue real; versiones/HTML/JSON saneados, cero High; npm producción/desarrollo | 167/167 y PAN históricos reutilizados; 4/4 pruebas de saneamiento; cinco paquetes sin Critical ni producción vulnerable, 20 moderadas de desarrollo backend | **Comprobado en CI109:** ZAP 2.17.0 AMD64, 0 High, 10 Medium/4 Informational conservadas; producción/Critical npm 0. RNF-05/06 **parciales**, conexión externa de Diego pendiente; fallos anteriores conservados |
| Safety monetario | Verificador identificado de solo lectura, dinero exacto, relaciones libro/negocio/historial; negativo con doble | 17/17 unitarias; integración añadida a las pruebas financieras/QR existentes, sin nuevos CU | **Comprobado:** convivencia 5/5 y CLI 0/1 en CI109; reventa después de converger. RNF **parciales**: F12 sin resolver, referencia original de reembolso ausente en libro, QR asíncrono y retención anual sin acreditar |
| Modificabilidad | Tres parámetros existentes con efecto HTTP/navegador/SQL y Image IDs iguales; rango y URL inválidos rechazados | 24/24 guardas de API de ambos portales, 6/6 guardas de recursos y 3/3 procedencia desplegada con dobles, tipos; ensayo de servicios aprobado en CI109 | **Comprobado en CI108/109:** HTTP/navegador/SQL efectivos; 3004/1003 ms, inválidos rechazados y seis imágenes iguales. RNF-13 **parcial** por concesión de despliegues ADR-16 |


Corte documental: **15/11/2026, America/Bogota**. Rama exclusiva
`feature/sebastian`; revisión inicial limpia en `9bc1ee5`. Código y evidencias
anteriores se inspeccionan, **no se vuelven a ejecutar**. Esta entrega no opera
Docker/Redash, no instala ZeroTier, no provoca caídas y no desarrolla F12,
sustituciones ni casos de otros integrantes.

**Preparación parcial.** Hay SAD y presentación actualizados, trazabilidad de
Seguridad y guion de 54 minutos. El usuario confirmó el reparto de validación
del 5/11, incorporado abajo sobre `d819d4d` limpio. Faltan el temario completo,
la asignación de los RNF fuera de ese reparto y evidencias/demostraciones que debe
confirmar el equipo. No se puede
afirmar que se cubrieron todos los atributos vistos solo porque estén los del SAD.

## Rúbrica y material de entrega

| Exigencia del profesor | Preparación documental | Estado / condición de cierre |
|---|---|---|
| Máximo una hora | Guion **54 min**, con 6 min de preguntas; reserva adicional de 6 min hasta el máximo | Propuesto; falta ensayo cronometrado del equipo |
| Cambios de arquitectura, 10 min | Presentación, 04:00–14:00: contenedores antiguos ADR-14/15 frente a ADR-16 actual, decisiones y concesiones | Preparado; el diagrama antiguo es una propuesta, no un despliegue demostrado |
| Prototipo, 10 min | 34:00–44:00; tabla de microdemostraciones inferior | Propuesto; pruebas en vivo pendientes, varias dependen de confirmación |
| Una diapositiva de atributos por integrante | Diapositiva «Responsables de atributos» con el reparto de validación confirmado por el usuario | Preparada; el contraste con el temario completo y RNF fuera del reparto sigue pendiente |
| Diseño e implementación de todos los atributos del curso, diapositivas y demostración | Quince fichas inferiores, correspondientes a RNF-01–19, más grupos de diapositivas y propuestas de demo | **No acreditado globalmente:** falta temario completo y cerrar faltantes de evidencia/autoría |
| SAD, enlaces a código, diapositivas y anexos en Brightspace | [SAD PDF](../Submission/DescripcionArquitecturaSoftware.pdf), [presentación PDF](../Submission/Presentacion.pdf), fuentes y anexos enlazados abajo | Compilación/revisión local documentada al final; carga a Brightspace pendiente del equipo |
| SAD 10 %, diseño 30 %, implementación 30 %, conocimiento individual escrito 30 % | Cada ficha conecta escenario → táctica → código → evidencia → límite; preguntas individuales al final | La documentación no acredita la evaluación escrita individual |

Fuentes principales: [SAD](DescripcionArquitecturaSoftware.tex), incluidos
[arquitectura vigente](ArquitecturaVigente.tex), [atributos medidos](AtributosVigentes.tex),
[Seguridad vigente](SeguridadVigente.tex), [RNF compartidos](RequisitosNoFuncionales.tex)
y ADR-14/15/16; [SRS](EspecificacionRequisitos.tex),
[plan de cierre](PLAN-CIERRE-SEBASTIAN.md),
[guion de Samuel](../../App/infra/DEMOSTRACION-ATRIBUTOS.md),
[carga 1 réplica](../../App/infra/informe-atributos/CARGA-1-replica.md),
[carga Núcleo 2 réplicas](../../App/infra/informe-atributos/CARGA-nucleo-2-replicas.md),
[informe anterior](../../App/infra/informe-atributos/INFORME.md),
[Seguridad/resultado](../../App/infra/informe-atributos/seguridad/RESULTADO.md),
[cobertura por operación](../../App/infra/informe-atributos/seguridad/COBERTURA-RECURSOS.md)
y [Security/Safety](../../App/infra/informe-atributos/seguridad/SECURITY-SAFETY.md).

**Temario:** la bitácora menciona catorce atributos y clases 6–14; RNF-19 añade
Observabilidad. Security/Safety referencia dos materiales aportados previamente.
No se encontró un programa íntegro del curso versionado que permita comprobar
que esos quince nombres sean la lista completa exigida. Solicitar al equipo
el temario y cotejarlo uno a uno; no inventar atributos ni autores por exclusión.

## Estados y responsables respaldados

- **Implementado:** existe código o configuración identificable. No prueba su ejecución.
- **Comprobado:** hay una ejecución identificada, con fecha, entorno y alcance. No se extrapola.
- **Parcial:** solo parte del escenario/umbral tiene diseño, código o comprobación suficiente.
- **Desconocido:** no se halló evidencia o confirmación suficiente; no equivale a inexistente.
- **Pendiente:** acción futura, sin resultado medido. Un atributo puede tener código implementado,
  un ensayo comprobado y seguir parcial frente al RNF completo.

**Fuente del reparto:** confirmación del usuario en esta entrega, basada en la
guía de validación del **5 de noviembre de 2026**. Se incorpora el reparto
transcrito; no se atribuye una lectura de una copia íntegra no identificada en el
repositorio. La guía es un **plan de validación, no evidencia de resultados**.
El código y los informes actuales determinan los estados de las fichas. No se
ejecutan sus instrucciones antiguas de borrado, semillas, paradas o intervención
de otros proyectos.

| Integrante | Asignación de validación confirmada | Respaldo | Validación pendiente |
|---|---|---|---|
| Sebastián Sánchez | **Seguridad RNF-05/06; Safety monetario RNF-01/02/11; Modificabilidad RNF-13**; aporte a Usabilidad | Confirmación del usuario; RESULTADO.md y PLAN-CIERRE-SEBASTIAN.md | Preparar microdemo existente y aporte de pantallas, navegación, rotulado, pasos y capturas; RNF-05/06 siguen parciales |
| Samuel Emperador | **Desempeño, RNF-07/08/10; Disponibilidad, RNF-03/04/09/17; Monitoreo, RNF-19** | Reparto confirmado de la guía 5/11; Monitoreo documentado después en AtributosVigentes.tex y DEMOSTRACION-ATRIBUTOS.md | Contrastar cada umbral con informes actuales; 2000 usuarios, ingreso→tablero y recepción de alertas no se dan por comprobados por el reparto |
| Daniel Cristancho | **Integrabilidad RNF-16 y consolidación de Usabilidad RNF-12/14**, con aportes de todos | Confirmación del usuario y PLAN-CIERRE-SEBASTIAN.md, «Alcance y acuerdos» | Evidencia humana RNF-12 y matriz web/móvil RNF-14 |
| Diego Coronado | **Desplegabilidad, RNF-15/18** | Reparto confirmado por el usuario a partir de la guía 5/11 | Evidencia específica de despliegue/reversión y cobertura/aislamiento, sin equiparar configuración o conteo de tests a cumplimiento |

Los **bloques de trabajo de la guía** agrupan RNF de varios atributos del SAD:
RNF-10 es Escalabilidad; RNF-09, Tiempo real; RNF-17, Safety; RNF-18,
Comprobabilidad; RNF-14, Portabilidad. Sus nombres, escenarios y umbrales
permanecen separados en las fichas. Agruparlos para sustentar no los redefine ni
convierte la guía en medición. El reparto posterior de DISTRIBUCION-ATRIBUTOS confirma RNF-01/02/11/13
para Sebastián y RNF-16 para Daniel; conserva la clasificación individual del SAD.

**Aporte de Sebastián a Usabilidad:** pantallas, navegación, rotulado, flujos
con pasos y capturas de **Alimentos y cuentas/roles/recintos**, para la
consolidación de Daniel. Reconocer la implementación de Samuel donde corresponda,
en particular en Identidad/CU-027/028 y Recintos/CU-029; aportar documentación de
uso no transfiere su autoría ni acredita el ensayo con usuarios o la paridad global.

Implementar un CU no confirma la propiedad de su atributo. Se conserva el reparto
formal del SRS y el acuerdo de implementación de Identidad/Recintos por Samuel;
no se reasignan sus funciones ni los pendientes de Diego a Sebastián.

## Fichas por atributo

Las referencias ASR son las del árbol de utilidad del SAD. Observabilidad tiene
RNF-19 pero no un ASR numerado en ese árbol; no se crea un ASR ficticio.

### Consistencia

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Sebastián Sánchez**, Safety monetario RNF-01/02; reconocer implementación CU-006 de Samuel |
| Escenario / ASR / RNF | Dos compradores sobre la misma publicación, sin doble venta; invalidación del QR anterior. ASR-01, RNF-01/02 |
| Diseño | Reserva/bloqueos, estado transaccional, idempotencia, outbox y proyecciones; convergencia no equivale a invalidación inmediata |
| Implementación | **Implementada en parte:** [Ventas/Postventa](../../App/backend/modulos/entradas/postventa/postventa), [Acceso QR](../../App/backend/modulos/entradas/acceso-qr); mismo SQL no hace atómicas operaciones separadas |
| Evidencia | INFORME.md registra 50 compradores: 1 checkout/49 rechazados en su corrida histórica; pruebas de [Boletería](../../App/backend/test/boleteria) y [autorización de Ventas](../../App/infra/informe-atributos/seguridad/AUTORIZACION-VENTAS.md) con alcances distintos |
| Resultado | **Parcial.** La carrera histórica está comprobada en su revisión; no prueba RNF-02 inmediato bajo todos los canales/caídas actuales |
| Pendiente | Evidencia vigente específica RNF-01/02; no presentar la espera de convergencia como rechazo inmediato del QR viejo |

### Disponibilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador**, bloque Disponibilidad de la guía: RNF-03/04 y RNF-09/17, estos últimos en fichas separadas |
| Escenario / ASR / RNF | Caída de instancia durante ingreso. ASR-02, RNF-03/04: ≥99,9 % mensual y recuperación ≤30 s |
| Diseño | Núcleo/Boletería replicables, gateway, sesiones compartidas, detección pasiva y reinicio Docker; dependencias centrales sin redundancia |
| Implementación | **Implementada:** [Compose de escalado](../../App/infra/docker-compose.escalado.yml), [gateway](../../App/gateway/nginx.conf) y [guion local](../../App/infra/demo-disponibilidad.sh) |
| Evidencia | AtributosVigentes.tex/guion de Samuel: 484 lecturas Boletería y 509 Núcleo en 8 s, cero fallos; reinicio 8–13 s en un computador, fecha 12/11 |
| Resultado | **Comprobado para ese proceso y tráfico; parcial frente a RNF-03/04 completos.** No acredita caída de host, todo método ni porcentaje mensual |
| Pendiente | [Dos servidores y cliente](PLAN-DEMO-ZEROTIER.md), equipos/TLS/destinos y medición futura; A debe permanecer encendido. No ejecutar caídas en esta entrega |

### Seguridad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Sebastián Sánchez** |
| Escenario / ASR / RNF | Actor sin autoridad vigente intenta acceder a recurso o pago. ASR-03, RNF-05/06 |
| Diseño | JWT RS256, renovación/revocación compartida, roles y permisos vigentes, autoridad SQL administrativa, reglas por recurso y SSE revalidado; datos de pago limitados por contrato |
| Implementación | **Implementada:** [guarda común](../../App/backend/compartido/seguridad/sesion-valida.guard.ts), [gateway](../../App/gateway/autenticacion.js), guardas/servicios de dominio y [contratos](../../App/shared/seguridad) |
| Evidencia | **167/167 protegidas** de 186 declaradas/181 expuestas; últimas 16 por gateway/directo. Tres finales 560/560 y 346 conservaciones completas por final. [CI 9bc1ee5](https://github.com/Emperador24/HEXACORE/actions/runs/43768177312): 8/8, 1173 unitarias, Núcleo 141×2 y Boletería 29×2 |
| Resultado | **Comprobado el inventario en combinaciones publicadas; RNF-05/06 parciales.** 151 operaciones reutilizan evidencia anterior. Dos brechas corregidas: delegación de permisos nuevos en gateway y privilegio antiguo ante roles Redis ilegibles |
| Pendiente | DAST autenticado/combinaciones, residuos CSP, canales de PAN/datos, dependencias y límites publicados; no seguridad absoluta, Safety física ni F12. Ver [bloque SAD](SeguridadVigente.tex) |

### Rendimiento / Desempeño

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador** |
| Escenario / ASR / RNF | Apertura CU-001 y validación QR. ASR-04, RNF-07 p95≤500 ms con **2000** usuarios; RNF-08 QR p95≤300 ms |
| Diseño | Balanceo, concurrencia por procesos, pools limitados y consultas parametrizadas |
| Implementación | **Implementada:** [prueba-carga.py](../../App/infra/prueba-carga.py), aplicaciones y configuración de pools |
| Evidencia | CARGA-1-replica.md (12/11): lecturas CU-006/026/025 hasta **200** usuarios, p95 150/355/311 ms. CARGA-boleteria-1-replica.md (16/11): **CU-001 p95 197 ms** con 200 usuarios; **QR p95 51 ms** con 10 lectores sin pausa (~500 validaciones/s), 333 ms con 50. Cero fallos; un portátil compartido |
| Resultado | **RNF-07 cumple en CU-001 hasta 200 usuarios; 2000 no verificado. RNF-08 cumple hasta ~500 validaciones/s**; desde 50 lectores simultáneos lo supera porque todas suman en la misma fila de aforo |
| Pendiente | 2000 usuarios con el generador en otra máquina; contador de aforo repartido por puerta si se quiere más capacidad de QR |

### Tiempo real

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador**, RNF-09 dentro del bloque Disponibilidad acordado |
| Escenario / ASR / RNF | Ingreso/salida o incidente reflejado en tablero ≤2 s. ASR-05, RNF-09 |
| Diseño | Ingreso por evento AMQP, proyección de Operación y SSE consultando estado |
| Implementación | **Implementada en parte:** [Monitoreo](../../App/backend/modulos/operacion/monitoreo), [flujos SSE](../../App/backend/modulos/operacion/comun/flujo-operacion.service.ts) y Parqueaderos |
| Evidencia | TIEMPO-REAL.md (16/11), `tiempo-real.py`: ingreso → panel SSE, 20 muestras por panel en fase al azar. **Parqueadero máx. 1,01 s; Monitoreo (QR → RabbitMQ → Operación) máx. 1,12 s**, 20/20 en ≤ 2 s |
| Resultado | **Comprobado con carga normal.** Para lograrlo: flujos cada 1 s (antes 3 s); bandeja de salida de Acceso QR de ~50 a ~1700 avisos/s (confirmaciones en lote); ingreso sin puntoAcceso contado en «Acceso general» en vez de DLQ |
| Pendiente | Un pico de más de ~1700 ingresos/s volvería a atrasar la bandeja |

### Escalabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador**, RNF-10 dentro del bloque Desempeño acordado |
| Escenario / ASR / RNF | Duplicar Entradas: throughput ≥1,7× sin degradar otros dominios. ASR-06, RNF-10 |
| Diseño | Réplicas por programa y balanceo; PostgreSQL, Redis y gateway compartidos pueden limitar |
| Implementación | **Implementada:** escalado de Núcleo/Boletería; los componentes internos de Boletería no escalan de forma independiente |
| Evidencia | CARGA-nucleo-2-replicas.md: CU-025 **1,82×**, CU-026 **1,57×**. CARGA-boleteria-2-replicas.md (16/11): Boletería ×2, **CU-001 1,12×, CU-006 1,26×**, QR 1,04×; réplicas al 90–99 % de un núcleo con gateway, PostgreSQL y generador en el mismo portátil |
| Resultado | **No cumple en Entradas en este entorno.** La duplicación no es limpia: no quedan núcleos libres; en QR el límite es PostgreSQL (fila de aforo compartida) |
| Pendiente | Repetir con cada réplica en su máquina (red ZeroTier A/B) |

### Trazabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Sebastián Sánchez**, Safety monetario RNF-11 |
| Escenario / ASR / RNF | Operaciones financieras con actor, tiempo, transacción y resultado; 100 %, retención ≥1 año. ASR-07, RNF-11 |
| Diseño | Libro financiero común, historiales y auditoría cuyo actor deriva de sesión |
| Implementación | **Implementada en parte:** [Finanzas/Pagos](../../App/backend/modulos/finanzas/pagos), auditoría de Identidad y Alimentos |
| Evidencia | [Contratos de pagos](../../App/backend/test/pagos/README.md), conservación de historiales/outbox en Seguridad y auditoría de cuentas/roles |
| Resultado | **Parcial.** Se comprueban registros en casos concretos; no hay evidencia suficiente de 100 % global y retención efectiva anual |
| Pendiente | Catálogo de operaciones auditables y política/prueba de retención; SQL auditable no es no repudio criptográfico |

### Usabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Daniel Cristancho consolida RNF-12/14**, con aportes de todos; Sebastián aporta pantallas, navegación, rotulado, pasos y capturas de Alimentos y cuentas/roles/recintos, reconociendo la implementación de Samuel donde corresponda |
| Escenario / ASR / RNF | Usuario nuevo compra en ≤5 pasos; éxito ≥80 % con 5 usuarios. ASR-08, RNF-12 |
| Diseño | Interfaces por rol, estados y avisos diferenciados; no confundir aviso de reembolso con dinero confirmado |
| Implementación | **Implementadas interfaces:** [portal cliente](../../App/frontend/portal-web-cliente), [portal admin](../../App/frontend/portal-web-admin), [app](../../App/frontend/app-movil) |
| Evidencia | Recorridos automáticos/visibles en [e2e](../../App/e2e/README.md) y plan de cierre. [USABILIDAD-PORTABILIDAD.md](USABILIDAD-PORTABILIDAD.md): compra en ≤5 pasos por diseño (app 4, web 4–5) y protocolo de cinco usuarios con plantilla; sin resultados humanos |
| Resultado | **Parcial; éxito humano desconocido.** Playwright 16/16 y el conteo de pasos no equivalen al ensayo RNF-12 |
| Pendiente | Ejecutar el protocolo (P1–P5 anonimizados, tiempos, errores, ayudas) o declarar en la sustentación que no se hizo |

### Mantenibilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Sebastián Sánchez**, Modificabilidad RNF-13 |
| Escenario / ASR / RNF | Cambio típico en un dominio sin modificar/redesplegar otros. ASR-09, RNF-13 |
| Diseño | Módulos y conexiones nombradas, API pública local de Pagos, contratos compartidos; ADR-16 acepta despliegue/versionado coordinados |
| Implementación | **Implementada:** [workspace backend](../../App/backend/nest-cli.json), módulos, esquemas y preparación coordinada |
| Evidencia | [ESTADO-MIGRACION](ESTADO-MIGRACION.md) prueba preservación y separación en el hito; no mide todo cambio típico posterior |
| Resultado | **Parcial.** Separación lógica comprobable por inspección; independencia de despliegue por dominio tiene una concesión explícita |
| Pendiente | Ensayo de tres parámetros y ejemplo revisable Monitoreo sin puntoAcceso (PR #60); medición de cambio/impacto; conservar el RNF como objetivo y explicar la concesión, sin rediseñar |

### Portabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Daniel Cristancho**, consolidación RNF-14 dentro del bloque Usabilidad acordado, con aportes de todos |
| Escenario / ASR / RNF | 100 % de CU Cliente en web/móvil, misma API y sin reglas duplicadas. ASR-10, RNF-14 |
| Diseño | Dos portales Angular y una app Flutter Cliente/Personal sobre gateway; configuración de API por entorno |
| Implementación | **Implementados clientes y contratos**; no se infiere paridad de todo CU por existir sus pantallas |
| Evidencia | [Matriz por CU](USABILIDAD-PORTABILIDAD.md#rnf-14--portabilidad): 11/11 CU con parte interactiva del Cliente en web y app sobre el mismo contrato, 0 reglas duplicadas. Antes 6/11: la app simulaba CU-001 a 005 y calculaba el descuento en el teléfono; conectada en esta entrega. Pruebas `boleteria_test.dart` 4/4 y `validar_entradas_test.dart` 8/8 (app 90/90) y `entradas.service.spec.ts` 5/5 (web 35/35) |
| Resultado | **Cumple por inspección y pruebas automáticas**; sin prueba en teléfono físico ni por HTTPS de la demo |
| Pendiente | Probar la app en un teléfono contra la URL HTTPS de la demo y confiar en su certificado |

### Desplegabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Diego Coronado**, RNF-15/18 en el bloque Desplegabilidad acordado; RNF-18 se analiza también como Comprobabilidad |
| Escenario / ASR / RNF | Versión sin errores, despliegue ≤10 min y reversión ≤5 min. ASR-12, RNF-15 |
| Diseño | Imágenes, preparación SQL única, control de versiones y plan de corte/reversión; una base compartida exige coherencia de escritores |
| Implementación | **Implementados scripts/configuración:** [infra](../../App/infra), [preparación](../../App/backend/compartido/persistencia/preparar-base.ts), CI/CD |
| Evidencia | ESTADO-MIGRACION §§23–24: A/B, imágenes y CI; [corte/reversión](CORTE-Y-REVERSION.md) sigue pendiente en el entorno habitual |
| Resultado | **Parcial.** YAML válido, arranque vacío o CI verde no acreditan despliegue sin interrupción y reversión de datos nuevos |
| Pendiente | Diego contrasta evidencia específica y ventana controlada futura; no ejecutar despliegue, corte ni restauración en esta entrega |

### Integrabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Daniel Cristancho**, RNF-16 |
| Escenario / ASR / RNF | Sustituir pasarela modificando solo un adaptador, cero cambios en Entradas. ASR-11, RNF-16 |
| Diseño | Módulo Pagos reutilizable, adaptadores y webhook único con autenticación del proveedor; la elección vive solo en `crearProcesadorPagos` |
| Implementación | **Implementada frontera:** [HTTP](../../App/backend/modulos/finanzas/pagos/pasarela-http.service.ts), [Stripe](../../App/backend/modulos/finanzas/pagos/pasarela-stripe.service.ts), API pública de Pagos. El formato de tokens (`token-pago.ts`) pasó de `compartido/` a Pagos: era lo único fuera del adaptador que conocía a los proveedores |
| Evidencia | [INTEGRABILIDAD-RNF16.md](INTEGRABILIDAD-RNF16.md): `rnf16-cambio-pasarela.spec.ts` (21 pruebas: elección por configuración, el negocio no nombra proveedores ni importa internos de Pagos, mismo contrato en los dos adaptadores). En vivo (16/11): simulada ↔ Stripe en **8 s** sin recompilar, **0 archivos** de código. Sandbox de Stripe del equipo: cobro aprobado (`pi_…`), rechazado (CU-001C) y reembolso CU-003 (`re_…`) de punta a punta. Corregido: los reembolsos con Stripe fallaban por validar solo referencias de la simulada |
| Resultado | **Cumplido en backend** entre simulada y Stripe. El portal tokeniza con Stripe Elements (RNF-05), así que un proveedor nuevo también pide su formulario en el cliente |
| Pendiente | Ensayar el pago desde el portal con Stripe Elements; webhook con `stripe listen` opcional |

### Seguridad física / Safety

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador**, RNF-17 dentro del bloque Disponibilidad acordado; no implica certificación de Safety física |
| Escenario / ASR / RNF | Evacuación notificada al ≥99 % de dispositivos en ≤10 s incluso con lentitud/fallo. ASR-13, RNF-17 |
| Diseño | Estados y activación, avisos prioritarios con reintento, interlocks y reporte; separación entre decisión, aviso y recepción efectiva |
| Implementación | **Parcial:** [Evacuación](../../App/backend/modulos/operacion/evacuacion), portal/app; sin canales push/SMS reales ni aislamiento de proceso propio |
| Evidencia | TIEMPO-REAL.md y TIEMPO-REAL-caida.md (16/11): 300 dispositivos simulados con cuentas de Personal, sondeo de 4 s como la app; **300/300 en ≤ 4,0 s** (p95 3,8 s), y 300/300 en ≤ 4,1 s con una réplica del Núcleo muerta en la activación; 0 errores en ~760 consultas. Simulacro en evento propio, finalizado y cancelado al terminar |
| Resultado | **Comprobado para la app abierta y con señal.** [Security/Safety](../../App/infra/informe-atributos/seguridad/SECURITY-SAFETY.md) sigue distinguiendo interlocks de negocio de seguridad física |
| Pendiente | Teléfonos sin señal o con la app cerrada: requieren push/SMS reales, que el prototipo no tiene |

### Comprobabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Diego Coronado**, RNF-18 dentro del bloque Desplegabilidad acordado |
| Escenario / ASR / RNF | Pruebas aisladas, cobertura de dominio ≥70 % y 100 % de dependencias sustituibles. ASR-14, RNF-18 |
| Diseño | Dobles de puertos externos, unitarias separadas de HTTP/contratos/imagen; entornos de prueba propios |
| Implementación | **Implementada:** [Jest](../../App/backend/jest-unitarias.json), [test backend](../../App/backend/test/README.md), [cobertura](../../App/backend/test/cobertura-total.cjs) |
| Evidencia | CI 9bc1ee5: 1173 unitarias y suites HTTP/imagen/contratos aprobadas. Hay doble/configuración, pero el conteo no es porcentaje de cobertura |
| Resultado | **Parcial; umbral global desconocido** en esta revisión. CI exitosa no demuestra automáticamente ≥70 % ni 100 % de dependencias |
| Pendiente | Diego contrasta informe de cobertura de la revisión y matriz de dependencias; no volver a correr suites por esta edición documental |

### Observabilidad / Monitoreo y logs

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador** |
| Escenario / ASR / RNF | CPU, memoria, réplicas y logs del 100 % de servicios tras gateway, muestras ≤5 s. RNF-19; sin ASR numerado en el árbol vigente |
| Diseño | Exportador Docker, Prometheus, Promtail/Loki y Grafana, logs de upstream/tiempo en gateway |
| Implementación | **Implementada:** [Compose monitoreo](../../App/infra/docker-compose.monitoreo.yml), [Prometheus](../../App/infra/monitoreo/prometheus.yml), [tablero](../../App/infra/monitoreo/grafana/tableros/hexacore.json) |
| Evidencia | Guion/SAD del 12/11; configuración de CPU cada 2 s, global 5 s, refresco tablero 5 s y retención 2 días. No se abre el tablero en esta revisión |
| Resultado | **Comprobado en aquella demostración; parcial para totalidad actual.** Métricas de infraestructura y tráfico del gateway, sin alertas automáticas ni detalle por CU |
| Pendiente | Acceso controlado: Grafana ya no admite anónimos (usuario y contraseña, `GRAFANA_CONTRASENA`). Siguen sin alertas automáticas; cae con el nodo y no sustituye la retención de auditoría anual |

## Correcciones de datos obsoletos y comparación arquitectónica

| Dato anterior | Corrección / fuente vigente |
|---|---|
| «Operación no implementada» | Núcleo importa OperacionModule, con Evacuación CU-010 y Monitoreo CU-019; CU-020 sigue pendiente. [NucleoModule](../../App/backend/apps/nucleo/nucleo.module.ts) |
| «Ocho esquemas, 18 migraciones, 49 tablas» | **Once esquemas de negocio, 36 migraciones registradas**, con 18 fuentes originales conservadas. [historia.ts](../../App/backend/compartido/persistencia/historia.ts), [esquemas.ts](../../App/backend/compartido/persistencia/esquemas.ts). Se retira la cifra 49 sin inventariar SQL en vivo; las 76 tablas de Seguridad son el alcance de sus capturas, no un nuevo total universal |
| ADR-16 decía ocho esquemas y Operación futura | Se conserva como decisión del 2/11 y se añade nota temporal hacia el inventario actual, sin reescribir la historia |
| Diapositiva de responsables solo enumeraba CU | Nueva diapositiva de **atributos**; CU formales y acuerdos se conservan como anexo |
| Seguridad vigente presentada solo mediante 11 rutas | Bloque específico del SAD con 167/167, denominadores, canales, correcciones y RNF-05/06 parciales; las 11 rutas quedan históricas |
| Security/Safety encabezaba 88/159 como vigente | Encabezado actualizado a 167/167; matriz original fechada como histórica, con sus límites |
| RNF-07 «cumple hasta 200» y RNF-10 «se cumple» | Ensayo local con 200 en lecturas CU-006/025/026; no acredita 2000/CU-001/QR. El 1,82× de CU-025 no es prueba del escalado de Entradas |
| Reinclusión ≤5 s por DNS y «no publica dos veces» | Caché DNS no acota conmutación. Sonda Docker no es chequeo activo remoto; bloqueos/outbox no garantizan ejecución única global |
| «Cuatro piezas» de monitoreo | Cinco contenedores: exportador, Prometheus, Loki, Promtail y Grafana |
| Guía de equipo: 28 migraciones y CU-014/011F pendientes | 36 registradas; entregas de Alimentos con evidencia propia. Recuperación global F12 permanece pendiente |

Se recuperaron **sin alteración** el JSON y PDF de contenedores ADR-14/15 de
`4b8cdd4`; [procedencia y hashes](Historico/README.md). La presentación los muestra
frente al [diagrama actual](Diagrams/ArchifyPDF/02-contenedores.pdf), con vistas
completas para poder leer las cajas. El antes es la **propuesta** de 14 servicios,
almacenamiento separado y clúster; no se afirma que todo eso se desplegó. El ahora
son tres ejecutables, módulos agrupados, SQL común, gateway y proveedores. Se
exponen sus costes: fallo SQL compartido, despliegue coordinado y componentes
internos sin escalado independiente. No se rediseñan diagramas vigentes.

## Guion propuesto — 54 minutos

| Minuto | Duración | Contenido | Quién |
|---|---:|---|---|
| 00:00–02:00 | 2 min | Problema, alcance, rúbrica y lectura de estados | Moderador por confirmar |
| 02:00–04:00 | 2 min | Diapositiva de atributos por integrante y pendientes de asignación | Equipo |
| 04:00–14:00 | **10 min** | Antes/ahora de contenedores: 2 min comparación, 3 min propuesta anterior, 3 min arquitectura actual y 2 min concesiones/código | Expositor de arquitectura por confirmar |
| 14:00–34:00 | 20 min | Diseño e implementación: mapa RNF 2; desempeño/escalado 3; disponibilidad/observabilidad 3; Seguridad 4; consistencia/tiempo real 2; trazabilidad/Safety 2; usabilidad/portabilidad 2; mantenibilidad/despliegue/integrabilidad/comprobabilidad 2 | Samuel, Sebastián, Daniel y Diego según RNF; quedan por asignar Consistencia, Trazabilidad, Mantenibilidad e Integrabilidad |
| 34:00–44:00 | **10 min** | Prototipo y microdemostraciones inferiores | Cada responsable; orden ensayado |
| 44:00–48:00 | 4 min | Evidencias, límites, pendientes, enlaces y paquete Brightspace | Equipo |
| 48:00–54:00 | 6 min | Preguntas y defensa individual | Todos |

No se agregan diez minutos por cada atributo a los diez del prototipo. Los bloques
de demo de la tabla siguiente **suman 600 s** y corresponden a 34:00–44:00. Es una
propuesta por ensayar: abrir código/CI evidencia implementación, pero no reemplaza
una prueba en vivo exigida por el profesor. Donde falta prueba, se informa como
faltante; no se marca la rúbrica completa por mostrar una diapositiva.

### Microdemostraciones futuras por atributo — no ejecutadas en esta entrega

| Atributo | Segundos | Acción breve reutilizable | Límite / preparación por confirmar |
|---|---:|---|---|
| Seguridad | 90 | En recursos propios preparados, consulta válida 200; misma operación/recurso con actor sin autoridad 403 y sin token 401; cierre de sesión propia y lectura posterior 401. Mostrar fila de cobertura y fuente de guarda | Casos de RESULTADO/AUTORIZACION-CIERRE, sin regenerar matriz ni inyectar Redis. Identidades/IDs válidos y tokens fuera de pantalla/Git; no usar un 400/404 como prueba de autorización |
| Desempeño | 45 | Mostrar medición breve de lectura y compararla con carga existente y p95 | Unas lecturas no acreditan p95 con 2000; Samuel selecciona una prueba existente que quepa, sin carga nueva aquí |
| Escalabilidad | 30 | Mostrar reparto/instancias ya preparadas y relación con informe 1 vs 2 réplicas | Reparto no mide 1,7×; no escalar ahora |
| Disponibilidad | 40 | Leer X-Servidor y señalar el escenario de caída pendiente y evidencia local histórica | **Caída de B pendiente**, sin incluirla como lograda. La prueba multiequipo completa requiere ventana posterior y puede exceder este presupuesto; sustituir/repartir tiempo solo tras ensayo del equipo |
| Observabilidad | 35 | Abrir tablero preparado y correlacionar una solicitud con upstream, CPU y log | Samuel confirma cobertura/acceso; ningún arranque desde esta revisión |
| Consistencia | 60 | Responsable selecciona caso existente de competencia/replay sobre recurso exclusivo y señala un único efecto | Prueba exacta/coste pendientes; no relanzar guion histórico que siembra/borra datos. Si no cabe, queda evidencia histórica, sin afirmar demo cumplida |
| Tiempo real | 40 | Samuel: evento/ingreso propio con puntoAcceso y actualización del panel | Cronómetro extremo a extremo pendiente; ciclo SSE o revocación no son RNF-09 |
| Trazabilidad | 30 | Leer historial/libro de una operación propia y correlacionar actor/transacción | No prueba retención anual ni cobertura financiera global |
| Safety | 35 | Samuel: mostrar estado/aviso de un escenario simulado ya preparado y sus interlocks | Ejecución por confirmar; sin mensajes reales ni afirmar 99 % de dispositivos en 10 s |
| Usabilidad | 45 | Daniel muestra una tarea corta y los pasos, con la evidencia humana si existe | Recorrido del expositor no sustituye cinco usuarios nuevos |
| Portabilidad | 35 | Daniel consolida con aportes del equipo: la misma lectura autorizada en web y app ya conectadas | Una lectura no acredita 100 % de CU; móvil/TLS pendientes |
| Mantenibilidad | 30 | Navegar de interfaz de módulo a implementación/contrato para explicar impacto | No modificar código en vivo ni afirmar independencia de despliegue por dominio |
| Desplegabilidad | 30 | Diego: mostrar versión, imagen y CI; explicar procedimiento de corte/reversión | Sin despliegue/rollback real no se acredita RNF-15 |
| Integrabilidad | 25 | Mostrar interfaz y pruebas existentes del adaptador seleccionado | Código y contratos no equivalen a sustitución completa medida |
| Comprobabilidad | 30 | Diego: mostrar una prueba aislada existente y su resultado CI; ejecución breve futura solo si confirma | Conteo aprobado no equivale a 70 %; no ejecutar suites ahora |

Para Seguridad se reutilizan sesiones/casos de las pruebas existentes: primero
control positivo y objeto válido, luego rechazo en la misma operación y finalmente
revocación. Preparar previamente los actores/recursos nuevos del ensayo autorizado;
no usar cuentas ajenas, cadenas de compra/cobro ni reintentos automáticos de
escrituras. Mostrar solo método/ruta/estado y datos saneados. Conservar los fallos
y tiempos reales si la demo no sale; evidencia previa no se llama ejecución en vivo.

La comprobación de Seguridad contra **backend directo se conserva como evidencia
adicional al gateway**, por defensa en profundidad. Se reutilizan sus resultados
existentes con recursos y actores válidos; no se elimina ese canal de la cobertura
167/167 ni se expone el backend públicamente por mostrar la demo. No se repite la
matriz en esta actualización del reparto.

## Dos servidores y un cliente — pendiente separado

El [plan ZeroTier](PLAN-DEMO-ZEROTIER.md) conserva A con gateway/HTTPS,
PostgreSQL/Redis/RabbitMQ y una instancia de aplicaciones; B con las otras
instancias y C con URL estable. **Solo B se podrá tumbar; A debe permanecer
encendido.** Distinguir proceso/contenedor/computador y los puntos únicos de fallo.
Faltan equipos/OS/arquitectura/capacidad, responsables A/B/C, direcciones asignadas,
puertos y alcance desde contenedores, nombres/certificados confiables, versión
común y decisión móvil. No se instalan VPN, redes o firewalls en esta entrega.

Queda por implementar la configuración mínima ya identificada (upstreams
remotos explícitos, puertos/selectores por equipo, HTTPS/orígenes/sesiones y
cautelas de trabajos de fondo) y ejecutar después el procedimiento del plan:
ambos servidores atienden → correlacionar X-Servidor → caída manual B → medir
errores/interrupción/recuperación desde C → continuidad de sesión/datos. No
reintentar cobros/escrituras de resultado incierto. Una caída breve no mide
RNF-03 mensual ni demuestra tolerancia al fallo de A.

## Tareas por integrante y bloqueos

| Integrante | Tarea de preparación pendiente | Evidencia que debe traer |
|---|---|---|
| Sebastián | Sustentar Seguridad RNF-05/06, Safety monetario RNF-01/02/11 y Modificabilidad RNF-13: guion ejecutable de ocho minutos; aportar a Daniel pantallas, navegación, rotulado, pasos y capturas de Alimentos y cuentas/roles/recintos | RESULTADO, cobertura 167/167 gateway + backend directo, evidencia saneada y código; reconocer implementación de Samuel donde corresponda, secretos privados |
| Samuel | Preparar Desempeño RNF-07/08/10, Disponibilidad RNF-03/04/09/17 y Monitoreo RNF-19; contrastar cifras por revisión; continuar el montaje A/B/C a su cargo | Informes de carga, tablero/fallo local y pruebas existentes de ingreso→panel/alertas; señalar faltantes de 2000 usuarios, Boletería, porcentaje mensual y recepción de dispositivos |
| Daniel | Integrabilidad RNF-16 y consolidar Usabilidad RNF-12/14 con aportes de todos | Protocolo/resultados humanos o declarar ausencia; matriz de equivalencia web/móvil, flujos/pasos/capturas con autoría reconocida |
| Diego | Preparar Desplegabilidad RNF-15/18 con escenario, código, evidencia y demo existentes | Destino HTTPS de presentación y conexión al workflow OWASP; plan/resultado real de despliegue/reversión, informe de cobertura y aislamiento; documentar faltantes sin ejecutar instrucciones destructivas antiguas ni desarrollar pendientes en esta entrega |
| Equipo | Traer temario completo, cerrar reparto, moderador y arquitectura; ensayar 54 min y confirmar carga Brightspace | Matriz curso↔fichas↔diapositivas↔demo; asignación explícita de los atributos desconocidos |

Bloqueos: temario completo pendiente de contrastar; reparto de los 19 RNF confirmado en DISTRIBUCION-ATRIBUTOS. Pruebas de varios umbrales
sin acreditar; demo multiequipo pendiente; capacidad del entorno. El último control
de Redash **15/11 16:48 Bogotá** terminó en timeout HTTP y nuevos OOM; es histórico,
no diagnóstico actual ni motivo para operar ese proyecto. Consultar la
[guía operativa](OPERACION-LOCAL-REDASH-HEXACORE.md); su responsable debe resolver
capacidad por separado. En C solo se consulta inventario/capacidad, sin modificar contenedores; servicios nuevos únicamente en Actions.

Cada integrante debe poder explicar por escrito escenario/umbral, táctica,
alternativa descartada, ruta del código, resultado y límite; distinguir
autenticación/autorización, consistencia/convergencia, reinicio/alta disponibilidad
y conteo de tests/cobertura. El 30 % individual no se cubre con las respuestas de
otro integrante ni con una presentación compartida.

## Paquete revisable para Brightspace

Entregar los PDF compilados del SAD y presentación, más este documento y
anexos públicos de Seguridad (RESULTADO, COBERTURA-RECURSOS, SECURITY-SAFETY,
AUTORIZACION-CIERRE, CIERRE-EVIDENCIA), informes de carga, plan ZeroTier y las
dos revisiones de contenedores con su procedencia. Incluir enlace al
[repositorio](https://github.com/Emperador24/HEXACORE), la revisión/PR de entrega y
CI por SHA; el bloque Seguridad enlaza código medido en `9bc1ee5`.

No adjuntar `.privado/`, logs crudos, bases/capturas SQL/Redis, credenciales,
tokens, cookies, QR reales o `.env`. Los PDF contienen enlaces a fuentes públicas
del repositorio; comprobar acceso del evaluador y enlaces al empaquetar. No se
ha subido nada a Brightspace por esta entrega.

## Validación documental

**Comprobado localmente en esta entrega:** `latexmk -pdf` termina con código 0
para SAD (**71 páginas**), presentación (**26 diapositivas: 20 principales y 6
anexos**) y ArchitecturalProposal (**9 páginas**, incluye la nota temporal ADR-16).
Salida y logs temporales fuera del repositorio; solo los PDF finales se copian
a `Documentation/Submission/`.

Se revisaron visualmente las 26 diapositivas y las páginas del bloque Seguridad,
las referencias locales y rutas de código enlazadas, las quince fichas y el
presupuesto de **54 min / 600 s de prototipo**. No hay referencias LaTeX
indefinidas, desbordes verticales ni desbordes de cajas en la presentación o el
bloque Seguridad nuevo. El SAD conserva **27 avisos de ancho anteriores**:
comparación con una compilación de `9bc1ee5` dio exactamente las mismas 27
anchuras; no se corrigió la tipografía histórica ajena al bloque. Se conserva
la advertencia de Metropolis sobre fuentes al compilar con pdfLaTeX, sin error.
Los diagramas completos permiten abrir el PDF vectorial para ampliar; no se
alteró su contenido.

El PDF histórico/JSON coinciden byte por byte con `4b8cdd4`. Cambios limitados a
fuentes documentales, sus PDF y esa copia histórica; sin archivos privados,
credenciales o tokens añadidos. `git diff --check` aprobado. **No se ejecutaron
matrices, recorridos de negocio, Docker ni pruebas de caída.** La CI funcional
citada es la existente de `9bc1ee5`, separada de cualquier nueva CI automática de
publicación documental; no se lanza una repetición manual por cambios de texto.

**Aclaración posterior del reparto:** sobre `d819d4d` limpio se actualizan solo
esta matriz, la presentación/fuente/PDF y la nota de seguimiento del plan de
cierre. `latexmk -pdf` aprobado, **26 diapositivas**, sin referencias indefinidas
ni desbordes; revisión visual de las láminas afectadas. Comparación con `d819d4d`:
**las quince filas de evidencia y las quince de resultado permanecen idénticas**.
Se conservan los resultados previos del SAD y las pruebas gateway/backend directo. El reparto confirmado no
cambia ningún resultado a aprobado, ni completa RNF-05/06 o el temario del curso.
