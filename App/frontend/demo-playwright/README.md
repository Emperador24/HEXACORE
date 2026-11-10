# Demostración automatizada · casos de uso de Samuel

Playwright recorre en los portales reales los casos de uso de Samuel Emperador: abre Chrome,
hace lo que haría una persona y deja un **video por caso de uso**, con un rótulo en pantalla que
dice qué paso del caso de uso se está viendo. No incluye CU-027 ni CU-029.

| Archivo | Caso de uso | Portal · cuenta |
|---|---|---|
| `casos/01-cu026-eventos.spec.ts` | CU-026 Gestión de eventos: crear, publicar, editar, cancelar | Admin · organizador |
| `casos/02-cu007-personal.spec.ts` | CU-007 Alta de un empleado y asignación a una zona | Admin · administrador |
| `casos/03-cu008-cambios-turno.spec.ts` | CU-008 Aprobar con reemplazo y rechazar (008A) | Admin · organizador |
| `casos/04-cu009-asistencia.spec.ts` | CU-009 Fichajes y reporte de puntualidad | Admin · organizador |
| `casos/05-cu010-evacuacion.spec.ts` | CU-010 Evacuación: propuesta, avisos, salida bloqueada (010A), escalar, finalizar | Admin · organizador |
| `casos/06-cu024-025-parqueadero.spec.ts` | CU-024 Tarifa y cobro · CU-025 Ocupación, zona llena (025A) y redirección | Admin · administrador y organizador |
| `casos/07-cu006-reventa.spec.ts` | CU-006 Reventa: publicar, retirar (006B), pago rechazado (006G) y compra | Cliente · Ana y Bruno |

## Requisitos

- El sistema en marcha con los **datos de demo** (`./App/infra/iniciar.sh --datos-demo npm` en
  una instalación vacía): gateway, Núcleo, Boletería, Trabajador, los dos portales y el correo
  simulado. Las cuentas son las sembradas (`organizador@`, `admin@`, `cliente@`, `bruno@`).
- Google Chrome instalado (Playwright usa el canal `chrome`, no descarga navegadores).
- Node 22 y, una vez, `npm ci` en esta carpeta.

## Uso

```bash
cd App/frontend/demo-playwright
npm ci
npm run demo            # sin ventana; videos e informe en informe/
npm run demo:ver        # abre Chrome y va despacio, para presentar en vivo
npm run demo -- casos/05-cu010-evacuacion.spec.ts   # un solo caso de uso
npm run demo:informe    # abre el informe con los videos y los pasos
```

`DEMO_LENTO` (ms entre acciones) y `DEMO_PAUSA` (ms al final de cada paso) ajustan el ritmo.

## Qué prepara y qué no toca

Antes de empezar, `apoyo/preparar.ts` crea **por la API** lo que los casos de uso necesitan y no
es lo que se demuestra: un recinto con zonas y plan de evacuación, un evento publicado para
mañana, cuatro empleados de Seguridad y una cuenta nueva para la ficha de CU-007 (verificada con
el enlace del correo simulado). Todo lleva un sufijo propio, así la demostración **se puede repetir
sin volver a sembrar ni borrar nada**. Si a Ana ya no le quedan entradas revendibles, la demo de
CU-006 le compra una en la venta primaria.

Lo que llega de la app móvil o del lector de credenciales (la solicitud de cambio de turno, los
fichajes) se envía por la API con la misma cuenta y forma que usaría la app; lo que se demuestra
es lo que ve y decide el supervisor en el portal.

## Otro entorno

| Variable | Por defecto |
|---|---|
| `DEMO_PORTAL_ADMIN` / `DEMO_PORTAL_CLIENTE` | `http://localhost:4201` / `http://localhost:4200` |
| `DEMO_API` | `http://localhost:8080/api/v1` |
| `DEMO_BUZON` | `http://localhost:3098/correos` |
| `DEMO_ORGANIZADOR`, `DEMO_ADMINISTRADOR`, `DEMO_VENDEDORA`, `DEMO_COMPRADOR`, `DEMO_CONTRASENA` | cuentas de los datos de demo |
| `DEMO_CUENTA_EMPLEADO` | una cuenta verificada sin ficha, si no hay buzón para registrar una |

Los portales deben servirse en los puertos 4200 y 4201: son los orígenes que admite el CORS del
gateway.
