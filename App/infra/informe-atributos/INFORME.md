# HEXACORE — Resultados cuantitativos de los atributos de calidad

Medido el 2026-09-22 07:16 contra el sistema desplegado, a través del API Gateway
(ADR-02), que es por donde entra el tráfico real.

Generado por `App/infra/atributos-calidad.py`. Cada fila se puede volver a
obtener delante de quien lo pida corriendo ese mismo guion; la salida completa
de cada suite está en los `.log` de esta misma carpeta.

| Atributo | RNF | Medición | Resultado | Referencia |
|---|---|---|---|---|
| **Desempeño** | RNF-07, RNF-08 | Peor p95 bajo carga | **189.9 ms con 200 peticiones simultáneas** | umbral 500 ms |
|  |  | Capacidad máxima | **1059.9 peticiones por segundo** | — |
|  |  | Peticiones fallidas | **0** | exigido 0 |
| **Disponibilidad** | RNF-03, RNF-04 | Recuperación tras kill -9 | **1.3 s** | exigido ≤ 30 s |
|  |  | Login con Redis caído | **200 en    90 ms** | debe seguir sirviendo |
|  |  | Login con RabbitMQ caído | **200 en    95 ms** | debe seguir sirviendo |
|  |  | Login con PostgreSQL caído | **503 en  3023 ms** | 503 honesto, no 200 falso |
| **Seguridad** | RNF-05, RNF-06 | Rutas de negocio abiertas | **11 de 11 rutas de negocio responden 401 sin token (0 % abiertas)** | exigido 0 % |
|  |  | Intentos de entrar rechazados | **8 con 401** | sin token, firma ajena, alg none, HS256, caducado, otro emisor, manipulado |
|  |  | Revocación al cerrar sesión | **inmediata** | el token deja de valer en todo el sistema |
|  |  | Sin poder comprobar la revocación | **503** | no se acepta un token no comprobable |
| **Consistencia** | RNF-01, RNF-02 | 50 compradores a la vez | **1 checkout, 49 rechazados** | exigido exactamente 1 |
|  |  | Pago con reserva caducada | **1 cobro aprobado** | exigido exactamente 1 |
|  |  | Los dos pagan a la vez | **1 pago, 1 QR** | exigido exactamente 1 |

## Escenario de cada atributo

### Desempeño (RNF-07, RNF-08)

Consulta de catálogo durante la apertura de venta.

Suite: `entradas-mercado-secundario/pruebas/rnf07-desempeno.py` · salida completa en `rnf07-desempeno.log` · duración 5 s

### Disponibilidad (RNF-03, RNF-04)

El login sigue atendiendo con una dependencia caída, y se recupera solo.

Suite: `administracion/pruebas/cu027-disponibilidad.py` · salida completa en `cu027-disponibilidad.log` · duración 35 s

### Seguridad (RNF-05, RNF-06)

Toda petición llega autenticada y autorizada por rol desde el gateway.

Suite: `entradas-mercado-secundario/pruebas/rnf06-autenticacion.py` · salida completa en `rnf06-autenticacion.log` · duración 4 s

### Consistencia (RNF-01, RNF-02)

Ninguna entrada publicada puede venderse a dos compradores.

Suite: `entradas-mercado-secundario/pruebas/rnf01-concurrencia.py` · salida completa en `rnf01-concurrencia.log` · duración 4 s

## Cómo se reproduce

```bash
cd App/infra && ./iniciar.sh          # levanta el sistema completo
./atributos-calidad.py               # vuelve a medir y reescribe este informe
./atributos-calidad.py --desplegabilidad   # incluye el arranque de cero (borra datos)
```
