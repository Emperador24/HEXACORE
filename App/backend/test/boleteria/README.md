# Integración aislada de Boletería

Node **22.22.3**, npm ci en App/backend y Docker/Compose. Seleccionar Node con
`cd App/backend && nvm install && nvm use`; alternativa temporal documentada en
[las pruebas del Núcleo](../README.md). Desde raíz con Node en PATH:

```bash
npm --prefix App/backend ci
npm --prefix App/backend run lint
npm --prefix App/backend run test:boleteria:infra
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16383 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16383 npm --prefix App/backend test -- --runInBand
npm --prefix App/backend run test:boleteria
npm --prefix App/backend run test:boleteria
npm --prefix App/backend run verificar:infra
npm --prefix App/backend run test:boleteria:imagen:infra
npm --prefix App/backend run test:boleteria:imagen
npm --prefix App/backend run test:boleteria:imagen
# Para volver a la suite de procesos, parar solo las imágenes de esta prueba:
docker compose -p hexacore-boleteria-e2e -f App/backend/test/boleteria/docker-compose.yml -f App/backend/test/boleteria/docker-compose.imagen.yml stop gateway boleteria
# Al terminar toda la inspección:
npm --prefix App/backend run test:boleteria:limpiar
```

Proyecto **hexacore-boleteria-e2e**; sin contenedores, volúmenes ni redes externos.
No ejecutar iniciar.sh, semillas de desarrollo ni guiones que truncan tablas.
Los JWT usan las claves fixture de test/claves; esta suite no prueba login,
interfaces ni un proveedor financiero real. Boletería/imagen reciben solo la
clave pública: las firmas fixture se hacen fuera del proceso del programa.

| Recurso exclusivo | Destino del host |
|---|---|
| PostgreSQL, usuario/contraseña boleteria_e2e | 127.0.0.1:15436 |
| Redis | 127.0.0.1:16383 |
| RabbitMQ, vhost boleteria | 127.0.0.1:15676; administración 16776 |
| Pagos actual / pasarela simulada | 127.0.0.1:13090 / 13102 |
| Proceso compilado controlado por Jest | 13096 |
| Imagen / gateway | 127.0.0.1:13097 / 18081 |

Bases exclusivas: entradas_e2e, catalogo_boleteria_e2e, postventa_boleteria_e2e,
acceso_qr_boleteria_e2e y pagos_boleteria_e2e. Cuatro historiales de negocio:
5+1+1+3 migraciones; Postventa conserva **migrations**, las otras **migraciones**.
El preparador impone las cuatro POSTGRES_BD_*; nunca synchronize. Pagos conserva
su servidor y su libro propio; no es una biblioteca del workspace todavía.

`pretest:boleteria` compila; procesos.cjs migra e inicia **un Node real** con
`dist/apps/boleteria/main.js`. Exige un PID, los dos cron, una conexión AMQP y
cinco consumidores. VENTAS_URL apunta a un puerto inaccesible: publicación,
transferencia y devolución deben funcionar por la interfaz local. SIGTERM debe
terminar sin SIGKILL, con cron/outbox/consumos drenados, cuatro conexiones SQL y
clientes Redis/AMQP desaparecidos. Guarda logs en .evidencia-e2e, ignorada por Git.

La suite ejecuta **23 casos**: los ocho CU-001 originales y los doce escenarios
de referencia del primer hito, más tres comprobaciones: reconexión AMQP sin
duplicar consumidores/outbox, cron de publicaciones y reembolso temporal parcial.
Incluye concurrencia de reservas y de reventa, promoción, rechazo/aprobación,
repetición de cobro sin otro movimiento, reembolso total o parcial según política,
transferencia/historial/rotación de QR, doble ingreso concurrente, rutas internas,
autorización/revocación y persistencia en bases correctas.

Se reutilizan los mismos datos entre corridas: UUID nuevos, sin TRUNCATE,
FLUSHDB, purgas ni desactivar auditoría. El historial de propietarios y el libro
financiero quedan hasta eliminar exclusivamente los recursos del proyecto.
El observador de compra.confirmada filtra por cliente/evento UUID del fixture:
un outbox pendiente de otra corrida puede publicar al arrancar y no debe
confundirse con la compra que se está comprobando. No se purga para evitarlo.
El cron de prueba usa la configuración existente de un segundo; no sube límites.
La prueba de reconexión cierra por HTTP de administración **solo la conexión
hexacore-boleteria**, no reinicia RabbitMQ ni los contenedores habituales.

**Consistencia:** se observa el QR inmediatamente después de transferir, se
registra su convergencia y solo después se comprueba el rechazo del QR anterior.
Esto acredita proyección eventual, sin invalidación inmediata. La prueba de
expiración observa primero EXPIRADA y después la devolución a VALIDA; no promete
atomicidad entre bases. Ingreso→Ventas también depende del outbox/evento.
Liquidación/notificación de reventa aún registran lo que se enviaría, sin abono
real ni recepción acreditada. F12/F13/F14 permanecen pendientes.

El smoke construye/arranca Boletería y Nginx/njs reales. Comprueba las cinco
familias en un mismo upstream :3001, el consumo único de turno, compra y pago,
QR y doble ingreso, rutas internas no publicadas y revocación. No usa login ni
interfaces. Los guiones Python históricos se conservan con referencias adaptadas;
varios resiembran datos habituales y no forman parte de esta ejecución.

F13 opcional, en otra terminal mientras está activo este proyecto:

```bash
python3 App/backend/test/boleteria/observar-recursos.py --segundos 120
```

Captura SQL, bloqueos, conexiones y recursos propios sin cambiar límites.
CI verifica ambos programas de forma secuencial: detiene el proyecto propio de
Boletería antes de levantar Núcleo y finalmente limpia ambos proyectos.

La referencia de **cinco procesos**, anterior al traslado, permanece reproducible
en el commit **d48befff29244bdd2746ba4686c519c13a28cc4c**. Allí se ejecutan
`test:boleteria:referencia` y correr-referencia.cjs: 20 casos repetidos, 451 pruebas
existentes y diez migraciones. Consultar ESTADO-MIGRACION §17 para el resultado
antes del movimiento; esos comandos se retiraron de la versión actual junto con
los cinco servidores.
