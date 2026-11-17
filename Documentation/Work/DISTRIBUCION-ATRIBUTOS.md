# Distribución de atributos de calidad — HEXACORE

16/11/2026 · Samuel Emperador · versión editable: [documento compartido](https://claude.ai/artifact/DPejGAzrQTYRqhiKKtRGxM)

Cada atributo tiene un único responsable, que lo presenta en vivo y responde por él en la nota individual.

## Asignación

Esta tabla es la base de la diapositiva de asignación. Cada integrante debe confirmarla por escrito en el grupo.

| Atributo | Responsable | RNF del SAD que lo miden | Demostración mínima que espera el profesor |
| --- | --- | --- | --- |
| Desempeño (pruebas de carga) | Samuel | RNF-07, RNF-08, RNF-10 | Ejecutar una prueba de carga en vivo y mostrar e interpretar su reporte |
| Disponibilidad (pruebas de resiliencia) | Samuel | RNF-03, RNF-04, RNF-09, RNF-17 | Balanceo de carga entre réplicas; dar de baja réplicas y que el sistema siga funcionando y se restablezca |
| Monitoreo y logs | Samuel | RNF-19 | Dashboard con el estado de las instancias (CPU, memoria) y acceso a los logs desde el mismo punto de entrada |
| Desplegabilidad (tiempo de ciclo, repetibilidad) | Diego | RNF-15 | Un cambio visible, merge a `main`, GitHub Actions despliega solo y el cambio aparece en la app, sin un solo clic |
| Comprobabilidad (cobertura de pruebas) | Diego | RNF-18 | Reporte de cobertura al 100 % de los servicios, dentro de GitHub Actions |
| Seguridad (escaneo OWASP) | Sebastián | RNF-05, RNF-06 | Escaneo OWASP en GitHub Actions con su reporte, sin vulnerabilidades críticas |
| Safety (transacciones seguras) | Sebastián | RNF-01, RNF-02, RNF-11 | Mostrar en el código el proceso que verifica, después de ejecutarse, que las transacciones con dinero quedaron bien |
| Modificabilidad (configuración sin recompilar) | Sebastián | RNF-13 | Cambiar varios parámetros (puerto y otros) por archivo de configuración o línea de comandos, sin recompilar |
| Integrabilidad (pasarela de pagos) | Daniel | RNF-16 | Protocolos de conexión internos y con sistemas externos; el pago con la pasarela funcionando, en detalle |
| Usabilidad (arquitectura de información) | Daniel consolida; todos aportan | RNF-12, RNF-14 | Para cada grupo de pantallas, el patrón de arquitectura de información que siguió (secuencial, jerárquico, matricial, etc.) |

## Requisitos no funcionales por atributo

Los 19 RNF del SAD quedan cubiertos: cada uno tiene un atributo y un responsable que lo explica en la sustentación. Un RNF es la versión medible del atributo: dice qué tiene que pasar y con qué umbral se considera cumplido.

| RNF | Qué exige | Umbral (medida) | Atributo | Responsable |
| --- | --- | --- | --- | --- |
| RNF-01 | Una entrada en reventa no se vende a dos compradores (CU-006) | 0 ventas duplicadas con 50 compras simultáneas de la misma publicación | Safety | Sebastián |
| RNF-02 | Al transferir una entrada, el QR anterior queda invalidado antes de emitir el nuevo (CU-006) | 0 QR antiguos aceptados tras una transferencia | Safety | Sebastián |
| RNF-03 | El sistema sigue atendiendo si cae una instancia de cualquier servicio | Disponibilidad mensual del gateway ≥ 99,9 % (máx. 43 min caído al mes) | Disponibilidad | Samuel |
| RNF-04 | Tras la caída de una instancia, el sistema se recupera solo | ≤ 30 s hasta volver a responder el 100 % de las solicitudes | Disponibilidad | Samuel |
| RNF-05 | El sistema nunca guarda datos completos de tarjetas | 0 campos de tarjeta en bases propias; el cobro lo hace la pasarela | Seguridad | Sebastián |
| RNF-06 | Toda petición pasa autenticada y autorizada por rol desde el gateway | 0 % de rutas de negocio alcanzables sin token válido | Seguridad | Sebastián |
| RNF-07 | La consulta de disponibilidad de entradas responde rápido en la apertura de venta (CU-001) | p95 ≤ 500 ms con 2 000 usuarios concurrentes | Desempeño | Samuel |
| RNF-08 | Validar el QR en la puerta no genera filas (CU-002) | p95 ≤ 300 ms por validación | Desempeño | Samuel |
| RNF-09 | Aforo y ocupación se reflejan casi de inmediato tras un ingreso o salida (CU-019, CU-025) | ≤ 2 s entre el evento y su reflejo en el tablero | Disponibilidad (tiempo real) | Samuel |
| RNF-10 | Entradas (Boletería) escala horizontalmente sin degradar otros dominios | Al duplicar instancias, rendimiento ≥ 1,7× | Desempeño (escalabilidad) | Samuel |
| RNF-11 | Toda operación financiera queda auditada (CU-006, CU-031) | 100 % con actor, hora, id. de transacción y resultado; retención ≥ 1 año | Safety | Sebastián |
| RNF-12 | Un cliente sin capacitación compra una entrada (CU-001) | ≥ 80 % de éxito con 5 usuarios, en ≤ 5 pasos | Usabilidad | Daniel |
| RNF-13 | Un cambio de reglas de un dominio no obliga a tocar otro servicio | 1 servicio modificado por cambio típico (más el contrato si cambia) | Modificabilidad | Sebastián |
| RNF-14 | Todo lo del rol Cliente está en web y en móvil sobre la misma API | 100 % de CU del Cliente en ambas; 0 reglas duplicadas en el cliente | Usabilidad (portabilidad) | Daniel |
| RNF-15 | Una versión nueva se despliega sin interrumpir el servicio | 0 solicitudes fallidas; despliegue ≤ 10 min y reversión ≤ 5 min | Desplegabilidad | Diego |
| RNF-16 | La pasarela de pagos se cambia por otra sin tocar la lógica de negocio | Solo el adaptador cambia; 0 cambios en Entradas | Integrabilidad | Daniel |
| RNF-17 | Al activar una evacuación, todo el personal en campo recibe la instrucción (CU-010) | ≥ 99 % de dispositivos en ≤ 10 s | Disponibilidad (aviso crítico) | Samuel |
| RNF-18 | Cada servicio se prueba aislado, sin levantar los demás | Cobertura de dominio ≥ 70 % y 100 % de dependencias externas con dobles | Comprobabilidad | Diego |
| RNF-19 | Operación ve consumo y logs de cada instancia desde un solo punto de entrada | CPU, memoria, réplicas y logs del 100 % de servicios tras el gateway, muestras ≤ 5 s | Monitoreo y logs | Samuel |

Tres decisiones de reparto que conviene poder explicar:

- **Safety:** el profesor pidió la versión centrada en transacciones con dinero. Por eso lo miden RNF-01, RNF-02 y RNF-11: no vender dos veces, invalidar el QR viejo y auditar cada pago. RNF-17 es Safety física (evacuación); como su riesgo es que el aviso no llegue a tiempo, lo mide Samuel junto con la disponibilidad.
- **Tiempo real (RNF-09)** y **escalabilidad (RNF-10)** no están en la lista del profesor: van con disponibilidad y desempeño, que usan las mismas réplicas, el mismo tablero y las mismas pruebas.
- **Portabilidad (RNF-14)** va con usabilidad: los dos se demuestran recorriendo las pantallas de web y móvil.

## Reglas comunes

El bloque de atributos ocupa el resto de la hora, después de los 10 minutos de arquitectura y los 10 de demostración del prototipo. Estas reglas aplican a todos:

- **Cada atributo lo presenta su responsable.** El profesor dijo que esto define la nota individual: quien no tenga su atributo listo responde por él.
- **Todo automatizado.** La única excepción es la prueba de carga, que se puede ejecutar manualmente.
- **Diapositivas y demostración en vivo.** Cada atributo lleva su diseño en diapositivas y una demostración funcionando, no solo capturas.
- **Todos los atributos vistos en clase deben estar en el prototipo.** Los que el profesor detalló por Teams son los que piden validación más exhaustiva, pero no excluyen a los demás.
- **Diseño en el SAD.** Cada responsable escribe en el SAD actualizado el diseño de su atributo: escenario, tácticas, implementación y evidencia.
- **Aprovechar el tiempo en paralelo.** Lo que tarda varios minutos, como el pipeline, se deja corriendo en un computador aparte mientras se muestra otra cosa.

## Samuel

### Desempeño (pruebas de carga)

**Lo que pidió el profesor.** Ejecutar una prueba de carga en el momento y mostrar su reporte. No le interesa que los resultados sean óptimos, porque las condiciones de despliegue no siempre lo son. Le interesa ver que la prueba se hace, que produce resultados y que se interpretan: por qué unas cosas salieron bien y otras mal. Optimizar queda fuera del alcance de esta entrega.

**RNF que lo miden y lo medido** (16/11/2026, un portátil de 11 núcleos con todo el sistema en Docker; informes en `App/infra/informe-atributos/`):

- **RNF-07 · Consultar la disponibilidad en la apertura de venta (CU-001).** Cuando abre la venta de un evento, miles de personas consultan a la vez cuántas entradas quedan. Umbral: p95 ≤ 500 ms con 2 000 usuarios. **Medido:** p95 de 197 ms con 200 usuarios y 0 fallos (`CARGA-boleteria-1-replica.md`). No se llegó a 2 000: en un solo portátil el generador de carga compite por la CPU con lo que mide.
- **RNF-08 · Validar el QR en la puerta sin filas (CU-002).** Cada escaneo bloquea la fila de la entrada, suma al aforo y deja el ingreso y su aviso, en una sola transacción. Umbral: p95 ≤ 300 ms. **Medido:** p95 de 51 ms con 10 lectores validando sin pausa (unas 500 validaciones/s); desde 50 lectores simultáneos supera los 300 ms. Una puerta real valida mucho menos: 40 accesos a un escaneo cada 3 s son unas 13 validaciones/s. El límite es que todas las validaciones de un evento actualizan la misma fila de aforo.
- **RNF-10 · Escalar Entradas (Boletería).** Al duplicar las instancias, el rendimiento debe crecer ≥ 1,7× sin afectar a los demás. **Medido con Boletería ×2** (`CARGA-boleteria-2-replicas.md`): las lecturas suben 1,12× (CU-001, de 1 645 a 1 840 peticiones/s) y 1,26× (CU-006), sin llegar a 1,7×. Las dos réplicas ya trabajan al 90–99 % de un núcleo, pero el portátil también corre el gateway (≈ 130 %), PostgreSQL (≈ 90 %) y el generador de carga, así que no es una duplicación limpia. En la validación de QR la segunda réplica no ayuda: el límite es PostgreSQL (100 %), porque todas las validaciones de un evento actualizan la misma fila de aforo. Con el Núcleo, el mismo ensayo dio 1,82× en CU-025.

**Cómo leer el reporte en vivo.** Hasta cierto número de usuarios el rendimiento sube; después se queda quieto y cada usuario más solo espera en cola (ley de Little). El tablero muestra por qué: el proceso Node del servicio llega a un núcleo de CPU, su techo, y por eso replicar ayuda en las lecturas.

**Cómo debería verse la demostración.**

1. Explicar el escenario: qué operación se carga y por qué (por ejemplo, la consulta del catálogo al abrir una venta).
2. Lanzar la prueba en vivo, a través del gateway, con concurrencia creciente.
3. Mostrar el reporte generado: latencias p50, p95 y p99, peticiones por segundo y errores.
4. Interpretar: dónde se degrada, qué cuello de botella aparece y qué se haría para mejorarlo.

**Es la única demostración que puede ser manual.**

### Disponibilidad (pruebas de resiliencia)

**Lo que pidió el profesor.** Como mínimo: balanceo de carga, recarga de réplicas y dar de baja réplicas mostrando que el sistema sigue funcionando. También que, si algo se cae, se pueda restablecer.

**RNF que lo miden y lo medido:**

- **RNF-03 · Seguir atendiendo si cae una instancia.** Umbral: disponibilidad mensual del gateway ≥ 99,9 %. Un porcentaje mensual no se mide en una demostración; lo que se demuestra es su mecanismo: con una réplica muerta (`kill -9`) el gateway sigue repartiendo entre las vivas. **Medido en un computador:** 484 lecturas a Boletería ×3 y 509 al Núcleo ×2 en los 8 s tras la caída, 0 fallidas.
- **RNF-04 · Recuperarse solo.** Umbral: ≤ 30 s hasta volver a atender todo. **Medido:** Docker reinicia la réplica y vuelve al reparto en 8–13 s, sin intervención.
- **RNF-09 · El tablero refleja un ingreso en ≤ 2 s (CU-019, CU-025).** Se cronometra desde que se registra el ingreso hasta que el panel en vivo lo muestra. **Medido:** máximo 1,01 s en el panel del parqueadero y 1,12 s en el de monitoreo (QR → RabbitMQ → Operación), 20 de 20 ingresos en cada uno. Para lograrlo, los paneles pasaron de actualizarse cada 3 s a cada 1 s, y la bandeja de salida de Acceso QR pasó de publicar unos 50 avisos/s a unos 1 700/s: con la versión anterior, en un pico de ingresos el panel se atrasaba minutos.
- **RNF-17 · La evacuación llega al personal (CU-010).** Umbral: ≥ 99 % de los dispositivos en ≤ 10 s. **Medido:** 300 teléfonos simulados, consultando cada 4 s como la app móvil: 300 de 300 la vieron en ≤ 4 s (p95 3,8 s). Con una réplica del Núcleo muerta en el instante de la activación, también 300 de 300. No cubre teléfonos sin señal ni con la app cerrada: eso requiere notificaciones push o SMS reales.

**Entre computadores (ZeroTier).** La demostración en vivo usa tres equipos en una red ZeroTier privada (`192.168.193.0/24`): A, el Mac de Samuel, con datos, gateway y una réplica de Núcleo y Boletería; B, la VM de la Javeriana, con otra réplica de cada uno; C, el Mac de Sebastián, como cliente que mide. Se apaga B y C sigue atendido por A. A es el punto único de falla: no se apaga. La VM llega a A por un relevo de ZeroTier (unos 124 ms por ida y vuelta), así que sus réplicas responden más lento que las de A.

**Cómo debería verse la demostración.**

1. Mostrar varias réplicas del servicio corriendo detrás del gateway.
2. Evidenciar que el gateway reparte las peticiones entre ellas.
3. Dar de baja una réplica en vivo y mostrar que el sistema sigue atendiendo.
4. Mostrar que la réplica caída se restablece sola, sin intervención manual.

### Monitoreo y logs

**Lo que pidió el profesor.** Un dashboard con el estado de las instancias, en gráficos: uso de CPU, uso de memoria y similares, todo habilitado. Los logs también deberían poder consultarse desde ese mismo punto de entrada.

**RNF que lo mide:**

- **RNF-19 · Consumo y logs de cada instancia desde un solo punto.** Umbral: CPU, memoria, réplicas vivas y logs del 100 % de los servicios, por el gateway, con muestras cada ≤ 5 s. **Implementado:** Prometheus toma una muestra cada 2 s, Grafana refresca cada 5 s y se abre en `/grafana/` del mismo gateway que la API. Los logs de todos los contenedores llegan por Promtail a Loki y se filtran por servicio en el mismo tablero. Grafana pide usuario y contraseña: los logs muestran rutas, réplicas y errores.

Límites que conviene decir: no hay alertas automáticas, la retención es de 2 días y todo corre en un nodo, así que si cae la máquina cae también el monitoreo.

**Cómo debería verse la demostración.**

1. Abrir el dashboard y mostrar CPU y memoria por instancia.
2. Abrir los logs desde la misma entrada.
3. Ideal: usarlo como evidencia de los otros dos atributos, mostrando la réplica que desaparece al tumbarla y la CPU que sube durante la prueba de carga.

## Diego

### Desplegabilidad (tiempo de ciclo, repetibilidad)

**Lo que pidió el profesor.** Ver el pipeline de despliegue en GitHub Actions funcionando, disparado por un evento, por ejemplo un merge a `main`. Todo debe ser 100 % automático: ningún clic más allá del merge.

**RNF que lo mide.**

- **RNF-15 · Desplegar sin interrumpir.** Una versión nueva de un servicio se pone en producción sin que fallen solicitudes. Umbral: 0 solicitudes fallidas durante el despliegue, ventana ≤ 10 min y reversión ≤ 5 min. En la demostración: el pipeline que arranca solo tras el merge cubre la ventana; lo que falta mostrar es que, mientras despliega, la app sigue respondiendo y cómo se vuelve a la versión anterior.

**Cómo debería verse la demostración.**

1. Editar un archivo con un cambio sencillo pero notorio, por ejemplo el texto de la pantalla de inicio.
2. Hacer commit, push y merge a `main`.
3. Mostrar que GitHub Actions se ejecuta solo.
4. Después de unos minutos, mostrar el cambio ya visible en la aplicación que está corriendo.

Como tarda varios minutos, el profesor sugirió dejarlo corriendo en un computador aparte, a la vista, mientras se muestra otra cosa.

### Comprobabilidad (cobertura de pruebas)

**Lo que pidió el profesor.** Cobertura de pruebas al 100 % para los servicios, mostrada como un reporte dentro de GitHub Actions. La cobertura tiene que ser parte del pipeline: la idea es que todo esté automatizado.

**RNF que lo mide.**

- **RNF-18 · Probar cada servicio aislado.** Cada servicio se prueba sin levantar los demás: sus dependencias externas (base, broker, pasarela, correo) se reemplazan por dobles de prueba. Umbral: cobertura de la lógica de dominio ≥ 70 % y 100 % de las dependencias externas sustituibles. El profesor pide más (100 % de cobertura); el reporte en GitHub Actions es la evidencia de los dos.

**Cómo debería verse la demostración.**

1. En la misma corrida del pipeline, abrir el paso de pruebas.
2. Mostrar el reporte de cobertura por servicio o módulo.
3. Explicar qué tipos de prueba lo componen (unitarias, integración, e2e).

La cobertura de cada módulo depende de las pruebas que escriba su dueño; Diego integra el reporte y coordina que todos lleguen a la meta.

## Sebastián

### Seguridad (escaneo OWASP)

**Lo que pidió el profesor.** Que, como parte del pipeline de GitHub Actions, se ejecute la herramienta de OWASP para escanear vulnerabilidades, y que el reporte aparezca en esa misma ejecución, después del despliegue. No quiere ver ninguna vulnerabilidad crítica: todas las críticas deben estar resueltas. Las demás son opcionales.

**RNF que lo miden.**

- **RNF-05 · No guardar tarjetas.** El sistema nunca almacena datos completos de tarjetas: el cobro se delega a la pasarela. Umbral: 0 campos de tarjeta en cualquier base propia.
- **RNF-06 · Todo pasa autenticado por el gateway.** Cada petición a un servicio llega autenticada y autorizada por rol. Umbral: 0 % de rutas de negocio alcanzables sin un token válido.

El escaneo OWASP es la evidencia automática de que no quedan vulnerabilidades críticas; RNF-05 y RNF-06 son lo que ese escaneo y las pruebas de autorización protegen.

**Cómo debería verse la demostración.**

1. En la misma corrida del despliegue, abrir el paso del escaneo OWASP.
2. Mostrar el reporte de vulnerabilidades.
3. Evidenciar que no hay vulnerabilidades críticas y explicar cómo se resolvieron las que hubo.

### Safety (transacciones seguras)

**Lo que pidió el profesor.** Como no hay vidas humanas involucradas, se pide una versión más laxa de safety, centrada en transacciones. Hay que asegurar que las transacciones sensibles, por ejemplo las que involucran dinero, se ejecuten correctamente y se verifiquen después de ejecutarse. Debe existir un proceso posterior de verificación, y se demuestra entrando directo al código.

**RNF que lo miden.** Los tres tratan de dinero o de la entrada que se pagó, que es lo que el profesor llamó transacciones seguras:

- **RNF-01 · No vender dos veces.** Una entrada publicada en reventa no puede quedar vendida a dos compradores (CU-006). Umbral: 0 ventas duplicadas con 50 compras simultáneas de la misma publicación.
- **RNF-02 · El QR viejo deja de valer.** Al transferir una entrada, el QR anterior se invalida antes de emitir el nuevo. Umbral: 0 QR antiguos aceptados en la puerta tras una transferencia.
- **RNF-11 · Auditar cada operación financiera.** Cada pago, reembolso o reventa deja registro de quién, cuándo, qué transacción y con qué resultado. Umbral: 100 % de las operaciones, con retención ≥ 1 año. Es la base del proceso posterior que verifica que la transacción quedó bien.

RNF-17 también está clasificado como Safety, pero es Safety física (evacuación): lo mide Samuel en disponibilidad.

**Cómo debería verse la demostración.**

1. Explicar qué transacciones con dinero tiene el sistema (pagos, reventa, reembolsos).
2. Abrir el código y mostrar dónde se ejecuta la transacción.
3. Mostrar el proceso posterior que verifica que quedó bien y qué hace si encuentra una inconsistencia.

### Modificabilidad (configuración sin recompilar)

**Lo que pidió el profesor.** Por un lado, que se siguieron buenas prácticas de programación y diseño; nada especial ahí. Sobre todo, que el sistema sea configurable: con sus parámetros por defecto funciona de cierta forma, y al ejecutarlo se puede cambiar ese comportamiento, con el archivo de configuración o con parámetros por línea de comandos, sin recompilar. Por ejemplo, correrlo en otro puerto pasándole un parámetro. Tienen que ser varios elementos parametrizables, no solo uno.

**RNF que lo mide.**

- **RNF-13 · Un cambio toca un solo servicio.** Un cambio típico en las reglas de un dominio no obliga a modificar ni redesplegar otro servicio. Umbral: 1 servicio modificado (más el contrato de API solo si este cambia). La configuración por variables y línea de comandos que pide el profesor es la otra mitad: cambiar el comportamiento sin recompilar.

**Cómo debería verse la demostración.**

1. Arrancar el sistema con su configuración por defecto.
2. Detenerlo y arrancarlo cambiando el puerto por línea de comandos o por el archivo de configuración.
3. Repetir con otros parámetros (por ejemplo, conexión a base de datos, Redis o tiempos de espera) y mostrar que el comportamiento cambia sin recompilar.

## Daniel

### Integrabilidad (pasarela de pagos)

**Lo que pidió el profesor.** Mostrar cómo se conecta el sistema: los protocolos de conexión internos y, sobre todo, con sistemas externos. La integración externa actual es la pasarela de pagos, y quiere verla habilitada y funcionando. Aunque el pago ya se haya visto rápido en la demostración de requisitos funcionales, aquí hay que volver a mostrarlo con más detalle.

**RNF que lo mide.**

- **RNF-16 · Cambiar de pasarela sin tocar el negocio.** La pasarela de pagos se puede sustituir por otro proveedor modificando solo su adaptador. Umbral: 1 componente modificado (el adaptador) y 0 cambios en Entradas. En la demostración se ve con el cambio entre la pasarela simulada y Stripe por configuración (`PAGOS_PROVEEDOR`).

**Cómo debería verse la demostración.**

1. Explicar los protocolos internos: HTTP a través del gateway y mensajería con RabbitMQ entre módulos.
2. Explicar la integración externa con Stripe: qué se envía, qué se recibe y cómo se confirma el pago.
3. Hacer un pago en vivo en modo de prueba y seguir el flujo de punta a punta.

### Usabilidad (arquitectura de información)

**Lo que pidió el profesor.** Es la parte más sencilla de todo lo que pidió: nada elaborado. Solo mostrar, para cada grupo de pantallas, qué patrón de arquitectura de información se siguió: secuencial, jerárquico, matricial, etc.

**RNF que lo miden.**

- **RNF-12 · Comprar sin capacitación.** Un cliente nuevo completa la compra de una entrada (CU-001) sin ayuda. Umbral: ≥ 80 % de éxito en una prueba con 5 usuarios, en ≤ 5 pasos desde el evento hasta la confirmación.
- **RNF-14 · Lo mismo en web y en móvil.** Todo lo que hace el rol Cliente está en el portal web y en la app móvil, sobre la misma API. Umbral: 100 % de los casos de uso del Cliente en ambas interfaces y 0 reglas de negocio duplicadas en el cliente.

La tabla de patrones de arquitectura de información explica cómo están organizadas las pantallas; RNF-12 y RNF-14 dicen si eso funciona para un usuario nuevo y en las dos interfaces.

**Cómo debería verse la demostración.**

1. Agrupar las pantallas por interfaz y por flujo (portal web del cliente, portal administrativo, app móvil).
2. Para cada grupo, indicar el patrón y por qué se eligió.
3. Mostrar un ejemplo de cada patrón en el prototipo.

Cada integrante aporta el patrón de sus propias pantallas; Daniel lo consolida en una sola tabla o diapositiva.
