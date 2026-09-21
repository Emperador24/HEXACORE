# Preparación explícita del inventario Redis

Desde `App/services/pedidos`, con las migraciones aplicadas:

```sh
npx ts-node src/inventario/preparar-inventario.ts <establecimientoId> --compras-detenidas
```

Antes de ejecutarlo, detener checkout, pagos y modificaciones de inventario en **todas** las instancias. El flag declara esa condición operativa; no detiene procesos ni implementa un bloqueo distribuido. No ejecutar desde el checkout, al arrancar el servidor o ante un campo Redis ausente.

El comando lee todos los productos (también inactivos y con cantidad cero) en una lectura consistente de PostgreSQL. Rechaza reservas no cerradas, pedidos `PENDIENTE_PAGO` aunque haya pasado su fecha de expiración, pagos `PENDIENTE`/`FALLIDA` y aprobaciones sin pedido confirmado. No cancela, expira ni modifica esos registros.

Lua crea el hash completo y la marca persistente en una operación. Rechaza stock o marca existentes y reservas residuales del establecimiento. Para el volumen del prototipo, revisa el namespace de reservas durante la operación administrativa: no está diseñado para cargas grandes ni reconstrucción online. Un índice huérfano o datos corruptos bloquean la preparación por seguridad. Un establecimiento sin productos se rechaza porque Redis no mantiene hashes vacíos.

No se sobreescriben cantidades, no se completan hashes parciales y no se reconstruyen reservas. Un timeout puede ocurrir después de aplicar la preparación: no borrar datos ni asumir que no se ejecutó. Si hay datos o compromisos anteriores, deben resolverse fuera de esta operación antes de preparar de nuevo.

El script de reserva exige marca, hash y todos los productos; si falta alguno responde `INVENTARIO_NO_PREPARADO`, sin cargar PostgreSQL. La marca no es un certificado de integridad frente a restauraciones parciales; si Redis pierde datos se detienen compras y se revisa explícitamente.

Las pruebas Redis reales se habilitan con `REDIS_INVENTARIO_PRUEBAS_URL` apuntando a un Redis efímero dedicado. No ejecutar los escenarios de corrupción contra el Redis de desarrollo. Ejecutarlas con `--runInBand` para no intercalar escenarios administrativos de corrupción. No usan `FLUSHDB`.
