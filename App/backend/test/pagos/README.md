# Pagos local y webhook: pruebas aisladas

Usar **Node 22.22.3** (`nvm install && nvm use` en App/backend), npm ci, Docker y
Compose. [Entorno y secuencia completa](../README.md). No ejecutar iniciar.sh,
semillas ni limpiezas de desarrollo. Solo proyecto **hexacore-base-unica-e2e**:
PostgreSQL 15439/cu011_e2e, base hexacore_e2e, libro finanzas_pagos.transacciones_pago, Redis 16384, RabbitMQ
15679/16779 (vhost cu011), simulador 13105. Los ocho esquemas conservan sus historiales. No se lee ni modifica una base habitual.

Desde raíz, con Node seleccionado:

```bash
npm --prefix App/backend ci
npm --prefix App/backend run lint
npm --prefix App/backend run test:infra
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16384 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16384 npm --prefix App/backend test -- --runInBand
npm --prefix App/backend run test:pagos:modulo
npm --prefix App/backend run test:e2e
npm --prefix App/backend run test:e2e
npm --prefix App/backend run test:boleteria
npm --prefix App/backend run test:boleteria
npm --prefix App/backend run verificar:infra
npm --prefix App/backend run test:imagen:infra
npm --prefix App/backend run test:imagen
npm --prefix App/backend run test:boleteria:imagen
npm --prefix App/backend run test:pagos:contratos
npm --prefix App/backend run test:pagos:contratos
npm --prefix App/backend run test:pagos:convivencia
npm --prefix App/backend run test:limpiar
```

Ejecutar secuencialmente. Los contratos/convivencia requieren ambas imágenes
saludables: Núcleo 13109, Boletería 13117 y gateway 18082 (puertos en loopback).
El webhook del simulador llama a nucleo:3002; no hay servicio Pagos ni endpoints
de cobro/reembolso. La tarea preparacion-base aplica/reconoce los ocho historiales/18 migraciones originales una
vez por despliegue y sale; ambos programas esperan su terminación. Los tests
no vuelven a ejecutar la migración financiera al reiniciar aplicaciones.

Las **27 unitarias originales** de servicio/guarda se conservan (la guarda se
prueba ahora en el llamante). Se añaden 13 de adaptadores locales y un caso de
salud financiera. El conjunto del workspace tiene **830 casos en 57 suites**.
La guarda exige JWT/revocación como antes; importar Pagos no sustituye autorización.
No se utiliza passWithNoTests ni skip. El código PAGOS_ERROR_HTTP se mantiene
como contrato legado de error, aunque ya no haya transporte interno HTTP.

`test:pagos:modulo` compila e importa PagosModule en un contexto Nest real, con
PostgreSQL real. Exige cero controladores, conexión nombrada/opciones
finanzas-pagos, ausencia de conexión por defecto, synchronize/migrationsRun=false
y base correcta. JWT/Redis/AMQP apuntan a destinos inválidos: el módulo no debe
necesitarlos. Cierra su conexión al terminar.

`test:pagos:contratos` conserva **13 escenarios**, adaptando cobro/reembolso al
nivel de la API pública en un contexto Nest real sin servidor de prueba. Comprueba
COP/USD/decimales, solicitante/clave/referencia, rechazo, repetición, conflictos,
reembolso parcial/rechazado/repetido, INDETERMINADO/reintento, timeout real de pasarela (3 s en pruebas) y DTO. El webhook
se llama al Núcleo real: firma HMAC de bytes con espacios/salto de línea,
firma ausente/incorrecta/canonizada, 204/evento, repetido, 404/409/400.
También exige 404 en los antiguos endpoints de ambos programas, ausencia de
webhook en Boletería y 401 de JWT/revocación en las operaciones llamantes.
Envía SIGTERM solo a las dos imágenes propias y comprueba cierre SQL/Redis/AMQP,
sin OOM. Las inicia con `compose up -d --no-deps --no-build --wait nucleo boleteria`: mismo libro/referencia/intentos
y fecha de terminación de la tarea financiera sin otra ejecución.

`test:pagos:convivencia` añade **5 escenarios** sobre gateway e imágenes reales:
configuración efectiva del mismo libro, pools de ambos procesos, un Node por
programa y migración única; login real Cliente/perfil y compras Alimentos/Entradas
con el mismo JWT; claves originales sin prefijos de proceso e importes/referencias
persistidos; reinicio/replay sin duplicar efectos; cancelación/reembolso repetido;
y pago incierto/webhook/logout. Cada corrida crea UUID/cuenta/evento propios.
Ventas conserva **409 COMPRA_NO_PAGABLE** al repetir pago de una compra PAGADA y
**409 COMPRA_NO_CANCELABLE** al repetir su cancelación; se exige persistencia
de referencias/entradas y ningún otro movimiento. No se cambia a 200 para esta
migración. El replay financiero de la API sí devuelve el resultado con repetida=true.

**F12 permanece pendiente:** el callback auténtico actualiza el libro y publica,
pero el pedido incierto conserva su transacción FALLIDA y estado PENDIENTE_PAGO.
La suite comprueba esa diferencia, sin construir recuperación. El callback
repetido vuelve a publicar el mismo ID; no se promete entrega exactamente una
vez. Las carreras del libro/pasarela y consistencia eventual por proyecciones de
Entradas conservan sus límites. No se añade atomicidad entre bases o proveedor.

No se ejecutan TRUNCATE, FLUSHDB, purgas, ni reinicios de las bases/broker.
El libro e historial permanecen: test:limpiar solo detiene recursos, sin borrar volúmenes.
No se prueban interfaces, banco real, réplicas ni publicación GHCR. Los contratos
usan JWT/HMAC fixtures; convivencia sí usa login real. CI/CD configurados no
equivalen a workflow/publicación remotos ejecutados.
