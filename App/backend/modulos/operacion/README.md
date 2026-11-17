# Operación (Núcleo, por ahora)

Módulo del futuro programa **Operación** (ADR-16: CU-010/019/020). Mientras ese proceso no
existe, se registra dentro del Núcleo. Esquema propio `operacion`; migraciones
`1793900000000-EsquemaOperacionMonitoreo`, `1794100000000-Cu010Evacuacion` y
`1794900000000-Cu020Incidentes`.

## CU-019 · Monitorear el evento

Seguridad SSE de CU-019 y CU-010: se conserva el ciclo de **3 s / 2 s**, con
revalidación JWT/Redis y permisos dinámicos antes de cada emisión y durante la
consulta. Invalidación o fallo termina con un evento saneado `sesion_finalizada`
y EOF; HTTP inicial conserva 401/403/503. Desconexión y apagado liberan la
suscripción. Consultas propias del SSE limitadas a 2 s SQL / 5 s estado, sin
cambiar HTTP normal. La detección es periódica, no instantánea. Contratos y
mediciones: [Seguridad de Operación](../../../infra/informe-atributos/seguridad/AUTORIZACION-OPERACION.md).

| Ruta `/api/v1/monitoreo` | Qué |
|---|---|
| GET `eventos` | Eventos publicados que se pueden monitorear, primero los que están en curso |
| GET `eventos/:id/panel` | Paso 2-4 una vez: aforo, accesos, personal, alertas y decisiones |
| GET `eventos/:id/flujo` | El mismo panel en vivo por **Server-Sent Events**, cada 3 s |
| GET `eventos/:id/alertas` | Historial de alertas, también las resueltas |
| POST `eventos/:id/decisiones` | Paso 7-8: registrar una decisión (cerrar o habilitar acceso, redistribuir personal…) |
| PATCH `eventos/:id/decisiones/:d` | Anotar el resultado de una decisión |

El actor es el **supervisor**; el sistema no tiene ese rol de cuenta (CU-027), así que lo
ejercen Organizador y Administrador.

### Fuentes

- **Aforo y accesos:** cola propia `operacion.ingresos` atada a `acceso.eventos` /
  `ingreso.registrado`, que publica Acceso QR al validar (CU-002). Idempotente por el id del
  ingreso (clave primaria), con DLQ. No le quita mensajes a Ventas: cada uno tiene su cola.
  Solo cuenta ingresos desde que existe la cola; no reconstruye los anteriores.
- **Evento y aforo máximo:** `EventosService` de eventos-recintos (CU-026), interfaz local.
- **Personal:** `CoberturaPersonalService` de Personal/Logística: requeridos, asignados,
  confirmados y presentes (entrada sin salida, CU-018) por zona.
- **Parqueaderos:** resumen de ocupación de CU-025 (`OcupacionService`), si el evento tiene zonas.
- **Incidencias:** resumen en vivo de CU-020 (`IncidentesService.resumenPorEvento`): abiertos,
  sin responsable y por prioridad. Un incidente CRÍTICO abierto dispara la alerta
  `INCIDENTES_CRITICOS` igual que las demás del paso 4.

### Alertas (paso 4)

Se calculan en cada lectura del panel y se guardan una vez por situación (índice único
parcial); cuando la situación desaparece quedan resueltas con su hora. Umbrales en
`UMBRALES` (`panel.service.ts`):

| Alerta | Cuándo | Sugerencia |
|---|---|---|
| `AFORO_ALTO` / `AFORO_COMPLETO` (CU-019A) | ≥ 90 % / ≥ 100 % del aforo | El bloqueo de nuevos ingresos lo aplica Acceso QR (CU-002B) |
| `CONGESTION` (CU-019B) | ≥ 30 ingresos en 5 min por un punto y ≥ 2× el promedio de los demás | Mover personal de las zonas con gente de más; si no la hay, desviar a un acceso activo |
| `ACCESO_SIN_ACTIVIDAD` (CU-019C) | En curso, ≥ 5 ingresos en la última hora y ninguno en 10 min, mientras los demás registran | Cerrar ese acceso y desviar a un acceso activo |
| `PERSONAL_INSUFICIENTE` | En curso, presentes < requeridos en una zona | — |

### Decisiones (pasos 7-8)

Quedan con usuario, fecha, alerta que las motivó y resultado. `CERRAR_ACCESO` exige una
alternativa y la habilita; `HABILITAR_ACCESO` puede abrir una entrada nueva.

**Límite:** cerrar un acceso aquí no impide que Acceso QR siga validando en ese punto; es un
estado operativo del panel. Hacerlo efectivo en la puerta requiere que Acceso QR lo consulte.

`test/operacion/monitoreo.e2e-spec.ts`: 6 escenarios; publica `ingreso.registrado` con el
formato de Acceso QR y lee el flujo SSE real.

## CU-010 · Gestionar evacuación ante emergencias

