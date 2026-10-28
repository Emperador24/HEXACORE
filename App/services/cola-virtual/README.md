# Microservicio de Cola virtual

El turno para entrar a comprar. Apoya **CU-001** y sostiene el **primer ASR**.

## Qué resuelve

En la apertura de venta de un evento muy demandado llegan muchos más
compradores de los que Ventas puede atender a la vez. La cola no los rechaza:
los **ordena**, y deja pasar tantos como el aforo concurrente permita. El resto
espera sabiendo su puesto.

Sin ella, el pico entero llega al checkout y se degradan todos a la vez.

## No tiene base de datos

Su estado es la fila, y la fila vive en Redis. Un turno perdido al reiniciar no
es un dato perdido: el comprador vuelve a pedir sitio. A cambio, la cola
aguanta el pico sin tocar disco.

## Cómo funciona

Tres estructuras por evento, y hacen falta las tres:

| Clave | Qué guarda | Por qué |
|---|---|---|
| `cola:{evento}:admitidos` | `token → cuándo caduca` | Ventas gasta el turno **por token** |
| `cola:{evento}:espera` | `usuario → cuándo llegó` | el orden de la fila |
| `cola:{evento}:por-usuario` | `usuario → token` | saber si **este** ya tiene turno |

Con una sola estructura, una de las dos búsquedas sale mal. La que salía mal
era la tercera, y el síntoma era serio: **pedir turno dos veces daba dos
sitios**, que es justo lo que rompe el aforo. Hay una prueba para eso.

Las operaciones van en **Lua**, no en varias órdenes seguidas: Redis ejecuta un
guion entero sin que nada se cuele en medio. Con tres réplicas atendiendo el
mismo pico, hacer "mirar cuántos hay dentro" y "meter a uno más" en dos viajes
dejaría pasar de más — dos instancias leerían 99 y las dos admitirían.

## El token es de un solo uso

Lo gasta Ventas con `DELETE /interno/cola/...`, no el cliente. Es `DELETE`
porque gastarlo **lo destruye**: si sirviera dos veces, el aforo dejaría de
significar nada.

Esa ruta **no está en el gateway**, pero autentica igual: que algo solo sea
alcanzable desde dentro de la red no es un control de acceso (RNF-06).

## Arrancar

```bash
cp .env.example .env
npm install
npm run start:dev          # http://localhost:3009/api/v1/docs
```

Necesita Redis: `cd App/infra && ./iniciar.sh --rol datos`.

Las pruebas de `cola.redis.spec.ts` corren contra un Redis real y se saltan
solas si no hay uno: la lógica está en Lua, y un doble no probaría nada.
