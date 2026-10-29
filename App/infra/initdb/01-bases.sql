-- Una base de datos por microservicio (ADR-01): cada dominio evoluciona su
-- esquema sin pisar a los demás, y no hay forma de escribir un JOIN entre
-- dominios "sin querer" — las referencias cruzadas (p. ej. propietario_id
-- hacia Usuario) se resuelven a nivel de aplicación, no con llaves foráneas
-- físicas (SAD §12).
--
-- Postgres ejecuta este script UNA SOLA VEZ, al inicializar el volumen vacío.
-- Si añades una base nueva después, créala a mano o levanta con `down -v`.

CREATE DATABASE entradas_mercado_secundario OWNER hexacore;
CREATE DATABASE personal                    OWNER hexacore;
CREATE DATABASE eventos_emergencias         OWNER hexacore;
CREATE DATABASE parqueaderos                OWNER hexacore;
CREATE DATABASE pedidos                     OWNER hexacore;
CREATE DATABASE administracion              OWNER hexacore;

-- Fase A de ADR-14: el Catalogo sale de entradas_mercado_secundario con su
-- propia base. Solo contiene la proyeccion de eventos que lee la cartelera.
CREATE DATABASE catalogo                    OWNER hexacore;

-- Fase A de ADR-14: Pagos sale con su propia base. Solo guarda el libro de
-- idempotencia: ni pedidos ni compras, que son de quien llama.
CREATE DATABASE pagos                       OWNER hexacore;

-- Fase A de ADR-14: Acceso QR sale con su propia base. Guarda los ingresos y
-- su proyeccion del evento con el aforo; la tabla de entradas es de Ventas.
CREATE DATABASE acceso_qr                   OWNER hexacore;
CREATE DATABASE postventa                   OWNER hexacore;
