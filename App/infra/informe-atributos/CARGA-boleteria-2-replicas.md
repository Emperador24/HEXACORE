# Prueba de carga — casos de uso de Samuel

Medida el 2026-11-16 18:34 por el API Gateway con `App/infra/prueba-carga.py`: cada nivel son N usuarios pidiendo sin pausa durante 12 s. Umbrales: p95 ≤ 500 ms (RNF-07) y ≤ 300 ms en la validación del QR (RNF-08), sin fallos. La CPU por contenedor sale de Prometheus (tablero de Grafana en `/grafana/`).

## CU-006 · Catálogo de reventa

Boletería, 2 réplica(s) · `GET /api/v1/reventa/publicaciones…` · umbral p95 500 ms (el umbral de RNF-07)

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.4 | **4.9** | 7.9 | 357 | 0 | hexacore-adr16-boleteria-2 30, hexacore-adr16-boleteria-1 27, hexacore-postgres 13 |
| 10 | 5.4 | **12.1** | 19.8 | 1589 | 0 | hexacore-gateway 84, hexacore-adr16-boleteria-2 79, hexacore-adr16-boleteria-1 72 |
| 50 | 23.6 | **52.0** | 78.9 | 1872 | 0 | hexacore-gateway 132, hexacore-adr16-boleteria-2 91, hexacore-adr16-boleteria-1 85 |
| 100 | 54.2 | **128.9** | 229.0 | 1613 | 0 | hexacore-gateway 130, hexacore-adr16-boleteria-2 97, hexacore-adr16-boleteria-1 89 |
| 200 | 143.9 | **362.5** | 503.5 | 1185 | 0 | hexacore-gateway 125, hexacore-adr16-boleteria-2 94, hexacore-adr16-boleteria-1 87 |

```text
Peticiones/s por nivel de usuarios
    1 │██████ 357
   10 │█████████████████████████ 1589
   50 │██████████████████████████████ 1872
  100 │██████████████████████████ 1613
  200 │███████████████████ 1185
```

**Interpretación**

- **Cumple el umbral de RNF-07**: p95 de 363 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 100 usuarios**: el rendimiento se queda en unas 1872 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, cada réplica de Boletería ronda el 94 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-gateway 125 %, hexacore-adr16-boleteria-2 94 %, hexacore-adr16-boleteria-1 87 %, hexacore-postgres 78 %.

## CU-001 · Disponibilidad de un evento en apertura de venta

Boletería, 2 réplica(s) · `GET /api/v1/cartelera/e0000005-0000-4000-8000-000000000005…` · umbral p95 500 ms (RNF-07)

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.4 | **6.4** | 15.6 | 314 | 0 | hexacore-adr16-boleteria-1 29, hexacore-adr16-boleteria-2 26, hexacore-postgres 14 |
| 10 | 4.5 | **11.8** | 18.8 | 1778 | 0 | hexacore-adr16-boleteria-2 82, hexacore-adr16-boleteria-1 78, hexacore-postgres 57 |
| 50 | 24.8 | **77.1** | 104.2 | 1673 | 0 | hexacore-adr16-boleteria-2 91, hexacore-adr16-boleteria-1 89, hexacore-postgres 79 |
| 100 | 46.4 | **136.7** | 217.3 | 1783 | 0 | hexacore-adr16-boleteria-2 97, hexacore-adr16-boleteria-1 91, hexacore-postgres 82 |
| 200 | 95.2 | **229.9** | 294.9 | 1840 | 0 | hexacore-adr16-boleteria-2 99, hexacore-adr16-boleteria-1 93, hexacore-postgres 90 |

```text
Peticiones/s por nivel de usuarios
    1 │█████ 314
   10 │█████████████████████████████ 1778
   50 │███████████████████████████ 1673
  100 │█████████████████████████████ 1783
  200 │██████████████████████████████ 1840
```

**Interpretación**

- **Cumple RNF-07**: p95 de 230 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 1840 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, cada réplica de Boletería ronda el 99 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10); PostgreSQL gasta 90 %, pero reparte el trabajo en varios procesos y núcleos, así que todavía no es el límite. CPU por contenedor (% de un núcleo): hexacore-adr16-boleteria-2 99 %, hexacore-adr16-boleteria-1 93 %, hexacore-postgres 90 %, hexacore-gateway 57 %.

## CU-002 · Validación del QR en la puerta

Boletería, 2 réplica(s) · `POST /api/v1/ingresos…` · umbral p95 300 ms (RNF-08)

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 4.5 | **9.2** | 21.8 | 184 | 0 | hexacore-adr16-boleteria-1 32, hexacore-adr16-boleteria-2 31, hexacore-postgres 27 |
| 10 | 14.6 | **46.0** | 75.2 | 526 | 0 | hexacore-postgres 89, hexacore-adr16-boleteria-2 69, hexacore-adr16-boleteria-1 67 |
| 50 | 108.1 | **352.2** | 573.7 | 364 | 0 | hexacore-postgres 99, hexacore-adr16-boleteria-2 61, hexacore-adr16-boleteria-1 55 |
| 100 | 236.4 | **510.4** | 795.7 | 406 | 0 | hexacore-postgres 102, hexacore-adr16-boleteria-2 61, hexacore-adr16-boleteria-1 59 |
| 200 | 411.1 | **649.0** | 742.2 | 472 | 0 | hexacore-postgres 103, hexacore-adr16-boleteria-2 60, hexacore-adr16-boleteria-1 56 |

```text
Peticiones/s por nivel de usuarios
    1 │██████████ 184
   10 │██████████████████████████████ 526
   50 │█████████████████████ 364
  100 │███████████████████████ 406
  200 │███████████████████████████ 472
```

**Interpretación**

- **No cumple RNF-08**: p95 de 649 ms con 200 usuarios a la vez (umbral 300 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 526 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, ningún componente llega a su techo (el que más, hexacore-postgres, 103 %): el límite es la máquina compartida, donde el generador de carga compite por la misma CPU que el sistema. CPU por contenedor (% de un núcleo): hexacore-postgres 103 %, hexacore-adr16-boleteria-2 60 %, hexacore-adr16-boleteria-1 56 %, hexacore-adr16-nucleo-1 25 %.

## Lo que hay que tener en cuenta al leer las cifras

- El generador de carga, el gateway, los dos programas y PostgreSQL corren en el mismo computador: compiten por la misma CPU. Las cifras son un piso, no la capacidad de un despliegue con máquinas separadas.
- Entre corridas seguidas el p95 varía en torno a ±30 %: se comparan tendencias (dónde se satura y quién), no décimas de milisegundo.
- CU-006, CU-025, CU-026 y CU-001 son lecturas: la ruta caliente de cada caso de uso. La validación del QR escribe: cada petición usa un QR distinto, bloquea su fila, suma al aforo y deja el ingreso y su aviso en la bandeja de salida, en una transacción.

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
./prueba-carga.py            # o --rapida en vivo
```
