# App Móvil HEXACORE

Aplicación Flutter para clientes y personal operativo. Incluye los flujos de eventos y entradas, parqueadero, pedidos, turnos, asistencia, validación e incidencias.

**Conectado al backend real:** las cuentas y la sesión (CU-027) y el mercado de reventa (CU-006).
El resto sigue con datos de demostración locales.

## Requisitos

- Flutter SDK estable

## Ejecución

```bash
flutter pub get
flutter run
```

Si el proyecto todavía no tiene sus carpetas de plataforma, ejecute una vez `flutter create .` desde esta carpeta antes de `flutter run`.

## Cómo levantar el backend

```bash
# Infraestructura y los dos servicios, en contenedor
docker compose -f ../../infra/docker-compose.yml --profile servicios up -d --build

# La primera vez, los datos de ejemplo
(cd ../../services/administracion && npm install && npm run semilla)
(cd ../../services/entradas-mercado-secundario && npm install && npm run semilla)
```

La app encuentra sola los servicios en el simulador de iOS (`localhost`) y en el emulador de
Android (`10.0.2.2`, su alias para la máquina anfitriona). **En un teléfono físico** hay que darle la
IP del computador, en la misma red wifi:

```bash
flutter run --dart-define=HEXACORE_HOST=192.168.18.16
```

La app conoce **una sola dirección**: el **API Gateway** en el puerto `8080` (ADR-02). No sabe
cuántos microservicios hay ni en qué puerto está cada uno; el gateway autentica cada petición y la
enruta. Con `--dart-define=HEXACORE_API=…` se apunta a un gateway desplegado en otro sitio.

| Puerto | Qué es |
|---|---|
| 8080 | **API Gateway** — todo el backend: cuentas, sesiones (CU-027) y reventa (CU-006) |
| 3098 | Buzón de correo simulado: los enlaces de verificación y recuperación (solo desarrollo, es un sistema externo y no pasa por el gateway) |

## Cuentas y sesión (CU-027)

- **Login real.** Los tokens que devuelve el servidor se guardan en el **llavero** (Keychain de
  iOS, Keystore de Android), no en `shared_preferences`: son credenciales y ahí quedarían en texto
  plano. Al abrir la app se restauran y se confirman con el servidor.
- **La sesión no se cierra mientras se use.** El token de acceso dura 15 minutos y la app lo renueva
  sola (un minuto antes de que caduque, o al recibir un 401, repitiendo la petición). La sesión solo
  termina tras **30 días sin abrir la app**, o si se cierra desde el servidor.
- **Una sola renovación a la vez** (`Sesion.renovar`). Si varias peticiones renovaran a la vez, la
  segunda usaría un token ya gastado y el servidor cerraría la sesión por posible robo.
- **Registro** con nombre, correo y contraseña. Siempre crea una cuenta de **Cliente**; las cuentas
  de Personal las crea un administrador.
- **Activación y recuperación por enlace.** Los correos llevan un enlace. Como la app todavía no
  abre enlaces directamente, se **pega** el enlace completo en la pantalla correspondiente.
  En desarrollo los correos no se envían: están en
  `http://<IP del computador>:3098/correos?para=<correo>`, y la app lo recuerda en pantalla.
- **Perfil:** se puede cambiar el nombre y la contraseña (pide la actual).
- **Cerrar sesión** la cierra también en el servidor, y el token deja de valer en la reventa.
- **Si la sesión se cierra desde fuera** —se cerró en otro dispositivo, se cambió la contraseña, se
  desactivó la cuenta, o alguien usó un token de renovación robado—, la siguiente petición no
  consigue renovar y la app vuelve al login diciendo por qué.
- **Los mensajes de error vienen del servidor** y se muestran tal cual (RNF-14): la app no repite la
  política de contraseñas ni decide qué decir ante un login fallido.

Se quitaron el registro por teléfono con código, el registro como Personal y los botones de Google y
Apple, que eran simulados: creaban una "sesión" sin token que el backend rechazaba, y el CU-027 no
los contempla.

### El área del personal es provisional

