# Disponibilidad entre computadores (ZeroTier) — RNF-03 y RNF-04

**Medición del 17/11/2026, 05:57:10–06:00:10 UTC** (00:57–01:00 en Bogotá). Samuel Emperador.

## Montaje

| Equipo | IP ZeroTier | Qué corre |
|---|---|---|
| A · Mac de Samuel | `192.168.193.59` | PostgreSQL, Redis, RabbitMQ, gateway, HTTPS (Caddy), portales, Trabajador y una réplica de Núcleo y Boletería |
| B · VM de la Javeriana | `192.168.193.137` | Otra réplica de Núcleo y Boletería |
| C · PC Windows de Samuel | `192.168.193.84` | Observador `App/infra/zerotier/cliente.py` |

- Demo `demoabc-261116-dd70`, mismo commit en A y B: `9815d8e` (`main`). Herramientas en `App/infra/zerotier/`.
- C entra por `https://hexacore.zt.test:8443`, con certificado verificado contra la CA privada de ensayo.
- C hace dos lecturas cada 0,5 s, cada una con conexión nueva y sin reintentos:
  - **pública:** `GET /api/v1/cartelera`, que atiende Boletería;
  - **autenticada:** `GET /api/v1/sesiones/actual`, que atiende Núcleo, con una sesión de una cuenta de ensayo.
- Los registros del gateway de A se grabaron con `equipo.py logs --seguir` y se importaron en C con `cliente.py importar-logs`. Así cada petición queda cruzada con la réplica que la atendió.

## Qué se hizo

| Segundo | Hora (UTC) | Acción |
|---|---|---|
| 0 | 05:57:10 | C empieza a medir (180 s) |
| ~62 | 05:58:12 | `kill -9` del proceso `node` dentro del contenedor del Núcleo de A, que simula su caída. Docker lo relanza por `restart: unless-stopped` |
| ~93 | 05:58:43 | Se detienen los contenedores de B con `equipo.py parar`. **La VM sigue encendida:** no hay forma confirmada de volver a encenderla desde la plataforma |
| 180 | 06:00:10 | C termina |

## Resultados

Las cifras vienen de los registros del gateway de A y coinciden con el informe de C (`cliente.py informe`).

| Tramo | Peticiones | Fallidas | Lo observado |
|---|---|---|---|
| A y B arriba (05:57:10–05:58:12) | 219 | **0** | Reparto parejo entre A y B en las dos lecturas |
| Cae el Núcleo de A (05:58:12) | — | **1** | Falla la petición que estaba en curso. B atiende todas las lecturas autenticadas. Docker relanza el Núcleo de A y **vuelve a responder a las 05:58:24, unos 12 s después** |
| B detenida (05:58:43–06:00:10) | 338 | **16** | **A atiende solo: 322 de 338 (95 %).** Las 16 fallas son las pruebas que el gateway hace a B, una cada ~12 s por cada lectura |
| **Total** | **671** | **17 (2,5 %)** | |

Vista desde C, según `cliente.py informe`:

| | Cartelera | Sesión |
|---|---|---|
| Latencia mediana | 63 ms | 78 ms |
| Latencia p95 | 656 ms | 656 ms |
| Mayor hueco entre dos respuestas correctas | 1,7 s | 1,6 s |
| Errores de red, peticiones incompletas o sin respuesta | 0 | 0 |

El p95 sale de las respuestas de B, que llegan a A por un relevo de ZeroTier (unos 124 ms por ida y vuelta, más el resto del recorrido).

## Cómo se lee

- **RNF-04 (recuperación ≤ 30 s): cumplido en esta corrida.** El Núcleo de A volvió a atender unos 12 s después de caer, sin intervención. Mientras tanto B absorbió las sesiones y solo falló la petición en curso.
- **RNF-03 (el sistema sigue atendiendo si cae un servidor): mecanismo demostrado.** Con B detenida, A atendió el 95 % de las peticiones y ningún usuario estuvo más de 1,7 s sin una respuesta correcta. Son 3 minutos: no mide el 99,9 % mensual.
- **Por qué hay 16 fallas con B caída.** El gateway del montaje tiene `proxy_next_upstream off`, a propósito, para que el observador vea todos los errores sin que un reintento los convierta en 200. Con `max_fails=1 fail_timeout=10s`, el gateway vuelve a probar B cada 10 s y esa petición falla.
  - El gateway normal del proyecto **sí** reintenta las lecturas en otra réplica. Con él, `demo-disponibilidad.sh` dio **0 fallas** al tumbar una réplica en un computador ([DEMOSTRACION-ATRIBUTOS](../DEMOSTRACION-ATRIBUTOS.md), sección 3).
  - Las dos mediciones juntas muestran que el reintento es lo que oculta esas fallas al usuario.

| Medición | Reintento de lecturas | Fallas al caer una réplica |
|---|---|---|
| Un computador, gateway normal (12/11) | Sí | 0 de 484 (Boletería) y 0 de 509 (Núcleo) |
| Dos computadores por ZeroTier, gateway del montaje (17/11) | No, a propósito | 1 al caer el Núcleo de A; 16 de 338 con B detenida |

## Límites

- **B se detuvo deteniendo sus contenedores, no apagando la VM.** Para el gateway el efecto es el mismo (B deja de responder), pero no es el apagado físico que pide la guía. Por eso no se usaron las marcas `apagar-b` y `b-apagado` de `cliente.py`, y los campos del informe que dependen de ellas salen vacíos.
- C fue el PC Windows de Samuel, no el Mac de Sebastián.
- **Lo que no se probó:**
  - escrituras: un `POST` en curso en la réplica que cae no se reintenta, para no duplicarlo;
  - la caída de A, que sigue siendo el punto único de falla: datos, gateway y HTTPS.
- **Primer intento descartado (05:45–05:48 UTC).** El Núcleo de A se tumbó con `docker kill`. Docker no relanza un contenedor detenido a mano, así que quedó caído, y al detener B no quedó ningún Núcleo. Se repitió con `kill -9` del proceso, como hace `demo-disponibilidad.sh`.

Los registros completos de A y la carpeta del observador se conservan fuera de Git. Tienen identificadores de solicitud e IPs internas, pero no tokens ni contraseñas.
