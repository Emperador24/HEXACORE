# CU-015 visible para la sustentación

**Comprobado el 17/11/2026, 01:16:57–01:18:56 Bogotá:**

```bash
npm --prefix App/e2e run test:cu015:visible -- --grep "CU-015 por portales"
```

**1/1 aprobado, salida 0, 119,13 s de ejecución total, un intento y cero
reintentos.** No se ejecutó la aceptación completa. La traza registra 67
operaciones de interfaz sin fallos, separación mínima 1002,924 ms, 18 lecturas
de 2500–2504 ms y dos contextos de actor; slowMo nativo cero.

Se mostró de principio a fin: acceso administrativo, registro/persistencia,
duplicado y zona inválida, edición, acceso Cliente, menú/carrito, pago y QR,
regreso al Organizador, deshabilitación con menú abierto, checkout rechazado,
catálogo oculto, rehabilitación y horario cerrado conservando el pedido pagado.

## Preparación que permitió completar el caso

Se mantuvieron el producto, las imágenes y los datos existentes. La modificación
del recorrido es únicamente su configuración demo compartida **1000/2500 ms** y
el mensaje inicial. Las esperas de HTTP/producto y Playwright no se ampliaron.

Se verificó el manifiesto privado de 18 aplicaciones: IDs, imágenes, montajes y
proyectos. Antes del cierre, las consultas de solo lectura no mostraron
transacciones activas ni mensajes RabbitMQ en vuelo en los dos HEXACORE que se
iban a pausar; dos mensajes pendientes por proyecto quedaron en sus brokers.
Redash no tenía hashes de workers RQ vivos; el único registro iniciado estaba
vencido desde hacía horas y su job figuraba encolado. Su cola periódica se
conservó: no se borraron ni cancelaron trabajos.

Se detuvieron ordenadamente cinco aplicaciones Redash y trece de los HEXACORE
base/revisión. Los proveedores de datos siguieron encendidos. Docker esperó sin
escalado a SIGKILL (`--timeout -1`); se usó SIGINT para el programador Redash y
la señal original de cada imagen para los demás. Se conservaron los resultados:
17 cierres 0/143; el gateway base, que ya estaba inestable, terminó con 1. Las
cuatro banderas OOM de Redash eran anteriores y no se presentan como nuevas.

La pausa dejó 24 contenedores activos. En la línea de estabilidad posterior:

| Comprobación | Resultado |
| --- | --- |
| Tres GET del catálogo anterior, separados 30s | 200 y datos válidos en **90,74 / 49,39 / 48,80 ms** |
| MemAvailable VM durante la ventana | **1795–1874 MiB** |
| Swap libre VM | **463–470 MiB** |
| Nuevos OOM/reinicios | **0 / 0** |
| Nuevos timeouts DNS/SQL en logs propios | **0** |

Este cambio de condiciones justificó un nuevo ensayo. El anterior fallo, la
línea base con incidentes y sus evidencias no se eliminaron. La mejora no
identifica RAM como única causa: también se retiró carga concurrente.

## Procedimiento breve para repetir en clase

Usar **este Mac, sus contenedores ya preparados y `.env.local` privada**. No
aplicar estos comandos a Samuel A/B. Antes de la clase, conservar el control
privado `ventana.py`, su manifiesto y credenciales fuera de Git; el resultado
privado del ensayo proporciona la ruta real. No reconstruir ni sembrar.

1. Acordar la ventana sin otros usuarios de esas aplicaciones. Cerrar recorridos
   ajenos y dejar terminar consultas/trabajos activos. El control comprueba RQ,
   transacciones SQL y RabbitMQ; si hay trabajo activo, no continuar. Los
   proveedores permanecen encendidos.
