# Pagos reutilizable: extracción de implementación existente

Libro, cobros, reembolsos, pasarela HTTP y confirmación financiera trasladados de
App/services/pagos. Esta etapa no implementa casos de uso nuevos, conciliación
administrativa ni recuperación/finalización F12.

```text
pagos/
  index.ts                 API pública
  pagos.module.ts          proveedores y persistencia, sin controladores
  pagos.service.ts         cobrar, reembolsar y confirmar (reglas existentes)
  procesador-pagos.ts       contrato del adaptador y estados
  pasarela-http.service.ts  único adaptador existente de pasarela
  dto/ y contratos/        solicitudes/respuestas y evento financiero
  config/                  configuración propia del libro/pasarela
  persistencia/            entidad, conexión y migración original
```

La API pública es `index.ts`: PagosModule, PagosService y contratos de operación,
respuesta y confirmación. Importar PagosModule no publica endpoints, no configura
JWT y no abre clientes Redis/RabbitMQ. Alimentos y Entradas importan esta API, sin acceder a entidades o repositorios
internos. Sus adaptadores locales mantienen autorización en los controladores
llamantes y validación con validarSolicitudPagos, equivalente a la antigua
frontera HTTP. Los contratos y códigos de error existentes se conservan.

Conexión TypeORM **finanzas-pagos** en registro, opciones devueltas, forFeature e
inyecciones. Configuración **CONFIGURACION_FINANZAS_PAGOS** y puerto del adaptador
**PROCESADOR_FINANZAS_PAGOS**; sin tokens globales de otros dominios. No hay imports
a Identidad, Alimentos, Entradas o Personal. Base **pagos**, una tabla
transacciones_pago y una migración original/historial **migraciones**.
`POSTGRES_BD_PAGOS` selecciona la base; la librería ignora POSTGRES_BASE genérico.
`synchronize=false` y `migrationsRun=false`; no se copian ni consolidan datos.

Se conservan importes, COP/USD, solicitante, claves, referencias, contador de
intentos y APROBADO/RECHAZADO/INDETERMINADO. Un resultado terminal se devuelve sin
otra llamada; uno incierto vuelve a consultar con la misma clave. El webhook
puede actualizar el libro y devuelve un evento: eso **no finaliza un pedido ni
una compra**. Repetir el webhook vuelve a publicar el mismo ID; los receptores
deben deduplicar como antes. No hay trabajo durable de finalización nuevo.

Límites previos conservados: la consulta y escritura del libro rodean una llamada
externa, sin reclamación SQL previa ni transacción atómica con la pasarela.
La compatibilidad de una clave compara tipo, monto y moneda; no agrega una
comparación nueva de solicitante o referencia de cobro. El callback admite el
DTO existente, sin monto/moneda del proveedor, y usa los datos guardados. Un
callback adelantado responde OPERACION_DESCONOCIDA; no hay bandeja de entrada
nueva. Estas limitaciones se documentan para los responsables, sin corregir
negocio ajeno durante la extracción.

Solo Núcleo registra el receptor en apps/nucleo/pagos. Conserva
POST /api/v1/pagos/webhook, validación, HMAC sobre rawBody y publicación con la
conexión AMQP compartida. No se publica ese controlador al importar PagosModule.
Boletería no carga el secreto HMAC ni una clave privada. La envoltura HTTP y sus
endpoints de cobro/reembolso se retiraron; sigue el HTTP hacia la pasarela externa.

La migración del libro la ejecuta **una sola tarea de despliegue** antes de los dos
programas. Compose usa migracion-pagos (imagen Núcleo, comando TypeORM CLI,
restart=no, sin puertos); sus dos aplicaciones dependen de su terminación correcta.
Fuera de Compose ejecutar una vez `npm run migracion:pagos:correr`, revisando antes
el destino con `migracion:pagos:estado`. No incluir esa orden en ambos bootstraps.
No se cambia la migración 1790380800000 ni se crean libros por aplicación.

Las pruebas de [test/pagos](../../../test/pagos/README.md) usan Nest, PostgreSQL,
Redis, RabbitMQ, ambos programas y gateway reales, con proveedor simulado. Los
contratos de operaciones retirados del HTTP se prueban directamente en el módulo;
el webhook se prueba por HTTP. Las unitarias originales de servicio/guarda se
conservan, ahora la guarda se verifica en su módulo llamante. F12 sigue pendiente.
