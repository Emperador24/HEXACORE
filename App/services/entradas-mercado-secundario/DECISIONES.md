# Decisiones abiertas del CU-006

Al implementar el **CU-006 (Gestión del Mercado Secundario de Entradas)** aparecieron ocho huecos
que la documentación del proyecto no cierra. Ninguno es una decisión *arquitectónica* —los ADR-01,
02, 03, 06, 09 y 10 ya fijan microservicios, gateway, Redis, PostgreSQL, NestJS y RabbitMQ—, pero
sin resolverlos el caso de uso no se puede codificar.

Se resuelven aquí con un valor por defecto razonado y **configurable**, no incrustado en el código.
Este archivo es la propuesta; si el equipo ratifica alguno, sube a ADR en el SAD §14.

---

## 1. Tope del precio de reventa — **no existe en la documentación**

El paso 3 del CU-006 dice literalmente *"Establece el precio de venta y confirma la publicación"*,
sin restricción alguna. El prototipo Angular tampoco valida
(`portal-web-cliente/src/app/core/entradas.service.ts`, `ponerEnReventa` acepta cualquier número).

**Propuesta:** `REVENTA_TOPE_PRECIO_FACTOR = 1.5` — el precio publicado no puede superar 1,5× el
precio original de la entrada.

**Por qué:** el objetivo declarado del CU-006 es que el comprador adquiera la entrada *"de forma
segura"*, y el atributo de calidad **Seguridad** de la ficha exige *"impedir fraude"*. Un mercado
secundario sin tope es precisamente el mecanismo del que vive la reventa especulativa. Un factor de
1,5 deja margen para que el vendedor recupere lo pagado más la comisión y algo de valor, sin
convertir el mercado en subasta.

**Alternativa descartada:** precio máximo = precio original (reventa "a la par"). Elimina el
incentivo a revender y dejaría el mercado vacío, que es peor para el caso de uso que un tope alto.

**Cómo desactivarlo:** `REVENTA_TOPE_PRECIO_FACTOR` muy alto (p. ej. `999`). No se admite un valor
`< 1`: haría irrevendible toda entrada y el servicio se niega a arrancar.

---

## 2. Comisión de la plataforma — **no existe en la documentación**

El paso 13 dice *"Liquidar el pago correspondiente al vendedor"* y el ADR-04 menciona *"liquidación
de pagos"* como carga asíncrona, pero en ningún punto se define un porcentaje ni un *fee*.

**Propuesta:** `REVENTA_COMISION_PORCENTAJE = 10`. El comprador paga el precio publicado; el
vendedor recibe `precio × (1 − 0,10)`; la diferencia queda registrada como comisión de la
plataforma.

**Por qué:** que la comisión la absorba el vendedor y no se sume al precio mantiene coherente el
tope del punto 1 — si se cobrara aparte, el comprador pagaría por encima del tope que el sistema
dice aplicar. Además hace que el número que ve el comprador en el mercado sea el que se le cobra,
sin sorpresas en el checkout.

**Consecuencia:** la liquidación deja de ser un simple "pagar al vendedor" y necesita registrar tres
cifras (precio, comisión, neto). Eso se refleja en la tabla `transacciones_reventa` del paso 2.

---

## 3. Expiración de la publicación (CU-006D) — **plazo no especificado**

El flujo alterno **CU-006D** ("La publicación expira sin haberse vendido") exige una caducidad pero
no dice cuándo ocurre. La única pista temporal del CU-006 es cualitativa: *"el mercado secundario
debe permanecer operativo especialmente en los días previos al evento"*.

**Propuesta:** la publicación expira cuando **empieza el evento**, con un margen configurable
(`REVENTA_MARGEN_CIERRE_MINUTOS = 0`).

