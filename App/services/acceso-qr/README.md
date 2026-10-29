# Microservicio de Acceso QR

Validar la entrada en la puerta: **CU-002**.

Salió de `ventas` en la fase A de ADR-14. Es el primero
del proyecto que **no fue una mudanza**: la transacción que lo sostenía había
que convertirla en una Saga.

## Por qué es microservicio

Cumple tres criterios, y el primero es el que más se nota: **su pico es en otro
momento que el de la venta**. La puerta se llena en la media hora antes de
empezar; la venta fue semanas atrás. Dimensionar para la suma de dos picos que
nunca coinciden es desperdiciar.

Y su falla tiene que quedar aislada: si no valida, la gente no entra, y eso no
puede depender de que la venta esté sana.

## La Saga, y por qué el orden importa

`Entrada` es de Ventas; los ingresos y el aforo son de aquí. Ya no hay una
transacción que abarque las dos cosas.

1. **Ventas gasta el QR.** El `UPDATE ... WHERE estado = VALIDA` sigue siendo
   la autoridad contra la doble entrada, solo que en otra base.
2. **Aforo e ingreso, en una transacción local.** Las dos son de este servicio,
   así que siguen siendo atómicas entre sí: no hay ingreso sin su plaza.
3. **Si el paso 2 falla, se deshace el 1** pidiendo a Ventas devolver la
   entrada a `VALIDA`.

Sin el paso 3, alguien se queda en la puerta con la entrada gastada **sin haber
entrado**. Es el fallo caro de este caso de uso, y hay dos pruebas que lo
cubren: aforo lleno y registro fallido.

**Si Ventas no responde, no se deja pasar.** No se sabe si la entrada quedó
marcada, y en una puerta el error caro es dejar entrar a quien no debía.

## Las dos defensas contra el doble ingreso sobreviven

| Defensa | Dónde vive ahora |
|---|---|
| `UPDATE entradas SET USADA WHERE VALIDA` | Ventas |
| `UNIQUE (entrada_id)` en `ingresos` | aquí |

Lo que **no** sobrevive es la llave foránea de `ingresos` a `entradas`: están
en bases distintas. Es la consecuencia que ADR-01 ya aceptó por escrito, y lo
que la sustituye es el orden de la Saga — aquí solo se inserta después de que
Ventas confirme la entrada y devuelva su id.

## Sin conexión (CU-002E)

El dispositivo descarga los **hashes** de los QR válidos y valida contra ellos
si pierde la red. Los hashes se los pide este servicio a Ventas: las entradas
son suyas. Van hasheados para que ni el dispositivo ni este servicio lleguen a
conocer los códigos en claro.

## Arrancar

```bash
cp .env.example .env
npm install && npm run migracion:correr && npm run semilla
npm run start:dev          # http://localhost:3010/api/v1/docs
```

`npm run semilla` **no borra los ingresos**: son el registro de quién entró, y
vaciarlos escondería un doble ingreso entre corridas. Para limpiarlos hay que
decirlo: `npm run semilla -- --con-ingresos`.
