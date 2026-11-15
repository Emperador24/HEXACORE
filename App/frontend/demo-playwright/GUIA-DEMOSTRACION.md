# Guía para presentar la demostración de los casos de uso

Cómo correr en vivo, en la sustentación, la demostración de los casos de uso de Samuel, y qué
decir en cada pantalla. El detalle técnico (variables, qué prepara la demo) está en el
[README](README.md).

## Antes de la sustentación

**El día anterior**, una vez:

```bash
cd App/frontend/demo-playwright
nvm use 22          # Node 22
npm ci
```

**15 minutos antes:**

1. Levanta el sistema, si no está corriendo. En una instalación vacía:
   `cd App/infra && ./iniciar.sh --datos-demo`. En el entorno habitual basta `./iniciar.sh`.
2. Comprueba que todo responde:

   ```bash
   curl -s -o /dev/null -w "gateway %{http_code}\n" http://localhost:8080/api/v1/salud
   curl -s -o /dev/null -w "admin   %{http_code}\n" http://localhost:4201
   curl -s -o /dev/null -w "cliente %{http_code}\n" http://localhost:4200
   curl -s -o /dev/null -w "buzón   %{http_code}\n" http://localhost:3098/correos
   ```

   Las cuatro líneas deben dar `200`.
3. Haz un ensayo sin ventana: `npm run demo`. Si pasan los 8, estás listo, y además te quedan los
   videos del plan B.
4. Cierra pestañas y notificaciones. Pon la pantalla en 1440×900 o más: es el tamaño de la ventana
   que abre Playwright.

La demo se puede repetir cuantas veces quieras: cada corrida crea sus propios datos con un sufijo
nuevo, sin volver a sembrar ni borrar nada.

## En vivo

```bash
cd App/frontend/demo-playwright
npm run demo:ver                                    # los 8 casos, uno detrás de otro (~3 min 30 s)
npm run demo:ver -- casos/05-cu010-evacuacion.spec.ts   # un solo caso
npm run demo:ver -- casos/07 casos/08                  # varios casos, por prefijo
```

- Se abre Chrome y Playwright hace lo que haría una persona.
- Abajo a la derecha, un rótulo dice qué paso del caso de uso se está viendo. **Tú no tienes que
  tocar nada:** tu papel es narrar.
- Cada pantalla se queda como mucho 1,5 s, y entre acciones hay 300 ms. Si necesitas más tiempo
  para explicar, narra mientras corre en lugar de detenerla.

### Si solo hay tiempo para algunos

El grupo tiene 10 minutos de demostración del prototipo en total. Si te tocan unos 2,5 minutos,
corre estos tres, que juntos duran unos 95 s y muestran los dos portales, Núcleo y Boletería:

```bash
npm run demo:ver -- casos/05 casos/07 casos/08      # CU-010, CU-006, CU-028
```

| Si quieres mostrar… | Corre |
|---|---|
| Lo más complejo del dominio | `casos/05` (CU-010 evacuación) |
| Un flujo de cliente, con pago y QR | `casos/07` (CU-006 reventa) |
| Seguridad y cambios en caliente | `casos/08` (CU-028 roles) |
| El CRUD central del que dependen los demás | `casos/01` (CU-026 eventos) |

## Qué decir en cada caso

Las duraciones son las medidas con `demo:ver`.

### 1. CU-026 · Gestión de eventos (~27 s) · portal admin, organizador

| Pantalla (rótulo) | Qué señalar |
|---|---|
| Pasos 1-3 · Datos del evento | El organizador llena nombre, categoría, recinto, fecha y aforo. |
| Paso 4 · Tipos de entrada | Los cupos de las localidades no pueden superar el aforo. |
| Paso 5 · Borrador | Valida el horario contra el recinto, para que no se crucen dos eventos. |
| Paso 6 · Publicar | **Arquitectura:** publica el mensaje `eventos.gestion`, que consumen Catálogo, Ventas, Postventa y Acceso QR. |
| Editar | El cambio de precio queda en el historial, con su versión. |
| CU-026B · Cancelar | Pide el motivo; Ventas recibe el mensaje y devuelve las compras. |

### 2. CU-007 · Personal (~26 s) · portal admin, administrador

| Pantalla | Qué señalar |
|---|---|
| Pasos 1-2 · Cuenta | La ficha se vincula a una cuenta ya verificada (CU-027). |
| Pasos 3-4 · Datos | Documento y correo únicos, rol de trabajo y credencial QR/NFC. |
| Pasos 7-8 · Disponibilidad | Solo aparecen libres quienes tienen el rol y no tienen un turno que se cruce. |
| Paso 9 · Asignar | El empleado recibe el aviso y confirma desde la app móvil. |

### 3. CU-008 · Cambios de turno (~17 s) · portal admin, organizador

