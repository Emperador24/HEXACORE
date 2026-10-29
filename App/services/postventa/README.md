# Microservicio de Postventa

El mercado secundario de entradas: **CU-006**.

Salió de `entradas-mercado-secundario` en la fase A de ADR-14. Fue la
extracción más cara del proyecto: tenía **dos** transacciones que había que
convertir en Sagas, y una de ellas corre con el pago ya cobrado.

## Por qué es microservicio

Cumple tres de los cuatro criterios de ADR-14:

- **Pico propio y en otro momento.** La reventa se mueve en los días previos al
  evento, cuando la venta primaria ya se agotó.
- **Almacén propio.** Publicaciones y transacciones de reventa no las consulta
  nadie más.
- **Falla aislada.** Antes compartía proceso con la venta: un checkout de
  reventa atascado esperando a la pasarela consumía los hilos de todo lo demás.

Se puede comprobar en vivo. Con Postventa pausado, Ventas, Acceso QR y Catálogo
siguen respondiendo 200.

## Qué se llevó y qué no

**No se llevó `Entrada`.** Es de Ventas, que es quien manda sobre de quién es
cada entrada y en qué estado está. Tampoco `HistorialPropietario`.

Eso es deliberado: el cambio de dueño, el QR nuevo y la fila de historial siguen
ocurriendo **en una sola transacción local de Ventas**. Es lo que queda de la
transacción grande que había antes, y es donde viven las dos garantías que no se
podían aflojar — RNF-02 (nunca dos códigos QR válidos para la misma entrada) y
RNF-11 (el 100 % de los cambios de propiedad, auditados).

Postventa orquesta la reventa a través de la API interna de Ventas
(`/interno/entradas/`), que el gateway no enruta.

## Las dos Sagas, y por qué el orden importa en cada una

### Publicar (CU-006, pasos 2-4)

1. **Ventas retiene la entrada** (`VALIDA` → `EN_REVENTA`), comprobando en el
   mismo `UPDATE` condicionado que sea de quien dice.
2. **Postventa valida lo suyo**: la política de reventa del evento y el tope de
   precio.
3. **Se crea la publicación**, con su copia de lo que anuncia.

Si 2 o 3 fallan, se compensa devolviendo la entrada.

El orden está elegido. Al revés existiría un anuncio sobre una entrada todavía
`VALIDA`: su dueño podría entrar al evento con ella mientras alguien la compra,
y acabaríamos con una entrada vendida y ya usada. Así el peor caso es el
contrario y es mucho más barato — una entrada retenida sin anuncio: nadie puede
comprarla, nadie puede usarla, y se arregla devolviéndola.

### Vender (CU-006, pasos 6-11)

1. **Se cierra la publicación** (`UPDATE ... WHERE estado = ACTIVA`). Va primero
   porque es lo que decide la carrera entre dos compradores: es la última
   defensa de RNF-01.
2. **Ventas transfiere**, y dentro de su transacción hace el cambio de dueño, el
   QR nuevo y el historial.
3. **Si Ventas dijo que no transfirió**, se reabre la publicación. Es seguro:
   se sabe que no pasó nada.

Y la diferencia que importa: **si Ventas no responde, la publicación NO se
reabre**. No se sabe si transfirió, y reabrirla podría venderla dos veces. Se
deja cerrada y se marca para conciliación. Una entrada bloqueada se arregla; una
vendida dos veces, no.

Por eso `ClienteVentas` distingue `transferida: false` de `respondio: false`.
No es una sutileza de tipos: es la condición de la que cuelga esa decisión.

## La copia de lo que se anuncia

`publicaciones_reventa` lleva `evento_id`, `numero_ticket` y `localidad_nombre`
copiados de la entrada al publicar. Antes se leían con un `innerJoin` a
`entradas`, que ahora está en otra base.

Se copian y no se piden porque **un anuncio muestra lo que se anunció**, y esos
datos no cambian mientras la publicación está activa. Pedírselos a Ventas sería
una llamada HTTP por publicación listada, y el mercado se caería cada vez que se
cayera Ventas.

Se nota: con Ventas pausado, `GET /reventa/publicaciones` sigue devolviendo 200.
Lo que corta es solo lo que de verdad necesita a Ventas —publicar, listar tus
entradas, comprar— con un 503 y el código `VENTAS_NO_DISPONIBLE`, al timeout
configurado, sin colgarse.

Lo que **no** se copia es de quién es la entrada y en qué estado está: eso
cambia, y su dueño es Ventas.

## El credencial de servicio

El trabajo de expiración (CU-006D) corre por reloj: cierra las publicaciones
vencidas y tiene que pedirle a Ventas que libere cada entrada. No hay usuario,
así que no hay token que reenviar.

Se identifica con `TOKEN_SERVICIOS`, que Ventas comprueba en
`llamada-interna.guard.ts`. Inventar una cuenta «sistema» habría sido disfrazar
un servicio de persona: aparecería en la auditoría como si alguien hubiera hecho
algo, y heredaría la caducidad y la revocación de las sesiones, que no tienen
sentido para un proceso.

## Lo que se perdió al separar

Las dos llaves foráneas que apuntaban a `entradas` (`fk_publicaciones_entrada` y
`fk_transacciones_entrada`). PostgreSQL no las admite entre bases distintas: es
la consecuencia que ADR-01 ya anunciaba por escrito, y aquí se paga en efectivo.
`entrada_id` sigue siendo `uuid NOT NULL`, pero la integridad pasó a ser de la
aplicación — Postventa nunca inventa un `entrada_id`, solo escribe el que Ventas
le devolvió al retener la entrada.

`uq_publicacion_activa_por_entrada`, que es el índice que de verdad protege
RNF-01, sobrevive intacto: era local a esta tabla.

## Correrlo

```bash
cp .env.example .env
npm install
npm run migracion:correr
npm run semilla          # la proyección de eventos; las entradas las siembra Ventas
npm run start:dev        # :3011
```

Necesita a Ventas levantado (`:3001`): sin él no hay nada que revender.

```bash
npm test                 # unitarias, con dobles
npm run test:integracion # contra la pila real; levántala con ../../infra/iniciar.sh
```
