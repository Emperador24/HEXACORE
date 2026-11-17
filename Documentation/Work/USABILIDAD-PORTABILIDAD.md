# Usabilidad (RNF-12) y Portabilidad (RNF-14) — consolidación

Responsable de la consolidación: **Daniel Cristancho**, con aportes del equipo
([CIERRE-RUBRICA.md](CIERRE-RUBRICA.md), reparto confirmado). Corte: 16 nov 2026,
sobre `main` en `4cffea3` más los cambios de esta entrega en `feature/daniel`.

Este documento separa tres cosas que no deben confundirse:

1. **Lo verificado por inspección y pruebas automáticas** (código, contratos, tests).
2. **Lo que exige personas** (RNF-12): no se ha ejecutado; aquí queda el protocolo.
3. **Lo que exige el entorno de la demo** (dispositivo, HTTPS): pendiente.

---

## RNF-14 — Portabilidad

> *Toda funcionalidad del rol Cliente está disponible desde web y desde móvil
> sobre el mismo contrato.* Medida: CU del rol Cliente cubiertos por ambas
> interfaces consumiendo la misma API: **100 %**, con **0** reglas de negocio
> duplicadas en el cliente. (ASR-10)

### Alcance: CU con actor Cliente en el SRS

Tomados de `RequisitosCasosUso.tex` (campo *Actores*): CU-001, 002, 003, 004, 005,
006, 011, 013, 014, 021, 022, 024 y 027. En CU-002, 013, 014, 022 y 024 el Cliente
es actor secundario: su parte es **presentar** un QR o recibir avisos, y quien
opera es el personal.

### Matriz de equivalencia

Web = `App/frontend/portal-web-cliente`. App = `App/frontend/app-movil`.
Todas las rutas pasan por el gateway (`/api/v1/...`).

| CU | Parte del Cliente | Contrato (gateway) | Web | App | Estado |
|---|---|---|---|---|---|
| CU-001 Comprar | cola → reservar → pagar | `POST cola/eventos/:id/turnos`, `POST compras` (+`X-Turno-Cola`), `POST compras/:id/pagar` | `core/entradas.service.ts`, `eventos/evento-detalle`, `pago/pasarela-pago` | `services/boleteria_api.dart`, `pages/entradas_page.dart` (`CompraEntradasPage`) | ✅ ambos |
| CU-002 Validar QR | mostrar el QR de la entrada | `GET compras/:id` (entradas con `codigoQr`) | `entradas/mis-compras.component.ts` | `DetalleCompraPage`, confirmación de compra | ✅ ambos |
| CU-003 Cancelar | cotizar → confirmar con el monto | `POST compras/:id/cancelacion/cotizacion`, `POST compras/:id/cancelaciones` | `entradas/mis-compras.component.ts` | `DetalleCompraPage` | ✅ ambos |
| CU-004 Promociones | aplicar / quitar código | `PUT` / `DELETE compras/:id/cupon` | pasarela (`PagoPendiente.cupon`) | `CompraEntradasPage` | ✅ ambos |
| CU-005 Consultar evento | cartelera y detalle | `GET cartelera`, `GET cartelera/:id` | `core/eventos.service.ts` | `boleteria_api.dart` + `EventsPage` | ✅ ambos |
| CU-006 Reventa | publicar, comprar, retirar | `reventa/mis-entradas`, `reventa/publicaciones…`, `reventa/checkout…` | `core/reventa.service.ts` | `services/reventa_api.dart` | ✅ ambos |
| CU-011 Pedidos | establecimientos, menú, checkout, pago | `pedidos/eventos/:id/establecimientos`, `pedidos/establecimientos/:id/productos`, `pedidos/checkout`, `pedidos/:id/pagos` | `core/pedidos.service.ts` | `services/pedidos_api.dart` | ✅ ambos |
| CU-013 / 014 | seguir el pedido y presentar su QR | `pedidos/mis-pedidos[/:id]` | `pedidos/mis-pedidos`, `qr-pedido` | `seguimiento_pedidos_page.dart` | ✅ ambos |
| CU-021 Reservar parqueadero | disponibilidad, reserva, pago | `parqueaderos/eventos/:id/disponibilidad`, `…/reservas`, `parqueaderos/reservas/:id/pagar` | `core/parqueadero.service.ts` | `services/parqueadero_api.dart` | ✅ ambos |
| CU-022 Ingreso/salida | presentar el QR de la reserva | `GET parqueaderos/reservas` | `parqueadero.component` | `parking_page.dart` | ✅ ambos |
| CU-024 Cobro | paga en el punto de salida | lo registra el operador | — | — | ➖ sin pantalla de Cliente en ninguno (por diseño del CU) |
| CU-027 Cuentas | registro, verificación, recuperación, sesión, perfil, contraseña | `cuentas/*`, `sesiones/*` | `core/auth.service.ts` | `services/cuentas_api.dart` | ✅ ambos |

