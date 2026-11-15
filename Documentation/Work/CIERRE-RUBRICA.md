# Preparación de la sustentación y cierre frente a la rúbrica

Corte documental: **15/11/2026, America/Bogota**. Rama exclusiva
`feature/sebastian`; revisión inicial limpia en `9bc1ee5`. Código y evidencias
anteriores se inspeccionan, **no se vuelven a ejecutar**. Esta entrega no opera
Docker/Redash, no instala ZeroTier, no provoca caídas y no desarrolla F12,
sustituciones ni casos de otros integrantes.

**Preparación parcial.** Hay SAD y presentación actualizados, trazabilidad de
Seguridad y guion de 54 minutos. Faltan el temario completo, responsables de varios
atributos y evidencias/demostraciones que debe confirmar el equipo. No se puede
afirmar que se cubrieron todos los atributos vistos solo porque estén los del SAD.

## Rúbrica y material de entrega

| Exigencia del profesor | Preparación documental | Estado / condición de cierre |
|---|---|---|
| Máximo una hora | Guion **54 min**, con 6 min de preguntas; reserva adicional de 6 min hasta el máximo | Propuesto; falta ensayo cronometrado del equipo |
| Cambios de arquitectura, 10 min | Presentación, 04:00–14:00: contenedores antiguos ADR-14/15 frente a ADR-16 actual, decisiones y concesiones | Preparado; el diagrama antiguo es una propuesta, no un despliegue demostrado |
| Prototipo, 10 min | 34:00–44:00; tabla de microdemostraciones inferior | Propuesto; pruebas en vivo pendientes, varias dependen de confirmación |
| Una diapositiva de atributos por integrante | Diapositiva «Responsables de atributos» con nombres respaldados y pendientes explícitos | Parcial: no se reemplaza el reparto de atributos con el reparto de CU |
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

| Integrante | Asignación de atributo confirmada | Respaldo | Por confirmar |
|---|---|---|---|
| Sebastián Sánchez | Seguridad, RNF-05/06 | RESULTADO.md y PLAN-CIERRE-SEBASTIAN.md, «Alcance y acuerdos» | Ninguna ampliación a Safety física o pendientes ajenos |
| Samuel Emperador | Desempeño, Disponibilidad, Monitoreo y logs | Encabezados de AtributosVigentes.tex y DEMOSTRACION-ATRIBUTOS.md | Dueño formal de Escalabilidad; su ensayo del Núcleo se usa como evidencia relacionada |
| Daniel Cristancho | Consolidación de Usabilidad | PLAN-CIERRE-SEBASTIAN.md, «Alcance y acuerdos» | Qué otros atributos acordó y evidencia con usuarios |
| Diego Coronado | **Desconocida: por confirmar** | SRS confirma sus CU, no una asignación de atributos | Atributos, escenarios y demostraciones que presentará |

Implementar un CU no confirma la propiedad de su atributo. Se conserva el reparto
formal del SRS y el acuerdo de implementación de Identidad/Recintos por Samuel;
no se reasignan sus funciones ni los pendientes de Diego a Sebastián.

## Fichas por atributo

Las referencias ASR son las del árbol de utilidad del SAD. Observabilidad tiene
RNF-19 pero no un ASR numerado en ese árbol; no se crea un ASR ficticio.

### Consistencia

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar; CU-006 pertenece a Samuel, lo cual no asigna todo el atributo |
| Escenario / ASR / RNF | Dos compradores sobre la misma publicación, sin doble venta; invalidación del QR anterior. ASR-01, RNF-01/02 |
| Diseño | Reserva/bloqueos, estado transaccional, idempotencia, outbox y proyecciones; convergencia no equivale a invalidación inmediata |
| Implementación | **Implementada en parte:** [Ventas/Postventa](../../App/backend/modulos/entradas/postventa/postventa), [Acceso QR](../../App/backend/modulos/entradas/acceso-qr); mismo SQL no hace atómicas operaciones separadas |
| Evidencia | INFORME.md registra 50 compradores: 1 checkout/49 rechazados en su corrida histórica; pruebas de [Boletería](../../App/backend/test/boleteria) y [autorización de Ventas](../../App/infra/informe-atributos/seguridad/AUTORIZACION-VENTAS.md) con alcances distintos |
| Resultado | **Parcial.** La carrera histórica está comprobada en su revisión; no prueba RNF-02 inmediato bajo todos los canales/caídas actuales |
| Pendiente | Responsable y evidencia vigente específica RNF-01/02; no presentar la espera de convergencia como rechazo inmediato del QR viejo |

### Disponibilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador** |
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
| Evidencia | CARGA-1-replica.md: lecturas CU-006/026/025, hasta **200** usuarios; p95 150,3/355,0/310,6 ms, cero fallos; un portátil compartido, 12/11 |
| Resultado | **Parcial.** Cumple el umbral de latencia solo en esos ensayos; no son la consulta CU-001 con 2000 usuarios ni validaciones QR RNF-08 |
| Pendiente | Confirmar evidencia específica de CU-001/QR y condiciones del ensayo; sin nuevos ensayos de carga en esta revisión |

### Tiempo real

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | Ingreso/salida o incidente reflejado en tablero ≤2 s. ASR-05, RNF-09 |
| Diseño | Ingreso por evento AMQP, proyección de Operación y SSE consultando estado |
| Implementación | **Implementada en parte:** [Monitoreo](../../App/backend/modulos/operacion/monitoreo), [flujos SSE](../../App/backend/modulos/operacion/comun/flujo-operacion.service.ts) y Parqueaderos |
| Evidencia | Pruebas de panel/consumidor y SSE de Seguridad; el cierre de sesión medido a 2/3 s es una **métrica de revocación**, no latencia ingreso→tablero |
| Resultado | **Parcial; umbral extremo a extremo desconocido.** Ciclo del panel de 3 s no permite inferir ≤2 s |
| Pendiente | Medición con instantes correlacionados y responsable; ingreso QR sin puntoAcceso se registra en QR/Ventas pero va a DLQ en Monitoreo, hallazgo funcional ya documentado |

### Escalabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**; Samuel aportó medición relacionada, no consta asignación formal separada |
| Escenario / ASR / RNF | Duplicar Entradas: throughput ≥1,7× sin degradar otros dominios. ASR-06, RNF-10 |
| Diseño | Réplicas por programa y balanceo; PostgreSQL, Redis y gateway compartidos pueden limitar |
| Implementación | **Implementada:** escalado de Núcleo/Boletería; los componentes internos de Boletería no escalan de forma independiente |
| Evidencia | CARGA-nucleo-2-replicas.md: CU-025 **1,82×**, CU-026 **1,57×** frente a una réplica; CPU compartida |
| Resultado | **Parcial.** El factor de CU-025 está comprobado; no es RNF-10 de Entradas ni aislamiento de latencia de los demás |
| Pendiente | Confirmar responsable y evidencia de Boletería/efecto en otros dominios; no ampliar infraestructura ahora |

### Trazabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | Operaciones financieras con actor, tiempo, transacción y resultado; 100 %, retención ≥1 año. ASR-07, RNF-11 |
| Diseño | Libro financiero común, historiales y auditoría cuyo actor deriva de sesión |
| Implementación | **Implementada en parte:** [Finanzas/Pagos](../../App/backend/modulos/finanzas/pagos), auditoría de Identidad y Alimentos |
| Evidencia | [Contratos de pagos](../../App/backend/test/pagos/README.md), conservación de historiales/outbox en Seguridad y auditoría de cuentas/roles |
| Resultado | **Parcial.** Se comprueban registros en casos concretos; no hay evidencia suficiente de 100 % global y retención efectiva anual |
| Pendiente | Responsable, catálogo de operaciones auditables y política/prueba de retención; SQL auditable no es no repudio criptográfico |

### Usabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Daniel Cristancho consolida**; Sebastián aporta pantallas/navegación de Alimentos |
| Escenario / ASR / RNF | Usuario nuevo compra en ≤5 pasos; éxito ≥80 % con 5 usuarios. ASR-08, RNF-12 |
| Diseño | Interfaces por rol, estados y avisos diferenciados; no confundir aviso de reembolso con dinero confirmado |
| Implementación | **Implementadas interfaces:** [portal cliente](../../App/frontend/portal-web-cliente), [portal admin](../../App/frontend/portal-web-admin), [app](../../App/frontend/app-movil) |
| Evidencia | Recorridos automáticos/visibles en [e2e](../../App/e2e/README.md) y plan de cierre; no se halló protocolo/resultados de cinco usuarios nuevos |
| Resultado | **Parcial; éxito humano desconocido.** Playwright 16/16 no equivale al ensayo RNF-12 |
| Pendiente | Daniel confirma protocolo, participantes anonimizados, pasos, tiempos/errores y resultados; no se realiza estudio ni recorrido nuevo ahora |

### Mantenibilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | Cambio típico en un dominio sin modificar/redesplegar otros. ASR-09, RNF-13 |
| Diseño | Módulos y conexiones nombradas, API pública local de Pagos, contratos compartidos; ADR-16 acepta despliegue/versionado coordinados |
| Implementación | **Implementada:** [workspace backend](../../App/backend/nest-cli.json), módulos, esquemas y preparación coordinada |
| Evidencia | [ESTADO-MIGRACION](ESTADO-MIGRACION.md) prueba preservación y separación en el hito; no mide todo cambio típico posterior |
| Resultado | **Parcial.** Separación lógica comprobable por inspección; independencia de despliegue por dominio tiene una concesión explícita |
| Pendiente | Responsable y ejemplo medido de cambio/impacto; conservar el RNF como objetivo y explicar la concesión, sin rediseñar |

### Portabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | 100 % de CU Cliente en web/móvil, misma API y sin reglas duplicadas. ASR-10, RNF-14 |
| Diseño | Dos portales Angular y una app Flutter Cliente/Personal sobre gateway; configuración de API por entorno |
| Implementación | **Implementados clientes y contratos**; no se infiere paridad de todo CU por existir sus pantallas |
| Evidencia | Plan de cierre registra integración en Alimentos; fuentes de web/app y CI independientes. No consta matriz global 100 % web/móvil |
| Resultado | **Parcial.** Backend y compilación móvil no acreditan equivalencia completa ni uso de móvil físico por VPN |
| Pendiente | Responsable y matriz por CU; confirmar dispositivo/emulador, URL HTTPS y confianza de certificados |

### Desplegabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | Versión sin errores, despliegue ≤10 min y reversión ≤5 min. ASR-12, RNF-15 |
| Diseño | Imágenes, preparación SQL única, control de versiones y plan de corte/reversión; una base compartida exige coherencia de escritores |
| Implementación | **Implementados scripts/configuración:** [infra](../../App/infra), [preparación](../../App/backend/compartido/persistencia/preparar-base.ts), CI/CD |
| Evidencia | ESTADO-MIGRACION §§23–24: A/B, imágenes y CI; [corte/reversión](CORTE-Y-REVERSION.md) sigue pendiente en el entorno habitual |
| Resultado | **Parcial.** YAML válido, arranque vacío o CI verde no acreditan despliegue sin interrupción y reversión de datos nuevos |
| Pendiente | Responsable, ventana controlada y evidencia específica; no ejecutar despliegue, corte ni restauración en esta entrega |

### Integrabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | Sustituir pasarela modificando solo un adaptador, cero cambios en Entradas. ASR-11, RNF-16 |
| Diseño | Módulo Pagos reutilizable, adaptadores y webhook único con autenticación del proveedor |
| Implementación | **Implementada frontera:** [HTTP](../../App/backend/modulos/finanzas/pagos/pasarela-http.service.ts), [Stripe](../../App/backend/modulos/finanzas/pagos/pasarela-stripe.service.ts), API pública de Pagos |
| Evidencia | Pruebas de adaptadores/contratos previas, sin cobros reales; existencia de dos adaptadores no mide el coste de sustituir uno |
| Resultado | **Parcial.** La separación existe; falta evidencia completa del cambio con el criterio exacto RNF-16 |
| Pendiente | Responsable y prueba/registro del impacto de sustitución por su dueño; no implementar sustituciones ni F12 aquí |

