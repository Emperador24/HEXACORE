# Integrabilidad · RNF-16 (pasarela de pagos)

16/11/2026 · Daniel Cristancho

> **RNF-16.** La pasarela de pagos se cambia por otro proveedor sin tocar la lógica de negocio.
> **Umbral:** 1 componente modificado (el adaptador) y 0 cambios en Entradas.

**Resultado:** cumplido entre la pasarela simulada y Stripe. Se cambia con una variable
(`PAGOS_PROVEEDOR`) en **8 s**, sin recompilar, con **0 archivos de código modificados**. Una prueba
automática impide que el negocio vuelva a depender de un proveedor. **Pendiente:** el pago real en
Stripe necesita las llaves de prueba (`sk_test_…`, `pk_test_…`) de una cuenta de Stripe.

## 1. Cómo está hecho

```
Entradas · Alimentos · Parqueaderos          (negocio: no saben qué pasarela hay)
        │  ProcesadorPagos (interfaz propia: cobrar / reembolsar)
        ▼
finanzas/pagos  ── API pública: index.ts ──  PagosService (libro de transacciones)
        │  crearProcesadorPagos(config)  ← PAGOS_PROVEEDOR
        ├── PasarelaHttp    → pasarela simulada (App/infra/pasarela-pagos-simulada)
        └── PasarelaStripe  → api.stripe.com (PaymentIntents, Refunds)
apps/nucleo/pagos: webhooks de entrada (simulada y Stripe), los dos con PagosService.confirmar
```

- El negocio cobra con una **interfaz** (`ProcesadorPagos`) y recibe siempre uno de tres resultados:
  `APROBADO`, `RECHAZADO` (seguro que no hubo cargo) o `INDETERMINADO` (no se sabe; lo resuelve el
  webhook). Esos resultados son los mismos para cualquier proveedor.
- **El único lugar que sabe qué pasarela hay** es `crearProcesadorPagos` en
  [pagos.module.ts](../../App/backend/modulos/finanzas/pagos/pagos.module.ts). Un proveedor nuevo es un
  adaptador más ahí (y su webhook de entrada en `apps/nucleo/pagos`), dentro del componente Pagos.

## 2. Protocolos

### Internos

| Protocolo | Para qué | Detalle |
| --- | --- | --- |
| HTTP/JSON por el API Gateway (Nginx) | Portales y app → Núcleo / Boletería | Prefijo `/api/v1`. El gateway valida el JWT (RS256 con clave pública, algoritmo fijo) antes de reenviar |
| AMQP (RabbitMQ), exchanges *topic* | Entre módulos, asíncrono | Bandeja de salida: el evento se guarda en la misma transacción y luego se publica. Ej.: `pagos.eventos`, `ventas.eventos`, `eventos.gestion`, `acceso.eventos` |
| SSE (Server-Sent Events) | Paneles en vivo | Monitoreo, evacuación y parqueaderos |

### Externo: Stripe

| Paso | Qué viaja |
| --- | --- |
| 1. El navegador tokeniza la tarjeta | Stripe.js (`js.stripe.com`) con la llave pública `pk_test_…` → `pm_…`. La tarjeta **nunca** llega a HEXACORE (RNF-05) |
| 2. HEXACORE cobra | `POST /v1/payment_intents`, `application/x-www-form-urlencoded`, `Authorization: Bearer sk_test_…`, `Idempotency-Key` = id de la transacción. `amount` en centavos, `confirm=true`, `metadata[claveIdempotencia]` |
| 3. Stripe responde | `succeeded` → APROBADO · 402 tarjeta rechazada → RECHAZADO · 429/5xx/sin red/`processing` → INDETERMINADO |
| 4. Reembolso (CU-003) | `POST /v1/refunds` con el `payment_intent` del cobro y su propia `Idempotency-Key` |
| 5. Confirmación tardía | Webhook `POST /api/v1/pagos/webhook/stripe`, firmado: `Stripe-Signature` = HMAC-SHA256 de `t.cuerpo` con `whsec_…`, comparado en tiempo constante, tolerancia 300 s |

