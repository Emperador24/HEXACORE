# Reproducir autorización por recurso y DAST de API

Node **22.22.3**, dependencias bloqueadas existentes. Fuente de las finales:
**d402a89**, correcciones funcionales **545e19c / 9a06ba8**. Alcance/resultados:
[RESULTADO.md](RESULTADO.md), [COBERTURA-RECURSOS.md](COBERTURA-RECURSOS.md),
[SECURITY-SAFETY.md](SECURITY-SAFETY.md), [evidencia](RECURSOS-DAST-EVIDENCIA.json).

## Preparar la ventana local

Seguir [la alternancia](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md),
registrando motor, IDs/estados/montajes y recursos iniciales. Detener solo Redash
activo. Usar exclusivamente CU-015, proveedores simulados y guardas existentes.
Mantener un único ensayo en serie. La última ventana restauró el motor apagado.

Si cambian estas fuentes, compilar solo componentes afectados, sin semillas:

```bash
./App/infra/cu015.sh iniciar --compilar nucleo boleteria
npm --prefix App/backend run build
npm --prefix App/backend run build:boleteria
```

Si las mismas imágenes ya están preparadas, reanudar los contenedores siguiendo
la guía. Comprobar once saludables y salud pública/login antes del ensayo.
No ejecutar seeds, down/prune, borrar volúmenes, cambiar recursos globales o
configurar Stripe/correo real.

Crear una salida **nueva e ignorada**, con acceso privado:

```bash
umask 077
export SEGURIDAD_SALIDA="$PWD/App/e2e/.evidencia/recursos-dast-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SEGURIDAD_SALIDA"
git check-ignore "$SEGURIDAD_SALIDA/control"
node App/infra/informe-atributos/seguridad/preparar-recursos.cjs
node App/infra/informe-atributos/seguridad/preparar-dast.cjs
```

La preparación crea once cuentas exclusivas, cuatro fichas (una baja), dos
establecimientos, productos, pedido pagado y evento DAST propio. El único SQL de
alta es de **cuentas nuevas de fixture**, asignadas a roles fijos existentes;
negocio y personal se preparan por API. Roles laborales con prefijo exclusivo
impiden que el algoritmo de reemplazos elija empleados preexistentes. No se
modifican contraseñas demo. Los auxiliares del contrato de contraseña son cuentas
nuevas; su configuración permanece privada.

Si se continúa **la misma ventana** con fixture completa, copiar fixture y estado
ZAP a la nueva salida y omitir ambos preparadores. No volver a preparar una
fixture parcial o un evento caducado: conservar evidencia y diagnosticar.
Para otro día, usar una fixture exclusiva nueva, conservando la anterior.

## Scanner y tres finales

Reutilizar el scanner y `zap-entorno.json` privado conservado por las entregas
anteriores, como en README. Si no existe, crearlo con `zap-entorno.py iniciar`
usando la imagen oficial fijada; no crear otro proyecto ni escanear terceros.

```bash
cp "$SEGURIDAD_ANTERIOR/zap-entorno.json" "$SEGURIDAD_SALIDA/zap-entorno.json"
python3 App/infra/informe-atributos/seguridad/zap-entorno.py reanudar
python3 App/infra/informe-atributos/seguridad/finales-recursos.py
```

Cada final ejecuta: fuentes/imágenes/salud → memoria → matriz semántica →
complemento → filtros HTTP → ZAP activo → memoria. Rechaza sobrescritura de
resultados completos o interrumpidos, cambios de versión entre pasadas, fallos
de control, HTTP 5xx y pérdida de sesión. No reintenta pruebas. Las alertas
se conservan y evalúan: cero alertas no equivale a RNF aprobado.

Por pasada: 302 + 30 controles, cuatro de contexto sin ficha que **no** se
acreditan como autorización; ocho de filtros separados. Recursos propios/ajenos
existen y se comprueban positivamente. Un 404 por ocultación de pedido ajeno tiene
su contraparte propia 200; un 400 de DTO no se usa como prueba de permiso.
Cobertura exacta: 49/159 en ambos canales, incluidas las 41 originales sin rol.

