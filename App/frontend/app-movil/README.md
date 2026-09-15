# App Móvil HEXACORE

Aplicación Flutter para clientes y personal operativo. Incluye los flujos de eventos y entradas, parqueadero, pedidos, turnos, asistencia, validación e incidencias con datos de demostración locales.

## Requisitos

- Flutter SDK estable

## Ejecución

```bash
flutter pub get
flutter run
```

Si el proyecto todavía no tiene sus carpetas de plataforma, ejecute una vez `flutter create .` desde esta carpeta antes de `flutter run`.

## Backend real: mercado de reventa (CU-006)

Las **dos pestañas** de Reventa hablan ya con el **Servicio de Entradas y Mercado Secundario**
(`App/services/entradas-mercado-secundario`), sin datos locales:

- **Mis entradas** — publicar, cambiar el precio (CU-006A) y retirar del mercado (CU-006B).
- **Mercado** — consultar las entradas disponibles con orden configurable (paso 5), **reservar** una
  con bloqueo distribuido (paso 6), **pagar y recibir el QR nuevo** (pasos 7-11) o cancelar la
  reserva (CU-006C).

La reserva muestra una cuenta atrás: es el TTL real del bloqueo en Redis. Si expira, la entrada
vuelve al mercado. Si otra persona se adelanta, la hoja lo dice con el mensaje que manda el backend
(camino CU-006H).

La hoja de pago trae un selector de **medio de pago de prueba** (aprueba / rechaza / no responde).
En producción la app tokeniza la tarjeta contra la pasarela y solo envía el token —los datos de
tarjeta nunca pasan por el backend (RNF-05)—; en desarrollo ese selector elige el token del
simulador, y es lo que permite enseñar los caminos **CU-006G** y **CU-006I** desde la app.

Requiere también el contenedor de la pasarela simulada, que ya va en el `docker compose` de infra.

El resto de la app sigue con datos de demostración.

Para que funcione hay que levantar antes el backend:

```bash
docker compose -f ../../infra/docker-compose.yml up -d
cd ../../services/entradas-mercado-secundario
npm install && cp .env.example .env
npm run migracion:correr && npm run semilla
npm run start:dev
```

La app resuelve sola la URL: `10.0.2.2:3001` en el emulador de Android (su alias para la máquina
anfitriona) y `localhost:3001` en el simulador de iOS. Para un dispositivo físico, con la IP del
computador en la misma red:

```bash
flutter run --dart-define=HEXACORE_API=http://192.168.1.50:3001
```

Solo la cuenta `cliente@hexacore.com` está asociada a un usuario del backend (ver `_idsBackend` en
`lib/main.dart`); con las demás la pestaña muestra un error de sesión. Es provisional: cuando exista
el API Gateway (ADR-02), la identidad saldrá del token del login y ese mapa desaparece.

## Accesos de demostración

Contraseña para todas las cuentas: `1234`.

- `cliente@hexacore.com`
- `personal@hexacore.com`
- `parqueadero@hexacore.com`
- `restaurante@hexacore.com`
- `jefepersonal@hexacore.com`
