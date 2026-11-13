# CSP efectiva de los portales

Nginx aplica `Content-Security-Policy`, también en errores. No se usa Report-Only,
`unsafe-inline`, `unsafe-eval` ni comodines para scripts, estilos o conexiones.
El gateway añade una política `default-src 'none'` a sus respuestas propias;
no aloja una aplicación HTML que necesite ejecutar scripts.

## Angular y caché

La política y `app-root[ngCspNonce]` reciben el mismo `$request_id` mediante
`sub_filter`. Nginx genera 16 bytes aleatorios por petición; no se acepta un
nonce fijo o la cabecera de identificación de un cliente.
[Variable oficial](https://nginx.org/en/docs/http/ngx_http_core_module.html#var_request_id).
Angular propaga ese nonce a los estilos que inserta en tiempo de ejecución,
incluidos Material/CDK. Se desactiva solamente la inserción de CSS crítico y de
fuentes al compilar para evitar manejadores inline y descargas durante el build.
[Mecanismo documentado por Angular](https://angular.dev/best-practices/security#content-security-policy).

Los documentos HTML llevan `Cache-Control: no-store`; no usan ETag/304.
Los assets con hash conservan su comportamiento. Recargar cualquier ruta SPA
vuelve a index.html y genera un nonce nuevo. Los colores antes escritos como
atributos `style` estáticos se trasladan a clases CSS, conservando los valores.
Los bindings de estilo de Angular usan CSSOM y se comprueban con los recorridos.

## Recursos permitidos y límites

- Scripts propios y, solo en Cliente, el cargador existente `https://js.stripe.com`.
  Frames de Cliente: `js.stripe.com` y `hooks.stripe.com`; API: `api.stripe.com`.
  Admin no permite frames ni Stripe. No se habilita el proveedor real para probar.
  [Cargador oficial Stripe](https://github.com/stripe/stripe-js#ensuring-stripejs-is-available-everywhere).
  El control usa respuestas sintéticas interceptadas: no acredita integración
  completa con todos los dominios/productos o futuros cambios de Stripe.
- Fuentes existentes: CSS en las rutas `/css2` y `/icon` de `fonts.googleapis.com`,
  binarios en `fonts.gstatic.com`. Se conservan Manrope y Material Icons.
- Conexiones: propio origen y orígenes concretos de API/buzón configurados. No se
  permite `*`, `http:` o `https:` como fuente general de conexiones.
- Imágenes Cliente: propias, `data:` para QR y `http:`/`https:` para las URLs de
  imágenes de eventos admitidas actualmente por el producto. Es una **amplitud
  residual explícita**, restringida a imágenes; no prueba que todo host externo
  sea confiable. Reducirla requiere decidir hosts/proxy de imágenes sin romper
  ese contrato. No se modifica ni suprime una regla ZAP para ocultarla.
- Imágenes Admin: propias, `data:` y `blob:`. CU-029 crea Object URLs para el plano
  descargado y su previsualización; omitir `blob:` rompió el plano y quedó
  demostrado en la primera regresión (15/16, tres violaciones `img-src`). Se
  habilita solo para imágenes: no para scripts, estilos, frames o workers.
- Objetos, workers y medios denegados; `base-uri` y formularios al propio origen;
  `frame-ancestors 'none'` conserva la protección de clickjacking.

## Orígenes del despliegue

`origenes-csp.conf` se copia en la imagen. Sus valores predeterminados corresponden
a los puertos de desarrollo 8080/3098 del host del portal. El perfil CU-015 genera
y monta un archivo propio de solo lectura con 18100/13138, junto a su
`configuracion.js`. Si otro despliegue cambia la API o buzón, debe montar también
`/etc/nginx/hexacore/origenes-csp.conf` con los **orígenes exactos autorizados**:

```nginx
set $csp_api "https://api.ejemplo.test";
set $csp_buzon "https://buzon-de-prueba.ejemplo.test";
```

No introducir rutas, claves ni fuentes de script en esos valores. En producción
no habilitar el buzón de pruebas: conservar la configuración de producto y omitir
ese origen del archivo/política de despliegue. Validar `nginx -t`, cabecera final,
nonce del documento y navegación después de configurar los orígenes.

## Evidencia

`csp-portales.cjs` comprueba ambos logins, nonce/caché, bloqueo efectivo de script
inline y atributo style, doble local de SDK/iframe, navegación y renovación real
en rutas autenticadas. Las violaciones de las dos sondas negativas se registran
por separado: no se confunden con violaciones inesperadas del producto.

`App/e2e/csp.fixture.ts` es optativo (`HEXACORE_COMPROBAR_CSP=1`); captura eventos
de consola, errores JavaScript y CSP incluso en contextos explícitos multiusuario.
Con el indicador ausente no crea fixtures/contextos adicionales. El config CSP
hereda el normal: un trabajador, cero reintentos, 120 s por caso/15 s por aserción.
Solo cambia los destinos privados de informes. No se toca el modo demo.

Resultados exactos y alertas residuales: [RESULTADO.md](RESULTADO.md).
