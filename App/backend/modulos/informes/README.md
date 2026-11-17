# Informes: CU-032 (Gestión de Reportes y Analítica del Evento)

Dashboard con métricas de un evento (ventas, ocupación, ingresos, personal,
incidentes) por rango de fechas, comparativo entre varios eventos (CU-032B) y
exportación (CU-032, pasos 7-8). Sin esquema ni conexión propia: no es dueño
de ningún dato, solo agrega lo que Eventos, Parqueaderos, Personal/Logística
y Operación ya calculan cada uno en el suyo (ADR-16, sin SQL cruzado entre
esquemas, por interfaz local de solo lectura).

```text
informes/
  informes.controller.ts   GET /:eventoId, GET /comparativo, GET /:eventoId/exportar
  informes.service.ts      dashboard, comparativo, exportar
  dto/                      ConsultarDashboardDto, CompararEventosDto, ExportarInformeDto
  comun/                    config (solo JWT; no hay postgres) y guarda re-exportada
```

## Qué sí mide, hoy

- **Ocupación**: `OcupacionService.resumen(eventoId)` (Parqueaderos, CU-025).
  Es un corte del presente, no del rango pedido — por definición, "ocupado"
  es ahora, no en el pasado.
- **Personal**: `AsistenciaService.reporte({eventoId, desde, hasta})`
  (Personal/Logística, CU-009), ya exportado para este CU.
- **Incidentes**: `IncidentesService.informe(eventoId, desde, hasta)`
  (Operación, CU-020): nuevo método, agrega por prioridad y estado dentro del
  rango (abiertos y cerrados; a diferencia de `resumenPorEvento`, que es solo
  lo abierto para el panel en vivo de CU-019).

## Qué falta: Ventas e Ingresos

Ventas (`modulos/entradas/ventas`) no corre en el Núcleo: vive en Boletería,
un programa Node separado (`apps/boleteria`). Informes no puede inyectarlo
por DI — es una frontera de **proceso**, no solo de esquema — y hoy Boletería
no expone una interfaz interna (del estilo `X-Token-Servicio` que ya usa
Postventa) para que el Núcleo le pregunte ventas/ingresos por evento. El
libro de Pagos (`finanzas_pagos.transacciones_pago`) tampoco sirve para esto:
no tiene `eventoId`, solo `solicitante` (el módulo que cobró).

Por eso estas dos categorías siempre llegan con `sinDatos: true` y un mensaje
explícito (CU-032A), nunca con un cero engañoso. Para resolverlo de verdad
haría falta un endpoint interno nuevo en Boletería, simétrico al que ya usa
Postventa — trabajo pendiente, documentado también en
`Documentation/Work/GUIA-EQUIPO-MIGRACION.md`.

## CU-032A y CU-032B

Cada categoría del dashboard es `{ categoria, sinDatos, mensaje }` si no hay
datos suficientes, o `{ categoria, sinDatos: false, datos }` si los hay — un
estado vacío explicado, nunca un error ni un cero que se confunda con un
dato real. El comparativo (`GET /comparativo?eventos=id1,id2`) reconsulta el
dashboard completo de cada evento pedido (mínimo dos, distintos) y los
devuelve juntos.

## Exportación: CSV/JSON, no PDF/Excel binario

Simplificación deliberada (la misma que ya se había tomado para este CU en la
arquitectura de microservicios abandonada, antes de la migración a Núcleo):
el paso "exportar PDF/Excel" del SRS se cumple con CSV (abre nativo en
Excel) y JSON, sin añadir una dependencia de generación de binarios solo para
esto. `GET /:eventoId/exportar?formato=csv|json` (CSV por defecto).

## Permisos

`@RolesPermitidos('Organizador', 'Administrador')` + `@ModuloPermisos('reportes')`:
el SRS nombra ambos actores para este CU (a diferencia de CU-031, que solo
nombra "Administrador Financiero").

## Pruebas

[test/informes/informes.e2e-spec.ts](../../test/informes/informes.e2e-spec.ts)
contra el Núcleo compilado y Postgres real: siembra datos reales en los
esquemas de Parqueaderos y Personal/Logística, y crea un incidente real vía
la API de CU-020, para que la agregación sea sobre datos genuinos, no un
doble en memoria.
