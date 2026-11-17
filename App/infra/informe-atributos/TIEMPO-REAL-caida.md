# Tiempo real (RNF-09) y aviso de evacuación (RNF-17)

Medido el 2026-11-16 18:35 con `App/infra/tiempo-real.py`, todo por el API Gateway, en un solo computador (Docker Desktop). Los paneles son los flujos SSE que abre el portal; los dispositivos imitan la app móvil.

## RNF-17 · Aviso de evacuación (≥ 99 % en ≤ 10 s)

300 dispositivos simulados consultan la evacuación activa cada 4 s, como la app móvil del personal, cada uno desde una fase al azar. El reloj empieza al enviar la confirmación (la activación). En ese instante se mata con `kill -9` la réplica `hexacore-adr16-nucleo-1` del Núcleo.

| Dispositivos | La vieron en ≤ 10 s | % | p50 (s) | p95 (s) | Máx. (s) | Errores / consultas |
|---:|---:|---:|---:|---:|---:|---:|
| 300 | 300 | **100.0** | 1.99 | 3.83 | 4.07 | 0 / 760 |

Cola de avisos del Núcleo (altavoces, asistentes y personal): 5/5 entregados, latencia máxima 0.02 s desde que se creó el aviso.

- El peor caso es un sondeo completo de la app (4 s) más una respuesta: el diseño deja margen frente a los 10 s.
- Mide la llegada a la app. No mide teléfonos apagados, sin señal o con la app cerrada: para eso hacen falta notificaciones push o SMS reales, que el prototipo no tiene.

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh --datos-demo --monitoreo
./tiempo-real.py                     # RNF-09 y RNF-17
./tiempo-real.py evacuacion --caida  # con 2 réplicas del Núcleo (demo-disponibilidad.sh)
```
