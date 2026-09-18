# Guía detallada — Entrega 1 (SAD v1, 15%)

Guía de trabajo para cerrar los 6 puntos del checklist de Entrega 1
(`Cronograma.md` § "Checklist consolidado — Entrega 1", fecha tentativa
**9 oct 2026**, aún no confirmada por el profesor). No es un entregable del
curso — es la hoja de ruta interna del equipo; actualizarla conforme se
avanza (marcar los `[ ]` como `[x]`).

> **Por qué existe este documento.** El usuario pidió explícitamente que la
> entrega tenga: (1) **pruebas** que demuestren por qué se tomó cada
> decisión, (2) **al menos dos alternativas** comparadas en toda selección
> de tecnología, y (3) que **cada decisión corresponda a un atributo de
> calidad** concreto (no una preferencia sin justificar) — **para todas las
> decisiones tomadas hasta el momento**, no solo las nuevas. Estas tres
> reglas son transversales a los 6 puntos de abajo — no son un ítem aparte.
>
> **Ejemplo de referencia dado por el usuario**, que fija el nivel de
> rigor esperado: *"en la app móvil se decidió trabajar en Flutter porque
> se hizo un demo en Flutter y otro en Android Studio, y se debe decir el
> porqué de la decisión y a qué atributo de calidad corresponde."* — es
> decir, no basta con elegir y justificar en prosa: hay que **construir
> algo en cada alternativa candidata** (aunque sea un demo pequeño) y
> comparar con datos reales. Este documento desarrolla ese ejemplo a fondo
> más abajo, y aplica el mismo criterio a **todas** las decisiones técnicas
> ya tomadas en el proyecto (auditoría completa en la siguiente sección).

---

## Regla de oro: la plantilla de decisión (úsala siempre)

Cada vez que el equipo elija una tecnología, patrón o táctica — no solo en
los ADR "grandes", también en cada análisis de atributo de calidad (clases
6–14) — la decisión se redacta con esta plantilla, la misma que ya usa
`BitacoraArquitectonica.md` pero con un campo nuevo obligatorio
(**Evidencia**):

```
**Atributo de calidad que motiva la decisión:** <uno de los priorizados en
ArchitecturalProposal.tex — Disponibilidad, Seguridad, Rendimiento, etc.>

**Alternativas consideradas (mínimo 2):**
1. <Opción A> — ventajas / desventajas
2. <Opción B> — ventajas / desventajas
3. <Opción C, si aplica>

**Demo/PoC construido para comparar:** <qué se construyó en cada
alternativa, aunque sea mínimo — una pantalla, un endpoint, un script — y
dónde vive el código>

**Decisión:** <cuál se eligió y en una frase, por qué gana sobre las otras>

**Evidencia / pruebas:** <qué demuestra que la decisión funciona: resultado
medido del demo (tiempo, líneas de código, throughput, latencia, capturas
de pantalla comparadas), o si no alcanzó el tiempo para un demo propio, al
menos documentación/benchmark técnico citado — nunca solo "porque es lo más
usado" sin respaldo>

**Riesgos / desventajas de lo elegido:** <qué se sacrifica>
```

**Por qué el campo "Evidencia" importa tanto:** en la sustentación, "elegimos
Redis porque es rápido" no resiste una pregunta de seguimiento. "Elegimos
Redis porque en el PoC-02 (`Work/PoCs/locking-redis/`) simulamos 50 compras
concurrentes de la misma entrada en reventa y Redis con `SETNX` evitó el
100% de las ventas duplicadas, mientras que sin bloqueo se duplicaron 6 de
50" sí resiste. Ese es el nivel que se busca — y es exactamente el nivel del
ejemplo de Flutter vs. Android Studio que dio el usuario.

---

## Auditoría completa de decisiones tecnológicas (tomadas o pendientes)

Se revisó todo lo que hoy existe en `Proyecto/App/**/README.md`, los ADR-01
a ADR-04 del SAD y las decisiones fundacionales de la Bitácora
(2026-08-18). Ninguna tiene hoy el campo **Evidencia** de la plantilla de
arriba — todas fueron justificadas por razonamiento, no por una prueba
construida. Además, **dos decisiones están literalmente sin cerrar**
(marcadas ❌ abajo) y bloquean poder avanzar con PoCs reales.

