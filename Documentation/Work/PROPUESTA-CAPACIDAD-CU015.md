# Ventana exclusiva para la demo CU-015 en este Mac

**17/11/2026, instantánea 00:44 Bogotá. Propuesta no ejecutada.**

**Actualización posterior del 17/11:** el usuario autorizó la ventana y se
aplicó la pausa ordenada de las 18 aplicaciones. CU-015 completó **1/1** y luego
se restauraron las 18. El contenido inferior conserva la propuesta original;
[el procedimiento y resultado ejecutados](DEMO-CU015-SUSTENTACION.md) prevalecen
para la siguiente sustentación. No se cambiaron recursos del motor.
No se repitieron la línea base, Playwright o la investigación de código/logs.
Solo se consultaron motor local, inventario, una muestra de `docker stats`,
memoria de VM/host y propiedad de directorios.

**El estado actual no ofrece margen adecuado para repetir la demo.** La ventana
propuesta podría hacerlo viable, pero requiere detener aplicaciones acordadas
y medir la reserva resultante; todavía no acredita capacidad suficiente.

## Motor y consumos observados

- Docker local `desktop-linux`: **2912,30 MiB**, 8 CPU virtuales.
- VM: **178,73 MiB disponibles**, swap total 1024 MiB y solo **180 KiB libres**.
- Host: **8 GiB físicos**, swap 4096 MiB/3125,81 MiB usados; la consulta de presión
  informó 34 % libre. Es una métrica del host, distinta de MemAvailable en la VM.
- Disco del checkout: unos **14,4 GiB disponibles**, sin builds propuestos.

| Proyecto | Contenedores activos en inventario/stats | MemUsage agregado |
| --- | ---: | ---: |
| Redash | 7 | **1543,75 MiB** |
| `hexacore-cu015-sebastian` | 11 | **192,19 MiB** |
| `hexacore-infra` — despliegue base anterior | 12 | **154,11 MiB** |
| `hexacore-revision-arquitectura` | 11 | **134,22 MiB** |
| `techos-solares-pdet` — MongoDB | 1 | **29,08 MiB** |
| **Total de la muestra** | **42** | **2053,36 MiB** |

El motor informó 41 activos al inicio; inventario/stats recogieron 42 en momentos
posteriores de esta captura acotada. No es una transacción atómica y hay procesos
reiniciándose. Un valor de 0 MiB durante esa transición no es consumo garantizado.
No se suman los límites de cada contenedor como si fueran memoria reservada.

Las sumas de MemUsage son consumo puntual, no picos ni memoria disponible:
kernel, cachés y swap impiden deducir MemAvailable restando esas sumas al límite
del motor. Tampoco se garantiza que detener un grupo libere exactamente esa cifra.

Hay **tres HEXACORE activos**, con PostgreSQL, Redis y RabbitMQ de proyectos
distintos. CU-015 y revisión comparten el identificador de este checkout, pero
tienen proyectos/volúmenes separados. El base conserva módulos anteriores
(`administracion`, `pedidos`, `eventos-emergencias`, `entradas-mercado-secundario`).
No se necesita investigarlos o reconstruirlos para proponer una pausa local.

Los perfiles de seguridad/parqueaderos, CU-015 regresión, base única/vacía,
trabajador, consolidación, backend y Pedidos E2E están detenidos y no aportan
consumo RAM a esta muestra. Se conservan así, con sus datos. Las dos tareas
`preparacion-base` de CU-015/revisión también permanecen detenidas.

## Propietario y disponibilidad para la ventana

| Recursos | Propiedad local comprobada | Qué falta confirmar antes de una pausa |
| --- | --- | --- |
| CU-015 | Sebastián; directorio HEXACORE, UID 501 | Conservarlo como único recorrido activo. |
| Revisión arquitectura | Usuario `sebastiansanchez`; mismo directorio/checkout | Que no exista otra revisión o usuario utilizándolo. |
| HEXACORE base | Usuario `sebastiansanchez`; mismo directorio de infraestructura | Uso actual y ventana con el equipo HEXACORE; no se asigna a Samuel/Diego por inferencia. |
| Redash | Usuario `sebastiansanchez`, directorio local `~/lab03/redash` | Responsable de uso del laboratorio, consultas activas y tareas programadas; acordar su interrupción temporal. |
| Techos solares | Usuario `sebastiansanchez`, directorio local del proyecto | Se mantiene activo: no hace falta intervenirlo para esta propuesta. |

Se comprobó la propiedad de los directorios con metadatos del sistema de archivos.
Eso no confirma quién usa el servicio ni constituye autorización para pararlo.
Los montajes/IP de Samuel A/B y ZeroTier quedan fuera de esta propuesta.

## Recursos candidatos y margen

**Solo pausar los dos HEXACORE completos ajenos a CU-015** retiraría consumo
observado de **288,33 MiB**. Solo sus aplicaciones representan **166,25 MiB**.
No basta para prometer margen manteniendo Redash: en el cálculo puramente
aritmético, 178,73 + 288,33 serían unos 467 MiB, antes de variaciones, swap y
trabajo nuevo. No se propone ese cálculo como una medición de capacidad futura.

**Opción recomendada para una ventana acordada: detener 18 aplicaciones y dejar
los proveedores de datos encendidos.**

