# Prueba de carga — casos de uso de Samuel

Medida el 2026-11-12 23:10 por el API Gateway con `App/infra/prueba-carga.py`: cada nivel son N usuarios pidiendo sin pausa durante 12 s. Umbral RNF-07: p95 ≤ 500 ms sin fallos. La CPU por contenedor sale de Prometheus (tablero de Grafana en `/grafana/`).

## CU-026 · Eventos del organizador

Núcleo, 2 réplica(s) · `GET /api/v1/eventos…`

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 3.8 | **5.8** | 7.7 | 245 | 0 | hexacore-adr16-nucleo-1 40, hexacore-adr16-nucleo-2 39, hexacore-postgres 11 |
| 10 | 8.4 | **17.3** | 27.7 | 1030 | 0 | hexacore-adr16-nucleo-1 107, hexacore-adr16-nucleo-2 105, hexacore-postgres 60 |
| 50 | 40.5 | **79.0** | 96.4 | 1196 | 0 | hexacore-adr16-nucleo-2 103, hexacore-adr16-nucleo-1 103, hexacore-postgres 70 |
| 100 | 87.9 | **194.6** | 236.3 | 1123 | 0 | hexacore-adr16-nucleo-1 104, hexacore-adr16-nucleo-2 103, hexacore-postgres 70 |
| 200 | 173.2 | **314.7** | 350.6 | 1106 | 0 | hexacore-adr16-nucleo-1 106, hexacore-adr16-nucleo-2 104, hexacore-postgres 65 |

```text
Peticiones/s por nivel de usuarios
    1 │██████ 245
   10 │██████████████████████████ 1030
   50 │██████████████████████████████ 1196
  100 │████████████████████████████ 1123
  200 │████████████████████████████ 1106
```

**Interpretación**

- **Cumple RNF-07**: p95 de 315 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 100 usuarios**: el rendimiento se queda en unas 1196 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, cada réplica de Núcleo ronda el 106 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10). CPU por contenedor (% de un núcleo): hexacore-adr16-nucleo-1 106 %, hexacore-adr16-nucleo-2 104 %, hexacore-postgres 65 %, hexacore-gateway 58 %.

## CU-025 · Panel de ocupación del parqueadero

Núcleo, 2 réplica(s) · `GET /api/v1/parqueaderos…`

| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 4.7 | **7.3** | 12.6 | 193 | 0 | hexacore-postgres 29, hexacore-adr16-nucleo-2 25, hexacore-adr16-nucleo-1 25 |
| 10 | 9.5 | **19.1** | 24.7 | 934 | 0 | hexacore-postgres 188, hexacore-adr16-nucleo-1 87, hexacore-adr16-nucleo-2 87 |
| 50 | 41.8 | **94.6** | 173.3 | 1052 | 0 | hexacore-postgres 251, hexacore-adr16-nucleo-1 99, hexacore-adr16-nucleo-2 96 |
| 100 | 71.0 | **154.5** | 185.8 | 1275 | 0 | hexacore-postgres 293, hexacore-adr16-nucleo-1 101, hexacore-adr16-nucleo-2 98 |
| 200 | 140.3 | **208.2** | 233.6 | 1385 | 0 | hexacore-postgres 325, hexacore-adr16-nucleo-2 102, hexacore-adr16-nucleo-1 102 |

```text
Peticiones/s por nivel de usuarios
    1 │████ 193
   10 │████████████████████ 934
   50 │███████████████████████ 1052
  100 │████████████████████████████ 1275
  200 │██████████████████████████████ 1385
```

**Interpretación**

- **Cumple RNF-07**: p95 de 208 ms con 200 usuarios a la vez (umbral 500 ms) y 0 peticiones fallidas.
- **Saturación desde 50 usuarios**: el rendimiento se queda en unas 1385 peticiones/s y a partir de ahí cada usuario más solo espera en cola; por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento fijo, más usuarios en el sistema es más tiempo de respuesta).
- **Por qué:** con 200 usuarios, cada réplica de Núcleo ronda el 102 % de un núcleo y no sube aunque lleguen más usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de botella. Más réplicas detrás del gateway reparten justo eso (RNF-10); PostgreSQL gasta 325 %, pero reparte el trabajo en varios procesos y núcleos, así que todavía no es el límite. CPU por contenedor (% de un núcleo): hexacore-postgres 325 %, hexacore-adr16-nucleo-2 102 %, hexacore-adr16-nucleo-1 102 %, hexacore-gateway 97 %.

## Lo que hay que tener en cuenta al leer las cifras

- El generador de carga, el gateway, los dos programas y PostgreSQL corren en el mismo computador: compiten por la misma CPU. Las cifras son un piso, no la capacidad de un despliegue con máquinas separadas.
- Entre corridas seguidas el p95 varía en torno a ±30 %: se comparan tendencias (dónde se satura y quién), no décimas de milisegundo.
- Son lecturas: miden la ruta caliente de cada caso de uso (lo que miles consultan a la vez). Las escrituras con bloqueo se miden en las pruebas de concurrencia.

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
./prueba-carga.py            # o --rapida en vivo
```