| # | Decisión | Estado hoy | Atributo de calidad que debería justificarla | Alternativas a comparar (mínimo 2) | Evidencia que falta conseguir |
|---|---|---|---|---|---|
| 1 | Arquitectura de microservicios (vs. monolito) | 🟡 decidida, alternativas ya listadas en Bitácora (2026-08-18) | Escalabilidad / Disponibilidad | Microservicios vs. Monolito modular (ya nombrada) | PoC: escalar solo el servicio de Entradas bajo carga simulada vs. escalar un monolito completo — medir recursos usados |
| 2 | **Lenguaje/framework del backend de `services/*`** | ❌ **"Por definir"** (`App/README.md`) — bloquea todo lo demás | Rendimiento (ASR-04: apertura de venta) | Ej. Node.js/Express vs. Java/Spring Boot vs. Go — elegir 2-3 candidatos reales del equipo | Benchmark: mismo endpoint (ej. "consultar disponibilidad de entradas") implementado en cada candidato, medir throughput/latencia con carga simulada (k6, JMeter o similar) |
| 3 | **Cola de mensajes: RabbitMQ *o* Kafka** | ❌ **sin decidir** — ADR-04 hoy dice "RabbitMQ/Kafka" como si fueran intercambiables | Desacoplamiento / Disponibilidad | RabbitMQ vs. Kafka | PoC: publicar/consumir el evento "entrada transferida" en ambos, comparar latencia y facilidad de configurar reintentos/DLQ |
| 4 | Redis para bloqueo de concurrencia + caché | 🟡 decidida (ADR-03), sin alternativa explícita comparada | Consistencia (evitar doble venta) | Redis (`SETNX`/lock distribuido) vs. bloqueo optimista en PostgreSQL (version/timestamp) vs. `SELECT FOR UPDATE` | Ya es uno de los PoCs sugeridos en el punto 4 de esta guía — reutilizar ese resultado aquí |
| 5 | PostgreSQL para datos transaccionales | 🟡 decidida, sin alternativa comparada | Consistencia (ACID) | PostgreSQL vs. MySQL | Evidencia liviana: comparación documentada (no necesita PoC propio si el equipo ya tiene experiencia clara con uno) |
| 6 | MongoDB para Reportes/analítica (polyglot persistence) | 🟡 decidida, sin alternativa comparada | Flexibilidad de esquema / Rendimiento en consultas analíticas | MongoDB vs. PostgreSQL con columnas JSONB | Evidencia liviana: ejemplo de una consulta de reporte típica en ambos, comparar flexibilidad de esquema |
| 7 | Angular + TypeScript para los portales web | 🟡 decidida, con un "motivo" en la tabla de `App/README.md` (RxJS para tiempo real) pero **sin demo comparado** | Modifiability / Rendimiento en actualizaciones en tiempo real | Angular vs. React (o Vue) | Demo pequeño: un componente con actualización en tiempo real (WebSocket o polling, ej. "aforo restante del evento") implementado en ambos frameworks |
| 8 | **Stack de las apps móviles: Kotlin nativo (Android) + Swift nativo (iOS), dos apps separadas** | ❌ decidida **de facto** (las dos apps ya están construidas: `app-movil` y `app-ios`) pero **sin documentar la comparación ni el porqué** | Modifiability (una base de código) vs. Usability/Performance (look-and-feel 100% nativo) | Nativo (Kotlin + Swift, ya construido) vs. **Flutter** (una sola base de código) — ver desarrollo completo abajo | Este es el ejemplo exacto que dio el usuario — desarrollado a fondo en la siguiente sección |

**Prioridad si el tiempo no alcanza para las 8**: cerrar primero la **#2**
(lenguaje del backend — sin esto no se puede ni empezar a codificar
`services/`) y la **#3** (cola de mensajes), porque son las únicas que
están genuinamente **sin decidir**, no solo sin evidencia. Las demás ya
tienen una decisión funcionando; hay que respaldarla, pero no bloquean
avanzar mientras tanto.

### Cómo cerrar la decisión #2 — lenguaje/framework del backend (paso a paso)

1. **El equipo elige 2-3 candidatos reales** en una llamada/reunión corta
   (no más de 3, o el PoC se vuelve inmanejable) — sugeridos por lo que ya
   se usa en el resto del stack: **Node.js/Express** o **NestJS**
   (TypeScript, mismo lenguaje que los portales Angular — reduce el
   cambio de contexto del equipo) vs. **Java/Spring Boot** (tipado fuerte,
   ecosistema maduro para microservicios) vs. **Go** (si alguien ya lo
   conoce; mejor rendimiento crudo pero curva de aprendizaje nueva para
   el equipo).
2. **Implementar el mismo endpoint mínimo** en cada candidato: `GET
   /entradas/{id}/disponibilidad` que responda un JSON fijo (no hace falta
   BD real todavía) — esto ya es un PoC-04 legítimo.
3. **Benchmark de carga**: usar `k6` o `autocannon` (Node) o `wrk` para
   simular 500-2000 solicitudes concurrentes contra cada implementación,
   corriendo en la misma máquina/condiciones. Medir: solicitudes/segundo,
   latencia p95, uso de memoria del proceso.