**Resultado: 11 de 11 CU con parte interactiva del Cliente, en ambas interfaces y
sobre el mismo contrato (100 %).** CU-024 no tiene parte interactiva del Cliente
en ninguna de las dos.

### Reglas de negocio duplicadas: 0

Comprobado por inspección en los flujos de la matriz:

- Precio, total, descuento y reembolso los calcula el servidor; los clientes
  solo los muestran. `POST compras` no lleva precio (lo rechazaría
  `forbidNonWhitelisted`).
- El código promocional lo valida el servidor (`PUT compras/:id/cupon`).
- La política de cancelación (porcentaje, entradas no cancelables) llega en la
  cotización y el cliente confirma con ese monto; si cambió, el servidor rechaza.
- Lo que el cliente valida antes de enviar es solo **forma** (largo del motivo,
  formato de placa), no reglas del dominio.

### Qué cambió en esta entrega para llegar al 100 %

Antes del corte, la matriz daba **6 de 11**:

| CU | Web antes | App antes |
|---|---|---|
| CU-001 | ✅ | ❌ simulado (`TicketsPage` + `api_client.dart` con `Future.delayed`) |
| CU-002 | ⚠️ solo número de ticket | ❌ QR fijo en el código |
| CU-003 | ❌ sin pantalla | ❌ simulado (`requestsStore`) |
| CU-004 | ❌ sin pantalla | ❌ simulado, **regla duplicada**: el descuento se calculaba en el teléfono (`requestsStore.validatePromo`) |
| CU-005 | ✅ | ❌ lista fija `_events` y fallo aleatorio simulado |

Cambios:

- **App**: nuevo `services/boleteria_api.dart` (cartelera, cola, compras, cupón,
  cancelación) y `pages/entradas_page.dart` (`CompraEntradasPage`,
  `MisEntradasPage`, `DetalleCompraPage`). `EventsPage` lee la cartelera real.
  Se retiran `TicketsPage` y `services/api_client.dart`. Entrada "Mis entradas"
  en el menú del Cliente.
- **Web**: `EntradasService` suma cupón y cancelación; la pasarela acepta un
  código promocional que aplica el servidor (`PagoPendiente.cupon`); nuevo
  `entradas/mis-compras.component.ts` con QR por entrada y cancelación.

### Evidencia automática

| Prueba | Qué comprueba | Resultado (16 nov) |
|---|---|---|
| `app-movil/test/boleteria_test.dart` | la compra pasa por la Cola y no envía precio; códigos de error del CU; flujo CU-001/004 hasta el QR; CU-003 confirma con el monto cotizado | 4/4 |
| `app-movil`, suite completa | `flutter test` | 82/82 |
| `portal-web-cliente/src/app/core/entradas.service.spec.ts` | cupón PUT/DELETE, cotización y cancelación con monto aceptado; total con descuento del servidor | 5/5 |
| `portal-web-cliente`, suite completa | `ng test --watch=false` | 35/35 |
| `portal-web-cliente` | `ng build` | compila |

### Límites (no se dan por cumplidos)

- **Dispositivo y HTTPS de la demo remota**: la app se probó en emulador
  Android; falta el teléfono físico y confiar en el certificado del entorno A/B/C
  ([PLAN-DEMO-ZEROTIER.md](PLAN-DEMO-ZEROTIER.md)). En `debug`, el
  `network_security_config.xml` admite texto claro solo hacia los hosts de
  desarrollo.
- **Pasarela**: ambos clientes usan los tokens de demostración
  (`tok_ok_*`, `tok_rechazo_*`); la web puede usar Stripe si está configurado, la
  app no.
- **Pedidos (CU-011)**: web y app parten del mismo evento de demostración fijo
  (`e0000001-…`) en vez de elegirlo de la cartelera. Es equivalente entre
  clientes, pero queda anotado para Alimentos.
