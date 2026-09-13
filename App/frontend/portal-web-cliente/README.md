# Portal Web Cliente

Interfaz web para el rol Cliente (SAD §8, vista de contenedores).

**Responsabilidad:** consulta de eventos, compra y reventa de entradas, reserva de parqueadero,
pedidos de alimentos — consumiendo el backend únicamente a través del API Gateway (`../../gateway`),
sin duplicar lógica de negocio (ASR-10).

**Stack:** Angular 19 + TypeScript, Angular Material.

**Estado:** en construcción (Entrega 2). Ya están el login (usuario demo Cliente, mismo patrón que
`app-movil-cliente`), el shell con menú lateral, y las cuatro secciones completas con datos mock:
**Eventos** (consulta + compra de entradas, CU-001..CU-006), **Mis entradas** (envío a otro cliente y
publicación en reventa, CU-009/CU-010), **Mercado de reventa** (comprar entradas publicadas por otros
clientes — CU-007/CU-008, no existe en la app móvil: allá solo se consulta y se envía, ver el
comentario en `EntradasScreen`), **Parqueadero** (reservar y consultar reservas, CU-021..CU-025) y
**Pedidos** (restaurantes, menú y mis pedidos, CU-011..CU-015). Entradas, parqueadero y pedidos
comparten una sola pasarela de pago (`PagoService` + `PasarelaPagoComponent`), igual que
`PasarelaPagoScreen` en el móvil: nunca se piden datos de tarjeta, solo se elige entre medios ya
guardados.

## Cómo correrlo

```bash
cd frontend/portal-web-cliente
npm install   # si no se hizo ya
npm start     # sirve en http://localhost:4200
```

Usuario demo (clave `1234`): `cliente@hexacore.com`.

## Estructura

```
src/app/
├── core/            Modelos, autenticación mock, guard de sesión, servicios de dominio, PagoService, ítems del menú
├── login/           Login del rol Cliente
├── shell/           Toolbar + menú lateral + <router-outlet>
├── eventos/         CU-001..CU-006 — lista (Próximos/Pasados) y detalle con compra de entradas
├── entradas/        CU-007..CU-010 — mis entradas (enviar/reventa) y mercado de reventa
├── parqueadero/      CU-021..CU-025 — reservar y consultar reservas
├── pedidos/         CU-011..CU-015 — restaurantes, menú y mis pedidos
├── pago/            Pasarela de pago compartida por los tres flujos de compra
├── perfil/          Datos editables del cliente
├── ajustes/         Preferencias, soporte y cierre de sesión
└── shared/          QrPlaceholder — mismo criterio que en app-movil-cliente
```