4. **Registrar el resultado** en `Proyecto/App/PoCs/poc-04-lenguaje-backend/`
   con el mismo formato que los PoCs 1 y 2.
5. **Redactar ADR-05** (o el número que corresponda tras el de la app
   móvil) en `DescripcionArquitecturaSoftware.tex`, actualizar
   `Proyecto/App/README.md` (fila "services/\* — Por definir" de la tabla
   de Stack técnico) y `Proyecto/App/infra/README.md` si aplica.

### Cómo cerrar la decisión #3 — RabbitMQ vs. Kafka (paso a paso)

1. Instalar ambos localmente (`brew install rabbitmq` / correr Kafka vía
   Docker, ej. imagen `confluentinc/cp-kafka` — más pesado que RabbitMQ de
   instalar, tenerlo en cuenta como parte de la evidencia).
2. Implementar el mismo caso real: publicar el evento
   `ENTRADA_TRANSFERIDA` (ya nombrado en `DescripcionArquitecturaSoftware.tex`
   § "Vista de procesos") y un consumidor que lo procese, en ambos.
3. Medir: latencia publicación→consumo, y qué tan fácil fue configurar
   reintentos/dead-letter-queue en cada uno (cualitativo, pero documentarlo
   con el número de líneas de configuración que tomó cada uno).
4. Con el resultado, cerrar el **ADR-04** existente en
   `DescripcionArquitecturaSoftware.tex` (hoy dice "RabbitMQ/Kafka" —
   cambiarlo a uno solo, con la evidencia del PoC) y actualizar
   `Proyecto/App/infra/README.md` y `Proyecto/App/README.md` para que ya
   no aparezcan ambos como si fueran intercambiables.

---

## Ejemplo completo desarrollado: stack de la app móvil (Nativo vs. Flutter)

