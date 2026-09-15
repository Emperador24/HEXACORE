# Pruebas de integración del CU-006

Estas cuatro suites corren contra la **infraestructura real** —PostgreSQL, Redis, RabbitMQ y la
pasarela simulada, todo en Docker— y comprueban lo que un doble de prueba no puede: que el bloqueo
distribuido de verdad impida la doble venta, que la cola de verdad mueva el mensaje a la DLQ, y que
las restricciones de la base de verdad rechacen una escritura incoherente.

Las pruebas unitarias (`npm test`, en `src/**/*.spec.ts`) cubren la lógica de dominio con dobles;
estas cubren el montaje.

## Cómo correrlas

```bash
docker compose -f ../../infra/docker-compose.yml up -d
npm run migracion:correr && npm run semilla
npm run start:dev          # en otra terminal

npm run test:integracion   # las cuatro
python3 pruebas/rnf01-concurrencia.py   # o una suelta
```

Cada suite resiembra la base al empezar, así que pueden correrse en cualquier orden y repetirse sin
limpiar nada a mano.

## Qué comprueba cada una

| Suite | Qué demuestra |
|---|---|
| [`cu006-flujo-completo.py`](cu006-flujo-completo.py) | El flujo básico (pasos 1–11) y los tres fallos de pasarela: **CU-006G**, **CU-006I** por 502 y **CU-006I** por timeout real de 10 s. Verifica en la base las post-condiciones: propiedad cambiada, QR anterior inexistente (RNF-02) y cadena `EMISION -> REVENTA` en el historial (RNF-11). |
| [`rnf01-concurrencia.py`](rnf01-concurrencia.py) | **RNF-01** en sus tres momentos: (A) 50 compradores reservan a la vez y solo uno gana; (B) pagar con la reserva ya caducada se rechaza; (C) dos pagos simultáneos producen un solo cobro y un solo QR. **B y C fallaban** antes de la revisión — C llegaba a dos cobros y dos códigos QR sobre una entrada. |
| [`cu006-eventos-cola.py`](cu006-eventos-cola.py) | Los pasos 12–13 por RabbitMQ: publicación y consumo, DLQ ante lo imposible de procesar, límite de reintentos, descarte de duplicados, y **la venta se completa con el broker detenido** (ADR-04). |
| [`cu006d-expiracion.py`](cu006d-expiracion.py) | **CU-006D**: una publicación vencida se cierra y su entrada vuelve al vendedor; una vigente no se toca; una con compra en curso se respeta; y cinco barridos simultáneos no la expiran dos veces. |

## Por qué no son pruebas unitarias

Tres de los hallazgos de esta implementación **no habrían salido** con dobles:

1. Los consumidores no se resuscribían tras reconectar al broker: el servicio quedaba "conectado"
   pero mudo. Se vio al **detener el contenedor de RabbitMQ** y volver a arrancarlo.
2. El contador de reintentos leía la cabecera `x-death`, que RabbitMQ solo añade al pasar por la
   DLQ. Con un doble de canal el contador habría "funcionado"; contra el broker real, los mensajes
   rebotaban indefinidamente.
3. El camino **CU-006I** por timeout necesita un servidor que acepte la conexión y calle. Un doble
   en memoria responde siempre.

Por eso la pasarela simulada es un contenedor y no un *stub*: es la única forma de que *"falla la
comunicación con la pasarela de pagos"* ocurra de verdad.

## Limitaciones honestas

- **Cliente y servidor en la misma máquina**, sin red de por medio.
- **Una sola instancia del servicio.** El bloqueo es distribuido y debería sostenerse con varias
  réplicas (ASR-06), pero eso aquí no se mide.
- **No se prueban 2.000 usuarios concurrentes** (la carga de RNF-07); RNF-01 pide 50 y son los que
  se ejecutan.
- El barrido de expiración se dispara por su endpoint de mantenimiento, no esperando al cron. Que el
  temporizador funciona se comprobó aparte, arrancando el servicio con `EXPIRACION_CRON` corto.