| Grupo a detener ordenadamente | Cantidad | Servicios | Consumo observado |
| --- | ---: | --- | ---: |
| HEXACORE revisión | 6 | Dos portales, gateway, Núcleo, Boletería, Trabajador | **62,35 MiB** |
| HEXACORE base | 7 | Dos portales, gateway, Administración, Pedidos, Eventos/Emergencias, Mercado Secundario | **103,91 MiB** |
| Redash, aplicaciones | 5 | `scheduler`, `worker`, `adhoc_worker`, `scheduled_worker`, `server` | **1523,45 MiB** |
| **Total propuesto** | **18** | | **1689,70 MiB** |

Permanecerían activos los once CU-015, diez proveedores de los otros dos
HEXACORE, PostgreSQL/Redis de Redash y MongoDB de Techos: **24 contenedores**.
Los otros 69 ya detenidos no se arrancan. Se retira carga de aplicación y se
reduce el riesgo de recuperación de datos manteniendo proveedores originales.

Aquí «pausar» significa detención ordenada conservando el contenedor, no congelar
procesos con `docker pause`: el freezer no es un mecanismo para garantizar
liberación de RAM. [Semántica oficial de pause](https://docs.docker.com/reference/cli/docker/container/pause/).

Esta opción saca de ejecución procesos que ahora reportan unos **1,65 GiB**;
es una candidata razonable para una sola demo, no una reserva ya demostrada.
El pico de CU-015 y Chromium, que corre en el host, no está medido por esta muestra.
Si Redash debe seguir completo o no puede acordarse la ventana, **este Mac no
ofrece margen acreditado con la coexistencia actual**. La alternativa es un
equipo dedicado con capacidad comprobada, sin reasignar ni operar A/B desde aquí.

## Preparar, detener y restaurar — procedimiento futuro

1. Reconfirmar la ventana con los responsables anteriores y dejar terminar
   consultas/trabajos activos. Actualizar inventario, estados iniciales, IDs,
   imágenes y montajes justo antes de intervenir; esta instantánea es referencia,
   no una orden para usar IDs antiguos a ciegas.
2. Conservar los proveedores activos. En Redash detener primero el programador,
   permitir que terminen trabajos y después los tres workers y el servidor.
   En los HEXACORE duplicados cerrar ingreso por portales/gateway y detener sus
   backends/consumidores. Usar los contenedores existentes y cierre ordenado;
   si no terminan, dejar la operación pendiente, sin convertirla en un cierre
   correcto ni forzar procesos para obtener memoria.
3. La selección exacta de 18 IDs, imágenes/montajes y los 24 protegidos está en
   el manifiesto privado `propuesta-ids-restauracion.json`. No se ejecutó. No se
   eliminan contenedores, redes o volúmenes; no se usa preparación o recreación
   para detener/reanudar. Una detención con plazo finito puede terminar en
   SIGKILL: el operador debe acordar una política de cierre que conserve trabajo,
   no lanzar un lote ciego. [Semántica oficial de stop](https://docs.docker.com/reference/cli/docker/container/stop/).
4. Medir la reserva tras los cierres antes de permitir un ensayo. Conservar las
   condiciones del diagnóstico: ventana de al menos 60s sin nuevos OOM/reinicios
   ni timeouts concurrentes, con reserva sostenida y los datos de CU-015 intactos.
   No se repite esa comprobación en esta entrega ni se cambia memoria/swap/CPU
   de Docker, HTTP, Playwright o su ritmo 1000/2500.
5. Para restaurar un proyecto, usar **start de sus mismos IDs**, verificando
   previamente imagen y montajes contra el inventario. Sus proveedores siguen
   encendidos; comprobarlos antes de abrir backends. En HEXACORE arrancar backends/
   consumidores y después gateway/portales. En Redash arrancar servidor, workers
   de uno en uno y programador al final. Conservar privados los archivos de
   configuración y credenciales. No arrancar tareas finitas, sembrar o compilar.
6. Restaurar solo grupos que estaban activos y se detuvieron en esa ventana.
   Conservar las tareas de preparación y perfiles previamente detenidos como
   estaban. Verificar datos y acceso de cada proyecto antes de darlo por recuperado.
   Todos los candidatos tienen `unless-stopped`; reanudarlos requiere start
   explícito, sin cambiar esa política. [Políticas oficiales](https://docs.docker.com/engine/containers/start-containers-automatically/).

**Restauración de estados y convivencia son problemas distintos.** Los IDs y
volúmenes permiten restaurar los grupos, pero volver a poner los tres HEXACORE
y Redash completos simultáneamente reproduce la carga sin margen observada.
Tras la demo, acordar qué entorno se usará: puede cerrarse CU-015 conservando sus
datos antes de devolver la ventana a Redash u otro perfil. No se promete una
restauración simultánea estable de todo con 2912 MiB, ni se cambian recursos aquí.

Volúmenes CU-015 protegidos: `hexacore-cu015-sebastian-postgres`,
`hexacore-cu015-sebastian-redis`, `hexacore-cu015-sebastian-rabbitmq`. La propuesta
también conserva los proveedores/volúmenes de los otros proyectos, incluido el
volumen anónimo observado en Redash: no se recrean para reanudar.

Los inventarios y rutas/IDs reales permanecen en un directorio privado nuevo
`capacidad-por-proyecto-20261117-004401/`. Solo se incorpora este resumen.
**No se ejecutó ninguna parada, arranque, cambio de recursos o prueba.**
