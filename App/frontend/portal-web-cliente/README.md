# Portal Web Cliente

Interfaz web para el rol Cliente (SAD §8, vista de contenedores).

**Responsabilidad:** consulta de eventos, compra y reventa de entradas, reserva de parqueadero,
pedidos de alimentos — consumiendo el backend únicamente a través del API Gateway (`../../gateway`),
sin duplicar lógica de negocio (ASR-10).

**Stack:** Angular 19 + TypeScript, Angular Material.

## Acceso público

La cartelera y el mercado de reventa **se ven sin iniciar sesión**, como en cualquier taquilla: un
visitante puede mirar los eventos, entrar al detalle y ver los precios por zona antes de registrarse.
La sesión se exige solo para lo que es propio del cliente (sus entradas, reservas y pedidos) y para
completar una compra.

Que la compra pida sesión **no está resuelto con un guard de ruta** sino en la acción de comprar: si
fuera un guard, el visitante no podría ni ver los precios, que es justo lo que debe verlo para
animarse a registrarse. Al pedir sesión se pasa `returnUrl`, de modo que al iniciarla vuelve a donde
estaba.

## Diseño

Sigue el sistema visual **"Liquid Glass"** de la app móvil (`../app-movil`), para que web y móvil se
vean como el mismo producto. Los valores están tomados de `app-movil/lib/theme/app_theme.dart` y
`lib/widgets/liquid_glass.dart`:

- **Tipografía:** Space Grotesk (títulos, con tracking negativo) + Manrope (cuerpo).
- **Color:** primario `#2F6BFF`; acentos rosa/cian/ámbar/índigo que rotan por posición en las listas
  (`src/app/shared/acentos.ts`, equivalente a `_rowAccents`).
- **Superficies:** fondo con manchas de color difuminadas y, encima, tarjetas translúcidas con
  desenfoque real (`backdrop-filter`). Por eso ninguna tarjeta es blanca opaca.
- **Componentes:** insignias tintadas (fondo al 16 % del color, borde al 40 %), badge de fecha
  apilado, talón punteado en las entradas.
- **Dos temas, como la app:** **oscuro por defecto**, con las manchas de color intensas de la app, y
  claro opcional. Se cambia desde el ícono del navbar o desde Ajustes → Modo oscuro, y se recuerda.
- **Fondo (`shared/fondo-atmosfera.component.ts`):** cuatro círculos de verdad con `blur(70px)`,
  igual que `AtmosphereBackground`, que crecen con la ventana para conservar la proporción.

Los tokens viven en `src/styles.scss`. **Los componentes no usan colores fijos**: usan variables
(`--hxc-tinta`, `rgb(var(--hxc-texto-rgb) / 0.6)`, `--hxc-vidrio-fondo`, `--hxc-primario-texto`…)
que se redefinen en `html.tema-oscuro`. Un color nuevo escrito a mano se verá bien en un tema y mal
en el otro. **Si cambia el tema de la app móvil, hay que actualizarlos a mano aquí**: están
duplicados y no tienen un origen común.

## Cuentas y sesión (CU-027)

