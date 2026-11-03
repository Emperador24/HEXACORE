# Pruebas reales del correo en el Trabajador

Usar Node **22.22.3** (`nvm install && nvm use` desde App/backend), npm ci y Docker.
No ejecutar iniciar.sh, semillas ni limpiezas habituales. No se envían correos reales.

Proyecto **hexacore-trabajador-e2e**, sin recursos externos:
RabbitMQ 15677/16777, usuario/clave/vhost trabajador_e2e, proveedor de prueba 13103.
El proceso compilado usa 13098 (y 13099 para la prueba explícita de dos instancias);
la imagen publica salud en 13100. Todos los puertos Docker están en loopback.
El proveedor guarda solicitudes por destinatario UUID y programa fallos/red/retención,
sin SMTP ni credenciales. Su estado es auxiliar de pruebas, no persistencia nueva del negocio.

Desde App/backend, ejecutar secuencialmente:

```bash
npm ci
npm run lint
npm run test:trabajador:infra
npm run test:trabajador           # compila y ejecuta 20 escenarios reales
npm run test:trabajador           # mismos recursos, sin purgar ni vaciar
npm run test:infra                # PG/Redis/pasarela exclusivos para Núcleo
npm run test:trabajador:identidad # 3 escenarios con los cinco correos de Identidad
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16384 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16384 npm test -- --runInBand
npm run test:e2e
npm run test:boleteria
npm run verificar:infra
npm run test:trabajador:imagen:infra
npm run test:trabajador:imagen
# Regresiones de imagen/gateway/finanzas: secuencia en ../README.md y ../pagos/README.md.
npm run test:imagen:infra
npm run test:imagen
npm run test:boleteria:imagen
npm run test:pagos:contratos
npm run test:pagos:convivencia
npm run test:trabajador:limpiar
npm run test:limpiar
```

No ejecutar contratos/Identidad por proceso mientras la imagen Trabajador esté
activa (se comprueba ausencia de otro consumidor). Detener solo esa imagen con
el Compose de este directorio y perfil imagen antes de volver a las suites del host.
No hay skip, passWithNoTests ni retorno silencioso. Los resultados iniciales y
cada fallo de preparación se registran en ESTADO-MIGRACION §21.

## Referencia y aserciones

Antes del traslado se compilaron y comprobaron tipos del paquete anterior con
Node 22.22.3. Los mismos **20 escenarios** se ejecutaron contra su main compilado,
y luego contra apps/trabajador, conservando íntegra la suite. El helper acepta
TRABAJADOR_ENTRADA/TRABAJADOR_CWD para contrastar un checkout de referencia externo;
no mantiene otra implementación activa en esta versión. La evidencia y la base
exacta están en §21. Los cinco cuerpos de correos quedaron congelados en
correos-referencia.json, revisados contra las plantillas originales.

Las pruebas usan RabbitMQ y proveedor HTTP reales. Comprueban salud/ausencia de
endpoints de negocio, topología durable/bindings/DLQ; los cinco contenidos exactos;
4xx permanente, 5xx transitorio y persistente, fallo de red y **timeout original de
10 s** (tres intentos reales, unos 30 s); JSON ilegible/versión; duplicados; cierre
de una conexión propia del broker y resuscripción única; pendientes con el proceso
detenido/reinicio; dos instancias; SIGTERM en vuelo y reinicio del contador.
Las propiedades consumerCount/messageCount se consultan por AMQP; las métricas
agregadas de management llegan por muestreo y se observan hasta converger.
No se confunde esa convergencia con garantías de negocio o entrega inmediata.

**Límites conservados y comprobados:** el mismo evento puede enviarse otra vez
tras reinicio o desde dos instancias. Un envío aceptado antes de responder puede
repetirse si SIGTERM ocurrió antes del ack. El límite de tres intentos es por
memoria de instancia, no global. Un JSON null queda sin ack/bloquea prefetch;
la prueba demuestra ese estado y retira únicamente su propio mensaje con ID
fixture para poder continuar. Evento/tipo desconocidos conservan el fallback
preexistente. Estos casos caracterizan deuda; no afirman corrección funcional.

El preload capturar-carga.cjs solo observa require.cache con un timer unref:
no intercepta SIGTERM ni cambia proveedores. Cada cierre exige salida sin SIGKILL
y ausencia de pg/TypeORM/ioredis/JWT/Identidad/Finanzas cargados. Se usan destinos
SQL/Redis y claves deliberadamente inutilizables para confirmar independencia.

## Identidad e imagen

Los **3 escenarios de Identidad** arrancan un Núcleo compilado con las bases/Redis
propias de la base única de pruebas (A o B seleccionada) y el broker exclusivo del correo. No se utilizan
migraciones/semillas de desarrollo. Crean una cuenta UUID por corrida, registran
con Trabajador detenido, inspeccionan el mensaje persistente real (contrato/ID),
lo reencolan y arrancan Trabajador: verifican correo/enlace/activación/login.
Registro duplicado, bloqueo, recuperación y restablecimiento ejercitan los otros
cuatro tipos reales, enlace de un solo uso y revocación. Solo se borran sus filas
fixture; un teardown fallido retira únicamente mensajes de su destinatario.

El smoke construye/arranca Dockerfile.trabajador con su CMD real. Exige un Node,
un consumidor, salud compatible servicio=notificaciones, ningún endpoint de
negocio y entorno sin PG/Redis/JWT/Pagos. Envía SIGTERM, deja un mensaje persistente
con cero consumidores, reinicia la misma imagen y verifica contenido/entrega única
observada. No certifica exactamente una vez, réplicas en producción ni correo real.

Logs y módulos cargados quedan en .evidencia-e2e (ignorada). Limpieza solo con los
dos comandos anteriores: detienen proyectos propios y conservan redes/volúmenes. Las imágenes
locales no equivalen a publicación GHCR o CI/CD remotos. F12/F14/alertas operativas
permanecen fuera de alcance. El Trabajador sigue sin SQL tras consolidar las
conexiones de Núcleo/Boletería; ver ../base-unica/README.md.