**Por qué:** atar la expiración al evento y no a un plazo fijo desde la publicación (p. ej. "30
días") es lo que respeta esa frase: una publicación creada tres meses antes sigue viva justo en los
días previos, que es cuando el CU dice que más importa. Un plazo fijo la habría matado antes de
llegar ahí.

**Por qué el margen existe:** el equipo puede querer cerrar la reventa un rato antes de abrir
puertas, para que no se transfiera una entrada mientras su dueño ya está en la fila. Se deja en `0`
porque la ficha del CU no lo pide; quien lo necesite lo sube sin tocar código.

---

## 4. TTL del bloqueo de Redis — **mencionado sin valor**

La tabla de riesgos del SAD §13 da como mitigación del riesgo #1 *"Bloqueo distribuido con **TTL** en
Redis antes de procesar el pago"*, pero no fija el TTL.

**Propuesta:** `REVENTA_BLOQUEO_TTL_SEGUNDOS = 120`, con `PASARELA_TIMEOUT_MS = 10000`.

**Por qué:** el TTL acota los dos fallos posibles y hay que elegir cuál duele menos.

- **Demasiado corto:** el bloqueo caduca con el cobro aún en vuelo en la pasarela, la publicación
  queda libre y un segundo comprador puede comprarla → **doble venta**, justo lo que RNF-01 prohíbe
  ("ventas duplicadas bajo concurrencia: 0 %").
- **Demasiado largo:** si la instancia que sostenía el bloqueo muere, la publicación queda
  inaccesible hasta que caduque → indisponibilidad temporal de *una* publicación.

El segundo fallo es reversible y afecta a un solo registro; el primero rompe un requisito duro. Por
eso el TTL se elige con holhura: 120 s son doce veces el *timeout* de la pasarela. El servicio
**valida al arrancar** que `TTL > timeout de la pasarela` y se niega a levantar si no se cumple.

**Nota:** el bloqueo se libera explícitamente al terminar el checkout (con éxito, rechazo o
cancelación CU-006C); el TTL es solo la red de seguridad para cuando el proceso muere sin liberar.

---

## 5. Historial de propietarios — **la tabla no está en el modelo de datos**

El modelo de datos del SAD §12 define para este dominio únicamente:

```
Entrada(id, evento_id, localidad_id, propietario_id, codigoQR, estado)
PublicacionReventa(id, entrada_id, vendedor_id, precio, estado)
```

Pero el CU-006 exige en su **post-condición 3** y en su **paso 11** *"registrar la transferencia en
el historial de propietarios"*, el atributo **Trazabilidad** pide *"un historial auditable de todos
los propietarios de cada entrada"*, y **RNF-11** lo cuantifica: *"Operaciones con registro completo
(actor, marca de tiempo, id. de transacción, resultado): 100 %; retención ≥ 1 año"*. Con las dos
tablas de §12 eso es imposible: `Entrada.propietario_id` se sobrescribe y el dueño anterior se
pierde.

**Propuesta:** añadir dos tablas al esquema, y proponer al equipo que §12 se actualice:

- `historial_propietarios` — una fila por cambio de dueño (entrada, propietario anterior, nuevo,
  motivo, transacción, marca de tiempo). Es un registro **append-only**: nunca se actualiza ni se
  borra, porque un historial que se puede editar no es auditable.
- `transacciones_reventa` — el dato financiero de cada checkout (publicación, comprador, precio,
  comisión, neto al vendedor, referencia de la pasarela, estado). Separada del historial porque
  responde a otra pregunta: el historial dice *quién tuvo la entrada*, la transacción dice *cuánto
  se movió y con qué referencia en la pasarela*.

`PublicacionReventa` también necesita campos que §12 no lista: `fecha_publicacion`, `fecha_expiracion`,
`comprador_id` y `precio_original` (para poder aplicar el tope del punto 1).

**Sobre RNF-05** (*"campos de tarjeta persistidos en cualquier base de datos propia: 0"*): ninguna de
estas tablas guarda datos de tarjeta. De la pasarela solo se persiste su **referencia de
transacción**, que es un identificador opaco.

---

## 6. Payload y topología de `ENTRADA_TRANSFERIDA` — **sin especificar**

`ENTRADA_TRANSFERIDA` es el único evento de dominio que la documentación nombra (SAD §10.1 paso 6,
C4Diagrams paso 6, diagrama de secuencia, y el PoC-05 lo usa como caso real medido), pero **nunca se
definen sus campos ni el nombre de la cola o el *exchange***. Los únicos nombres concretos del repo
(`entradas.principal`, `entradas.dlq`, `dlx.entradas`) son de prueba, del `dlq.py` del PoC-05.

**Resuelto en el paso 7.** El contrato está publicado en
`App/shared/eventos/entrada-transferida.schema.json` (JSON Schema), con exchange `reventa.eventos`
(topic), clave `entrada.transferida`, colas `reventa.notificaciones` y `reventa.liquidaciones`, y
una DLQ por cola vía `reventa.muertos`. Hay pruebas que comprueban que lo que el servicio emite
valida contra ese esquema.

La propuesta original decía: se define en el paso 7 de la implementación y se publica como contrato en
`App/shared/` (JSON Schema), que es exactamente para lo que esa carpeta existe — su README ya cita
`ENTRADA_TRANSFERIDA` como ejemplo.

El evento se publicará en modo **duradero** (`delivery_mode=2` + *publisher confirms*), que es la
conclusión explícita del PoC-05: *"ni una transferencia de entrada ni una alerta de evacuación
pueden perderse porque el broker se reinició"*. El p95 medido en ese modo (282 ms) está treinta y
cinco veces por debajo del umbral de RNF-17.

---

## 7. Cómo obtiene este servicio los datos del Evento — **no previsto**

Apareció al implementar el modelo de datos. El CU-006 necesita dos datos que **no le pertenecen**:

- si *"el evento permite reventa"* (pre-condición 3, y camino de excepción **CU-006F**);
- cuándo empieza el evento, para calcular la expiración de la publicación (**CU-006D**).

Ambos son atributos de `Evento`, que según el SAD §12 vive en el servicio `eventos-emergencias`, y
el ADR-01 prohíbe leer la base de datos de otro microservicio.

**Propuesta:** una tabla `eventos_referencia` en esta base, con los cinco campos que hacen falta,
mantenida al día consumiendo los eventos que publique el servicio de Eventos en RabbitMQ.

**Por qué no una llamada HTTP síncrona al servicio de Eventos:**

1. **RNF-18** exige que cada microservicio *"pueda probarse de forma aislada, sin levantar los
   demás"*. Una llamada síncrona dentro del checkout haría imposible probar el CU-006 sin tener en
   pie el servicio de Eventos.
2. **CU-006I** ya obliga a manejar el fallo de *un* sistema externo (la pasarela) dentro del
   checkout. Un segundo punto de fallo síncrono empeoraría la Disponibilidad que el propio CU-006
   reclama: *"el mercado secundario debe permanecer operativo especialmente en los días previos al
   evento"*.
3. Es literalmente la consecuencia que el ADR-01 ya aceptó por escrito: *"gestionar consistencia
   eventual entre servicios en vez de transacciones ACID únicas"*.

**Consecuencia asumida:** si un organizador desactiva la reventa de un evento, este servicio puede
tardar unos segundos en enterarse. Es tolerable —impedir publicaciones nuevas no tiene ventana
crítica— pero conviene tenerlo presente.

**Mientras `eventos-emergencias` no exista**, la tabla se puebla con `npm run semilla`.

---

## Cómo se hacen cumplir los umbrales "0 %" y "100 %"

Los RNF del CU-006 no piden "pocos" fallos sino **cero**, y eso cambia dónde tiene que vivir la
garantía. Confiar en que el código de aplicación siempre recuerde comprobarlo no es suficiente:
basta un `save()` de más, en cualquier punto del servicio y en cualquier momento futuro, para
romperlo en silencio. Por eso el esquema lleva estas defensas en el motor:

| Garantía | Mecanismo en PostgreSQL | Requisito |
|---|---|---|
| Una entrada no puede estar publicada dos veces a la vez | Índice único **parcial** `uq_publicacion_activa_por_entrada … WHERE estado = 'ACTIVA'` | RNF-01, y la multiplicidad `Entrada — PublicaciónReventa = 0..1` del SAD §4 |
| El historial no se puede alterar | Disparador `BEFORE UPDATE OR DELETE` que lanza excepción | RNF-11, ASR-07 |
| El reparto del dinero cuadra al centavo | `CHECK (precio = comision + neto_vendedor)` | paso 13 del CU-006 |
| Una venta siempre tiene comprador registrado | `CHECK` de coherencia estado ↔ `comprador_id` | RNF-11 |
| Una transacción aprobada siempre trae la referencia de la pasarela | `CHECK (estado <> 'APROBADA' OR referencia_pasarela IS NOT NULL)` | RNF-05, RNF-11 |
| Una transferencia auditada nunca queda huérfana | `CHECK` de coherencia `motivo` ↔ (`propietario_anterior_id`, `transaccion_id`) | post-condición 3 |

El índice único parcial merece una nota aparte: **no sustituye al bloqueo de Redis**, lo respalda.
Redis (ADR-03) es la primera línea —rechaza al segundo comprador de inmediato y con un mensaje
claro, como pide ASR-01—, pero es un sistema aparte que puede caerse o perder su AOF. El índice
convierte la doble venta en una imposibilidad física del motor aunque Redis falle.

Por el mismo motivo el esquema se gestiona con **migraciones y nunca con `synchronize: true`**:
índices parciales, `CHECK` y disparadores no se deducen de las entidades, así que `synchronize` los
haría desaparecer sin avisar.

---

## 8. ¿La reventa vive solo en el portal web? — **la documentación se contradice**

Apareció al conectar la app móvil. Hay dos afirmaciones incompatibles en el propio SAD:

| Fuente | Qué dice |
|---|---|
| `Diagrams/Archify/05-secuencia.sequence.json`, tarjeta rosa | *"No vive en la app móvil — La reventa solo se gestiona desde el Portal Web Cliente"* |
| `ArchitecturalProposal.tex`, tabla interfaces ↔ microservicios | Mercado Secundario → **Web Cliente** |
| **RNF-14** (Portabilidad) | *"**100 %** de CU del rol Cliente en web y móvil **sobre la misma API**, 0 reglas de negocio duplicadas en el cliente"* |
| **ASR-10** | Consumo uniforme vía API |

CU-006 es un caso de uso del rol Cliente. Si la reventa solo existiera en el portal web, el
porcentaje de RNF-14 no sería 100 % y el requisito quedaría incumplido por diseño.

Además el código ya había resuelto la contradicción por su cuenta:
`app-movil/lib/pages/resale_page.dart` lleva tiempo con un mercado de reventa completo (publicar,
fijar precio, comprar), mientras el comentario de `portal-web-cliente/src/app/core/entradas.service.ts`
sigue afirmando que en el móvil *"la reventa solo se consulta"*.

**Propuesta:** la reventa está disponible **en ambos clientes sobre la misma API**, que es lo que
RNF-14 exige y lo que el código ya hace. La tarjeta rosa del diagrama de secuencia queda obsoleta y
debería corregirse en `05-secuencia.sequence.json` y regenerarse el HTML.

**Lo que esto no cambia:** la API es una sola y el dominio vive entero en el backend. Ningún cliente
decide si una entrada puede revenderse ni cuál es su precio máximo — eso llega calculado en cada
respuesta (`puedePublicarse`, `motivoBloqueo`, `precioMaximo`), justamente para que añadir el
segundo cliente no duplique ni una regla.

---

## 9. Dos límites conocidos de la mensajería — **pendientes para producción**

Aparecieron al implementar los pasos 12 y 13. Ninguno rompe el prototipo, pero los dos habría que
cerrarlos antes de que esto atienda dinero real.

### a) Un evento que no se publica, se pierde

`publicarEntradaTransferida` **nunca lanza**: si el broker está caído lo registra como error y
devuelve `false`. Tiene que ser así — para cuando se llama, el comprador ya pagó y la entrada ya
cambió de dueño, y hacer fallar esa respuesta sería mentirle sobre una compra que sí se completó. El
diagrama de secuencia lo dice: publicar y notificar quedan *"fuera del camino de respuesta"*.

Pero entonces esa venta se queda sin notificación y sin liquidación, y sólo aparece en el log.

**La solución de libro es el patrón *outbox*:** escribir el evento en una tabla dentro de **la misma
transacción** que la venta, y que un proceso aparte lea esa tabla y publique. Así el evento se
guarda o no se guarda junto con la venta, y un broker caído sólo retrasa la publicación en lugar de
perderla. No se implementó porque añade una tabla, un proceso y su propio monitoreo, y el CU-006 ya
demuestra el desacoplamiento sin él — pero es lo que falta para que ASR-07 se cumpla de verdad
cuando el broker falla.

### b) El descarte de duplicados vive en memoria

RabbitMQ entrega **al menos una vez**: un consumidor puede recibir el mismo evento dos veces, por
ejemplo si lo procesó y se cayó justo antes de confirmarlo. Los consumidores lo resuelven con un
`Set` de ids ya procesados, y el id del evento es el de la transacción justamente para eso.

Ese `Set` **se vacía al reiniciar el proceso**, y no se comparte entre réplicas. Con varias
instancias (ASR-06), dos podrían procesar el mismo evento. Para el prototipo es suficiente; en
producción la marca de procesado tendría que vivir en la base de datos —una tabla de ids consumidos,
consultada en la misma transacción que el trabajo—, que es lo que hace la idempotencia real.

---

## 10. Hallazgos de la revisión posterior — **corregidos**

Terminada la implementación, una revisión del código destapó cinco defectos de
corrección. Se documentan porque el más grave rompía justo el requisito que este
caso de uso existe para demostrar, y porque la razón de que se colara es
instructiva.

### El fallo: RNF-01 se cumplía al reservar, no al pagar

`exigirVigente()` comprobaba que **existiera** un bloqueo sobre la publicación,
no que fuera **de quien estaba pagando**. El comentario de la clase afirmaba lo
contrario —*"siempre se comprueba que el bloqueo siga siendo suyo"*—, así que el
código no hacía lo que su propia documentación prometía.

Secuencia, con datos reales: un comprador abre el checkout y tarda más que el
TTL de 120 s; su bloqueo caduca; otro comprador reserva la publicación; el
primero pulsa pagar. Había bloqueo —el del segundo—, la publicación seguía
`ACTIVA`, y el pago pasaba. **Pagando los dos a la vez: 2 cobros, 2
transferencias y 2 códigos QR sobre una sola entrada**, medido.

Agravantes, ambos corregidos: el resultado de `renovar()` —que devuelve `false`
cuando el bloqueo ya no es nuestro— se descartaba, y los `UPDATE` de la
transferencia no llevaban condición de estado, así que la segunda escritura
pisaba a la primera sin error. Curiosamente, la expiración (CU-006D) **sí** tenía
el `UPDATE` condicional, con un comentario explicando por qué hacía falta; en el
checkout, donde importaba más, no estaba.

### Por qué las pruebas no lo vieron

La batería de 50 compradores simultáneos pasaba en verde, y daba una falsa
sensación de garantía: todos atacan `iniciar()`, donde el bloqueo sí funciona.
Ninguna prueba ejercitaba pagar después de que el TTL venciera.

**La lección, que vale más que el arreglo:** una prueba de concurrencia solo
cubre el punto exacto donde se aplica. Tener una no significa que el sistema
entero sea seguro frente a concurrencia — significa que ese punto lo es.

Ahora `pruebas/rnf01-concurrencia.py` tiene tres escenarios (reservar, pagar con
la reserva caducada, y pagar los dos a la vez); los dos nuevos fallaban antes del
arreglo y pasan después.

### Los otros cuatro

| Defecto | Consecuencia | Arreglo |
|---|---|---|
| `ack`/`nack` sobre un canal muerto | Reiniciar RabbitMQ durante un `procesar()` producía un rechazo no manejado y **mataba el proceso** | Se pide el canal en el momento de usarlo y se tolera su ausencia; el mensaje se reentrega |
| Sin manejador de cierre de **canal** | Un error de nivel canal lo cerraba dejando la conexión viva: la sonda decía "arriba" y los consumidores quedaban mudos para siempre | `on('error')` y `on('close')` del canal, que rehacen la conexión |
| Estado desconocido de la pasarela → `RECHAZADO` | Un `PENDIENTE` o `EN_REVISION` se daba por "seguro que no se cobró", justo lo que el adaptador dice no hacer | Todo lo que no sea `APROBADO`/`RECHAZADO` es `INDETERMINADO`; también 408 y 429 |
| `retirar()` ignoraba el bloqueo de checkout | El vendedor podía retirar una entrada con un cobro en vuelo y acabar vendiéndola igual, sin error | Se rechaza con CU-006H, como ya hacía la expiración |

### Pendientes menores, no corregidos

- Al arrancar **sin broker**, el temporizador de reintento del consumidor y el
  aviso de reconexión pueden suscribirse dos veces a la misma cola: `prefetch`
  efectivo de 2 y una etiqueta de consumidor sin cancelar al apagar.
- El `Set` de eventos ya procesados **no se purga nunca**. Además de perderse al
  reiniciar (ya anotado en §9), crece de forma monótona.
- El endpoint de mantenimiento de expiración **no toma el bloqueo de tarea**. No
  corrompe nada —el `UPDATE` es condicional— pero duplica trabajo si coincide
  con el ciclo programado.

---

## 11. Autenticación: el servicio verifica el token por su cuenta — **ADR-02 lo pone en el gateway**

Hasta ahora la identidad llegaba en `X-Usuario-Id`, que cualquiera podía rellenar con el
identificador de otra persona. ADR-02 y RNF-06 ponen la validación del token en el API Gateway, que
todavía no existe.

**Decisión:** este servicio verifica el token él mismo, con la **clave pública** del Servicio de
Administración (RS256), y consulta en Redis si la sesión fue cerrada. Contrato completo en
`App/shared/seguridad/token-sesion.md`.

**Por qué también cuando exista el gateway:** RNF-06 mide *"endpoints alcanzables sin token válido:
0 %"*. Si la validación viviera solo en el gateway, cualquier camino que lo esquivara —una red
interna mal configurada, una prueba que apunta al puerto directo— llegaría con identidad
falsificable. Verificar aquí cuesta una comprobación de firma y un `EXISTS` en Redis.

**Por qué con clave pública y no con un secreto compartido:** con HS256, este servicio tendría una
clave capaz de **fabricar** tokens de administrador. Con RS256 solo puede verificarlos.

**Por qué la revocación en Redis y no preguntando a Administración:** ADR-03 ya prevé Redis para
"sesiones", el servicio ya depende de él para el checkout, y así un login caído no tumba la
reventa de quien ya tenía sesión. Si Redis no responde se devuelve **503**: aceptar un token sin
poder comprobar si se revocó sería aceptar uno robado justo cuando no se puede saber.

**Autorización por rol:** la reventa exige `Cliente` (el actor del CU-006); el barrido de
mantenimiento, `Administrador`.

**Consecuencia para las pruebas:** los compradores aleatorios no tienen cuenta, así que las suites
fabrican sus tokens con la clave privada de desarrollo (`pruebas/identidad.py`). Y ya no pueden
hacer `FLUSHALL` sobre Redis: borraría las revocaciones de Administración.

**Hallazgo al probarlo:** con Redis colgado (conexión abierta, sin respuesta), las peticiones
esperaban para siempre, porque `maxRetriesPerRequest` y `enableOfflineQueue` solo actúan cuando la
conexión se cae. Se añadió `commandTimeout: 2000`. Afectaba también al checkout.

---

## Errata detectada de paso

El prototipo Angular etiqueta la reventa como **CU-007/CU-008**
(`portal-web-cliente/src/app/core/entradas.service.ts:121`, `core/nav-items.ts:22`,
`entradas/mercado-reventa.component.ts:13`). En la especificación oficial
(`Submission/CU_eventos_completo.xlsx`) **CU-007 es "Gestión de Personal para Eventos"** y **CU-008
"Gestionar Cambios de Turno"**. La reventa es CU-006 y solo CU-006. Son comentarios, no lógica, pero
conviene corregirlos para que la trazabilidad código ↔ caso de uso no engañe.