| Ruta `/api/v1/emergencias` | Roles | Qué |
|---|---|---|
| GET / PUT `recintos/:id/plan` | Org, Admin | Precondición 1: salidas (con personas/min) y rutas por zona con prioridad |
| GET `eventos` · `eventos/:id/evacuaciones` | Org, Admin | Eventos publicados con su evacuación abierta; historial |
| GET `eventos/:id/activa` | + Personal | Lo que ve el personal en la app: solo una evacuación activa |
| POST `eventos/:id/evacuaciones` | Org, Admin | Pasos 1-6: registra tipo, ubicación, nivel y alcance; devuelve la **propuesta** |
| POST `evacuaciones/:id/confirmar` · `/descartar` | Org, Admin | Paso 7-9: activa y encola los avisos, o descarta la propuesta |
| GET `evacuaciones/:id` (+ `/flujo` SSE cada 2 s) | Org, Admin | Pasos 10-11: zonas, salidas, alertas, avisos y bitácora |
| PATCH `evacuaciones/:id/zonas/:zonaId` | + Personal | Paso 10: personas que quedan / zona evacuada |
| POST `evacuaciones/:id/salidas/:salidaId/bloqueo` | + Personal | **CU-010A**: salida bloqueada → rutas recalculadas y avisos |
| POST `evacuaciones/:id/zonas/:zonaId/ruta` | Org, Admin | **CU-010B**: confirmar la ruta alternativa propuesta |
| POST `evacuaciones/:id/nivel` | Org, Admin | **CU-010D**: escalar; suma zonas, avisa y pide personal adicional |
| POST `evacuaciones/:id/finalizar` · GET `/reporte` | Org, Admin | Pasos 12-13: exige todas las zonas evacuadas; reporte de auditoría |

- **Zonas afectadas (paso 2, CU-010C):** total o nivel 3, todo el recinto; nivel 1, las indicadas;
  nivel 2, además las vecinas en el plano de CU-029 (rectángulos a ≤ 3 % de distancia).
- **Aforo por zona (paso 3):** se **estima** repartiendo los ingresos del evento (copia del
  monitoreo) según la capacidad de cada zona, porque Acceso QR registra la puerta, no la zona. El
  personal lo corrige con sus reportes.
- **Rutas (paso 5):** la de menor prioridad cuya salida está habilitada; sin ninguna, alerta
  crítica `SIN_RUTA`. `ZONA_CONGESTIONADA` (más personas que capacidad) y `SALIDA_SATURADA` (más de
  10 min a su ritmo) proponen una ruta alternativa.
- **Avisos (pasos 8-9):** bandeja `notificaciones_evacuacion` escrita en la misma transacción; el
  `NotificadorEvacuacion` los publica en la cola **de prioridad** `operacion.evacuacion`
  (`x-max-priority` 10; nivel 3 y altavoces adelantan) y los reintenta cada 5 s si RabbitMQ no
  está. Su consumidor hace de pasarela multicanal y marca la entrega (latencia medida).
- **Auditoría:** `bitacora_evacuacion` y el reporte final guardan quién activó y finalizó, el
  estado final de cada zona, los avisos por canal y la línea de tiempo.

**Límites:** no hay sensores; la detección de una salida bloqueada o de congestión llega por el
personal. Los avisos no salen a push/SMS/altavoces reales: la cola es el punto de integración.

`test/operacion/evacuacion.e2e-spec.ts`: 3 escenarios con cola real.

## CU-020 · Gestionar incidentes

| Ruta `/api/v1/incidentes` | Roles | Qué |
|---|---|---|
| POST `eventos/:eventoId/incidentes` | Personal, Org, Admin | Paso 1-3: registra tipo/ubicación/descripción; el sistema asigna prioridad inicial y avisa al supervisor |
| GET `eventos/:eventoId/incidentes` | Personal, Org, Admin | Listado ordenado por atención: prioridad, luego antigüedad (CU-020A) |
| GET `incidentes/:id` | Personal, Org, Admin | Detalle con su bitácora completa (paso 9) |
| PATCH `incidentes/:id/prioridad` | Org, Admin | **CU-020A**: reclasificar la prioridad |
| POST `incidentes/:id/responsable` | Org, Admin | Paso 5-6: asigna responsable (pasa a EN_ATENCION) y lo notifica |
| PATCH `incidentes/:id/avance` | Personal, Org, Admin | Pasos 7-8: EN_ATENCION o RESUELTO |
| POST `incidentes/:id/cerrar` | Personal, Org, Admin | **CU-020B**: cierra directo, con nota de resolución, sin escalar |

- **Prioridad inicial (paso 2):** `clasificarPrioridadInicial` revisa palabras clave del tipo
  reportado (incendio, médica, estructural → CRÍTICA; robo, violencia → ALTA; objeto perdido,
  leve → BAJA; el resto, MEDIA). El supervisor la puede corregir después (CU-020A).
- **Notificaciones (pasos 3 y 6):** mismo patrón que CU-010 — bandeja `notificaciones_incidentes`
  escrita en la misma transacción y publicada por `NotificadorIncidentes` en la cola de
  prioridad `operacion.incidentes` (un CRÍTICO se entrega antes que uno de prioridad BAJA).
- **Ciclo:** ABIERTO → (asignar responsable) → EN_ATENCION → RESUELTO → CERRADO. CU-020B permite
  saltar directo a CERRADO desde cualquier estado abierto, sin pasar por los intermedios.
- **Auditoría (paso 9):** `bitacora_incidentes` guarda cada paso (creación, reclasificación,
  asignación, avance, cierre) con quién y cuándo.
- **Integración con CU-019:** `PanelService.panel` consulta `resumenPorEvento` y agrega la
  alerta `INCIDENTES_CRITICOS` cuando hay al menos uno abierto.

`test/operacion/incidentes.e2e-spec.ts`: 8 escenarios con cola real (incluida la entrega de los
avisos al supervisor y al responsable).