### Seguridad física / Safety

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar; Samuel implementó CU-010, sin que esto asigne todo Safety |
| Escenario / ASR / RNF | Evacuación notificada al ≥99 % de dispositivos en ≤10 s incluso con lentitud/fallo. ASR-13, RNF-17 |
| Diseño | Estados y activación, avisos prioritarios con reintento, interlocks y reporte; separación entre decisión, aviso y recepción efectiva |
| Implementación | **Parcial:** [Evacuación](../../App/backend/modulos/operacion/evacuacion), portal/app; sin canales push/SMS reales ni aislamiento de proceso propio |
| Evidencia | Pruebas funcionales y de autorización/SSE existentes; [Security/Safety](../../App/infra/informe-atributos/seguridad/SECURITY-SAFETY.md) distingue interlocks de negocio de seguridad física |
| Resultado | **Parcial.** No existe prueba de población de dispositivos/acuse que acredite el porcentaje/tiempo RNF-17 |
| Pendiente | Responsable, fallos/omisiones/estados inseguros y recepción verificable; no activar evacuación ni enviar avisos en esta revisión |

### Comprobabilidad

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Desconocido**, por confirmar |
| Escenario / ASR / RNF | Pruebas aisladas, cobertura de dominio ≥70 % y 100 % de dependencias sustituibles. ASR-14, RNF-18 |
| Diseño | Dobles de puertos externos, unitarias separadas de HTTP/contratos/imagen; entornos de prueba propios |
| Implementación | **Implementada:** [Jest](../../App/backend/jest-unitarias.json), [test backend](../../App/backend/test/README.md), [cobertura](../../App/backend/test/cobertura-total.cjs) |
| Evidencia | CI 9bc1ee5: 1173 unitarias y suites HTTP/imagen/contratos aprobadas. Hay doble/configuración, pero el conteo no es porcentaje de cobertura |
| Resultado | **Parcial; umbral global desconocido** en esta revisión. CI exitosa no demuestra automáticamente ≥70 % ni 100 % de dependencias |
| Pendiente | Responsable, informe de cobertura de la revisión y matriz de dependencias; no volver a correr suites por esta edición documental |

### Observabilidad / Monitoreo y logs

