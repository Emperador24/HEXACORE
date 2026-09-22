# Pasarela de Pagos simulada

La **Pasarela de Pagos** es un sistema externo en el SAD (aparece en gris en la vista de
componentes, *"otro nivel"*): no la construye este proyecto. Esto es lo que responde al otro lado
para poder ejercitar el CU-006 de extremo a extremo.

Corre como **contenedor propio** y no como un doble de prueba dentro del servicio de Entradas, para
que la llamada sea HTTP real y el Procesador de Pagos tenga que lidiar con lo que de verdad pasa en
una red. Un doble en memoria respondería siempre bien, y el camino de excepción **CU-006I** (*"Falla
la comunicación con la pasarela de pagos"*) nunca se probaría.

Sin dependencias: solo la librería estándar de Node.

## API

```
GET  /salud       -> { servicio, estado }
POST /pagos       -> { referencia, estado, motivo, monto, moneda, procesadoEn }
POST /reembolsos  -> { referencia, estado, motivo, referenciaCobro, monto, procesadoEn }
```

Cuerpo de `POST /pagos`: `{ monto, moneda, token, descripcion }`. Cuerpo de `POST /reembolsos`
(CU-003): `{ referenciaCobro, monto, moneda, motivo }`. Las dos admiten la cabecera
`Idempotency-Key`.

Un reembolso se rechaza si la referencia no es de un cobro aprobado (la pasarela guarda sus cobros
en memoria: reiniciarla los olvida), si el cobro se hizo con `tok_noreemb…`, o si se pide devolver
más de lo que queda por devolver.

## Cómo se decide el resultado

Igual que las pasarelas reales en su entorno de pruebas (las "tarjetas de prueba" de Stripe o
Mercado Pago): **lo decide el token que manda el cliente**, no una configuración del servidor. Así
una prueba puede disparar un rechazo sin pedirle nada a la pasarela, y el servicio de Entradas no
tiene forma de "pedir" un resultado — solo cobra.

| Token | Qué hace | Camino |
|---|---|---|
| `tok_ok…` | Aprueba el cobro | flujo básico |
| `tok_rechazo…` | Rechaza con "Fondos insuficientes" | **CU-006G**, **CU-001C** |
| `tok_timeout…` | No responde nunca | **CU-006I** |
| `tok_error…` | Responde 502 | **CU-006I** |
| `tok_noreemb…` | Aprueba el cobro, pero rechaza sus reembolsos | **CU-003C** |

## Idempotencia

Respeta `Idempotency-Key`: dos llamadas con la misma clave devuelven el mismo resultado y la misma
referencia, sin cobrar dos veces. Es lo que hace seguro reintentar cuando no se sabe si el primer
intento llegó (CU-006I), y es como funcionan las pasarelas de verdad.

## Comprobación de RNF-05

Si el cuerpo trae `pan`, `numeroTarjeta`, `cvv`, `cvc` o `expiracion`, la petición se **rechaza con
400**. RNF-05 exige *"campos de tarjeta persistidos en cualquier base de datos propia: 0"* y que
*"el cobro se delega íntegramente a la pasarela"*: esta comprobación convierte ese requisito en algo
que falla ruidosamente si alguien lo incumple, en vez de en una promesa.

## Levantarla

Va incluida en `App/infra/docker-compose.yml`:

```bash
docker compose -f App/infra/docker-compose.yml up -d pasarela
curl localhost:3099/salud
```
