# Tiempo real (RNF-09) y aviso de evacuación (RNF-17)

Medido el 2026-11-16 18:26 con `App/infra/tiempo-real.py`, todo por el API Gateway, en un solo computador (Docker Desktop). Los paneles son los flujos SSE que abre el portal; los dispositivos imitan la app móvil.

## RNF-09 · Del ingreso al tablero (umbral 2 s)

Cronómetro: desde que se envía el ingreso hasta que el panel en vivo lo muestra. Cada muestra empieza en una fase al azar del ciclo de 1 s del panel.

| Panel | Muestras | p50 (s) | p95 (s) | Máx. (s) | Dentro de 2 s | Sin reflejar |
|---|---:|---:|---:|---:|---:|---:|
| CU-025 · Panel de ocupación del parqueadero | 20 | 0.46 | 1.01 | **1.01** | 20/20 | 0 |
| CU-019 · Panel de monitoreo (QR → broker → Operación) | 20 | 0.71 | 1.12 | **1.12** | 20/20 | 0 |

- **Parqueadero:** el ingreso y el panel están en el mismo módulo y la misma base; el tiempo es la espera hasta el siguiente ciclo del flujo (1 s) más la consulta.
- **Monitoreo:** el QR se valida en Boletería, el aviso sale por la bandeja de salida (cada 300 ms), cruza RabbitMQ, lo guarda el consumidor de Operación en el Núcleo y lo muestra el siguiente ciclo del flujo.

## RNF-17 · Aviso de evacuación (≥ 99 % en ≤ 10 s)

300 dispositivos simulados consultan la evacuación activa cada 4 s, como la app móvil del personal, cada uno desde una fase al azar. El reloj empieza al enviar la confirmación (la activación).

| Dispositivos | La vieron en ≤ 10 s | % | p50 (s) | p95 (s) | Máx. (s) | Errores / consultas |
|---:|---:|---:|---:|---:|---:|---:|
| 300 | 300 | **100.0** | 2.15 | 3.76 | 3.99 | 0 / 757 |

Cola de avisos del Núcleo (altavoces, asistentes y personal): 5/5 entregados, latencia máxima 0.02 s desde que se creó el aviso.

- El peor caso es un sondeo completo de la app (4 s) más una respuesta: el diseño deja margen frente a los 10 s.
- Mide la llegada a la app. No mide teléfonos apagados, sin señal o con la app cerrada: para eso hacen falta notificaciones push o SMS reales, que el prototipo no tiene.

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
./tiempo-real.py                     # RNF-09 y RNF-17
./tiempo-real.py evacuacion --caida  # con 2 réplicas del Núcleo (demo-disponibilidad.sh)
```