Conectado al **Servicio de Administración** a través del **API Gateway** (<http://localhost:8080/api/v1>, ADR-02), que es la única dirección que conoce el portal:

| Ruta | Qué hace |
|---|---|
| `/login` | Inicio de sesión (pasos 8-9) |
| `/registro` | Registro con rol Cliente (pasos 1-4) |
| `/cuenta/verificar` | Activación con el enlace del correo (pasos 5-7) |
| `/recuperar` | Pedir el enlace de recuperación (CU-027A) |
| `/cuenta/restablecer` | Contraseña nueva con el enlace (CU-027A) |
| `/perfil` | Cambiar el nombre (CU-027C) |
| `/ajustes` | Cambiar la contraseña, tema y cerrar sesión |

`/cuenta/verificar` y `/cuenta/restablecer` son las direcciones a las que apuntan los correos
(`CORREO_URL_BASE_ENLACES` del backend). Al abrirlas, el token se quita de la barra de direcciones, y
la cuenta **no se activa sola**: hay que pulsar el botón, porque algunos programas abren los enlaces
de los correos para revisarlos y gastarían el enlace.

**Dónde viven los tokens** (DECISIONES.md §22 del backend):

- **Acceso** (15 min): solo en memoria. Nunca en `localStorage`, donde cualquier script inyectado
  podría leerlo.
- **Renovación** (30 días sin uso): en una cookie `HttpOnly`, `SameSite=Strict`, limitada a
  `/api/v1/sesiones`. JavaScript no puede leerla. Al recargar la página, la sesión se recupera en
  silencio con ella.

Como en la app, **una sola renovación a la vez**, y una petición que recibe 401 renueva y se repite
una vez. Si la sesión se cerró desde fuera (otro dispositivo, cambio de contraseña, cuenta
desactivada), el portal vuelve al login y dice por qué, también si eso ocurrió con la página
cerrada.

Solo entran cuentas con rol **Cliente**; el resto recibe un mensaje que las dirige a la app o al
portal de administración.

Los mensajes de error vienen del servidor (RNF-14): el portal no repite la política de contraseñas.

## Cómo correrlo

```bash
cd App/frontend/portal-web-cliente
npm install   # si no se hizo ya
npm start     # sirve en http://localhost:4200
```

Necesita el backend en marcha (desde `App/infra`):

```bash
docker compose --profile servicios up -d --build
```

Cuentas de ejemplo con contraseña `hexacore2026`: `cliente@hexacore.com`, `bruno@hexacore.com`,
`carla@hexacore.com` (la crea la semilla del servicio de Administración).

En desarrollo los correos no se envían: están en <http://localhost:3098/correos>, y las pantallas
de activación y recuperación lo recuerdan.

### Prueba de extremo a extremo

```bash
npm run test:login     # con el backend y `npm start` en marcha
```

Maneja un Chrome de verdad: registro, correo, activación, login, sesión tras recargar, perfil,
cambio de contraseña, sesión cerrada desde otro dispositivo (con la página abierta y cerrada),
recuperación, cierre de sesión, mensajes del servidor y el cambio de tema. Comprueba además que
ningún token queda en `localStorage` y que la cookie es `HttpOnly`.

## Estructura

```
src/app/
├── core/            Modelos, sesión real (AuthService), tema, guards, servicios de dominio, PagoService, menú
├── login/           Login del rol Cliente (CU-027)
├── cuenta/          Registro, activación, recuperación y restablecimiento (CU-027, CU-027A)
├── shell/           Navbar de vidrio + <router-outlet> + pie
├── eventos/         CU-001..CU-006 — cartelera con filtros y detalle con compra de entradas
├── entradas/        CU-007..CU-010 — mis entradas (enviar/reventa) y mercado de reventa
├── parqueadero/     CU-021..CU-025 — reservar y consultar reservas
├── pedidos/         CU-011..CU-015 — restaurantes, menú y mis pedidos
├── pago/            Pasarela de pago compartida por los tres flujos de compra
├── perfil/          Nombre editable (CU-027C)
├── ajustes/         Tema, cambio de contraseña, soporte y cierre de sesión
└── shared/          Fondo de manchas, tarjeta de cuenta, medidor de contraseña, acentos, badge de fecha, QR
```

## Estado

**Las cuentas y la sesión son reales** (ver arriba). El resto —cartelera, entradas, reventa,
parqueadero, pedidos, pago— sigue sobre **datos mock**.

El **mercado de reventa (CU-006) ya está conectado** al Servicio de Entradas: publicar, retirar,
reservar con su cuenta atrás y pagar ocurren contra el backend real, igual que en la app móvil
(RNF-14). Lo que sigue simulado de esa pantalla es la **compra original** de la entrada (CU-001),
que todavía no tiene servicio propio.

Limitaciones conocidas:
- **El portal y el API siguen en orígenes distintos** (4200 y 8080), así que el CORS hace falta; lo
  resuelve el gateway en un solo sitio. Sirviendo el portal detrás del mismo gateway compartirían
  origen y dejaría de hacer falta.
- **Los filtros se resuelven en el navegador** sobre la cartelera completa. Con el API real deben
  pasar a ser parámetros de consulta del servidor.
