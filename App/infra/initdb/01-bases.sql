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
