# Prueba de carga — casos de uso de Samuel

Medida el 2026-11-16 18:30 por el API Gateway con `App/infra/prueba-carga.py`: cada nivel son N usuarios pidiendo sin pausa durante 12 s. Umbrales: p95 ≤ 500 ms (RNF-07) y ≤ 300 ms en la validación del QR (RNF-08), sin fallos. La CPU por contenedor sale de Prometheus (tablero de Grafana en `/grafana/`).

## CU-006 · Catálogo de reventa

Boletería, 1 réplica(s) · `GET /api/v1/reventa/publicaciones…` · umbral p95 500 ms (el umbral de RNF-07)

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.2 | **5.4** | 11.4 | 352 | 0 | hexacore-adr16-boleteria-1 47, hexacore-gateway 13, hexacore-postgres 11 |
| 10 | 5.9 | **13.0** | 19.5 | 1482 | 0 | hexacore-adr16-boleteria-1 95, hexacore-gateway 82, hexacore-postgres 44 |
| 50 | 35.9 | **72.2** | 130.1 | 1247 | 0 | hexacore-gateway 286, hexacore-adr16-boleteria-1 96, hexacore-postgres 51 |
| 100 | 72.1 | **124.1** | 263.7 | 1259 | 0 | hexacore-gateway 327, hexacore-adr16-boleteria-1 96, hexacore-postgres 55 |
| 200 | 132.7 | **240.2** | 440.9 | 1344 | 0 | hexacore-gateway 221, hexacore-adr16-boleteria-1 103, hexacore-postgres 53 |

```text
Peticiones/s por nivel de usuarios
    1 │███████ 352
   10 │██████████████████████████████ 1482
   50 │█████████████████████████ 1247
  100 │█████████████████████████ 1259
  200 │███████████████████████████ 1344
```

**Interpretación**

- **Cumple el umbral de RNF-07**: p95 de 240 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 1482 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, el proceso de Boletería ronda el 103 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-gateway 221 %, hexacore-adr16-boleteria-1 103 %, hexacore-postgres 53 %, hexacore-promtail 16 %.

## CU-001 · Disponibilidad de un evento en apertura de venta

Boletería, 1 réplica(s) · `GET /api/v1/cartelera/e0000005-0000-4000-8000-000000000005…` · umbral p95 500 ms (RNF-07)

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 1.7 | **3.3** | 5.3 | 502 | 0 | hexacore-adr16-boleteria-1 36, hexacore-postgres 11, hexacore-gateway 9 |
| 10 | 5.7 | **11.9** | 19.8 | 1523 | 0 | hexacore-gateway 106, hexacore-adr16-boleteria-1 100, hexacore-postgres 50 |
| 50 | 29.3 | **45.4** | 58.8 | 1645 | 0 | hexacore-gateway 282, hexacore-adr16-boleteria-1 102, hexacore-postgres 62 |
| 100 | 60.9 | **107.4** | 181.3 | 1472 | 0 | hexacore-gateway 337, hexacore-adr16-boleteria-1 102, hexacore-postgres 68 |
| 200 | 114.0 | **197.1** | 411.8 | 1537 | 0 | hexacore-gateway 151, hexacore-adr16-boleteria-1 105, hexacore-postgres 59 |

```text
Peticiones/s por nivel de usuarios
    1 │█████████ 502
   10 │████████████████████████████ 1523
   50 │██████████████████████████████ 1645
  100 │███████████████████████████ 1472
  200 │████████████████████████████ 1537
```

**Interpretación**

- **Cumple RNF-07**: p95 de 197 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 1645 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, el proceso de Boletería ronda el 105 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-gateway 151 %, hexacore-adr16-boleteria-1 105 %, hexacore-postgres 59 %, hexacore-promtail 18 %.

## CU-002 · Validación del QR en la puerta

Boletería, 1 réplica(s) · `POST /api/v1/ingresos…` · umbral p95 300 ms (RNF-08)

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 4.2 | **10.8** | 24.6 | 184 | 0 | hexacore-adr16-boleteria-1 47, hexacore-postgres 27, hexacore-rabbitmq 13 |
| 10 | 14.8 | **51.4** | 83.9 | 505 | 0 | hexacore-adr16-boleteria-1 93, hexacore-postgres 77, hexacore-adr16-nucleo-1 23 |
| 50 | 105.6 | **332.8** | 626.0 | 365 | 0 | hexacore-adr16-boleteria-1 90, hexacore-postgres 74, hexacore-gateway 23 |
| 100 | 284.9 | **516.6** | 759.2 | 316 | 0 | hexacore-adr16-boleteria-1 89, hexacore-postgres 77, hexacore-gateway 44 |
| 200 | 643.5 | **1059.8** | 1160.4 | 282 | 0 | hexacore-adr16-boleteria-1 93, hexacore-postgres 77, hexacore-gateway 47 |

```text
Peticiones/s por nivel de usuarios
    1 │███████████ 184
   10 │██████████████████████████████ 505
   50 │██████████████████████ 365
  100 │███████████████████ 316
  200 │█████████████████ 282
```

**Interpretación**

- **No cumple RNF-08**: p95 de 1060 ms con 200 usuarios a la vez (umbral 300 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 505 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, el proceso de Boletería ronda el 93 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-adr16-boleteria-1 93 %, hexacore-postgres 77 %, hexacore-gateway 47 %, hexacore-rabbitmq 25 %.

## Lo que hay que tener en cuenta al leer las cifras

- El generador de carga, el gateway, los dos programas y PostgreSQL corren en el mismo computador: compiten por la misma CPU. Las cifras son un piso, no la capacidad de un despliegue con máquinas separadas.
- Entre corridas seguidas el p95 varía en torno a ±30 %: se comparan tendencias (dónde se satura y quién), no décimas de milisegundo.
- CU-006, CU-025, CU-026 y CU-001 son lecturas: la ruta caliente de cada caso de uso. La validación del QR escribe: cada petición usa un QR distinto, bloquea su fila, suma al aforo y deja el ingreso y su aviso en la bandeja de salida, en una transacción.

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
./prueba-carga.py            # o --rapida en vivo
```
