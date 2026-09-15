# PoC-04 — Lenguaje/framework del backend

**Desafío:** `App/services/*` estaba marcado como *"lenguaje por definir"*, y esa decisión bloquea
empezar a codificar los seis microservicios. Había que elegir con evidencia medida, no por
preferencia.

**Atributos de calidad en juego:** Rendimiento (ASR-04 / RNF-07, RNF-08), Modificabilidad (RNF-13),
Comprobabilidad (RNF-18) y Desplegabilidad (RNF-15, por el tiempo de arranque).

## Alternativas comparadas

| Candidato | Por qué entró | Por qué no otros |
|---|---|---|
| **NestJS** (Node.js + TypeScript) | Mismo lenguaje que los portales Angular; su estructura de módulos e inyección de dependencias es la que el equipo ya usa | — |
| **Spring Boot** (Java 17) | Ecosistema de microservicios más maduro; tipado fuerte; ya instalado en las máquinas del equipo | — |
| Go | — | Nadie en el equipo lo conoce y no está instalado: introducir un lenguaje nuevo con la entrega encima es el mayor riesgo de cronograma |
| Python/FastAPI | — | Tipado opcional; con seis servicios en paralelo y cuatro personas, la disciplina de tipos importa |

## Qué se construyó

El **mismo endpoint** en ambos candidatos, devolviendo **byte por byte la misma respuesta**
(`Content-Length: 220`):

```
GET /entradas/{id}/disponibilidad      → responde de inmediato   (overhead puro del framework)
GET /entradas/{id}/disponibilidad-io   → espera 2 ms y responde  (simula la consulta a la BD)
```

La segunda variante existe por **la lección del PoC-02**: medir sin latencia de I/O exagera la
diferencia entre tecnologías, porque en producción el tiempo lo domina la base de datos, no el
framework. Los 2 ms son una latencia típica de una BD en la misma región de nube.

## Cómo correrlo

```bash
cd App/PoCs/poc-04-lenguaje-backend
(cd nestjs && npm install && npx tsc --outDir dist)   # una sola vez
(cd springboot && mvn package -DskipTests)            # una sola vez

python3 benchmark.py                 # 15 s por medición, 100 conexiones
DURACION=30 CONEXIONES=200 python3 benchmark.py
```

El script levanta cada candidato, **lo calienta** (la JVM sólo compila a nativo tras ejecutar el
código; sin warmup Spring se mediría en su peor momento), mide y escribe `resultados.txt`.

## Resultado

```
candidato   escenario  req_s  p50_ms  p97_5_ms  p99_ms  rss_mb  errores
NestJS      sin-io     21071  4       5         6       156     0
NestJS      con-io     18530  5       6         7       158     0
SpringBoot  sin-io     91441  0       1         2       335     0
SpringBoot  con-io     32288  3       4         5       337     0

arranque hasta la primera respuesta (s)
  NestJS: 0.28      SpringBoot: 1.09

carga: 100 conexiones concurrentes, 15 s por medición · macOS arm64
```

*(`p97_5` en vez de `p95` porque es el percentil que reporta autocannon; es **más exigente** que el
p95 del RNF-07.)*

### Lectura

1. **Ambos cumplen el RNF-07 con un margen enorme.** El umbral es p95 ≤ 500 ms y el peor caso medido
   es **7 ms**: setenta veces por debajo. El rendimiento **no es el criterio que decide** esta
   elección, porque ninguno de los dos está cerca de incumplir.
2. **Spring Boot rinde más**, pero la ventaja depende del escenario: **4,3×** sin I/O (91.441 vs
   21.071 req/s) y sólo **1,7×** con los 2 ms de I/O simulada. Cuanto más se parece a producción,
   más se encoge la diferencia — y contra una BD real (5–20 ms) se encogería aún más.
3. **NestJS arranca 4× más rápido** (0,28 s vs 1,09 s) y usa **menos de la mitad de memoria**
   (156 MB vs 335 MB). Eso favorece a RNF-15 (despliegue sin interrupción) y al escalado elástico de
   ASR-06: instancias que arrancan antes y caben más por nodo.
4. Ninguno tuvo **un solo error** en la medición final.

## Dos sesgos que hubo que corregir (y que invalidaban las primeras mediciones)

Las primeras corridas daban resultados imposibles: Spring reportaba 91.599 req/s **con 13.060
errores** y un p50 de 75 ms — cifras que se contradicen entre sí (por la ley de Little, 100
conexiones a 91.599 req/s implican ~1,1 ms, no 75). Dos causas, ambas del montaje y no de los
frameworks:

1. **Tomcat cierra la conexión cada 100 peticiones** (`maxKeepAliveRequests=100` por defecto); Node
   no tiene ese límite. El cliente reconectaba constantemente contra Spring y no contra NestJS, así
   que se estaban comparando políticas de *keep-alive*, no frameworks. Se igualó con
   `server.tomcat.max-keep-alive-requests=-1`.
2. **NestJS corría con `ts-node`**, que compila TypeScript en memoria y disparaba su RSS a **706 MB**;
   ejecutando el JS ya compilado baja a **156 MB**. Se corrigió para que el benchmark ejecute
   `dist/main.js`, que es como se despliega en producción.

También hubo que añadir `ShallowEtagHeaderFilter` en Spring: por defecto respondía
`Transfer-Encoding: chunked` sin `Content-Length`, mientras NestJS enviaba `Content-Length` +
`keep-alive`. Sin ese ajuste, las dos respuestas no eran comparables.

**La lección general:** un benchmark que da números "buenos" pero internamente inconsistentes está
midiendo el montaje, no lo que se quiere comparar. Vale la pena comprobar la coherencia (aquí, con
la ley de Little) antes de creerle a un resultado.

## Limitaciones honestas

- **Endpoint sin base de datos real.** Los 2 ms de I/O son una simulación con `sleep`, no una consulta
  con pool de conexiones, serialización de resultados ni contención. Es una aproximación, no una
  réplica.
- **Cliente y servidor en la misma máquina**, sin red de por medio.
- **No se midieron 2.000 usuarios concurrentes** (la carga de RNF-07): con 100 conexiones el
  generador de carga ya empezaba a ser el cuello de botella en la máquina de prueba.
- **No se midió lo que probablemente más pesa**: velocidad de desarrollo del equipo y curva de
  aprendizaje. Eso no se captura en un benchmark.

## Decisión

Ver **ADR-09** en `Documentation/Work/DescripcionArquitecturaSoftware.tex`.
x