La app móvil y las demos mandan tokens de la pasarela simulada (`tok_ok…`, `tok_rechazo…`); en modo
de prueba el adaptador los traduce a las tarjetas de prueba de Stripe (`pm_card_visa`,
`pm_card_chargeDeclined`), así que esos flujos cobran en el sandbox sin cambiar nada.

## 3. Evidencia

### Prueba automática

[rnf16-cambio-pasarela.spec.ts](../../App/backend/modulos/finanzas/pagos/rnf16-cambio-pasarela.spec.ts),
15 pruebas, en el CI con las demás:

1. `PAGOS_PROVEEDOR=stripe` crea `PasarelaStripe`; `simulada`, `PasarelaHttp`.
2. Ningún archivo de Entradas, Alimentos ni Parqueaderos nombra a Stripe, a un adaptador ni a
   `PAGOS_PROVEEDOR`, y todos llegan a Pagos solo por su API pública (nunca a un archivo interno).
3. **Mismo contrato:** la misma solicitud contra los dos adaptadores da el mismo resultado de negocio
   (aprobado con referencia y clave de idempotencia, rechazado, caído, sin red, reembolso). Un
   proveedor nuevo tiene que pasar esta misma tabla.

Backend completo tras el cambio: `tsc` sin errores y 1155 pruebas unitarias aprobadas.

### Medición en vivo (16/11, Docker local)

| Paso | Resultado |
| --- | --- |
| Pasarela simulada | Compra `PAGADA` (HTTP 200) |
| `PAGOS_PROVEEDOR=stripe` con una llave de prueba inventada | Aplicado en **8 s**, sin recompilar; `GET /pagos/configuracion` → `stripe` |
| Pago | La petición **llegó a Stripe**, que rechazó la llave (registro de Boletería: *"Stripe rechazó la llave secreta"*); el cliente ve `CU-001C` |
| Vuelta a `simulada` | **8 s**; compra `PAGADA` |
| Archivos de código cambiados por el cambio de pasarela | **0** |

### Hallazgo corregido

El formato de los tokens de pago (`tok_` de la simulada, `pm_` de Stripe) estaba en
`compartido/token-pago.ts`, fuera de Pagos, y lo usaban los DTO de Entradas, Alimentos y
Parqueaderos. Con un tercer proveedor de tokens distintos había que tocar ese archivo, además del
adaptador. Se movió **sin cambiar su contenido** a `modulos/finanzas/pagos/token-pago.ts` (con su
prueba, de Sebastián) y se exporta por la API pública de Pagos.

## 4. Límites

- **El cliente también tokeniza.** El portal web tiene un formulario de tarjeta propio de Stripe
  (Stripe Elements), porque RNF-05 exige que la tarjeta no pase por HEXACORE. Un proveedor nuevo
  necesitaría también su formulario en los portales. RNF-16 mide el backend ("0 cambios en
  Entradas") y eso se cumple.
- Stripe en prueba no permite forzar un **reembolso rechazado** (CU-003C); eso solo se ve con la
  pasarela simulada.

## 5. Demostración en vivo

1. **Protocolos (1 min):** la tabla de la sección 2.
2. **Cambio de pasarela (1 min).** En `App/infra/.env`:
   ```
   PAGOS_PROVEEDOR=stripe
   STRIPE_CLAVE_SECRETA=sk_test_…
   STRIPE_CLAVE_PUBLICA=pk_test_…
   ```
   y reiniciar solo Núcleo y Boletería, sin recompilar:
   ```
   docker compose -p hexacore-adr16 -f App/infra/docker-compose.yml --profile servicios up -d --no-build --no-deps --wait nucleo boleteria
   ```
3. **Pago en vivo:** comprar en el portal con la tarjeta de prueba `4242 4242 4242 4242` y mostrar el
   PaymentIntent en el panel de Stripe (modo de prueba). Con `4000 0000 0000 0002`, el rechazo.
4. **0 cambios:** `git status` no muestra código modificado, y la prueba
   `rnf16-cambio-pasarela.spec.ts` en verde.
5. Opcional, webhook: `stripe listen --forward-to localhost:8080/api/v1/pagos/webhook/stripe` y
   copiar el `whsec_…` a `STRIPE_SECRETO_WEBHOOK`.
