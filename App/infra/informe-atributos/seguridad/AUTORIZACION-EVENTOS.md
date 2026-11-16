# Autorización de Eventos y Recintos — 14/11/2026 Bogotá

**16/16 operaciones nuevas; global 129/159, 30 pendientes. RNF-05/06 parciales.**
[Métodos/rutas y reglas](COBERTURA-RECURSOS.md), [resultado](RESULTADO.md) y
[evidencia permitida](EVENTOS-RECINTOS-EVIDENCIA.json). Inventario contrastado:
178 declaradas, 173 expuestas, 159 protegidas; GET no duplica HEAD implícito.
Las 113 anteriores se reutilizan, incluida la corrección SSE de Parqueaderos.

## Contratos y corrección

Organizador y Administrador consultan Eventos (lista, detalle, disponibilidad).
Solo Organizador crea, edita, publica, cancela y elimina Eventos. Las ocho
operaciones de Recintos, incluido el plano, permiten ambos roles. Cliente y
Personal reciben 403 con sesión válida y cuerpos/versiones/recursos válidos.
Los roles son globales: otro Organizador puede operar recursos nuevos de A;
`creadoPor`/`actualizadoPor` son auditoría de sesión. No hay propiedad por creador
ni aislamiento de organizaciones. Las cabeceras de identidad/rol no sustituyen
la sesión; consultas con `creadoPor` no introducen un filtro de propiedad.

Antes de corregir se demostraron en ambos canales dos reasignaciones mediante
altas autorizadas: un `zonas[].id` existente movía la zona al recinto nuevo;
un `localidades[].id` existente movía la localidad al evento nuevo. El DTO
compartido acepta esos ids para edición y TypeORM `save` actualizaba la fila.
`90f0d02` genera identidades nuevas al crear e ignora esos ids; mantiene la
edición por id. Dos regresiones HTTP nuevas comprueban identidad y conservación
del recurso original e historial. La matriz repite ambos controles por canal.
No se modifica ningún permiso ni se añade un caso de uso.

## Ensayo y comparaciones

Cinco cuentas nuevas (dos Organizadores), recintos, zonas, eventos y sesiones
exclusivos. Gateway `127.0.0.1:18100` y Núcleo `127.0.0.1:13149`, Bearer en
Authorization; HTTP 10 s, ejecución serial, sin reintentos. Base vacía nueva,
migraciones sin semillas, Redis/volumen/vhost propios y proveedores simulados.
No usar la semilla de Alimentos sobre datos conservados.

Cada final contiene **218 observaciones**: 206 semánticas, ocho de contexto,
dos de DTO y dos de estado. **76 rechazos de autorización** (74×403 + 2×401),
separados de los 400 de contexto/DTO y 409 de versión. Positivos de las 16
operaciones por cada canal. Los errores por inexistencia no acreditan cobertura.

**88 comparaciones completas por final, 44 por canal:** contenido de 74 tablas
de los once esquemas de negocio de la base nueva, historial/versiones, planos
(SHA-256, tipo, tamaño y fecha), secuencias y DUMP/expiración absoluta de Redis.
Se ordenan tablas por nombre y filas por contenido antes de comparar.
En `eventos_salientes` se excluye solo `publicado_en`, acuse asíncrono; cuerpo,
clave, secuencia y fecha de creación se conservan. Los rechazos no producen
efectos. Se verifican los dos mensajes propios de publicar/cancelar y su contexto
de localidades. No se exige convergencia en Boletería ni se reabre el fallo
histórico de outbox; compras/eventos previos quedan fuera del ensayo.

Zonas ajenas al recinto y localidades ajenas al evento se prueban con ids
existentes y controles positivos. Disponibilidad conserva el conflicto publicado
al excluir un evento de otro recinto. Edición conserva ids e incrementa versión;
publicar/cancelar usan estados/versiones vigentes; eliminar usa un borrador nuevo
nunca publicado y mantiene historial. Planos A/B de bytes diferentes: subida,
descarga y retirada con ambos roles; ruta determina recinto aunque query/campo
multipart indique otro. Se comprueban hash/bytes, MIME y caché privada, y que B
permanece intacto tras operar A. Los PNG diminutos son fixtures existentes.

## Herramientas y reproducción

Seguir primero [la alternancia y restauración](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md).
Registrar todos los estados iniciales y detener Redash una vez; si las aplicaciones
CU-015 estaban activas, detener solo las propias necesarias tras validar ids e
imágenes. El preparador de aislamiento se niega a continuar con Núcleo original
activo. No ejecutar `preparacion-base` al reanudar contenedores conservados.

En una carpeta privada **nueva e ignorada**, con `SEGURIDAD_SALIDA` absoluto,
Node 22.22.3, backend compilado e infraestructura propia ya disponible:

```bash
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs iniciar hexacore-seg-parq-nucleo:eventos-recintos-FECHA
node App/infra/informe-atributos/seguridad/preparar-eventos.cjs
node App/infra/informe-atributos/seguridad/eventos-recursos.cjs desarrollo
python3 App/infra/informe-atributos/seguridad/finales-eventos.py
```

Reutilizar el preparador de aislamiento de Parqueaderos para la base/Redis/vhost
nuevos; **no** ejecutar su preparación de tarifas ni su matriz de 300 controles.
`sondear-eventos.cjs` conserva la demostración previa; requiere la versión
vulnerable y recursos nuevos, no es una prueba de aceptación del código corregido.
Si cambia producto, compilar y usar `cambiar-imagen` del entorno antes de medir.
`procedencia-eventos.py` contrasta 26 JS de Eventos y 21 de Parqueaderos/SSE,
gateway, fuentes e imágenes antes/después; `finales-eventos.py` detiene la serie
ante fallo y nunca sobrescribe resultados. `resumir-eventos.py` exporta una lista
permitida desde esta ventana concreta; no publica SQL, cuerpos, planos o sesiones.

La primera serie conservada tuvo final 1 aprobado y final 2 interrumpido tras
199 observaciones: HTTP 403 correcto, pero Parallel Append alteró el orden de
las 74 tablas de UNION ALL. Comparación por nombre confirmó igualdad de todo el
contenido, planos, secuencias y Redis. Se corrigió solo el comparador y se inició
una serie nueva `finales-eventos.py normalizada`: **3×218/218**, mismos límites,
fuentes e imágenes del producto. No hay reintentos automáticos. Los resultados
iniciales y su diagnóstico permanecen privados; el resumen permitido los registra.

Al terminar: `parqueaderos-entorno.cjs parar`, restaurar una sola vez con
`restaurar-parqueaderos.py` y comprobar todos los estados originales. Esta ventana
comenzó con CU-015 y Redash activos: se restauraron ambos, Docker activo, 98
originales intactos y tres nuevos detenidos. Restaurar estados no acredita HTTP
ni estabilidad de Redash: al último control seguía bloqueado con nuevos OOM.
Sin reinicios de recuperación, limpiezas globales o intervención en otros proyectos.