Este es el desarrollo íntegro del ejemplo que dio el usuario, aplicado al
caso real del proyecto (fila #8 de la tabla de arriba).

### Contexto

Ya existen dos apps móviles completas (19 pantallas cada una, sobre datos
mock, sin backend real todavía):
- `Proyecto/App/frontend/app-movil` — Android nativo, Kotlin + Jetpack Compose.
- `Proyecto/App/frontend/app-ios` — iOS nativo, Swift + SwiftUI.

Esto se construyó así porque el usuario lo pidió explícitamente en dos
pasos separados de la conversación, **no porque el equipo comparó
alternativas y decidió** — es exactamente el tipo de decisión "de facto sin
evidencia" que esta guía busca corregir antes de la entrega.

### Atributo de calidad que motiva la decisión

Hay tensión entre dos atributos, y el ADR final debe decir cuál pesa más
para HEXACORE:
- **Modifiability** (mantenibilidad/costo de desarrollo): una sola base de
  código (Flutter) se modifica una vez para ambas plataformas; dos bases
  nativas duplican todo cambio.
- **Usability** (consistencia con la plataforma) y **Performance**: código
  nativo usa los widgets/render real de cada SO (look-and-feel 100%
  fiel, mejor acceso a APIs nuevas del sistema operativo); Flutter dibuja
  su propio motor de renderizado (Skia/Impeller) por encima, no usa
  widgets nativos.

### Alternativas a comparar (mínimo 2 — aquí van 3)

1. **Dos apps nativas** (Kotlin/Compose + Swift/SwiftUI) — **ya construido**.
2. **Flutter** (Dart) — una sola base de código para ambas plataformas —
   **falta construir el demo**.
3. *(opcional, si el tiempo alcanza)* **Kotlin Multiplatform (KMM)**: UI
   nativa por plataforma pero lógica de negocio/red compartida — término
   medio entre las dos anteriores. Puede quedar solo como análisis en
   prosa si no alcanza el tiempo para un tercer demo.

### El demo que hay que construir (esto es lo que falta — es la evidencia)

Tomar **una sola pantalla ya existente en ambas apps nativas**, la más
representativa (recomendado: **Inicio** — lista de eventos con tabs
Próximos/Pasados, `InicioScreen.kt` / `InicioScreen.swift` — o si se
prefiere algo más simple, **Login**), y reimplementarla en Flutter desde
cero, con los mismos datos mock. No hace falta portar las 19 pantallas —
con una bien elegida basta para medir de forma justa.

**Qué medir en el demo (esto se convierte en la tabla de evidencia):**

| Métrica | Cómo medirla | Por qué importa |
|---|---|---|
| Tiempo de desarrollo | Horas reales para llegar al mismo resultado visual/funcional en Flutter, comparado con lo que ya tomó en Kotlin+Swift (estimar retrospectivamente si no se cronometró en su momento) | Evidencia directa de Modifiability/costo |
| Líneas de código | Flutter: 1 archivo/pantalla para ambas plataformas. Nativo: 2 archivos (uno Kotlin, uno Swift) para la misma pantalla | Evidencia directa de duplicación de esfuerzo |
| Fidelidad al look-and-feel nativo | Captura de pantalla lado a lado: la versión Flutter vs. la nativa de Android vs. la nativa de iOS, en el mismo dispositivo/simulador | Evidencia de Usability — ¿se nota que Flutter no es 100% nativo? |
| Rendimiento | Tiempo de arranque en frío y fluidez de scroll de la lista de eventos, medidos con Flutter DevTools vs. Android Studio Profiler / Xcode Instruments | Evidencia de Performance |
| Familiaridad del equipo | Cualitativo: el equipo ya conoce Kotlin (así lo dice `App/README.md` como "motivo" actual) — nadie en el equipo tiene experiencia previa en Dart/Flutter, lo cual es un riesgo real de tiempo, no solo una preferencia | Evidencia de Testability/riesgo de cronograma |

**Nota práctica:** esta máquina no tiene el SDK de Flutter instalado (se
verificó: `flutter`/`dart` no están disponibles). Si el equipo quiere que
se construya este demo en una sesión futura, hay que instalar el SDK
primero (`brew install --cask flutter` en macOS) — avisar antes de hacerlo
porque es una descarga grande. Mientras tanto, esta sección deja la
metodología exacta lista para ejecutar.

### Decisión (a redactar después de correr el demo — no se puede inventar)

Aquí va, una vez exista el resultado real del demo, una frase del tipo:
*"Se mantiene el stack nativo (Kotlin + Swift) porque, aunque duplica el
código, el demo de Flutter mostró [X ms más de arranque en frío / look
diferente perceptible en Y] y el equipo no tiene experiencia previa en
Dart, lo que habría puesto en riesgo el cronograma de Entrega 1."* — o la
conclusión contraria, si el demo de Flutter sale mejor de lo esperado. **No
redactar la decisión antes de tener el demo** — sería exactamente el tipo
de justificación sin evidencia que se está corrigiendo.

### Dónde documentarlo

Nuevo **ADR-05 — Stack de las apps móviles** en
`Work/DescripcionArquitecturaSoftware.tex` (junto a ADR-01..04) + entrada
nueva en `BitacoraArquitectonica.md` con la plantilla completa de la
sección "Regla de oro". Actualizar también la tabla de "Stack técnico" en
`Proyecto/App/README.md`, que hoy solo dice "Kotlin nativo... Lenguaje ya
conocido por el equipo" sin mencionar que también existe una app iOS ni
que se comparó con Flutter — está desactualizada respecto a lo que
realmente hay en el repo.

---

## 1. Especificación de casos de uso y RNF

**Estado: ✅ HECHO (2026-09-06).** CU: 32 CU en
`Submission/CU_eventos_completo.xlsx`. RNF: **RNF-01 a RNF-16** en
`Work/DescripcionArquitecturaSoftware.tex`, líneas 176-248 (sección
"Requisitos No Funcionales", justo después de "Visión general de los
requisitos funcionales"), uno o más por cada uno de los 14 atributos de
calidad priorizados, cada uno con métrica y umbral verificable. Tabla
completa reproducida en la Bitácora (entrada 2026-09-06) y en la
conversación de esta sesión si necesitas copiarla rápido.

**Ya no queda trabajo por hacer aquí salvo revisión.** Tareas específicas
restantes, una por persona/momento:
1. **Cada integrante lee los RNF de su(s) atributo(s) asignado(s)**
   (tabla de `Cronograma.md`: I1 Availability/Deployability → RNF-03,04,14;
   I2 Performance/Modifiability → RNF-01,02,08,11; I3
   Integrabilidad/Safety/Testability → RNF-13,15,16; I4
   Security/Usability → RNF-05,10) y confirma si el umbral numérico (ej.
   "≤500 ms", "≥99.9%") es realista o si prefiere otro número — hoy son
   estimaciones razonables del asistente, no medidas del equipo.
2. Si alguien detecta un RNF le falta (ej. un CU sin ningún RNF que lo
   respalde), agregar una fila nueva a la Tabla \ref{tab:rnf} siguiendo el
   mismo formato (ID, descripción, atributo, métrica/umbral) — no crear un
   sistema de numeración paralelo.
3. **No hace falta tocar nada más de este punto** hasta que el SAD completo
   se recompile por última vez antes de entregar (ver checklist final).

---

## 2. ASR (Árbol de Utilidad)

**Estado: ✅ HECHO (2026-09-06).** Tabla \ref{tab:asr} en
`Work/DescripcionArquitecturaSoftware.tex`, con **12 ASR** (ASR-01 a
ASR-10 del borrador original + **ASR-11** Integrabilidad y **ASR-12**
Desplegabilidad, agregados el 2026-09-06), cada uno con el par
**(Importancia, Dificultad)** en escala Alta/Media/Baja — ya no es una
sola columna de "Prioridad" genérica.

**Tareas específicas restantes:**
1. **Cada integrante revisa los ASR de su(s) CU propios** (columna
   "Funcionalidades" de la tabla) y confirma si el par (Importancia,
   Dificultad) que puso el asistente le parece correcto — hoy son
   estimaciones a partir del catálogo de clase, no una votación del equipo.
   Ejemplo concreto: Daniel Cristancho revisa ASR-01 (CU-006, aunque el
   dueño de CU-006 es Samuel Emperador — Daniel sí es dueño de CU-021..023,
   relacionados con ASR-06/ASR-08 de Parqueaderos).
2. Si el equipo decide que un escenario merece más detalle en formato
   Fuente/Estímulo/Artefacto/Entorno/Respuesta/Medida de respuesta
   completo (hoy la columna "Escenario" los combina en una frase), expandir
   esa fila sin borrar las demás.
3. **No requiere alternativas de tecnología ni PoC** — el Árbol de
   Utilidad es sobre requisitos, no sobre soluciones; eso ya se cubre en
   los puntos 3 y 4.

---

## 3. Diseño arquitectónico con tácticas de QA (clases 6–14)

**Estado: ✅ HECHO (2026-09-06)** para los 9 atributos de las clases 6-14.
Disponibilidad ya estaba (2026-08-25); el 2026-09-06 se agregaron los 8
restantes en `Work/ArchitecturalProposal.tex` § "Cómo la arquitectura
satisface los atributos de calidad", cada uno con tabla de
escenario/táctica/patrón (o Five Planes para Usabilidad) comparando ≥2
alternativas:

| Atributo | Responsable (`Cronograma.md`) | Dónde está | Tiene PoC propio |
|---|---|---|---|
| Disponibilidad | I1 | § "Disponibilidad -- Alta" | No, pero PoC-01 lo toca indirectamente (Redis) |
| Desplegabilidad | I1 | § "Desplegabilidad -- Media" | No — necesita el PoC de failover (punto 4) |
| Rendimiento | I2 | § "Rendimiento -- Alta" | Parcial — PoC-02 (QR) toca este atributo, resultado no concluyente |
| Modificabilidad | I2 | § "Mantenibilidad -- Baja-Media" | No |
| Integrabilidad | I3 | § "Integrabilidad -- Media" | No |
| Safety | I3 | § "Seguridad física (Safety) -- Baja" | No (prioridad baja, aceptable sin PoC) |
| Comprobabilidad (Testability) | I3 | § "Comprobabilidad (Testability) -- Media" | No |
| Seguridad | I4 | § "Seguridad -- Alta" | No |
| Usabilidad | I4 | § "Usabilidad -- Baja-Media" (Five Planes, no tácticas) | No aplica (no es de tácticas Bass/Kazman) |

**Tareas específicas restantes, una por responsable** (no hay que
redactar nada nuevo — es revisar y, donde aplique, reforzar con PoC):

1. **Cada responsable (I1-I4) lee la subsección de SU atributo** en
   `ArchitecturalProposal.tex` y confirma que los escenarios elegidos son
   realistas y que la elección entre alternativas le parece correcta —
   hoy todas fueron redactadas por el asistente a partir del catálogo de
   clase, no discutidas en equipo.
2. **I1** decide si vale la pena construir el PoC de failover (punto 4,
   3er PoC pendiente) para respaldar con datos medidos la elección
   Blue/Green vs. Rolling Upgrade de Desplegabilidad — hoy es solo
   razonamiento, no evidencia medida.
3. **I2** decide si el resultado inconcluso de PoC-02 (UUID vs. JWT para
   QR) debe resolverse antes de entregar, o si se documenta como
   "decisión pendiente, con plan de PoC de seguimiento" en el propio SAD
   — ambas opciones son honestas, la guía no fuerza ninguna.
4. **I3 e I4** no tienen PoC pendiente asociado a sus atributos — su única
   tarea es la revisión del punto 1. Si alguno quiere subir el nivel de
   evidencia, puede construir un PoC propio siguiendo el mismo formato de
   `Proyecto/App/PoCs/poc-01-bloqueo-concurrencia/README.md` (opcional,
   no bloqueante).

---

## 4. Pruebas de concepto (PoCs) de los 2–3 desafíos técnicos más complejos

**Estado: ✅ 2 de 2-3 HECHOS (2026-09-06)**, código real y ejecutable en
`Proyecto/App/PoCs/` (índice en `PoCs/README.md`):

1. **PoC-01 — Bloqueo de concurrencia** (`poc-01-bloqueo-concurrencia/`):
   compara sin bloqueo vs. optimista (BD) vs. Redis. **Resultado:** sin
   protección, 30/30 trials tuvieron venta duplicada (hasta 50 ventas
   simultáneas); con Redis u optimista, 0/30. Confirma ADR-03 y resuelve
   la fila #4 de la auditoría de decisiones.
2. **PoC-02 — Validación de QR** (`poc-02-validacion-qr/`): compara
   UUID+BD vs. JWT firmado. **Resultado no concluyente**: en SQLite local,
   UUID+BD midió más rápido (8.0 ms vs. 11.1 ms) porque el benchmark no
   tenía latencia de red real — decisión abierta a propósito.

**Tarea específica pendiente — 3er PoC (failover), paso a paso:**
1. Elegir el componente a simular: recomendado el **API Gateway** (más
   crítico, ASR-02) o el Servicio de Entradas.
2. Escribir 2 procesos HTTP mínimos en Python (`http.server` o `Flask`)
   que representen "instancia activa" e "instancia de respaldo", cada uno
   respondiendo en un puerto distinto.
3. Implementar **2 estrategias** a comparar en un script orquestador:
   - *Réplica activa*: ambas instancias corriendo desde el inicio; un
     "balanceador" (un tercer script) enruta a la primera que responda al
     `health-check`.
   - *Réplica pasiva*: la instancia de respaldo arranca (se lanza como
     subproceso) solo cuando el `health-check` de la activa falla.
4. Matar la instancia activa a mitad de una ráfaga de solicitudes
   simuladas (`for` con `requests.get`) y medir, para cada estrategia,
   **cuántas solicitudes fallan** y **cuántos segundos tarda** en volver a
   responder el 100% de las solicitudes.
5. Guardar el resultado en `Proyecto/App/PoCs/poc-03-failover/README.md`
   con la misma estructura que los otros dos (desafío, alternativas,
   cómo correrlo, tabla de resultado, decisión, riesgos), y agregar la fila
   correspondiente a `PoCs/README.md`.
6. Enlazar el resultado desde § "Disponibilidad" o "Desplegabilidad" de
   `ArchitecturalProposal.tex` y desde una entrada nueva en la Bitácora.

**Tarea específica pendiente — cerrar la decisión de PoC-02 (QR):**
1. Modificar `poc-02-validacion-qr/poc.py`: agregar un `time.sleep(0.002)`
   (2 ms, una latencia de red típica dentro de la misma región de nube)
   dentro de cada operación de base de datos, para simular que la BD ya no
   es local.
2. Volver a correr `python3 poc.py` y comparar el resultado nuevo contra
   el ya documentado en el README — si con latencia simulada `jwt_firmado`
   sí gana, esa es la evidencia que faltaba; si sigue perdiendo, documentar
   esa conclusión también (sigue siendo válida, solo distinta a la
   hipótesis inicial).
3. Actualizar `poc-02-validacion-qr/README.md` con el resultado nuevo y
   escribir la decisión final en un ADR (ADR-06 sugerido) en
   `DescripcionArquitecturaSoftware.tex`.

**Formato de cada PoC** (ya aplicado en los 2 existentes, mantenerlo en el
3ro): código real y ejecutable, con `README.md` (desafío, alternativas,
cómo correrlo, resultado medido), y enlace desde el ADR/análisis de QA
correspondiente y desde la Bitácora.

---

## 5. Prototipo funcional del CU más complejo de cada integrante

**Estado:** 🟡 hay trabajo de app móvil (`app-movil` Android,
`app-ios` SwiftUI) pero como apps genéricas de 19 pantallas, no enmarcadas
como "el CU complejo de cada integrante con sus QA implementados" — y,
como quedó dicho en la auditoría, la elección misma de ese stack todavía no
tiene su ADR con evidencia (fila #8).

**Qué hacer, específicamente por persona:**

- **Samuel Emperador** ya tiene sus 2 CU complejos identificados y
  reconocidos en el SAD como "hilo conductor": **CU-006** (Mercado
  secundario de entradas — Consistencia/ASR-01, ya con PoC-01 real) y
  **CU-010** (Evacuación ante emergencias — Disponibilidad/Safety). Tarea
  concreta: implementar el flujo de CU-006 (publicar en reventa → comprar
  → bloqueo Redis → transferencia) reutilizando la lógica de `poc-01` como
  base del backend real, y el flujo de CU-010 en el Portal Web
  Administrativo (`portal-web-admin`, sección "Emergencias" — hoy
  placeholder "en construcción").
- **Daniel Cristancho, Sebastián Sánchez, Diego Coronado** todavía no
  tienen un CU complejo formalmente identificado en el SAD (solo Samuel
  tiene los 2 "hilo conductor"). Procedimiento exacto para elegir el
  propio, sin adivinar:
  1. Abrir `Submission/CU_eventos_completo.xlsx`, ir a cada una de sus 8
     hojas de CU.
  2. Revisar las columnas "Atributos de Calidad Asociados" e
     "Infraestructura No Trivial Utilizada" — elegir la hoja donde esas
     dos columnas ya mencionan algo concreto (Redis, colas, validación
     compleja), no una frase genérica.
  3. Si ninguna de las 8 tiene contenido rico ahí, completar esa sección
     primero (siguiendo el mismo nivel de detalle que CU-006) antes de
     declararla "compleja" — no basta con etiquetarla.
  4. Implementar ese CU mostrando en funcionamiento la táctica de calidad
     de su atributo asignado (tabla de `Cronograma.md`) — no basta con que
     la pantalla exista, tiene que **demostrar** la táctica (ej. si es
     Seguridad, mostrar el flujo de autenticación real, no un login mock
     que acepta cualquier contraseña).
  5. Candidatos razonables por bloque temático propio, a confirmar por
     cada uno (no son una asignación definitiva, son puntos de partida
     para el paso 2 de arriba): Daniel — algo del bloque Parqueaderos
     (CU-021–023, ya usa Redis para ocupación según
     `services/parqueaderos/README.md`); Sebastián — algo del bloque
     Pedidos (CU-011–015, validación de pedidos por QR) o Cuentas/Roles
     (CU-027–029, RBAC); Diego — algo del bloque Logística (CU-016–020)
     o Proveedores/Pagos/Reportes (CU-030–032, ya tiene el patrón
     Map-Reduce documentado en § Rendimiento de `ArchitecturalProposal.tex`).

**Para los 4:** dejar evidencia demostrable — captura de pantalla, GIF
corto, o mejor, poder correrlo en vivo el día de la entrega/sustentación.

**Regla de las 3 reglas aquí:** si el prototipo usa una librería/framework
puntual para lograr la táctica (ej. una librería de rate-limiting para
Performance, un validador de esquema para Seguridad), esa elección también
debería tener su mini-ADR con ≥2 alternativas — no hace falta un PoC
aparte si el prototipo mismo ya es la prueba funcionando.

---

## 6. Listado de CU + atributos de calidad comprometidos para Entrega 2

**Estado:** ❌ no redactado.

**Qué producir:** una tabla al final de
`Work/DescripcionArquitecturaSoftware.tex` (nueva sección "Alcance
comprometido para Entrega 2"). Propuesta de arranque, construida a partir
de los dueños reales de cada bloque (`services/*/README.md`) y los
atributos ya analizados en el punto 3 — **ajustar con el equipo, no
copiar tal cual**:

| Bloque de CU | Integrante | QA a implementar completo en Entrega 2 |
|---|---|---|
| CU-006 (Mercado secundario) | Samuel Emperador | Consistencia (ASR-01), Rendimiento |
| CU-010 (Evacuación ante emergencias) | Samuel Emperador | Disponibilidad, Seguridad física (Safety) |
| CU-001–005 (Boletería) | Daniel Cristancho | Rendimiento (ASR-04, apertura de venta), Seguridad (pagos) |
| CU-021–023 (Parqueadero: reserva/ingreso-salida) | Daniel Cristancho | Comprobabilidad, Integrabilidad (si toca la pasarela) |
| CU-007–009 (Personal) | Samuel Emperador | Mantenibilidad |
| CU-011–015 (Pedidos) | Sebastián Sánchez | Modificabilidad (menú/inventario), Usabilidad |
| CU-027–029 (Cuentas, Roles, Recintos) | Sebastián Sánchez | Seguridad (RBAC) |
| CU-016–020 (Logística) | Diego Coronado | Trazabilidad |
| CU-030–032 (Proveedores, Pagos, Reportes) | Diego Coronado | Rendimiento (Map-Reduce sobre reportes), Trazabilidad (conciliación) |
| CU-024–025 (Parqueadero: cobro/ocupación) | Samuel Emperador | Tiempo real (Redis) |
| CU-026 (Gestión de eventos) | Samuel Emperador | Consistencia |

Esto es una declaración de alcance, no requiere alternativas/evidencia —
pero sí debe ser consistente con lo ya construido en los puntos 3 y 5 (no
comprometer un atributo que nunca se analizó), y **queda sujeta a
aprobación del profesor** (regla de Clase 1).

---

## Checklist de cierre antes de entregar

- [x] RNF redactados (punto 1) y agregados al SAD — **RNF-01 a RNF-16** en
      `DescripcionArquitecturaSoftware.tex` § "Requisitos No Funcionales"
      (2026-09-06).
- [x] Árbol de Utilidad con formato (Importancia, Dificultad) correcto y
      2 ASR nuevos (Integrabilidad, Desplegabilidad) — (punto 2,
      2026-09-06). **Pendiente:** que todo el equipo lo revise, no solo el
      asistente.
- [x] Los 8 atributos pendientes (Deployability, Integrabilidad,
      Comprobabilidad, Safety, Security, Rendimiento, Mantenibilidad,
      Usabilidad) tienen su análisis de tácticas/patrones (o Five Planes
      para Usabilidad) con ≥2 alternativas comparadas, en
      `ArchitecturalProposal.tex` § "Cómo la arquitectura satisface..." y
      en la Bitácora (2026-09-06) — punto 3. **Pendiente:** ninguna de
      estas comparaciones tiene todavía un PoC propio (son comparaciones
      técnicas razonadas, no medidas) salvo las que se apoyan en los PoCs
      del punto 4; cada responsable (tabla de `Cronograma.md`) debe
      revisar la suya.
- [x] **2 PoCs corridos**, con README de resultados reales, en
      `Proyecto/App/PoCs/` (punto 4, 2026-09-06):
      - PoC-01 (bloqueo de concurrencia): confirma ADR-03 con evidencia
        real (30/30 trials con venta duplicada sin protección, 0/30 con
        Redis u optimista).
      - PoC-02 (validación de QR): resultado **no concluyente** — el
        benchmark local en SQLite no reprodujo la latencia de red real;
        decisión UUID vs. JWT queda abierta hasta repetirlo contra una BD
        en red.
      **Falta el 3er PoC recomendado** (failover activo vs. pasivo) — ver
      `PoCs/README.md`.
- [ ] **Decidir el lenguaje/framework del backend de `services/*`**
      (auditoría #2) — pasos exactos y candidatos sugeridos ya escritos
      arriba ("Cómo cerrar la decisión #2"); produce `poc-04-lenguaje-backend/`
      y ADR nuevo. **Sigue pendiente.**
- [ ] **Decidir RabbitMQ vs. Kafka** (auditoría #3) — pasos exactos ya
      escritos arriba ("Cómo cerrar la decisión #3"); cierra el ADR-04
      existente. **Sigue pendiente.**
- [ ] **Construir el demo de Flutter y redactar el ADR-05 del stack móvil**
      (auditoría #8, desarrollado a fondo arriba) — es el ejemplo que
      motivó esta versión de la guía. **Sigue pendiente** (requiere
      instalar el SDK de Flutter).
- [ ] **Construir PoC-03 (failover)** — pasos exactos ya escritos en el
      punto 4 ("Tarea específica pendiente — 3er PoC"). **Sigue pendiente.**
- [ ] **Cerrar la decisión UUID vs. JWT para el QR** (surgida del PoC-02) —
      pasos exactos ya escritos en el punto 4 (agregar latencia simulada,
      re-correr, documentar en ADR-06). **Sigue pendiente.**
- [ ] Auditar el resto de la tabla de decisiones (filas #1, #4, #5, #6, #7)
      y conseguir al menos evidencia liviana (documentación citada) donde
      no alcance el tiempo para un PoC propio.
- [ ] Prototipo del CU complejo de cada integrante, demostrable en vivo
      (punto 5) — Samuel Emperador ya tiene los suyos identificados
      (CU-006, CU-010); Daniel/Sebastián/Diego siguen el procedimiento del
      punto 5 para elegir el propio.
- [x] Tabla de alcance para Entrega 2 (punto 6) — **propuesta de arranque
      ya redactada** arriba, a partir de los dueños reales de cada bloque
      de CU; falta que el equipo la confirme/ajuste y se pegue en
      `DescripcionArquitecturaSoftware.tex`.
- [x] `Work/DescripcionArquitecturaSoftware.tex` (22 páginas) y
      `Work/ArchitecturalProposal.tex` (30 páginas) compilan sin errores
      con los cambios de 2026-09-06. **Sigue sin copiarse a
      `Submission/`** — siguen siendo borradores.
- [ ] Actualizar `Proyecto/App/README.md` (tabla "Stack técnico") una vez
      se resuelvan las decisiones pendientes de la auditoría.
- [ ] Actualizar `TASKS.md` y esta guía conforme se cierre cada punto.
