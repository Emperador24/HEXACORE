# Entradas en Boletería

Implementación única de los cinco componentes trasladados. Un proceso
`apps/boleteria` atiende `/api/v1/cartelera`, `/cola`, `/compras`, `/reventa` e
`/ingresos`. Se conserva el alcance existente de CU-001–006; este traslado no
completa sus alternativas pendientes ni la garantía transaccional final del plan.

```text
entradas/
  ventas/       compra, promociones, cancelación, autoridad de entrada y API interna
  catalogo/     cartelera/proyecciones de eventos y localidades
  fila/         turnos Redis/Lua y consumo interno único
  postventa/    publicaciones, checkout, compensaciones y consumidores
  acceso-qr/    proyección de QR, ingresos, sincronización y outbox
  compartido/  configuración del programa, adaptador local de Pagos, guardas, QR y concurrencia
```

Cuatro bases conservadas: entradas_mercado_secundario, catalogo, postventa y
acceso_qr. Diez migraciones originales intactas (5/1/1/3); `synchronize=false` y
`migrationsRun=false`. Postventa mantiene su historial **migrations**. No se
trasladan datos entre bases ni se borran las tablas históricas de Ventas.
La consolidación a una base por esquemas sigue siendo obligatoria y posterior.

La configuración usa tokens propios por parte; POSTGRES_BD_VENTAS/CATALOGO/
POSTVENTA/ACCESO_QR eligen cada base, también en la CLI. POSTGRES_BASE no se
usa en estos componentes: una variable antigua no debe apuntar las cuatro
conexiones a una sola base. Los defaults conservan las cuatro bases originales.
TypeORM usa entradas-ventas, entradas-catalogo, entradas-postventa y
entradas-acceso-qr en fábrica, registro e inyecciones. Todos mantienen sus pools
actuales; esta entrega no dimensiona ni certifica réplicas.

Redis, conexión AMQP, JWT, generador QR, adaptador local de Pagos y gestor de
concurrencia tienen un registro por proceso. Dos políticas de sesión conservan
sus diferencias anteriores (Cola/Acceso verifican además iat/exp/jti y cabecera
estricta); ninguna firma tokens. Identidad conserva la firma. Un scheduler
registra los dos cron; permanecen dos outbox porque pertenecen a bases distintas.
El Redis común se cierra después de drenar cron, outbox y consumidores.

Postventa importa el contrato `ventas/api-ventas.ts`, no sus entidades ni
repositorios. El adaptador local reutiliza la guarda interna, DTO, validación y
respuestas del controlador existente. La fábrica exige ese adaptador; el cliente
HTTP anterior queda como transporte compatible probado por sus unitarias, sin
utilizarse en el programa. La integración fija VENTAS_URL en un puerto inaccesible
y comprueba publicación, transferencia y devolución programada sin HTTP interno.
Las rutas internas HTTP conservan sus guardas y no se publican en el gateway.

La cola, sus exchanges/DLQ y los cinco consumidores conservan nombres, contratos,
reintentos y deduplicación existentes. Se prueban arranque/reconexión sin duplicar
consumidores y cierre/drain. Publicar un mensaje no acredita un correo recibido
ni abono real al vendedor: los consumidores de reventa aún registran esas acciones.

**Ventanas conservadas:** QR y estado de ingreso en Ventas siguen siendo
proyecciones/eventos. Después de transferir puede persistir temporalmente el QR
anterior en Acceso; una publicación puede figurar EXPIRADA antes de liberar su
entrada. No hay atomicidad entre bases ni garantía inmediata por compartir
proceso. Fallar una compensación puede requerir intervención; no se añade un
recuperador en este traslado. F12/F13/F14 permanecen pendientes.

Instalación/arranque/migraciones: [workspace](../../README.md).
Pruebas reales, límites y repetición: [integración aislada](../../test/boleteria/README.md).
Los guiones históricos de `*/pruebas` conservan aserciones y rutas adaptadas,
pero algunos resiembran/truncan datos habituales: no forman parte de esa ejecución.

PagosModule se importa por su API pública desde el adaptador de Entradas. Ventas y
Postventa mantienen solicitante=entradas, claves y referencias originales. La quinta
conexión finanzas-pagos apunta al mismo libro pagos que Núcleo; no añade endpoints.
Solo Núcleo recibe el webhook. La migración financiera es una tarea única previa
a los dos programas. Repetir un pago de compra PAGADA o cancelar una CANCELADA
mantiene el 409 existente y no duplica cobro/entradas/reembolso; la API financiera
sí devuelve resultados terminales guardados con repetida=true.
