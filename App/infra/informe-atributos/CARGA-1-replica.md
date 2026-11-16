# Prueba de carga — casos de uso de Samuel

Medida el 2026-11-12 23:07 por el API Gateway con `App/infra/prueba-carga.py`: cada nivel son N usuarios pidiendo sin pausa durante 12 s. Umbral RNF-07: p95 ≤ 500 ms sin fallos. La CPU por contenedor sale de Prometheus (tablero de Grafana en `/grafana/`).

## CU-006 · Catálogo de reventa

Boletería, 1 réplica(s) · `GET /api/v1/reventa/publicaciones…`

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.8 | **4.5** | 6.4 | 339 | 0 | hexacore-gateway 33, hexacore-adr16-boleteria-1 28, hexacore-postgres 7 |
| 10 | 5.8 | **13.5** | 21.7 | 1430 | 0 | hexacore-gateway 134, hexacore-adr16-boleteria-1 85, hexacore-postgres 35 |
| 50 | 24.7 | **38.4** | 49.1 | 1906 | 0 | hexacore-gateway 106, hexacore-adr16-boleteria-1 103, hexacore-postgres 48 |
| 100 | 55.8 | **84.9** | 107.1 | 1695 | 0 | hexacore-gateway 342, hexacore-adr16-boleteria-1 94, hexacore-postgres 62 |
| 200 | 106.3 | **150.3** | 177.5 | 1804 | 0 | hexacore-gateway 279, hexacore-adr16-boleteria-1 101, hexacore-postgres 60 |

```text
Peticiones/s por nivel de usuarios
    1 │█████ 339
   10 │███████████████████████ 1430
   50 │██████████████████████████████ 1906
  100 │███████████████████████████ 1695
  200 │████████████████████████████ 1804
```

**Interpretación**

- **Cumple RNF-07**: p95 de 150 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 100 usuarios**: el rendimiento se queda en unas 1906 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, el proceso de Boletería ronda el 101 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-gateway 279 %, hexacore-adr16-boleteria-1 101 %, hexacore-postgres 60 %, hexacore-promtail 15 %.

## CU-026 · Eventos del organizador

Núcleo, 1 réplica(s) · `GET /api/v1/eventos…`

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.8 | **4.9** | 6.8 | 315 | 0 | hexacore-adr16-nucleo-1 57, hexacore-postgres 12, hexacore-gateway 10 |
| 10 | 12.8 | **16.4** | 20.0 | 760 | 0 | hexacore-adr16-nucleo-1 104, hexacore-postgres 30, hexacore-gateway 25 |
| 50 | 65.7 | **84.8** | 119.3 | 715 | 0 | hexacore-adr16-nucleo-1 104, hexacore-gateway 41, hexacore-postgres 31 |
| 100 | 142.2 | **168.0** | 179.6 | 683 | 0 | hexacore-adr16-nucleo-1 104, hexacore-gateway 103, hexacore-postgres 32 |
| 200 | 280.3 | **355.0** | 614.8 | 675 | 0 | hexacore-adr16-nucleo-1 103, hexacore-gateway 72, hexacore-postgres 31 |

```text
Peticiones/s por nivel de usuarios
    1 │████████████ 315
   10 │██████████████████████████████ 760
   50 │████████████████████████████ 715
  100 │███████████████████████████ 683
  200 │███████████████████████████ 675
```

**Interpretación**

- **Cumple RNF-07**: p95 de 355 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 760 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, el proceso de Núcleo ronda el 103 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-adr16-nucleo-1 103 %, hexacore-gateway 72 %, hexacore-postgres 31 %, hexacore-rabbitmq 10 %.

## CU-025 · Panel de ocupación del parqueadero

Núcleo, 1 réplica(s) · `GET /api/v1/parqueaderos…`

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 3.4 | **5.3** | 7.2 | 266 | 0 | hexacore-adr16-nucleo-1 41, hexacore-postgres 33, hexacore-gateway 9 |
| 10 | 12.0 | **21.0** | 34.1 | 746 | 0 | hexacore-postgres 121, hexacore-adr16-nucleo-1 104, hexacore-gateway 32 |
| 50 | 63.0 | **93.3** | 116.2 | 750 | 0 | hexacore-postgres 128, hexacore-adr16-nucleo-1 104, hexacore-gateway 80 |
| 100 | 135.3 | **203.7** | 447.8 | 673 | 0 | hexacore-gateway 139, hexacore-postgres 134, hexacore-adr16-nucleo-1 105 |
| 200 | 257.7 | **310.6** | 353.6 | 759 | 0 | hexacore-postgres 131, hexacore-adr16-nucleo-1 104, hexacore-gateway 90 |

```text
Peticiones/s por nivel de usuarios
    1 │███████████ 266
   10 │██████████████████████████████ 746
   50 │██████████████████████████████ 750
  100 │███████████████████████████ 673
  200 │██████████████████████████████ 759
```

**Interpretación**

- **Cumple RNF-07**: p95 de 311 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 759 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, el proceso de Núcleo ronda el 104 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10); PostgreSQL gasta 131 %, pero reparte el trabajo en varios procesos y núcleos, así que todavía no es el límite. CPU por contenedor (% de un núcleo): hexacore-postgres 131 %, hexacore-adr16-nucleo-1 104 %, hexacore-gateway 90 %, hexacore-promtail 9 %.

## Lo que hay que tener en cuenta al leer las cifras

- El generador de carga, el gateway, los dos programas y PostgreSQL corren en el mismo computador: compiten por la misma CPU. Las cifras son un piso, no la capacidad de un despliegue con máquinas separadas.
- Entre corridas seguidas el p95 varía en torno a ±30 %: se comparan tendencias (dónde se satura y quién), no décimas de milisegundo.
- Son lecturas: miden la ruta caliente de cada caso de uso (lo que miles consultan a la vez). Las escrituras con bloqueo se miden en las pruebas de concurrencia.

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
./prueba-carga.py            # o --rapida en vivo
```
