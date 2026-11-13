# Desempeño, disponibilidad y monitoreo — guion de Samuel

Los tres atributos que demuestra Samuel en la sustentación, con lo que se corre en vivo, los
resultados de la última medición y cómo leerlos.

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
```

Esa orden levanta el sistema completo y además el tablero de monitoreo, en
<http://localhost:8080/grafana/>. El tablero entra por el mismo punto que la API: el gateway.

## Orden sugerido en vivo (≈ 6,5 min)

| # | Qué se corre | Qué se señala | Tiempo |
|---|---|---|---|
| 1 | Abrir Grafana | Instancias vivas, CPU y memoria por instancia, logs | 30 s |
| 2 | `./prueba-carga.py --rapida` | La tabla por nivel, y en Grafana cómo sube la CPU de cada contenedor | 2 min |
| 3 | Leer la interpretación que imprime | Dónde se satura cada caso de uso y por qué | 1 min |
| 4 | `./demo-disponibilidad.sh` | Reparto por `X-Servidor`, réplica caída, cero fallos, recuperación | 1,5 min |
| 5 | `SERVICIO=nucleo ./demo-disponibilidad.sh --seguido` | Lo mismo con el Núcleo | 40 s |
| 6 | `./demo-disponibilidad.sh --restaurar` | Vuelve todo a una réplica | 10 s |

---

## 1. Monitoreo y logs

`docker-compose.monitoreo.yml` levanta cuatro piezas:

| Pieza | Qué hace |
|---|---|
| **exportador-docker** | Lee CPU y memoria de cada contenedor de la API de Docker. |
| **Prometheus** | Las guarda, una muestra cada 5 s. |
| **Promtail → Loki** | Recogen los logs de todos los contenedores. |
| **Grafana** | Muestra el tablero «HEXACORE · Instancias y logs». |

El tablero tiene estos paneles:

- **Instancias vivas** de gateway, Núcleo, Boletería y Trabajador. Baja al tumbar una réplica y
  vuelve a subir cuando Docker la reinicia.
- **CPU y memoria por instancia:** cada réplica es una serie propia.
- **Peticiones por réplica:** sale del log del gateway (`upstream=`), así que se ve el reparto y cómo
  pasa todo a las réplicas que quedan cuando una cae.
- **Respuestas por código** y **latencia p95** del gateway (`rt=`).
- **Logs** de todos los servicios, filtrables por servicio.

**Por qué no cAdvisor:** era la propuesta inicial, pero con el almacén de imágenes de containerd que
usa Docker Desktop no ve ningún contenedor.
- Lo probé con las versiones 0.49.1 y 0.52.1: las dos fallan con «failed to identify the read-write
  layer ID» y solo informan del total de la máquina.
- El exportador lee lo mismo de la API de Docker y publica las métricas con los nombres de cAdvisor.
  Si algún día se cambia por cAdvisor en un Linux, el tablero no cambia.

## 2. Desempeño (RNF-07, RNF-08) — `prueba-carga.py`

**Qué mide.** Cada escenario es la lectura que más gente hace a la vez en un caso de uso de Samuel:

- **CU-006** (Boletería): catálogo de reventa.
- **CU-026** (Núcleo): eventos del organizador.
- **CU-025** (Núcleo): panel de ocupación del parqueadero.

Cada nivel son N usuarios pidiendo sin pausa durante 12 s (8 s con `--rapida`), todo por el gateway.
Mientras dura cada nivel, la prueba lee en Prometheus cuánta CPU gastó cada contenedor. Con eso el
informe dice qué se saturó, además de cuánto tardó.

Umbral RNF-07: p95 ≤ 500 ms sin fallos.

### Resultados del 12/11/2026 (un solo portátil, 11 núcleos)

**Una réplica de cada programa** (`informe-atributos/CARGA-1-replica.md`)

| Escenario | p95 con 50 usuarios | p95 con 200 usuarios | Máximo pet/s | Fallos | CPU con 200 usuarios (% de un núcleo) |
|---|---:|---:|---:|---:|---|
| CU-006 Catálogo de reventa | 38 ms | 150 ms | 1 906 | 0 | Boletería **101**, gateway 279, Postgres 60 |
| CU-026 Eventos del organizador | 85 ms | 355 ms | 760 | 0 | Núcleo **103**, gateway 72, Postgres 31 |
| CU-025 Panel de ocupación | 93 ms | 311 ms | 759 | 0 | Núcleo **104**, Postgres 131, gateway 90 |

**Núcleo con 2 réplicas** (`informe-atributos/CARGA-nucleo-2-replicas.md`)

| Escenario | p95 con 200 usuarios | Máximo pet/s | Frente a 1 réplica | CPU con 200 usuarios |
|---|---:|---:|---|---|
| CU-026 Eventos del organizador | 315 ms | 1 196 | **+57 %** de capacidad | Núcleo **106 y 104**, Postgres 65 |
| CU-025 Panel de ocupación | 208 ms | 1 385 | **+82 %** de capacidad, p95 −33 % | Núcleo **102 y 102**, Postgres **325** |

La CPU por contenedor sale de Prometheus: la primera y la última muestra dentro de cada nivel, con
una muestra cada 2 s. Se contrastó con `docker stats` durante un nivel de 200 usuarios: Boletería
107 % y Núcleo 104 %.

### Interpretación

**Lo que salió bien**

- **Los tres casos de uso cumplen RNF-07 en todos los niveles.** El p95 queda por debajo de 500 ms
  hasta con 200 usuarios simultáneos, y no falló ninguna de las más de 100 000 peticiones de la
  corrida.
- **Replicar el Núcleo sube la capacidad**, que es la evidencia de RNF-10:
  - Con 2 réplicas, CU-026 atiende 57 % más peticiones por segundo y CU-025 82 % más.
  - El p95 de CU-025 con 200 usuarios baja de 311 a 208 ms.

**Lo que salió mal, y por qué**

- **Cada escenario deja de ganar rendimiento muy pronto.**
  - CU-026 y CU-025 se quedan en unas 750 peticiones por segundo desde 10 usuarios.
  - CU-006 se queda en unas 1 900 desde 50.
  - A partir de ahí, más usuarios solo es más espera: con el rendimiento fijo, el p95 de CU-026 va de
    85 ms con 50 usuarios a 355 ms con 200.
  - Es la Ley de Little (usuarios = rendimiento × tiempo de respuesta): si el rendimiento está topado,
    cuadruplicar los usuarios cuadruplica la espera.
- **El cuello de botella es el proceso Node de cada programa.**
  - Con 200 usuarios cada uno está en 101–106 % de un núcleo y no puede subir más.
  - Node ejecuta el código de la aplicación en un solo hilo: un núcleo es su techo, aunque la máquina
    tenga 11.
  - Por eso una segunda réplica casi duplica la capacidad.
  - CU-006 rinde más que los dos del Núcleo porque su consulta es más simple, no porque Boletería
    escale mejor.
- **El siguiente límite ya se ve.**
  - Con 2 réplicas, PostgreSQL llega a 325 % en CU-025: el panel agrega las estancias de cada zona en
    una ventana de tiempo, y es la lectura más cara de las tres.
  - No es todavía el límite, porque Postgres atiende cada conexión en su propio proceso y usa varios
    núcleos. Pero si se sigue escalando el Núcleo, será lo próximo en saturarse.
  - El gateway también pesa: hasta 279 % con 1 900 peticiones por segundo, porque verifica la firma
    RS256 de cada token.
- **Una conclusión que tuve que corregir.**
  - La primera versión del informe decía que Postgres limitaba CU-025 y que más réplicas no
    ayudarían. Venía de una medición de CPU con error (muestras cada 5 s tomadas en los bordes del
    nivel).
  - Con 2 réplicas quedó desmentido; se corrigieron la medición y la regla de interpretación.
- **Dónde se midió.**
  - El generador de carga, el gateway, Postgres y los dos programas comparten los 11 núcleos de un
    portátil.
  - Entre corridas seguidas el p95 varía en torno a ±30 %, así que se comparan tendencias (dónde se
    satura y quién), no milisegundos.
  - Las cifras son un piso: con máquinas separadas cada componente tendría su propia CPU.

**Qué se haría para mejorar** (no se hizo: lo que se califica es la interpretación)

- Más réplicas de Núcleo y Boletería: está demostrado que escala hasta que Postgres o el gateway se
  vuelvan el límite.
- Para CU-025, guardar el panel calculado unos segundos en Redis: lo leen muchos a la vez y cambia
  poco. Así baja la carga de Postgres antes de que sea el cuello.

### Suite anterior (`atributos-calidad.py`)

`atributos-calidad.py` sigue midiendo el catálogo de reventa con la suite histórica, ya apuntando a
`backend/modulos/entradas/postventa/pruebas/`. Lo que dio el 12/11 frente al 28/10, antes de ADR-16:

| Medida | 28/10 | 12/11 |
|---|---|---|
| p95 con 200 usuarios | 184 ms | entre 120 y 188 ms en cuatro corridas |
| Capacidad | 1 062 peticiones/s | entre 1 067 y 1 601 peticiones/s |

La arquitectura actual no empeoró la ruta caliente de la reventa.

## 3. Disponibilidad (RNF-03, RNF-04, RNF-10) — `demo-disponibilidad.sh`

| Paso | Boletería (3 réplicas) | Núcleo (2 réplicas) |
|---|---|---|
| Reparto de 30 peticiones (`X-Servidor`) | 10 / 10 / 10 | 15 / 15 |
| Peticiones en los 8 s siguientes a un `kill -9` | 484, **0 fallidas** | 509, **0 fallidas** |
| Peticiones reintentadas en otra réplica por el gateway | 1 | 1 |
| Docker la reinicia y vuelve a estar sana | 8–13 s | 8 s |
| Vuelve a recibir tráfico | sí, reparto parejo | sí, reparto parejo |

**Cómo leerlo**

- **Nadie ve la caída.** Cuando una réplica muere con peticiones en curso, nginx reintenta en otra
  la que no alcanzó a responder (`proxy_next_upstream`, solo para peticiones idempotentes). El
  guion la muestra como «reintento», y el cliente recibe 200.
- **El gateway encuentra las réplicas solo.** Resuelve el nombre del servicio en el DNS de Docker
  cada 5 s (`server … resolve`): una réplica nueva o reiniciada entra al reparto sin tocar la
  configuración.
- **La recuperación es de Docker, no del sistema:** `restart: unless-stopped` relanza el
  contenedor, y la sonda de salud dice cuándo vuelve a estar listo.

**Núcleo replicado**

- **Lo que se comprobó** con 2 réplicas antes de decidir tumbarlo en vivo:
  - La demostración completa de los casos de uso de Samuel pasa contra él: 8 de 8 con Playwright.
  - Sus trabajos de fondo toman las filas con `SKIP LOCKED`, así que dos réplicas no publican dos
    veces el mismo aviso: bandejas de evacuación, reservas, eventos y vencimiento de reservas.
  - Los paneles en vivo (SSE) consultan la base en cada intervalo y no dependen de la réplica.
- **Límites conocidos:**
  - El sondeo de inventario de Alimentos (CU-011) no se certificó con réplicas.
  - El aviso de que el gateway incluyó una réplica nueva tarda hasta 5 s.

## Lo que queda pendiente

- **Copias de eventos borradas en Ventas: resuelto.** Seis eventos publicados por CU-026 desaparecieron
  de la copia de Ventas, y por eso la compra de CU-006 fallaba con «No existe esa localidad».
  - **La causa no fue el consumidor.** Fue la suite de consistencia (`rnf01-concurrencia.py`): llama
    a `resembrar()`, que ejecuta la semilla de Ventas.
  - Esa semilla hace `TRUNCATE` de eventos, localidades, entradas y compras de Ventas, y vuelve a
    sembrar los datos fijos.
  - **Arreglo en la base local:** se volvieron a encolar los mensajes originales de la bandeja de
    salida de CU-026; la guarda de versión hizo que solo Ventas los aplicara.
  - **Para que no se repita:** `atributos-calidad.py` ya no corre esa suite salvo con
    `--destructivas`.
- **Copia de Postventa en la base transferida.** Los eventos de la base transferida no estaban en la
  copia de Postventa, porque los consumidores de CU-026 no existían cuando se publicaron. Se
  completaron en la base local. Una instalación nueva no lo necesita: la semilla los carga.