2. Crear una **ventana nueva**, conservando el journal del ensayo anterior:

   ```bash
   CONTROL_VENTANA="<ruta privada del ensayo comprobado>/ventana.py"
   python3 "$CONTROL_VENTANA" nueva
   # Usar la ruta VENTANA_NUEVA impresa; no reutilizar un journal completado.
   VENTANA="<ruta privada nueva impresa>"
   python3 "$VENTANA/ventana.py" trabajos
   ```

   `nueva` registra estados iniciales y vuelve a validar las 18 identidades.
   Rechaza imágenes o montajes distintos. La plantilla local fue comprobada al
   preparar una nueva ventana; no ejecuta una pausa por sí sola.

3. Con salida 0 y sin trabajos ajenos, pausar y comprobar 60s de estabilidad:

   ```bash
   python3 "$VENTANA/ventana.py" pausar
   python3 "$VENTANA/ventana.py" comprobar
   ```

   Si falla cualquier paso, conservar su error, restaurar lo que indique el
   journal y no lanzar ni repetir el recorrido. El control no cambia límites ni
   recursos del motor. Para clase comprueba recursos/salud/logs y no depende del
   catálogo fechado de un ensayo anterior: el caso crea sus fixtures propios por
   las API existentes. No son semillas ni requieren una preparación SQL nueva.

4. Con la ventana aprobada, desde la raíz del repositorio ejecutar **una vez**:

   ```bash
   umask 077
   npm --prefix App/e2e run test:cu015:visible -- --grep "CU-015 por portales"
   ```

   Se abre Chromium visible y se anuncian **1000 ms entre operaciones y 2500 ms
   por etapa lista**. No se necesitan variables de velocidad. El helper enfoca
   al actor activo en el contexto predeterminado y los explícitos, sin duplicar
   pausas con slowMo. Normal/CI mantienen su configuración previa.

5. **Tanto si aprueba como si falla**, restaurar antes de cerrar la ventana:

   ```bash
   python3 "$VENTANA/ventana.py" restaurar
   ```

   Se arrancan los mismos IDs solicitados en esa ventana, de forma escalonada:
   backends/servidor, ingreso/portales, workers uno a uno y programador al final.
   Se comprueban las sondas existentes; no se vuelven a ejecutar tareas finitas.
   Conservar journal, salida, imágenes/montajes y comprobación de datos/acceso.

6. Abrir el informe **`demo-FECHA/informe/index.html` de esa ejecución**. No usar
   por error el informe normal de `.evidencia/informe`. Las trazas y capturas
   contienen datos privados; mantenerlas fuera de Git y no proyectar tokens,
   configuración o credenciales. Si falla, conservarlo y repetir solo tras una
   corrección o cambio de condiciones demostrado.

## Restauración real y límites

Se restauraron **18/18 aplicaciones**. Los **111 contenedores iniciales**
conservaron IDs, imágenes, configuraciones, montajes y estados activo/detenido.
CU-015 terminó con once servicios saludables. No se tocaron las tareas de
preparación inicialmente detenidas ni se operaron A/B o ZeroTier.

El gateway base anterior estaba `unhealthy` al inicio y siguió así: no pertenece
al recorrido dirigido y no se corrigió como parte de esta entrega. Redash agotó
las primeras sondas durante el arranque; después de finalizar todos los grupos,
**`/ping` y `/login` respondieron 200**, sin otro reinicio manual. Se conservan
ambas comprobaciones. Volver a ejecutar todos los proyectos reduce otra vez la
reserva y provoca nuevos OOM globales; no acredita convivencia estable.

**No queda un bloqueo del caso CU-015 en la ventana ensayada.** La condición para
mostrarlo de forma reproducible es disponer de esa ventana exclusiva y verificar
la estabilidad antes de abrir el navegador. La recuperación de la convivencia
completa y el gateway antiguo son límites separados; no se certifica
disponibilidad sostenida o mensual.

Evidencia privada de referencia: `ensayo-cu015-20261117-010715/`, con trabajos,
journal, paradas, línea estable, resultado y restauración. Informe visible:
`.evidencia/demo-2026-11-17T06-16-58-242Z/`. Los originales fallidos permanecen en
sus directorios anteriores. La publicación contiene solo configuración demo y
resúmenes/documentación sin credenciales.