- **Filtros de la cartelera**: la web filtra por ciudad; la app busca por texto
  en nombre y lugar. Mismo endpoint, distinta presentación.
- **Pantallas de Personal simuladas** (`PromotionsPage`, `RequestsReviewPage`,
  eventos fijos en `AssignShiftPage`): no son del rol Cliente y quedan fuera de
  RNF-14; se dejan señaladas para sus responsables.

---

## RNF-12 — Usabilidad

> *Un cliente sin capacitación previa completa la compra de una entrada
> (CU-001).* Medida: **≥ 80 %** de éxito en prueba con **5 usuarios**, en
> **≤ 5 pasos** desde el evento hasta la confirmación. (ASR-08)

### Estado: sin evidencia humana

**No se ha realizado la prueba con cinco usuarios nuevos.** Las pruebas
automáticas y los recorridos de Playwright demuestran que el flujo funciona,
no que un usuario sin capacitación lo complete. El resultado humano es
**desconocido** hasta ejecutar el protocolo de abajo.

### Lo que sí está verificado: número de pasos por diseño

Contando acciones de la persona desde el detalle del evento hasta ver la
confirmación, con sesión iniciada:

| Paso | Web | App |
|---|---|---|
| 1 | Elegir localidad (y cantidad) | Tocar el evento en la cartelera |
| 2 | "Continuar al pago" (pasa la Cola y aparta) | Elegir localidad (y cantidad) |
| 3 | Elegir medio en la pasarela (viene preseleccionado) | "Continuar al pago" |
| 4 | "Confirmar pago" → "Mis entradas" | "Confirmar pago" → confirmación con QR |
| 5 | "Ver entradas y QR" | — |

Ambos quedan en **≤ 5 pasos**. El código promocional es opcional y añade uno.
Si la persona no tiene sesión, el registro (CU-027) no se cuenta: el RNF mide
desde el evento.

### Protocolo para la prueba con usuarios

- **Participantes**: 5 personas que nunca hayan usado HEXACORE, identificadas
  como P1–P5 (sin nombre ni contacto en el repositorio).
- **Preparación**: cuenta de Cliente verificada por participante; un evento
  publicado con cupo y sin fila; token de pasarela `tok_ok_*`. Mismo dispositivo
  o navegador para todos, anotado.
- **Consigna** (leída igual a todos, sin más ayuda): *"Compra una entrada General
  para el evento X y muéstrame el código para entrar."*
- **Éxito**: la compra queda `PAGADA` y la persona muestra el QR sin ayuda del
  observador, en ≤ 5 pasos y ≤ 5 minutos.
- **Se registra**: tiempo, pasos realizados, errores (toques en lugar
  equivocado, retrocesos), ayudas pedidas y un comentario libre.
- **Cálculo**: éxito = participantes exitosos / 5. Cumple con **≥ 4 de 5**.

Plantilla de resultados (vacía a propósito):

| Participante | Interfaz | Éxito | Tiempo | Pasos | Errores | Ayudas | Observación |
|---|---|---|---|---|---|---|---|
| P1 | | | | | | | |
| P2 | | | | | | | |
| P3 | | | | | | | |
| P4 | | | | | | | |
| P5 | | | | | | | |

---

## Microdemostraciones (sustentación)

**Usabilidad, 45 s.** En la app, con la cuenta de demostración: cartelera →
evento → General × 1 → "Continuar al pago" → "Confirmar pago" → QR. Contar los
pasos en voz alta (4). Cerrar con: *"esto prueba el número de pasos, no el 80 %
con usuarios nuevos, que está pendiente."*

**Portabilidad, 35 s.** La misma lectura autorizada en los dos clientes: abrir
"Mis entradas" en la web y en la app con la misma cuenta y mostrar la misma
compra, el mismo número de ticket y el mismo QR. Señalar en el código que ambos
llaman a `GET /api/v1/compras/:id`.

---

## Pendientes

1. Ejecutar el protocolo RNF-12 o declarar en la sustentación que no se hizo.
2. Probar la app en un teléfono físico contra la URL HTTPS de la demo.
3. Aportes del equipo para la parte de Usabilidad (pantallas y capturas de
   Alimentos, cuentas, roles y recintos: Sebastián), reconociendo la
   implementación de Samuel donde corresponda.
