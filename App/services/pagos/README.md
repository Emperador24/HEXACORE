# Microservicio de Pagos

Cobros y reembolsos contra la pasarela: **CU-001, 003, 006, 011 y 021**.

## Por qué existe

Es el criterio 2 de ADR-14 en su forma más concreta. Antes de salir, el
adaptador HTTP a la pasarela estaba **copiado en dos servicios** —Entradas y
Alimentos— y había empezado a divergir: uno sabía reembolsar y el otro no. Dos
dominios resolviendo el mismo problema por separado es exactamente lo que el
criterio describe.

También cumple el 3 —su estado cabe en una tabla propia— y el 4: es el único
que toca la pasarela, así que los datos de pago quedan confinados a un
despliegue, y si se cae nadie paga pero el evento sigue.

## Lo que aporta además de quitar la copia

**El libro de idempotencia durable.** Las llaves ya se mandaban a la pasarela,
pero ningún lado guardaba el resultado: si el proceso se reiniciaba entre el
cobro y la respuesta, el reintento dependía de que la pasarela recordara. Ahora
el primer resultado terminal queda escrito, con la clave como llave primaria —
la garantía la da PostgreSQL, no el código.

### Qué se cachea y qué se reintenta

- **APROBADO y RECHAZADO son finales.** Son respuestas de la pasarela: se sabe
  qué pasó con el dinero. Un reintento devuelve lo guardado sin salir a la red.
- **INDETERMINADO no se congela.** Significa *no se sabe*. Guardarlo como final
  convertiría una duda en un hecho. Un reintento vuelve a preguntar con la
  misma clave, que es justo lo que la pasarela necesita para devolver el
  resultado del primer intento. Lo que sí queda es el contador de intentos: una
  fila INDETERMINADO con muchos es la cola de reconciliación del SAD §13.

## No está en el gateway

Ningún cliente lo llama. Lo llaman Ventas, Postventa y Alimentos, que reenvían
el token del usuario. Que solo sea alcanzable desde dentro de la red **no lo
exime de autenticar**: la guardia sigue puesta, porque la red no es un control
de acceso (RNF-06).

## Arrancar

```bash
cp .env.example .env
npm install
npm run migracion:correr
npm run start:dev          # http://localhost:3008/api/v1/docs
```
