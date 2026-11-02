# Pruebas de la extracción de Pagos

Node **22.22.3** (`nvm use` en App/backend), Docker y dependencias del workspace.
No ejecutar iniciar.sh, semillas ni limpiezas de desarrollo. Estas pruebas usan
**hexacore-boleteria-e2e**, su PostgreSQL 15436/base pagos_boleteria_e2e, Redis
16383, RabbitMQ 15676/16776 y pasarela simulada 13102. Pagos es la nueva imagen
real del workspace, mismo servicio del proyecto, publicada solo en 127.0.0.1:13090.
Credenciales y HMAC son fixtures propios; no se leen destinos de bases habituales.

Desde raíz, con Node seleccionado:

```bash
npm --prefix App/backend ci
npm --prefix App/backend run lint
npm --prefix App/backend run test:boleteria:infra
npm --prefix App/backend run test:pagos:unitarias
npm --prefix App/backend run test:pagos:modulo
npm --prefix App/backend run test:pagos:contratos
npm --prefix App/backend run test:pagos:contratos
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16383 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16383 npm --prefix App/backend test -- --runInBand
npm --prefix App/backend run test:boleteria
npm --prefix App/backend run verificar:infra
# Antes de la regresión de Núcleo, detener solo este proyecto propio:
docker compose -p hexacore-boleteria-e2e -f App/backend/test/boleteria/docker-compose.yml stop
npm --prefix App/backend run test:e2e:infra
npm --prefix App/backend run test:e2e
# Limpiar exclusivamente ambos proyectos al terminar toda la inspección:
npm --prefix App/backend run test:e2e:limpiar
npm --prefix App/backend run test:boleteria:limpiar
```

`test:pagos:unitarias` ejecuta los **27 casos originales** de servicio/guarda,
sin eliminar comprobaciones. El script antiguo test:integracion apuntaba a un
pruebas/correr-todas.sh inexistente: se sustituye por comandos que ejecutan
pruebas reales, sin passWithNoTests ni skip.

`test:pagos:modulo` compila e importa PagosModule en un contexto Nest real, sin
HTTP ni dobles TypeORM. Exige cero controladores, token nombrado/opciones
finanzas-pagos, ausencia de conexión por defecto, synchronize=false y base
correcta. JWT apunta a un archivo inexistente y Redis/AMQP a destinos inválidos:
la librería no debe depender de ellos. Cierra la conexión al terminar.

`test:pagos:contratos` ejecuta **13 casos reales** con node:test: salud/historial,
JWT/revocación, cobro decimal COP, rechazo USD, repetición, conflictos de clave,
reembolso parcial/rechazado y repetido, INDETERMINADO/reintento, webhook HMAC con
espacios/salto de línea y firma inválida/canonizada, publicación/duplicado,
404/409 y validación DTO. El último caso envía SIGTERM **solo al servicio pagos
del proyecto exclusivo**, exige cierre SQL/Redis/AMQP y reinicia ese servicio;
el libro y la referencia siguen presentes sin otro intento. No reinicia ni
purga PostgreSQL/Redis/RabbitMQ. Cada corrida usa UUID nuevos y cola exclusiva;
el observador filtra su propio prefijo. Libro e historial permanecen hasta la
limpieza explícita del proyecto, sin TRUNCATE ni FLUSHDB.

Los JWT son fixtures firmados fuera del servidor. La pasarela es simulada y los
callbacks manuales caracterizan la actualización financiera, no un movimiento
real de proveedor ni la finalización de una compra. El webhook duplicado conserva
el ID de evento pero vuelve a publicarlo; no se afirma entrega exactamente una
vez. F12 sigue pendiente. Las regresiones del Núcleo y Boletería usan sus suites
reales sin modificar llamantes ni aserciones; prueban HTTP contra este arranque.

CI ejecuta estos contratos antes de las regresiones. La definición de CI/CD y
las configuraciones se pueden validar localmente; publicación GHCR y ejecución
del workflow remoto son comprobaciones distintas y quedan pendientes.
