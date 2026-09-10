# Bitácora Arquitectónica

Registro permanente y acumulativo de reuniones, decisiones de diseño,
cambios arquitectónicos, análisis realizados a las decisiones y pruebas de
concepto, tal como lo pide el profesor en la Clase 5 ("Proceso de diseño
arquitectónico 1"). **Se debe actualizar continuamente durante todo el
semestre** — no reescribir entradas pasadas, solo añadir nuevas.

Cada entrada nueva va arriba (orden cronológico inverso), con este formato:

```
## AAAA-MM-DD — Título breve

**Tipo:** Reunión / Decisión de diseño / Cambio arquitectónico / Análisis / PoC

**Contexto:** ...
**Decisión / resultado:** ...
**Alternativas consideradas:** ...
**Ventajas / desventajas:** ...
**Riesgos técnicos:** ...
**Participantes:** ...
```

---

## 2026-09-10 — Los diagramas C4 pasan a generarse con Archify y se corrige su contenido

**Tipo:** Cambio arquitectónico (documentación)

**Contexto:** Los diagramas C4 del documento se mantenían a mano en draw.io, y se habían
desactualizado sin que nadie lo notara: el diagrama de contenedores seguía mostrando **cuatro
interfaces** (App Móvil Cliente y App Móvil Personal como apps separadas) cuando **ADR-07** ya
había unificado ambas en una sola `app-movil`, y el repositorio solo tiene tres interfaces
desplegables. Una imagen editada a mano no deja rastro en el diff, así que el documento podía
contradecir al código sin que se viera en la revisión de un commit.

**Decisión / resultado:**
1. Los seis diagramas ahora se generan con **Archify** desde una especificación `JSON` versionada
   (`Work/Diagrams/Archify/`), y se insertan en `C4Diagrams.tex` y
   `DescripcionArquitecturaSoftware.tex` como PDF vectorial (`Work/Diagrams/ArchifyPDF/`).
2. Se corrigió el contenido desactualizado: contenedores y despliegue ahora muestran las **tres
   interfaces** reales, con la App Móvil unificada (Cliente + Personal, ADR-07).
3. Se actualizó el texto que rodeaba a las figuras, que seguía describiendo los diagramas viejos:
   pies de figura, las cinco leyendas de colores (Archify colorea por tipo de componente, no por
   la convención manual anterior) y la tabla de relaciones del Nivel 2, que trataba a las
   interfaces como una sola caja "App Web / Móvil".
4. Los `.drawio`/`.png` se conservan en `Work/Diagrams/` como referencia histórica, marcados
   explícitamente como no vigentes.

**Alternativas consideradas:**
- **Seguir en draw.io y solo corregir las cajas a mano:** se descartó porque no resuelve la causa
  —el diagrama vuelve a desactualizarse en el próximo ADR y el diff sigue siendo opaco—, aunque
  era la opción más rápida.
- **Mantener los diagramas de Archify solo como material interactivo aparte, dejando los `.png` en
  el PDF:** se descartó porque deja dos juegos de diagramas contradiciéndose y el documento
  entregable seguiría mostrando la versión incorrecta.
- **Exportar los diagramas como PNG en vez de PDF:** se descartó porque el PDF conserva el texto
  vectorial (se puede hacer zoom y buscar texto), y el `@media print` de Archify ya fuerza la
  paleta clara para papel.

**Ventajas / desventajas:** El diagrama pasa a ser texto revisable en el diff y regenerable con un
comando, y quedó una sola fuente de verdad. A cambio, editar el diagrama ya no es arrastrar cajas
en una interfaz gráfica: hay que editar `JSON` y regenerar, lo que tiene curva de aprendizaje para
quien no lo haya hecho (el `README.md` de la carpeta documenta el procedimiento exacto).

**Riesgos técnicos:** La exportación a PDF depende de Chrome headless y de `pdfcrop`; si cambia el
entorno de alguien del equipo, hay que repetir el procedimiento del README. Se detectó además una
trampa del propio Archify: el campo `tag` queda oculto en el visor pero **se dibuja encima del
`sublabel` al imprimir**; por eso esa información se movió dentro del `sublabel` y el README
advierte no volver a usar `tag`.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-09-07 — Árbol de Utilidad con par (Importancia, Dificultad) y 4 ASR nuevos (punto 2, Entrega 1)

**Tipo:** Análisis

**Contexto:** El Árbol de Utilidad del SAD calificaba cada escenario con una sola columna de
**"Prioridad"** (Alta / Media-Alta / Media / Baja-Media). El método visto en clase exige calificar
cada escenario con **dos** dimensiones independientes —importancia para el negocio y dificultad
técnica— porque son las que permiten identificar dónde está el riesgo arquitectónico: un escenario
importante pero fácil no necesita evidencia especial, mientras que uno importante y difícil sí.
Con una sola columna esa distinción se pierde. Además, la tabla solo cubría los 10 atributos
priorizados originalmente, dejando sin escenario a los 4 atributos agregados con los RNF.

**Decisión / resultado:**
1. Se reemplazó la columna "Prioridad" por el par **(Importancia, Dificultad)** en escala
   Alta/Media/Baja para los 14 escenarios.
2. Se agregaron **4 ASR nuevos**: **ASR-11** (Integrabilidad — sustituir la pasarela de pagos sin
   reescribir el dominio), **ASR-12** (Desplegabilidad — actualizar un servicio con el evento en
   curso), **ASR-13** (Safety — notificación garantizada de evacuación) y **ASR-14**
   (Comprobabilidad — probar un microservicio aislado).
3. Se agregó una columna **RNF** que enlaza cada escenario con el requisito verificable que pone a
   prueba, de modo que los 18 RNF quedan cubiertos por al menos un ASR y no queda ningún requisito
   "huérfano" sin escenario que lo tensione.

El resultado señala tres escenarios **(Alta, Alta)** —**ASR-01** (doble venta), **ASR-04**
(carga en apertura de venta) y **ASR-13** (notificación de evacuación)— como los que concentran
el riesgo arquitectónico y, por lo tanto, los candidatos a respaldarse con pruebas de concepto
medidas en vez de solo con razonamiento.

**Alternativas consideradas:**
- **Mantener la columna única de "Prioridad"**: se descartó porque mezcla importancia con
  dificultad; ASR-07 (auditoría) y ASR-05 (aforo en tiempo real) tenían ambos prioridad "Media"
  pese a que el primero es sencillo de implementar y el segundo es de los más difíciles.
- **Calificar la importancia según la prioridad global del atributo**: se descartó porque
  distorsiona escenarios puntualmente críticos dentro de atributos de prioridad media —el caso de
  ASR-13, cuyo atributo (Safety) está priorizado como Medio pero cuyo escenario compromete la
  integridad de las personas. Se documentó explícitamente esta distinción en el texto de la
  sección.
- **Agregar solo 2 ASR (Integrabilidad y Desplegabilidad)**: se descartó porque dejaría sin
  escenario a Safety y Comprobabilidad, que sí tienen RNF asociado (RNF-17, RNF-18).

**Ventajas / desventajas:** La tabla ahora identifica sola dónde hace falta evidencia medida
(las casillas Alta/Alta) y trazan RNF → ASR → (más adelante) táctica → PoC. La desventaja es que
el par (Importancia, Dificultad) sigue siendo una **estimación del equipo**, no el resultado de
una votación formal con los cuatro integrantes ni de una medición: cada responsable debe revisar
los escenarios de su atributo antes de la entrega.

**Riesgos técnicos:** Subestimar la dificultad de ASR-05 (aforo en tiempo real, calificado Alta)
o de ASR-12 (despliegue sin interrupción) llevaría a planear mal Entrega 2. Los tres escenarios
(Alta, Alta) son los que deberían tener PoC; hoy ninguno lo tiene todavía en este repositorio.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-09-07 — Requisitos No Funcionales con métrica y umbral verificable (punto 1, Entrega 1)

**Tipo:** Análisis

**Contexto:** El SAD documentaba los 32 casos de uso (qué hace el sistema) y una tabla de
atributos de calidad priorizados con su justificación en prosa, pero **no tenía requisitos no
funcionales**: no existía ninguna afirmación verificable sobre *con qué calidad* debe funcionar el
sistema. Sin ellos, el Árbol de Utilidad (ASR) no tiene de dónde derivarse y el análisis de
tácticas no tiene contra qué comprobarse. Es el punto 1 del checklist de Entrega 1.

**Decisión / resultado:** Se agregó la sección **"Requisitos No Funcionales (RNF)"** a
`DescripcionArquitecturaSoftware.tex`, justo después de la visión general de requisitos
funcionales, con **RNF-01 a RNF-18** en una tabla de cuatro columnas: ID, requisito, atributo de
calidad y **métrica con umbral verificable**. La regla que se aplicó es que un requisito no entra
a la tabla si no se puede comprobar objetivamente: por eso cada fila tiene un número (p. ej.
RNF-07 "latencia p95 ≤ 500 ms con 2.000 usuarios concurrentes") y no una frase como "el sistema
debe ser rápido".

Los 18 RNF cubren **14 atributos de calidad**: los 10 que el proyecto ya tenía priorizados
(Consistencia, Disponibilidad, Seguridad, Rendimiento, Tiempo real, Escalabilidad, Trazabilidad,
Usabilidad, Mantenibilidad, Portabilidad) más **4 nuevos** que exigen las clases 6–14 y que el
proyecto no había priorizado: **Desplegabilidad, Integrabilidad, Seguridad física (Safety) y
Comprobabilidad**. Esos cuatro se agregaron también a la tabla de atributos priorizados de
`ArchitecturalProposal.tex`, con su justificación, para que ambos documentos sigan siendo
coherentes entre sí.

**Alternativas consideradas:**
- **Dejar los RNF implícitos dentro de cada ASR** (como estaba hasta ahora): se descartó porque
  mezcla dos cosas distintas —el requisito de calidad y el escenario arquitectónicamente
  significativo que lo pone a prueba— y deja sin umbral a los atributos que hoy no tienen ASR
  propio.
- **Redactar RNF en prosa, sin métrica** (más rápido de escribir): se descartó porque un
  requisito sin umbral no se puede verificar ni sustentar; es exactamente lo que el profesor
  señala como requisito mal formulado.
- **Cubrir solo los 10 atributos ya priorizados**: se descartó porque dejaría sin requisito a
  cuatro de los nueve atributos que las clases 6–14 exigen analizar.

**Ventajas / desventajas:** Cada RNF ahora es comprobable y da un criterio objetivo de "listo"
para Entrega 2. La desventaja es que **los umbrales numéricos son estimaciones razonadas del
equipo, no mediciones** sobre un sistema en producción (que todavía no existe); quedan sujetos a
revisión por el responsable de cada atributo y a validación con las pruebas de concepto.

**Riesgos técnicos:** Comprometerse a umbrales optimistas (p. ej. p95 ≤ 500 ms con 2.000 usuarios
concurrentes, o ≥ 99,9 % de disponibilidad) sin haberlos medido: si en Entrega 2 la
implementación real no los alcanza, hay que corregir el número en el SAD y justificar el cambio,
no esconderlo. Cada responsable debe revisar los umbrales de su atributo antes de la entrega.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-27 — Stack técnico de las 4 interfaces y motor de base de datos por dominio

**Tipo:** Decisión de diseño

**Contexto:** `App/README.md` dejaba el stack técnico de frontend y el motor de base de datos
concreto explícitamente abiertos ("se define al empezar el prototipo" / "se definirá junto con el
prototipo funcional de Entrega 2", sección 12 del SAD). Con la Entrega 2 encima había que fijarlos
para que cada integrante pudiera empezar a codear su parte sin bloquear a los demás.

**Decisión / resultado:**
1. **Frontend web** (`portal-web-cliente`, `portal-web-admin`): **Angular + TypeScript** — el
   equipo ya lo conoce, y su estructura de módulos/*guards*/*interceptors* facilita que las 4
   personas trabajen en paralelo con convenciones consistentes; RxJS encaja con las
   actualizaciones en tiempo real de ASR-05.
2. **App móvil** (`app-movil-cliente`, `app-movil-personal`): **Kotlin nativo sobre Android
   Studio** (Jetpack Compose, *coroutines*/*Flow*) — ya decidido por el equipo antes de esta
   conversación; se descartó un framework híbrido (React Native/Flutter) porque ASR-10 ya evita
   duplicar lógica de negocio en el cliente, así que compartir código de UI entre plataformas no
   compensaba la complejidad extra.
3. **Motor de base de datos por microservicio** (refinando ADR-01): **PostgreSQL** para todos los
   esquemas transaccionales (Entradas, Personal, Eventos/Emergencias, Parqueaderos,
   cuentas/proveedores/pagos), y **MongoDB** solo para el esquema de Reportes/analítica dentro de
   `administracion` (*polyglot persistence*) — decisión explícita del equipo, ya insinuada en la
   sección de modelo de datos del SAD.

Se documentaron estas tres decisiones como **ADR-05** (stack de frontend) y **ADR-06** (motor de
BD por dominio) en `Work/DescripcionArquitecturaSoftware.tex`, se actualizó la sección 12 (Modelo
de datos) para referenciar ADR-06 en vez de dejarlo abierto, se recompiló sin errores, y se
reemplazó `Submission/DescripcionArquitecturaSoftware.pdf`. También se actualizaron `App/README.md`
y los `README.md` de cada carpeta de `frontend/` y `services/` con el stack/BD que le corresponde,
y se dejó una nota en `App/shared/README.md`: como Angular/TS y Kotlin no comparten lenguaje, los
contratos compartidos deben expresarse como especificación de API (OpenAPI/JSON Schema), no como
código compartido.

**Alternativas consideradas:**
- **React o Vue** para el frontend web: descartadas frente a Angular por preferencia del equipo
  (ya conocido) y porque su estructura opinionada reduce fricción de coordinación entre 4 personas
  trabajando en ramas paralelas (`WORKFLOW.md`).
- **Framework híbrido cross-platform** (React Native/Flutter) para el móvil: descartado por la
  razón de ASR-10 explicada arriba.
- **Un solo motor de BD (PostgreSQL) también para Reportes**: descartado para no forzar un esquema
  rígido sobre datos de reporte cuya estructura varía, y para mostrar explícitamente la separación
  de necesidades de persistencia que la sección 12 del SAD ya anticipaba.

**Ventajas / desventajas:** Un solo framework por tipo de interfaz (en vez de mezclar stacks)
simplifica *tooling*/CI y revisión de código para un equipo de 4, a costa de que Angular y Kotlin
no comparten código de UI entre plataformas — los contratos comunes quedan limitados a la
especificación de API. El *polyglot persistence* (Postgres + Mongo) usa el motor más adecuado a
cada tipo de dato, a costa de operar y respaldar dos motores de base de datos en vez de uno.

**Riesgos técnicos:** Ninguno nuevo respecto a los ya registrados en la sección de Riesgos del SAD;
esta entrada solo fija motores/lenguajes concretos para decisiones estructurales (ADR-01, ADR-10)
que ya existían. Queda pendiente que cada responsable de servicio confirme que PostgreSQL/MongoDB
son viables en su entorno de desarrollo local antes de empezar a codear.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Corrección de dirección: CU-013 y CU-015 sobrescritas con CU-003 y CU-005

**Tipo:** Cambio arquitectónico

**Contexto:** El usuario indicó que la reasignación de la entrada anterior fue en la dirección
equivocada: no se trataba de llevar `CU-013`/`CU-014` hacia las pestañas `CU3`/`CU5`, sino al
revés, y con un destino distinto para el segundo caso. Se confirmó explícitamente con el usuario el
resultado exacto antes de aplicarlo, incluyendo que esto **reemplaza y hace perder** el contenido
que tenían `CU-013` y `CU-015`.

**Decisión / resultado:** Se deshizo el cambio anterior (`CU3` y `CU5` vuelven a ser copia exacta
de `CU-003` y `CU-005`, como antes de esa entrada) y, adicionalmente, se sobrescribió el contenido
de la hoja **`CU-013`** con el de `CU-003` (Cancelaciones y devoluciones) y el de la hoja
**`CU-015`** con el de `CU-005` (Consultar evento) — verificado celda por celda (0 diferencias) y
sin solapes de celdas fusionadas. `CU-014` no se tocó en ningún momento y sigue siendo "Validar y
entregar pedido", sin cambios.

**Riesgos técnicos:** Esto reintroduce a propósito el mismo tipo de inconsistencia que se corrigió
al inicio de la sesión: la pestaña `CU-013` ahora contiene internamente el Id `CU-003` (no
`CU-013`), y la pestaña `CU-015` contiene el Id `CU-005`. Además, **se perdieron** de este archivo
los casos de uso originales "Gestionar preparación del pedido" (antes en `CU-013`) y "Gestionar
cancelaciones y reembolsos" (antes en `CU-015`) del módulo de Pedidos — no aparecen en ninguna otra
pestaña del libro. Se conservan copias del archivo en cada paso intermedio en el scratchpad de la
sesión por si hace falta recuperarlos. El equipo debería confirmar que esta pérdida es intencional
antes de la entrega final.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Contenido de las pestañas finales CU3 y CU5 reasignado a petición del usuario

**Tipo:** Cambio arquitectónico

**Contexto:** Tras sincronizar las 5 pestañas finales `CU1`..`CU5` (ver entrada anterior) para que
no contradijeran a `CU-001`..`CU-005`, el usuario pidió explícitamente reemplazar el contenido de
dos de esas pestañas: `CU3` (hasta entonces copia de `CU-003`) por `CU-013`, y `CU5` (hasta entonces
copia de `CU-005`) por `CU-014`.

**Decisión / resultado:** Se reemplazó el contenido de la pestaña `CU3` por una copia exacta de
`CU-013` (Gestionar preparación del pedido) y el de `CU5` por una copia exacta de `CU-014`
(Validar y entregar pedido) — mismos valores, estilos, fusiones y alturas de fila, verificado
celda por celda (0 diferencias). Las pestañas `CU1`, `CU2` y `CU4` quedaron sin cambios (siguen
siendo copias de `CU-001`, `CU-002` y `CU-004`). Se conserva una copia del archivo previo a este
cambio en el scratchpad de la sesión.

**Riesgos técnicos:** No se conoce la razón de negocio detrás de esta reasignación puntual (fue una
instrucción directa del usuario, no una corrección de un error detectado por el asistente) — el
archivo sigue teniendo 30 pestañas en total (`CU-001`..`CU-025` más 5 duplicados bajo nombres de
pestaña antiguos), de las cuales ahora `CU3` y `CU5` en realidad representan `CU-013` y `CU-014`.
Si el equipo no recuerda por qué se hizo, vale la pena revisarlo antes de la entrega final para que
no genere confusión.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Sincronización de hojas obsoletas reaparecidas en CU_eventos_completo.xlsx

**Tipo:** Análisis

**Contexto:** Antes de comitear el trabajo de la sesión se detectó que
`Submission/CU_eventos_completo.xlsx` había cambiado en disco sin
intervención del asistente: pasó de 25 a 30 hojas. Las 5 hojas nuevas
(`CU1`..`CU5`) resultaron ser copias **previas a todas las correcciones**
de esta sesión — mismo contenido que `CU-001`..`CU-005` pero con el
"Proyecto" sin estandarizar (`Organización de eventos - HEXACORE` en vez de
`Sistema Integral de Gestión de Eventos`) y la versión en `1.0` en vez de
`2.0`. La causa más probable es una sincronización de OneDrive que fusionó
una copia en caché anterior a la reorganización. No había ningún archivo de
conflicto de OneDrive junto al original que lo confirmara.

**Decisión / resultado:** Se consultó al usuario antes de tocar el archivo.
En vez de borrar las 5 hojas repetidas, se sincronizó su contenido para que
cada una sea una copia exacta (valores, estilos, fusiones de celdas y
alturas de fila) de su hoja corregida correspondiente
(`CU1`←`CU-001`, ..., `CU5`←`CU-005`), verificado celda por celda (0
diferencias) y sin solapes de celdas fusionadas. El archivo quedó con 30
hojas: las 25 `CU-001`..`CU-025` más 5 duplicados exactos bajo el nombre de
pestaña antiguo. Se conserva una copia del archivo de 30 hojas sin
sincronizar en el scratchpad de la sesión.

**Riesgos técnicos:** El archivo sigue teniendo pestañas duplicadas
(`CU1`..`CU5` junto a `CU-001`..`CU-005`) — ya no contradictorias entre sí,
pero sí redundantes. Si vuelve a ocurrir una sincronización similar, o si el
equipo decide que las pestañas duplicadas no deberían entregarse así,
convendría eliminarlas explícitamente en vez de mantenerlas sincronizadas.
También vale la pena que el usuario revise la configuración de sincronización
de OneDrive para esta carpeta, ya que el archivo cambió sin que nadie lo
editara conscientemente.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Guía de estudio para la sustentación + referencias CU obsoletas en Summary.tex

**Tipo:** Análisis

**Contexto:** Al preparar material de estudio para la sustentación se encontró que
`Work/Summary.tex` (el resumen ejecutivo del proyecto, ya en `Submission/Summary.pdf`) todavía
citaba los 5 casos de uso del módulo de Personal con la numeración antigua (`CU-016` a `CU-020`),
previa a la renumeración de casos de uso a `CU-001..CU-025` hecha antes en esta misma sesión. Esto
dejaba dos documentos ya entregados (`Summary.pdf` y `CU_eventos_completo.xlsx`) contradiciéndose
sobre el ID de los mismos casos de uso.

**Decisión / resultado:** Se corrigieron las 8 referencias de `CU-016..CU-020` a `CU-006..CU-010`
en `Work/Summary.tex`, se recompiló sin errores y se reemplazó `Submission/Summary.pdf`. Además, se
creó `Defense/DefenseGuide.tex` → `Defense/DefenseGuide.pdf`: una guía de estudio personal (no es
un entregable del curso) que explica, archivo por archivo, todo lo que hay en `Submission/`
(Summary, ArchitecturalProposal, C4Diagrams, CU_eventos_completo.xlsx), con preguntas que el
profesor podría hacer y los puntos delicados que el estudiante debe poder explicar con honestidad
(Árbol de Utilidad pendiente, posible duplicación Personal/Logística en los casos de uso,
infraestructura de despliegue propuesta por el asistente aún sin confirmar por el equipo) — en
línea con la regla del curso de que cada estudiante debe poder explicar cada término y decisión
generada con ayuda de IA.

**Riesgos técnicos:** Ninguno nuevo — el fix de `Summary.tex` es puramente de consistencia de IDs.
La guía de defensa puede quedar desactualizada si `Submission/` cambia después sin regenerarla; se
documentó esa dependencia en `CLAUDE.md` y `TASKS.md`.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Diagramas C4 completados: Panorama de Sistemas, Dinámico y Despliegue

**Tipo:** Cambio arquitectónico

**Contexto:** Se revisó el ejercicio de fin de clase de cada una de las 5
diapositivas del curso. El de la Clase 4 ("Notación y vistas
arquitectónicas") pide explícitamente elaborar **todos** los diagramas del
modelo C4 y validarlos contra el checklist oficial de c4model.com.
`Work/C4Diagrams.tex` solo cubría los 3 diagramas jerárquicos (Contexto,
Contenedores, Componentes) — los 3 diagramas auxiliares (System Landscape,
Dynamic, Deployment) estaban señalados como pendientes en `TASKS.md` desde
la sesión anterior. De paso se encontró una referencia cruzada obsoleta: el
diagrama de componentes citaba el caso de uso complejo como "CU-016" cuando
en realidad es CU-006 (Gestión del Mercado Secundario de Entradas) — un
resto de antes de la renumeración de casos de uso.

**Decisión / resultado:** Se agregaron los 3 diagramas auxiliares a
`Work/C4Diagrams.tex`: (1) **Panorama de Sistemas**, ubicando el Sistema
Integral de Gestión de Eventos junto a otros sistemas plausibles de la
organización (Contabilidad, CRM, BI); (2) **Dinámico**, con la secuencia
numerada de 8 pasos de la reventa de una entrada (CU-006) a nivel de
contenedores; (3) **Despliegue**, aterrizando los contenedores del Nivel 2
en nodos de infraestructura reales (CDN, balanceador/API Gateway, clúster
Kubernetes con un pod por microservicio, clústeres de BD/Redis/mensajería).
Se corrigió la referencia CU-016→CU-006, se reescribió la sección de
verificación contra el checklist oficial para cubrir explícitamente cada
ítem de c4model.com/diagrams/checklist (incluida la aclaración de íconos,
bordes, tamaños y estilos de línea) sobre los 6 diagramas, y se actualizó la
conclusión y la portada. El documento se recompiló sin errores (pdflatex,
3 pasadas, 16 páginas) y reemplazó al PDF anterior en
`Submission/C4Diagrams.pdf`; se conserva una copia del PDF previo en el
scratchpad de la sesión. También se revisó `Work/ArchitecturalProposal.tex`
contra el ejercicio de las Clases 2 y 3 (priorizar atributos de calidad,
definir componentes/conexiones, explicar cómo la arquitectura satisface
cada atributo): ya cumplía los tres puntos explícitamente, no requirió
cambios.

**Alternativas consideradas:** Omitir también el diagrama de Código (Nivel
4) sin justificación — se mantuvo la justificación ya existente (la guía
oficial de C4 solo lo recomienda para componentes críticos y normalmente se
genera desde el código fuente, que este proyecto aún no tiene). Anidar los
5 pods del clúster de Kubernetes con un `tikzpicture` interno en el
diagrama de despliegue — se descartó porque los estilos de nodo definidos
en el `tikzpicture` externo no son visibles dentro de uno anidado (hubiera
fallado la compilación); se optó por dibujar los 5 nodos como hermanos y
agruparlos visualmente con `\node[fit=...]` de la librería `fit` de TikZ.

**Riesgos técnicos:** El panorama de sistemas (Contabilidad, CRM, BI) es
una propuesta razonable del asistente, no un inventario real de sistemas de
la organización — el equipo debe confirmar o ajustar qué sistemas existen
realmente. El diagrama de despliegue asume un ambiente en la nube con
Kubernetes, que es coherente con la arquitectura de microservicios ya
decidida pero aún no ha sido validado por el equipo como la plataforma de
despliegue real.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Casos de uso ampliados a ≥8 pasos según la regla de Clase 1

**Tipo:** Análisis

**Contexto:** Revisando la diapositiva "Características generales del
sistema" de `Work/Slides/01. AS - Introducción al curso y reglas.pdf`, se
confirmó que el curso exige **al menos 8 pasos por caso de uso** (además de
≥5 CU por integrante y ≥1 CU complejo por integrante con atributos de
calidad + infraestructura no triviales). Al contar los pasos reales del
`FLUJO BÁSICO DE ÉXITO` en las 25 hojas de `Submission/CU_eventos_completo.xlsx`
(ver entrada anterior), 13 casos de uso quedaban por debajo del mínimo (entre
4 y 6 pasos): CU-002, CU-003, CU-004, CU-005 (bloque Boletería), CU-016,
CU-017, CU-019, CU-020 (bloque Logística) y CU-021 a CU-025 (bloque
Parqueadero). De paso se encontró un bug de datos: en CU-024 el paso 1
("El sistema calcula el valor a pagar…") estaba puesto en la columna del
ACTOR en vez de la del SISTEMA.

**Decisión / resultado:** Se amplió el flujo básico de los 13 CU a 8-10 pasos
cada uno, añadiendo pasos de validación, confirmación y notificación
coherentes con el objetivo/pre-condiciones/post-condiciones ya definidos de
cada caso (sin inventar comportamiento nuevo, solo detallando el que ya
estaba implícito). Donde el flujo alterno decía "No hay flujos alternativos
conocidos" (CU-003, CU-004, CU-005) se redactaron 1-2 alternos reales; donde
ya existían alternos/excepciones se les sumó 1-2 más para reforzar la lectura
de "caso complejo". Se corrigió el bug de columna en CU-024. Con esto, las 25
hojas del documento cumplen el mínimo de 8 pasos (verificado programáticamente
tras el cambio), y la mayoría queda con 9-13 pasos + varios alternos +
excepciones + atributos de calidad + infraestructura no trivial, cumpliendo
el criterio de "caso de uso complejo" para más de un CU por bloque. Se
conserva una copia del archivo previo a esta ampliación en el scratchpad de
la sesión.

**Riesgos técnicos:** Los pasos nuevos fueron redactados por el asistente a
partir del contexto de cada CU, no por el equipo — conviene que el dueño de
cada bloque (según lo indicado: CU-001 a CU-005 de un integrante, CU-006 a
CU-010 de Samuel, CU-011 a CU-025 de otro integrante) los revise antes de la
entrega. Sigue pendiente confirmar cuántos integrantes tiene el equipo
realmente: si son más de 5, 25 CU no alcanzan el mínimo de "5 CU por
integrante" y haría falta sumar más casos de uso.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-20 — Reorganización y corrección de `CU_eventos_completo.xlsx`

**Tipo:** Análisis

**Contexto:** El archivo `Submission/CU_eventos_completo.xlsx` reunía 25 casos
de uso escritos por distintos subequipos (Boletería/Entradas, Personal,
Pedidos/Comida "HEXACORE", Logística, Parqueadero) en momentos distintos, sin
una revisión de consistencia final. Al revisarlo hoja por hoja se encontraron
errores reales, no solo de formato: IDs internos que no coincidían con la
pestaña (CU7 tenía Id interno `CU-017`; CU8 tenía `CU-08`; el CU de logística
"Asignar personal operativo" tenía Id `CU-002`, que chocaba con el CU-002 real
de boletería; el CU de parqueadero "Control de ocupación" tenía Id `CU-005`,
que chocaba con el CU-005 real de boletería); referencias cruzadas rotas
copiadas de otra plantilla y nunca actualizadas (CU8 citaba "CU-018A..G" y
"CU-07" en vez de CU-008; CU12 citaba "CU-001"/"CU-002A..D" en vez de CU-011/
CU-012A..D; CU14 tenía el alterno "CU-04D" mal escrito); metadatos de
"Proyecto" con 3 redacciones distintas para el mismo sistema; hojas en un
orden no secuencial (CU6..CU15, CU1..CU5, LOG, PARK); y solo un caso de uso
(CU6, mercado secundario de entradas) tenía las secciones "Atributos de
Calidad Asociados" e "Infraestructura No Trivial Utilizada" que las otras 24
hojas no tenían.

**Decisión / resultado:** Con el usuario se confirmaron dos decisiones antes
de tocar el contenido: (1) renumerar los 25 CU de forma secuencial y sin
choques, `CU-001`–`CU-025` (001–006 Boletería/Entradas, 007–010 Personal,
011–015 Pedidos/Comida, 016–020 Logística, 021–025 Parqueadero), corrigiendo
todas las referencias cruzadas para que apunten al ID correcto; y (2) redactar
"Atributos de Calidad Asociados" e "Infraestructura No Trivial Utilizada" para
los 24 casos de uso que no los tenían, en vez de quitarlos de CU6, dado el
peso que tienen esos dos campos en un curso de Arquitectura de Software. Se
estandarizó también el campo "Proyecto" a un único texto y la versión de cada
ficha a `2.0`. El archivo corregido reemplazó al original en
`Submission/CU_eventos_completo.xlsx`; se conserva una copia del original sin
tocar en el scratchpad de la sesión por si se necesita comparar.

**Alternativas consideradas:** Mantener la numeración original por subequipo
(CU-001..CU-015 + prefijos `CU-LOG-XXX`/`CU-PARK-XXX`) y solo arreglar los IDs
que chocaban — se descartó porque perpetuaba dos convenciones de nombrado
distintas en el mismo documento. Quitar las secciones de calidad/infraestructura
de CU6 en vez de generalizarlas — se descartó porque esos campos son
justamente el eje de evaluación del curso.

**Riesgos técnicos:** El texto de "Atributos de Calidad" e "Infraestructura"
para los 24 CU nuevos fue redactado por el asistente a partir de la
descripción de cada caso de uso, no por el equipo; conviene que cada
responsable de módulo lo revise antes de entregar. También se detectó una
posible duplicación de alcance entre el módulo de Personal (CU-007 a CU-009)
y el de Logística (CU-017/CU-018), que cubren asignación y turnos del
personal desde dos ángulos — no se fusionaron ni se eliminaron, queda
pendiente que el equipo decida si son complementarios o redundantes.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-18 — Bitácora creada; decisiones iniciales ya documentadas

**Tipo:** Análisis

**Contexto:** Al estudiar las diapositivas de clase (`Work/Slides/`) se
identificó que el curso exige mantener esta bitácora de forma permanente, y
que aún no existía en el repositorio.

**Decisión / resultado:** Se crea este archivo. Las decisiones arquitectónicas
ya tomadas para "Sistema Integral de Gestión de Eventos" están descritas en
`Work/ArchitecturalProposal.tex` (sección "Resumen de decisiones
arquitectónicas") y en `Work/C4Diagrams.tex`, pero **no estaban registradas
aquí con su justificación cronológica** (por qué, alternativas, riesgos). Se
recomienda, en la próxima sesión de trabajo del equipo, migrar cada decisión
relevante de esos documentos a una entrada propia en esta bitácora,
incluyendo alternativas consideradas y riesgos — no solo el resultado final.

**Participantes:** Samuel Contreras (vía asistente).

---

## 2026-08-18 — Decisiones arquitectónicas fundacionales (migradas desde ArchitecturalProposal.tex)

**Tipo:** Decisión de diseño

**Contexto:** Migración pendiente señalada en la entrada anterior y en el
ejercicio de la Clase 5 ("refinar el documento de diseño"): las decisiones
de `Work/ArchitecturalProposal.tex` (sección "Resumen de decisiones
arquitectónicas") solo estaban registradas como una tabla de
decisión/problema/atributos, sin alternativas ni riesgos explícitos. Se
migran aquí con esa justificación completa.

**Decisión / resultado:** Para satisfacer consistencia, disponibilidad,
seguridad y rendimiento (prioridad Alta) más tiempo real, escalabilidad y
trazabilidad (prioridad Media), se adoptó:

1. **Arquitectura de microservicios** (uno por dominio: Entradas, Mercado
   Secundario, Personal, Eventos, Parqueaderos, Emergencias), cada uno con
   base de datos propia.
2. **API Gateway** como único punto de entrada al backend, centralizando
   autenticación, autorización y enrutamiento.
3. **Balanceador de carga** frente a las instancias de cada microservicio.
4. **Redis** para bloqueo temporal de recursos en disputa (p. ej. una
   entrada en reventa) y para datos de acceso rápido (aforo, sesiones).
5. **Cola de mensajes (RabbitMQ/Kafka)** para desacoplar operaciones
   asíncronas: generación de QR, notificaciones, auditoría, liquidación de
   pagos, alertas de emergencia.
6. **Base de datos independiente por servicio**, para reducir acoplamiento.
7. **Servicios externos** de pasarela de pagos y notificaciones
   (push/correo/SMS), integrados vía API.
8. **Cuatro interfaces especializadas** (Portal Web Cliente, Portal Web
   Administrativo/Operativo, App Móvil Cliente, App Móvil Personal), todas
   consumiendo el mismo backend a través del API Gateway.

**Alternativas consideradas:**
- **Monolito modular** en vez de microservicios: se descartó porque
  dificulta escalar de forma independiente el servicio de Entradas durante
  una apertura de venta sin sobre-aprovisionar los demás dominios.
- **Una sola base de datos compartida**: se descartó por acoplamiento —
  un cambio de esquema en un dominio (p. ej. Parqueaderos) no debería
  arriesgar la disponibilidad de Entradas.
- **Comunicación síncrona pura (sin colas)** para notificaciones/QR: se
  descartó porque un fallo temporal del proveedor de notificaciones no debe
  bloquear ni fallar la operación principal (compra, transferencia).
- **Una sola interfaz web genérica para todos los roles**: se descartó por
  usabilidad — clientes, personal y administración tienen necesidades muy
  distintas y exponer todas las funciones a todos los roles es
  confuso e inseguro.

**Ventajas / desventajas:** La separación en microservicios y BD por
dominio favorece mantenibilidad y escalabilidad independiente, a costa de
mayor complejidad operativa (más piezas de infraestructura que desplegar y
monitorear) y de tener que gestionar consistencia eventual entre servicios
en vez de transacciones ACID únicas. Redis y las colas resuelven
consistencia/concurrencia y desacoplamiento, pero introducen puntos
adicionales de falla que deben tener su propia estrategia de disponibilidad
(replicación, clúster).

**Riesgos técnicos:** Concurrencia entre compradores en el mercado
secundario (mitigado con bloqueo en Redis); disponibilidad del API Gateway
como punto único de entrada (mitigado con balanceador + múltiples
instancias); dependencia de servicios externos de pago y notificaciones
para completar flujos críticos (compra, reventa); sobrecarga de picos de
tráfico en la apertura de venta o el ingreso masivo al evento.

**Participantes:** Samuel Contreras (vía asistente).