| Pantalla | Qué señalar |
|---|---|
| Inicio | Las solicitudes llegan desde la app móvil; la demo las envía por la misma API. |
| Pasos 3-5 · Revisar | El sistema propone reemplazos del mismo rol que estén libres. |
| Paso 6 · Aprobar con reemplazo | El reemplazo debe confirmarlo en la app. |
| CU-008A · Rechazar | El empleado conserva su turno y recibe el motivo. |
| Historial | Cada solicitud guarda quién hizo qué y cuándo. **F14:** cada empleado ve solo sus avisos. |

### 4. CU-009 · Asistencia (~11 s) · portal admin, organizador

| Pantalla | Qué señalar |
|---|---|
| Inicio | Cuatro empleados fichan con su credencial; la demo lo envía como lo haría el lector. |
| Paso 5 · Reporte | Quién está en turno, horas trabajadas, llegadas tarde y salidas anticipadas. |
| Resultado | Andrés llegó 25 min tarde, Camila salió antes y Julián todavía no ficha. |

### 5. CU-010 · Evacuación (~28 s) · portal admin, organizador

| Pantalla | Qué señalar |
|---|---|
| Pasos 1-3 · Registrar | Incendio en la Gramilla: evacuación parcial de nivel 1 (CU-010C). |
| Pasos 4-6 · Propuesta | El sistema calcula zonas, rutas y personas **antes** de avisar a nadie. |
| Pasos 7-9 · Activar | **Arquitectura:** los avisos salen por una cola de alta prioridad, con reintento. |
| CU-010A · Salida bloqueada | La ruta cambia sola a la alternativa. |
| Paso 11 · Escalar | Nivel 2: se suman las zonas vecinas. |
| Finalizar | Queda el reporte de auditoría con la bitácora. |

Si te preguntan: no hay sensores ni canales push/SMS reales. Los avisos se entregan a la app y
quedan registrados.

### 6. CU-024 y CU-025 · Parqueadero (~33 s) · portal admin, administrador y organizador

| Pantalla | Qué señalar |
|---|---|
| CU-024 · Tarifa | Solo el Administrador fija la tarifa, y aplica a las salidas desde ese momento. |
| Zonas | El organizador define dos zonas con su capacidad. |
| CU-025A · Zona llena | Bloquea los ingresos y propone a qué zona redirigir. |
| CU-024 · Salida y cobro | La permanencia se redondea hacia arriba y se multiplica por la tarifa vigente. |
| CU-025 · Redirección | Se anota el resultado y la recomendación vuelve a ser automática. |

### 7. CU-006 · Reventa (~33 s) · portal cliente, Ana (vende) y Bruno (compra)

| Pantalla | Qué señalar |
|---|---|
| Pasos 1-4 · Publicar | El tope de precio evita la especulación. **Arquitectura:** esto corre en Boletería, no en el Núcleo. |
| CU-006B · Retirar | La entrada vuelve a ser de Ana y sale del mercado. |
| Pasos 5-6 · Reservar | Mientras Bruno paga, nadie más puede comprarla (reserva con tiempo límite). |
| CU-006G · Pago rechazado | No hay cargo y la entrada vuelve al mercado. |
| Pasos 7-13 · Pagar | Cambia de dueño y el QR anterior deja de valer. |

### 8. CU-028 · Roles y permisos (~33 s) · portal admin, administrador y una cuenta nueva

| Pantalla | Qué señalar |
|---|---|
| Pasos 1-2 · Roles | Los 4 roles del sistema son fijos; los propios tienen una matriz por módulo y acción. |
| Pasos 3-5 · Rol nuevo | No deja guardar un rol sin ningún permiso. |
| Pasos 6-8 · Guardar | El cambio queda auditado con el administrador. |
| CU-028B · Restringir | **El punto fuerte:** el usuario pierde el acceso en su siguiente clic, sin cerrar sesión. Los permisos viven en Redis y la guarda los lee en cada petición. |
| CU-028A · Eliminar | Un rol con usuarios no se puede eliminar sin decir a qué rol pasan esos usuarios. |

## Plan B

Si algo falla en vivo, **no lo depures delante del jurado.** Abre los videos del ensayo:

```bash
npm run demo:informe      # informe HTML con un video y los pasos de cada caso
```

Los videos quedan en `resultados/`. Si quieres llevarlos aparte, cópialos antes de la clase.

## Problemas conocidos

| Síntoma | Qué hacer |
|---|---|
| `ECONNREFUSED` o la página no carga | El sistema no está arriba: revisa los `curl` del principio. |
| Error de CORS en el portal | Los portales deben estar en los puertos 4200 y 4201. |
| Falla CU-007 al registrar la cuenta | El buzón simulado (`:3098`) no responde. |
| Un caso falla a medias | Vuelve a correr solo ese caso: los datos son nuevos en cada corrida. |