| Campo | Revisión |
|---|---|
| Responsable confirmado | **Samuel Emperador** |
| Escenario / ASR / RNF | CPU, memoria, réplicas y logs del 100 % de servicios tras gateway, muestras ≤5 s. RNF-19; sin ASR numerado en el árbol vigente |
| Diseño | Exportador Docker, Prometheus, Promtail/Loki y Grafana, logs de upstream/tiempo en gateway |
| Implementación | **Implementada:** [Compose monitoreo](../../App/infra/docker-compose.monitoreo.yml), [Prometheus](../../App/infra/monitoreo/prometheus.yml), [tablero](../../App/infra/monitoreo/grafana/tableros/hexacore.json) |
| Evidencia | Guion/SAD del 12/11; configuración de CPU cada 2 s, global 5 s, refresco tablero 5 s y retención 2 días. No se abre el tablero en esta revisión |
| Resultado | **Comprobado en aquella demostración; parcial para totalidad actual.** Métricas de infraestructura y tráfico del gateway, sin alertas automáticas ni detalle por CU |
| Pendiente | Samuel confirma cobertura vigente de instancias y acceso controlado a logs/tablero; cae con el nodo, no sustituye retención de auditoría anual |

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
| 14:00–34:00 | 20 min | Diseño e implementación: mapa RNF 2; desempeño/escalado 3; disponibilidad/observabilidad 3; Seguridad 4; consistencia/tiempo real 2; trazabilidad/Safety 2; usabilidad/portabilidad 2; mantenibilidad/despliegue/integrabilidad/comprobabilidad 2 | Samuel/Sebastián/Daniel y responsables pendientes |
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
| Tiempo real | 40 | Evento/ingreso propio con puntoAcceso y actualización del panel | Responsable y cronómetro extremo a extremo pendientes; ciclo SSE o revocación no son RNF-09 |
| Trazabilidad | 30 | Leer historial/libro de una operación propia y correlacionar actor/transacción | No prueba retención anual ni cobertura financiera global |
| Safety | 35 | Mostrar estado/aviso de un escenario simulado ya preparado y sus interlocks | Responsable confirma ejecución; sin mensajes reales ni afirmar 99 % de dispositivos en 10 s |
| Usabilidad | 45 | Daniel muestra una tarea corta y los pasos, con la evidencia humana si existe | Recorrido del expositor no sustituye cinco usuarios nuevos |
| Portabilidad | 35 | La misma lectura autorizada en web y app ya conectadas | Una lectura no acredita 100 % de CU; móvil/TLS pendientes |
| Mantenibilidad | 30 | Navegar de interfaz de módulo a implementación/contrato para explicar impacto | No modificar código en vivo ni afirmar independencia de despliegue por dominio |
| Desplegabilidad | 30 | Mostrar versión, imagen y CI; explicar procedimiento de corte/reversión | Sin despliegue/rollback real no se acredita RNF-15 |
| Integrabilidad | 25 | Mostrar interfaz y pruebas existentes del adaptador seleccionado | Código y contratos no equivalen a sustitución completa medida |
| Comprobabilidad | 30 | Mostrar una prueba aislada existente y su resultado CI; ejecución breve futura solo si responsable confirma | Conteo aprobado no equivale a 70 %; no ejecutar suites ahora |

Para Seguridad se reutilizan sesiones/casos de las pruebas existentes: primero
control positivo y objeto válido, luego rechazo en la misma operación y finalmente
revocación. Preparar previamente los actores/recursos nuevos del ensayo autorizado;
no usar cuentas ajenas, cadenas de compra/cobro ni reintentos automáticos de
escrituras. Mostrar solo método/ruta/estado y datos saneados. Conservar los fallos
y tiempos reales si la demo no sale; evidencia previa no se llama ejecución en vivo.

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
| Sebastián | Sustentar el bloque Seguridad y seleccionar microdemo existente de 90 s; explicar RNF-05/06 parciales | RESULTADO, cobertura 167/167, evidencia saneada, código de correcciones; secretos privados |
| Samuel | Confirmar guion de desempeño/disponibilidad/monitoreo y cifras por revisión; participar en preparación futura A/B/C | Informes de carga, tablero y fallo local con alcance; faltantes de 2000 usuarios, Boletería y porcentaje mensual |
| Daniel | Consolidar Usabilidad y confirmar otros atributos asignados; revisar evidencias de sus CU usadas por Consistencia/Portabilidad | Protocolo/resultados humanos o declarar ausencia; casos vigentes de Boletería/QR que seleccione |
| Diego | **Confirmar primero sus atributos**; asociar escenario, código, evidencia y demo existentes | No se presume Trazabilidad/Safety/Despliegue por su reparto de CU; no se le atribuye trabajo no confirmado |
| Equipo | Traer temario completo, cerrar reparto, moderador y arquitectura; ensayar 54 min y confirmar carga Brightspace | Matriz curso↔fichas↔diapositivas↔demo; asignación explícita de los atributos desconocidos |

Bloqueos: lista completa del curso y reparto faltantes; pruebas de varios umbrales
sin acreditar; demo multiequipo pendiente; capacidad del entorno. El último control
de Redash **15/11 16:48 Bogotá** terminó en timeout HTTP y nuevos OOM; es histórico,
no diagnóstico actual ni motivo para operar ese proyecto. Consultar la
[guía operativa](OPERACION-LOCAL-REDASH-HEXACORE.md); su responsable debe resolver
capacidad por separado. Ningún contenedor se consulta o modifica en esta entrega.

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
