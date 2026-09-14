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

Los tokens viven en `src/styles.scss`. **Si cambia el tema de la app móvil, hay que actualizarlos a
mano aquí**: hoy están duplicados y no tienen un origen común.

## Cómo correrlo

```bash
cd App/frontend/portal-web-cliente
npm install   # si no se hizo ya
npm start     # sirve en http://localhost:4200
```

Usuario demo (clave `1234`): `cliente@hexacore.com`.

## Estructura

```
src/app/
├── core/            Modelos, autenticación mock, guard de sesión, servicios de dominio, PagoService, ítems del menú
├── login/           Login del rol Cliente
├── shell/           Navbar de vidrio + <router-outlet> + pie
├── eventos/         CU-001..CU-006 — cartelera con filtros y detalle con compra de entradas
├── entradas/        CU-007..CU-010 — mis entradas (enviar/reventa) y mercado de reventa
├── parqueadero/     CU-021..CU-025 — reservar y consultar reservas
├── pedidos/         CU-011..CU-015 — restaurantes, menú y mis pedidos
├── pago/            Pasarela de pago compartida por los tres flujos de compra
├── perfil/          Datos editables del cliente
├── ajustes/         Preferencias, soporte y cierre de sesión
└── shared/          Acentos, badge de fecha y QrPlaceholder — mismo criterio que en la app móvil
```

## Estado

Funciona de extremo a extremo sobre **datos mock**: no hay backend todavía. Los servicios de `core/`
son la capa que se reemplazará por llamadas HTTP al API Gateway; la forma de los componentes no debe
cambiar cuando eso ocurra.

Dos limitaciones conocidas:
- **La sesión no persiste entre recargas** (vive en memoria); al refrescar se vuelve al estado
  público. Se resuelve cuando el backend emita un token.
- **Los filtros se resuelven en el navegador** sobre la cartelera completa. Con el API real deben
  pasar a ser parámetros de consulta del servidor.