DAST: **3 operaciones / 4 escenarios**: GET Cartelera con categoría propia fija;
PATCH perfil sin sesión; PATCH perfil de Cliente exclusivo; GET pedidos de su
establecimiento con Personal. Dos reglas seleccionadas entre 53 disponibles:
SQLi **40018** y XSS reflejado **40012**, ambas MEDIUM. 62 pasivas conservadas.
La política específica no modifica la predeterminada ni filtra alertas.
Nombres de política/contexto únicos permiten reutilizar el scanner; no cambian
reglas o vectores respecto a las finales documentadas.

Contextos exactos, `recurse=false`, un host/hilo. Vectores query y cuerpo JSON
(mask 3/RPC JSON 4); URI, IDs, cookies y cabeceras no se inyectan. Categoría es
límite de datos y no vector: `addExcludedParam.url` usa **wildcard**, no regex.
Las peticiones finales verifican que permanece fija. La semilla se comprueba en
Sites Tree antes de arrancar. Bearer fresco y regla de cabecera limitada al URL;
se verifica su presencia en **cada** petición activa y sesión 200 antes/durante/
después. Las reglas temporales de cabecera se retiran incluso al fallar.

Presupuesto de scanner: dos minutos por escenario, uno por regla y guardia de
150 s. Debe informar `Complete` con peticiones reales en ambas reglas; un
agotamiento se conserva como cobertura incompleta. Son límites de DAST, no
cambios en aserciones/plazos/reintentos de producto, CI o Playwright.

[API oficial ZAP](https://www.zaproxy.org/docs/api/),
[vectores](https://www.zaproxy.org/docs/desktop/ui/dialogs/options/ascaninput/),
[semántica wildcard del filtro](https://github.com/zaproxy/zaproxy/blob/main/zap/src/main/java/org/parosproxy/paros/core/scanner/ScannerParamFilter.java).
Todas las demás operaciones/familias activas, terceros, mensajes AMQP, correo,
webhooks, pagos, archivos, SSE, mutaciones generales y pruebas de carga quedan
fuera. Motivos y lista completa de reglas disponibles en cobertura/evidencia.

## Regresiones y material del curso

```bash
npm --prefix App/backend test -- --runInBand --testPathPatterns=personal-operativo.service.spec
npm --prefix App/backend test -- --runInBand --testPathPatterns=cartelera.dto.spec
App/backend/node_modules/.bin/tsc --noEmit -p App/backend/tsconfig.json
```

Las dos regresiones HTTP nuevas de Logística están en el arnés CI existente de
Núcleo, con sus recursos exclusivos. En el Mac se comprueban por los scripts
sobre CU-015: no arrancar/truncar otro perfil para repetirlas.

`interlocks-recursos.cjs` es un control dirigido separado, una sola vez por salida.
Guarda intención/checkpoint; `--recuperar` reutiliza exclusivamente esa operación.
En esta entrega recuperó el mismo cancelado/reembolso sin otra compra: siete
controles acreditados y uno de hash anterior no acreditado porque el primer arnés
falló antes de guardarlo. Se conserva ese límite y la referencia previa 16/16;
no se repiten los conjuntos completos por documentación.

`SECURITY-SAFETY.md` relaciona conceptos/diapositivas con código, evidencia y
brechas. Los archivos del curso permanecen fuera de Git. Para exportar esta
sesión histórica con sus archivos privados originales:

```bash
export CURSOS_SEGURIDAD_DIR="/ruta/local/a/las/presentaciones"
python3 App/infra/informe-atributos/seguridad/resumir-recursos.py
```

Exporta solo campos seleccionados; revisar el diff. No publicar fixture, sesiones,
peticiones completas, stderr, QR, trazas, logs ni carpetas de informes.
Al terminar: `zap-entorno.py parar`, `cu015.sh parar`, restaurar solo Redash inicial
una vez y comprobarlo según la guía; devolver también Docker Desktop a su estado
inicial. Ante fallo HTTP conservar estado/evidencia, sin ciclos de reinicio.
