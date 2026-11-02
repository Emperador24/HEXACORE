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
JWT y no abre clientes Redis/RabbitMQ. Los módulos llamantes futuros deberán
importar esta API, sin acceder a entidades o repositorios internos. Actualmente
Núcleo y Boletería siguen usando **HTTP**; no se ha cambiado su autorización.

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

La envoltura temporal vive en [apps/pagos-http](../../../apps/pagos-http/README.md)
y conserva rutas, validación, JWT/revocación, HMAC sobre rawBody y publicación
AMQP. Solo ella carga el secreto del webhook y la configuración de sesión/broker.
Las pruebas de [test/pagos](../../../test/pagos/README.md) verifican la separación
con Nest y PostgreSQL reales, además de los contratos HTTP y las 27 unitarias
originales. No se simula persistencia en esa integración.
