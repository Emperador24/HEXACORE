# Observación del cierre SIGTERM de Núcleo

El hijo del control CU-011 carga `observar.cjs` con
`NUCLEO_OBSERVAR_CIERRE=1`. Es instrumentación del arnés: no cambia `main`, los
hooks de producto, el orden de cierre, los plazos o las aserciones. No llama a
`process.exit` ni cierra recursos. La escucha de SIGTERM es de un solo uso para
conservar la señal final de Nest. El watchdog original sigue haciendo fallar el
control a los **5.000 ms**; no se utiliza su SIGKILL como resultado aprobado.

`CIERRE_NUCLEO` registra inicio/final/duración de los hooks y las fases de Nest,
HTTP, pools PostgreSQL, Redis y canal/conexión AMQP. Mientras cierra, añade hasta
ocho muestras cada 500 ms; toda la salida tiene un máximo de 256 registros.
Incluye solo nombres de clases/métodos, cantidades, estados y tipos de handles.
No copia URLs, direcciones, claves, SQL, comandos, argumentos, mensajes,
identidades ni texto de excepciones. `promesa-registrada` indica la existencia
del objeto Promise; no afirma que siga pendiente. Los hooks abiertos sí se
identifican por su inicio sin final y su duración observada.

`CIERRE_ARNES` mide por reloj monótono el tiempo desde la solicitud de SIGTERM
hasta `exit`, código/señal finales y si disparó el watchdog. Permite distinguir
una espera del hijo de una posible demora de observación del padre; un registro
de SIGKILL solicitado no demuestra por sí solo que el kernel lo entregara.

Desde `App/backend`, con Node 22, dependencias y los cinco proveedores E2E
existentes saludables y preparados, **Redash detenido** y los puertos exclusivos
libres de procesos ajenos:

```bash
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/cu011.e2e-spec.ts --testNamePattern='SIGTERM cierra el único proceso'
```

Ejecuta un control; los otros ocho casos del archivo quedan fuera por el filtro.
`beforeAll` conserva la preparación original del test con fixtures propias y
el hijo real, sin compras/pagos de los casos excluidos. Por eso un aprobado
dirigido no reproduce necesariamente la carga/historia previa de la CI completa.
La evidencia sigue siendo privada en `.evidencia-e2e/cu011.log`; conservarla en
una carpeta por ejecución antes de otro control. No ejecutar repetidamente para
obtener verde. Si no falla, registrar esa limitación y la observación faltante.

Pruebas del observador, sin Docker:

```bash
node --test test/apagado/observar.test.cjs
```

Comprueban carga real de dependencias, silencio antes de señal, semántica
Promise/callback/this/error, fases pendientes y límite de salida sin copiar
argumentos o mensajes privados. Incluyen una fixture sin proveedores externos:
retiene una tarea y una solicitud HTTP, comprueba ocho muestras con fase abierta,
una tarea pendiente y un socket/solicitud activos antes de cinco segundos. Solo
entonces libera la tarea artificial; debe terminar por SIGTERM sin watchdog.
Un watchdog disparado hace fallar esa comprobación, nunca la convierte en un
cierre de producto aprobado. Se verifica también que los marcadores privados
artificiales de URL, cabecera y tarea no aparezcan en la salida.

CI ejecuta estas siete comprobaciones antes de levantar proveedores; el control
CU-011 posterior usa el preload sobre el hijo Núcleo real. Si ese control falla
por plazo, su error incluye los registros `CIERRE_NUCLEO` capturados del hijo,
con las fases y muestras ya emitidas. La salida ordinaria completa permanece en
el log privado; una prueba comprueba esa selección y su límite de 256 registros.
No se publican trazas ni se amplía la lista de artefactos
permitidos. Los logs de diagnóstico requieren leer `CIERRE_NUCLEO` y
`CIERRE_ARNES`, sin interpretar la ausencia de un error como corrección del fallo.
Si el event loop del hijo deja de ejecutar JavaScript, las muestras periódicas
no pueden actualizarse: se conserva el último inicio/muestra y la señal/tiempo
del padre; no se garantiza observación reciente de un proceso congelado.

La alternancia y restauración de estados siguen
[la guía local](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md).
Resultados y limitaciones: [plan](../../../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).