El token dice si la cuenta es **Cliente** o **Personal**, pero no su área (Entrada, Parqueadero,
Restaurante, Jefe de personal): eso es del dominio de Personal (CU-007), que aún no tiene servicio.
Mientras tanto, `_areasPersonal` en `lib/main.dart` asigna el área a las cuentas de ejemplo por su
correo; cualquier otra cuenta de Personal va a Entrada.

Las cuentas que solo son **Organizador** o **Administrador** no entran a la app (ADR-07: la app es
para clientes y personal) y se les indica usar el portal web.

## Mercado de reventa (CU-006)

Las **dos pestañas** de Reventa hablan con el **Servicio de Entradas y Mercado Secundario** usando el
token de la sesión:

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

## Cuentas de ejemplo

Contraseña de todas: **`hexacore2026`** (la crea la semilla del servicio de Administración; la app
no la tiene escrita).

| Correo | Entra como |
|---|---|
| `cliente@hexacore.com` | Cliente, con entradas para revender |
| `bruno@hexacore.com`, `carla@hexacore.com` | Clientes, para probar compras entre cuentas |
| `personal@hexacore.com` | Personal · Entrada |
| `parqueadero@hexacore.com` | Personal · Parqueadero |
| `restaurante@hexacore.com` | Personal · Restaurante |
| `jefepersonal@hexacore.com` | Personal · Jefe de personal |
| `admin@hexacore.com` | Administrador y Personal · Entrada |
| `pendiente@hexacore.com` | No entra: cuenta sin verificar |
| `desactivada@hexacore.com` | No entra: cuenta desactivada |

## Pruebas

```bash
flutter test                                   # sesión, cliente de cuentas y pantallas (servidor simulado)
flutter test integration_test -d <simulador>   # la app real contra el backend real
```

La de `integration_test` registra una cuenta, lee el correo del buzón simulado, la activa, inicia
sesión, abre la reventa, comprueba que un acceso caducado se renueva solo sin salir de la reventa,
que reutilizar el token de renovación viejo cierra la sesión con un aviso de seguridad, y que una
sesión cerrada desde fuera devuelve la app al login.

### Firma de código en iOS

El proyecto **no lleva dentro el equipo de desarrollo de nadie**. Tenerlo dentro era lo que hacía
que la app solo compilara en el computador de quien lo puso: una cuenta gratuita de Apple no puede
usar el equipo de otra persona, ni registrar un identificador que ya registró otra cuenta.

- **Simulador de iOS y Android:** no hay que hacer nada. Ninguno de los dos necesita firma.
- **iPhone físico:** cada quien pone lo suyo en un archivo local que no se versiona.

```bash
cd ios
cp Flutter/Firma.xcconfig.ejemplo Flutter/Firma.xcconfig
```

Dentro se escriben dos valores:

- `DEVELOPMENT_TEAM`, el identificador del equipo (diez caracteres). Se ve en Xcode, en
  *Settings ▸ Accounts ▸ tu Apple ID*, o abriendo `ios/Runner.xcworkspace` en *Signing &
  Capabilities*.
- `FLUTTER_BUNDLE_ID`, el identificador de la app. Hay que cambiarlo por uno propio (por ejemplo
  `com.hexacore.javeriana.appmovil.samuel`) si dos personas van a instalarla en sus iPhone con
  cuentas gratuitas distintas: el mismo identificador no se puede registrar dos veces.

`Flutter/Firma.xcconfig` está en el `.gitignore`, así que nadie pisa la configuración de otro.
Los `Debug.xcconfig` y `Release.xcconfig` lo incluyen con `#include?` —con interrogante—, que no
falla cuando el archivo no existe: por eso quien solo use el simulador no tiene que crear nada.

### Compilar para iOS dentro de OneDrive

Esta carpeta está en OneDrive, que añade atributos extendidos a todo archivo nuevo; `codesign` los
rechaza (*"resource fork, Finder information, or similar detritus not allowed"*) y la compilación
de iOS falla, también desde Xcode. La solución es que `build/` viva fuera de OneDrive:

```bash
rm -rf build
mkdir -p ~/Library/Caches/hexacore/app-movil-build
ln -s ~/Library/Caches/hexacore/app-movil-build build
```
