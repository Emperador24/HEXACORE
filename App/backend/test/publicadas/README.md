# Comprobar imágenes publicadas del mismo commit

CD usa workflow_dispatch sobre feature/sebastian-arquitectura. En esa rama publica
`arquitectura-<SHA40>` y `sha-<SHA40>`; no toca main/develop/latest. Los ocho JSON
`imagen-*` del workflow contienen solo nombre, imagen, digest y revisión. No son
manifiestos de datos ni secretos. Ver ESTADO-MIGRACION §24 para ejecuciones reales.

Después del CI y con credenciales apropiadas (gh es opcional, no dependencia del backend):

```bash
gh workflow run cd.yml --repo Emperador24/HEXACORE --ref feature/sebastian-arquitectura
gh run list --repo Emperador24/HEXACORE --workflow cd.yml --branch feature/sebastian-arquitectura
gh run download <RUN_ID> --repo Emperador24/HEXACORE --pattern 'imagen-*' --dir /ruta/privada/imagenes
```

download de gh deja un subdirectorio por artifact; reunir los ocho JSON en un solo
directorio, sin renombrarlos ni combinar revisiones. El workflow comprobacion lo
hace con actions/download-artifact, merge-multiple=true. Rechazar publicaciones
parciales y verificar conclusión/job de cada imagen; un digest por sí solo no
acredita que el sistema haya arrancado.

Desde App/backend con Node 22.22.3, npm ci/build y Docker login al registro si requiere:

```bash
npm ci
npm run build
REVISION_PUBLICADA=<SHA40-del-CD> node test/publicadas/comprobar.cjs /ruta/privada/imagenes
```

El script exige ocho digests y la misma revisión OCI, los descarga por digest,
rechaza builds locales y arranca **hexacore-publicadas-e2e**, base
hexacore_publicadas_e2e. No inicia A/B ni usa sus volúmenes. Comparte sus puertos
de loopback **solo cuando están parados**: PG15439, Redis16384, Rabbit15679/16779,
gateway18082, Core13109, Boletería13117, correo13106/pasarela13105 y portales14200/14201.

Comprueba preparación única, tres programas, ocho imágenes por digest, portales
HTTP (sin navegador), smokes de gateway, cinco pruebas de convivencia, trece
contratos financieros y correo Identidad→RabbitMQ→Trabajador→simulador publicado.
SIGTERM cierra apps; el finally detiene solo ese proyecto, sin borrar volúmenes.
Preserva F12/F13/F14/F15; un fallo se propaga, no se convierte en skip ni se oculta
con una repetición. No prueba carga, correo real, interfaces completas o corte habitual.

CI publica solo backend-resumen (revisión, estados de pasos y conteos de Jest).
No publica .evidencia-e2e ni logs/raw JSON, respaldos, RDB, tokens o correos. Los
artifacts de CD contienen únicamente metadatos de imágenes. El registro de CI/CD
remoto debe indicar SHA exacto; un commit posterior solo documental no cambia
retroactivamente la revisión de las imágenes ya publicadas.

CD compila cada plataforma en su runner nativo (ubuntu-24.04 / ubuntu-24.04-arm),
comprueba uname y no instala QEMU. Une por digest dos compilaciones de la misma
corrida/SHA tras verificar plataforma y etiqueta OCI; mantiene solo los ocho JSON
finales como artifacts. Las etiquetas internas construccion-SHA-RUN_ID-arquitectura
no modifican etiquetas de otras ramas. El smoke completo se ejecuta en amd64;
compilar arm64 no certifica un recorrido completo de negocio en esa plataforma.

Este ajuste evita ejecutar npm/Node bajo el emulador que produjo SIGILL en las
primeras publicaciones; no es una recuperación financiera ni una corrección de F13.
Referencias: [estrategias multiplataforma de Docker](https://docs.docker.com/build/building/multi-platform/)
y [runners nativos disponibles](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
