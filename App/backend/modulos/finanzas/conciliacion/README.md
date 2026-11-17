# Conciliación: CU-031 (Gestión de Pagos y Conciliación Financiera)

Compara el libro propio (`finanzas_pagos.transacciones_pago`, vía `PagosService`)
contra lo que la pasarela externa reporta de sí misma (`ProcesadorPagos.listarTransacciones`),
para un rango de fechas y, opcionalmente, un módulo (`entradas`/`alimentos`/`parqueaderos`).
No reemplaza el libro de Pagos ni vuelve a hablar con la pasarela para cobrar o
reembolsar por su cuenta: reutiliza `PagosService.reembolsar` para el paso 6-9.

```text
conciliacion/
  conciliacion.controller.ts  POST /, GET /, GET /:id, POST /:id/reembolsos, POST /:id/cerrar
  conciliacion.service.ts     solicitar, listar, detalle, procesar (comparación), aprobarReembolso, cerrar
  conciliador.service.ts      outbox: despacha conciliaciones pendientes a la cola y las consume
  job-periodico.service.ts    corrida automática cada CONCILIACION_INTERVALO_MS (24h por defecto)
  topologia.ts                cola finanzas.conciliacion + su DLQ
  dto/                        SolicitarConciliacionDto, AprobarReembolsoDto
  comun/                      config y guarda (SesionValida re-exportado)
  persistencia/               esquema propio finanzas_conciliacion, sin entidades TypeORM (SQL crudo)
```

## Flujo

1. `POST /conciliacion` (pasos 1-2) solo escribe la fila en `conciliaciones`
   (estado `EN_PROCESO`); la comparación de verdad pasa a la cola, nunca
   síncrona en el request.
2. `ConciliadorService` despacha (outbox, `FOR UPDATE SKIP LOCKED` cada 5 s) y
   consume la cola `finanzas.conciliacion`, con DLQ tras 3 intentos.
3. `ConciliacionService.procesar` (pasos 3-5, idempotente: una conciliación que
   ya no está `EN_PROCESO` no se vuelve a comparar) trae en paralelo las
   transacciones del sistema y las de la pasarela, y las empareja por
   `referencia`:
   - Coincide monto/moneda/resultado → `CONCILIADO`.
   - El sistema la tiene pero no coincide, o la pasarela no la reporta →
     `DIFERENCIA`.
   - La pasarela la reporta y el sistema no la tiene → `HUERFANA` (CU-031B).
   - Sin ninguna diferencia ni huérfana → la conciliación se cierra sola como
     `CONCILIADA_AUTOMATICA` (CU-031A).
4. Para un ítem `DIFERENCIA`, `POST /:id/reembolsos` (pasos 6-9) aprueba un
   reembolso administrativo manual: llama a `PagosService.reembolsar` (misma
   lógica de CU-003, misma pasarela), registra el resultado en
   `reembolsos_administrativos`, marca el ítem `CONCILIADO` si se aprobó y
   anota `CLIENTE_NOTIFICADO` en la bitácora.
5. `POST /:id/cerrar` cierra manualmente una conciliación ya procesada
   (`LISTA`); se rechaza mientras siga `EN_PROCESO`.
6. `JobPeriodicoConciliacion` solicita automáticamente una conciliación del
   día anterior cada `CONCILIACION_INTERVALO_MS` (actor sentinela
   `USUARIO_JOB_CONCILIACION`, para que la bitácora distinga lo automático de
   lo pedido por un administrador).

## Permisos

`@RolesPermitidos('Administrador')` + `@ModuloPermisos('reportes')`: el SRS
nombra "Administrador Financiero" como actor, y no hay ese rol en el sistema,
así que se ejerce con `Administrador` (no `Organizador`, a diferencia de otros
CU financieros) más el permiso dinámico `reportes` de CU-028.

## Persistencia

Esquema propio `finanzas_conciliacion` (duodécimo esquema, sin procedencia
histórica), cuatro tablas: `conciliaciones`, `conciliacion_items`,
`reembolsos_administrativos` (FK a `conciliacion_items` con `ON DELETE SET
NULL`: un reembolso ya aprobado no debe desaparecer si el ítem se borra) y
`bitacora_conciliacion`. Todo por SQL crudo vía `DataSource.query()`, sin
entidades TypeORM (mismo estilo que CU-016/020/030).

## Pruebas

[test/finanzas/conciliacion.e2e-spec.ts](../../../test/finanzas/conciliacion.e2e-spec.ts):
contra el Núcleo compilado y la pasarela simulada real (no un doble en
memoria). Cada escenario llama primero a la pasarela —igual que
`PasarelaHttp.cobrar`— y solo después siembra el libro propio, para que la
comparación sea entre dos fuentes de verdad genuinas, incluido un reembolso
real de punta a punta.
