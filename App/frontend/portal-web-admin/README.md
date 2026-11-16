# Portal Web Administrativo/Operativo

Interfaz web para los roles Organizador y Administrador (SAD §8, vista de contenedores).
Consume el backend únicamente a través del API Gateway (`../../gateway`).

**Stack:** Angular 19 + TypeScript, Angular Material (tema M3 propio en `src/styles.scss`).

## Diseño

Mismo lenguaje visual que el portal de clientes y la app móvil ("Liquid Glass"): fondo con
manchas de color difuminadas (`compartido/fondo-atmosfera.component.ts`), superficies de vidrio
translúcido, Space Grotesk para títulos y Manrope para el cuerpo, botones en píldora con el
degradado azul-violeta de la marca e insignias tintadas para estados, fechas y avatares
(acentos que rotan por fila, `compartido/acentos.ts`). Tema oscuro por defecto y claro con el
botón de la barra superior (`core/tema.service.ts`, se recuerda en el navegador).

El menú lateral flota como una tarjeta de vidrio, agrupado (General, Operación,
Administración) y filtrado por rol; las secciones sin construir aparecen marcadas «pronto».
Por debajo de 960 px se abre encima del contenido. Las acciones irreversibles pasan por un
diálogo de confirmación que pide motivo cuando el servidor lo audita.

Los colores salen de los tokens `--hx-*` de `styles.scss`, que cambian con la clase
`tema-oscuro`; las clases `.panel`, `.estado`, `.mensaje`, `.badge-icono` y `.badge-fecha`
son las piezas comunes.

## Estado

| Sección | Caso de uso | Backend |
|---|---|---|
| Inicio | — | Cifras reales: cartelera y personal |
| Personal › Empleados | CU-007 (pasos 1-5, CU-007A) | Personal/Logística (Núcleo) |
| Personal › Asignación a eventos | CU-007 (pasos 6-12, CU-007C) | Personal/Logística + cartelera |
| Cuentas | CU-027B | Identidad (Núcleo) |
| Eventos | CU-026 (completo) | eventos-recintos (Núcleo) |
| Recintos y zonas | CU-029 | eventos-recintos (Núcleo) |
| Monitoreo | CU-019 | operacion (Núcleo), en vivo por SSE |
| Resto del menú | CU-010, 020, 028, 030-032 | Pendiente |

### CU-026 en el portal

- **Listado** con estado (borrador, publicado, cancelado), cupos y recinto. Crear y editar es
  del Organizador; el Administrador consulta en solo lectura.
- **Formulario**: información general, recinto y horario (si la hora de fin es menor, termina
  al día siguiente), aforo y tipos de entrada con zona. Mientras se edita comprueba el
  traslape con otros eventos publicados del recinto y ofrece horarios libres con un clic, y
  resume el aforo por recinto y por zona. Los errores del servidor señalan la zona en conflicto.
- **Estado**: publicar (con confirmación), cancelar con motivo (advierte la devolución a los
  compradores) y eliminar un borrador nunca publicado. Historial de versiones al lado.
- En un evento publicado el recinto queda fijo y los tipos ya a la venta no se pueden quitar ni
  reducir. Si otra persona guardó antes, avisa y ofrece recargar.
- Publicar o cancelar aún no cambia la cartelera de Boletería: falta que Entradas consuma
  `eventos.gestion` (ver `App/backend/modulos/eventos-recintos/CONTRATO-EVENTOS.md`).

### CU-007 en el portal

El paso 13 de CU-007 (el empleado confirma o rechaza) lo hace el propio empleado en la
app móvil, pantalla de turnos.

- **Alta:** solo el Administrador, porque hay que elegir la cuenta (CU-027) a la que
  pertenece la ficha. Se proponen nombre y correo de la cuenta y una credencial
  aleatoria. Si el servidor rechaza un dato repetido, se marca el campo.
- **Ficha:** edición (solo se envía lo que cambió), desactivar con motivo (cancela sus
  turnos futuros), reactivar, turnos del empleado e historial de auditoría.
- **Asignación:** evento de la cartelera, zonas con su cobertura, horario y la lista de
  candidatos del rol con su disponibilidad o el motivo por el que no lo están. Las
  asignaciones del evento muestran la respuesta del empleado; se pueden modificar
  (otra persona u otro horario) o cancelar con motivo.

## Cómo correrlo

```bash
cd App/frontend/portal-web-admin
npm install
npm start     # http://localhost:4200, contra el gateway en :8080
```

`public/configuracion.js` permite apuntar a otro gateway sin recompilar
(`window.HEXACORE_CONFIGURACION = { api: 'http://host:puerto/api/v1' }`).
Cuentas de la semilla de Identidad: `admin@hexacore.com` (Administrador) y
`organizador@hexacore.com` (Organizador); contraseña de la semilla. Recintos y eventos de
demostración: `npm run semilla:eventos` en `App/backend`.

## Estructura

```
src/app/
├── core/          Modelos, sesión (AuthService), guard, menú, servicios de API
├── compartido/    Diálogo de confirmación y formatos (estados, auditoría, horarios)
├── login/         Inicio de sesión
├── shell/         Menú lateral + barra superior + <router-outlet>
├── dashboard/     Inicio
├── personal/      CU-007: empleados, ficha, asignación a eventos, diálogo de reasignación
├── cuentas/       CU-027B
├── eventos/       CU-026: listado y formulario de eventos
├── recintos/      CU-029: listado, formulario y editor visual del mapa de zonas
├── monitoreo/     CU-019: panel en vivo, alertas y diálogo de decisiones
└── placeholder/   Secciones pendientes
```
