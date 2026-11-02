# CU-011 y convivencia real de Núcleo

Desde `App/backend`, usar `nvm install && nvm use` (**22.22.3**) y `npm ci`.
Alternativa sin nvm: instalar el binario de Node en un directorio temporal:

```bash
npm install --prefix /private/tmp/hexacore-node22 node@22.22.3 --no-save --no-package-lock
export PATH="/private/tmp/hexacore-node22/node_modules/.bin:$PATH"
node --version
```

Requiere Docker Desktop/Engine y Compose con `!reset`/`!override` (comprobado con
Docker 29.7.2, Compose 5.3.1). No ejecutar `iniciar.sh` ni semillas de demostración.

```bash
npm run lint
npm run test:e2e:infra
REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16382 npm test -- --runInBand
npm run test:e2e
npm run test:e2e                 # sin vaciar/recrear entre corridas
npm run verificar:infra
npm run test:imagen:infra        # construir/arrancar Núcleo y gateway reales
npm run test:imagen
npm run test:e2e:limpiar          # solo este proyecto y sus tres volúmenes
```

Proyecto fijo **hexacore-nucleo-e2e**, sin `container_name`, volúmenes externos ni
redes compartidas. La configuración impone los destinos antes de importar código;
las pruebas los comprueban antes de migrar o insertar fixtures.

| Recurso exclusivo | Destino de host |
|---|---|
| PostgreSQL 16 | 127.0.0.1:15435; usuario/contraseña cu011_e2e |
| Bases | identidad_cu011_e2e, alimentos_cu011_e2e, pagos_cu011_e2e |
| Redis 7 | 127.0.0.1:16382 |
| RabbitMQ 3.13 | AMQP 127.0.0.1:15675/cu011; administración 127.0.0.1:16775 |
| Pagos real actual | 127.0.0.1:13088/api/v1 |
| Pasarela HTTP simulada | 127.0.0.1:13101; webhook firmado directo al Pagos propio |
| Núcleo compilado de la suite | puerto propio 13087 |
| Imagen Núcleo / gateway opcionales | 127.0.0.1:13089 / 127.0.0.1:18080 |

Claves RSA de `claves/`: fixtures públicos de prueba, nunca cuentas reales.
Núcleo recibe privada/pública; Pagos y gateway reciben solo la pública.
Los puertos Docker se publican en loopback. El listener Nest mantiene el
comportamiento del bootstrap anterior y su puerto exclusivo de pruebas.

`pretest:e2e` compila. Jest controla **un proceso Node**, que ejecuta
`dist/apps/nucleo/main.js`: no importa Nest/TypeORM ESM dentro del runtime CommonJS
de Jest ni sustituye proveedores. La suite aplica las tres migraciones de Identidad
y las dos de Alimentos a sus bases propias; Pagos aplica la suya. Inserta una cuenta
activa con scrypt y rol Cliente, evento/local/productos con UUID nuevos; el login
HTTP real emite el token usado en toda la compra. El preparador real de inventario
se ejecuta antes de abrir el servidor, sin sembrar datos de desarrollo.

Nueve pruebas conservan las cinco de CU-011: checkout multi-producto/reserva,
inventario insuficiente, pago rechazado, pago aprobado con QR/descuento/evento y
replay sin efectos duplicados. Añaden login/perfil y separación de bases, cookie
web/renovación/roles/validación, cierre de sesión/revocación en ambos módulos y
SIGTERM. Se verifica el libro real de Pagos y el evento con una cola AMQP exclusiva.

La comprobación del proceso usa el PID del hijo, una sola conexión AMQP identificada,
dos topologías y un solo sondeo. Después de SIGTERM exige desaparición de las
conexiones TypeORM de ambos módulos, de los clientes Redis, de AMQP y del listener,
y ausencia de errores de cierre. Un SIGKILL por timeout falla la prueba. RabbitMQ
actualiza sus métricas periódicamente: se espera su convergencia hasta diez segundos.

`test:imagen` inserta y elimina únicamente otra cuenta fixture; prueba login,
perfil, validación de checkout y revocación a través de Nginx/njs. Comprueba que
cuentas y pedidos llegan al mismo upstream `:3002`. No requiere interfaces.
Para volver al E2E por proceso después del smoke, parar únicamente esas imágenes:

```bash
docker compose -p hexacore-nucleo-e2e -f test/docker-compose.e2e.yml -f test/docker-compose.imagen.yml stop gateway nucleo
npm run test:e2e
```

Los teardowns eliminan solo sus UUID y claves. El libro financiero permanece hasta
la limpieza del proyecto para inspección. No se ejecutan TRUNCATE, FLUSHDB ni purgas
de colas. No se certifican registro/verificación por correo completos, Angular,
Flutter, proveedor bancario real, réplicas, carga ni recuperación de pagos inciertos
(**F12 permanece pendiente**). El smoke local no publica imágenes en GHCR.
