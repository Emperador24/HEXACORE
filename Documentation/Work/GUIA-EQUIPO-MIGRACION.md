# Continuar el desarrollo después de la migración

La rama feature/sebastian-arquitectura migró **lo existente** y se integró en develop
mediante el PR #44 (2/11/2026). No entrega los 32 CU completos: cada integrante
conserva el reparto del SRS (§5, tabla reparto) y continúa en su propia rama
`feature/<nombre>` a partir de develop. ADR-16 sustituye la topología anterior;
requisitos de negocio y RNF no cambian. El corte del entorno habitual sigue pendiente.

## Ubicaciones y responsables

| Integrante / CU del SRS | Ubicación | Migrado / pendiente |
|---|---|---|
| Daniel Cristancho, CU-001–005 | App/backend/modulos/entradas: ventas, catalogo, fila, acceso-qr | Compra, promoción, cancelación/reembolso según políticas existentes, consulta, ingreso y turnos. Conserva proyecciones, concurrencia y límites financieros; no acredita QR inmediato/F12. |
| Daniel, CU-021–023 | modulos/parqueaderos, **destino futuro**, dentro de Núcleo | No hay backend migrado de reserva/ingreso/asignación vehicular. Pantallas no equivalen a implementación. |
| Samuel Emperador, CU-006 | modulos/entradas/postventa y API de ventas | Reventa/transferencia e historial existentes; liquidación/notificación aún registran lo que enviarían, sin abono real certificado. |
| Samuel, CU-007–009 | modulos/personal-logistica, Núcleo, compartido con CU-017/018 | Empleados, asignación, cambios y asistencia trasladados. No crear otra ficha/turnero. Completar alternativas de sus CU; revisar F14 junto a Diego. |
| Samuel, CU-010 | apps/operacion y modulos/operacion, **destinos futuros** | Evacuación y alertas/acuses ausentes. No hay proceso Operación vacío que arrancar. |
| Samuel, CU-024–025 | modulos/parqueaderos, futuro | Cobro y ocupación pendientes; el CU-024 no implica pago electrónico nuevo. |
| Samuel, CU-026 | modulos/eventos-recintos, futuro en Núcleo | Hay referencias/fixtures en otros módulos, no administración de eventos terminada. Acordar contratos con Entradas. |
| Sebastián Sánchez, CU-011–015 | modulos/alimentos, Núcleo | Checkout/reservas/pago/confirmación/QR existentes. CRUD completo, preparación/entrega y validación única de entrega siguen pendientes. F12 no se implementó. |
| Sebastián, CU-027–028 | modulos/identidad, Núcleo | Cuentas, sesiones, renovación/revocación, roles/guardas y administración existentes; permisos dinámicos completos pendientes. |
| Sebastián, CU-029 | modulos/eventos-recintos, futuro | Recintos/zonas administrables pendientes; no confundir con zonas de asignación laboral ya existentes. |
| Diego Coronado, CU-016–018 | modulos/personal-logistica, Núcleo | Planificación completa pendiente; base de asignación/turnos/asistencia trasladada. Coordinar solapamiento con Samuel. F14 conserva listado global. |
| Diego, CU-019–020 | apps/operacion y modulos/operacion, futuros | Monitoreo/incidentes no implementados. No atribuirlos al antiguo nombre eventos-emergencias. |
| Diego, CU-030 | personal-logistica/proveedores, destino funcional futuro | Proveedores/recursos y su planificación pendientes; sin nuevo servidor. |
| Diego, CU-031 | modulos/finanzas/pagos, Núcleo/Boletería | Libro/cobros/reembolsos/pasarela existentes; conciliación administrativa y recuperación durable F12 pendientes. |
| Diego, CU-032 | modulos/informes, futuro en Núcleo | Consulta/exportación completa pendiente; no hay MongoDB o réplica de lectura implementados. |

Comunicaciones es soporte compartido: el Trabajador carga solo el correo existente.
Sus límites F15 se revisan entre dueños de Identidad/correo; no se traslada automáticamente
allí el negocio de los demás. F13 es deuda de consultas/recursos a investigar con
los dueños afectados; el informe conserva sus consultas/observaciones, sin subir límites.
La migración no reasigna a Sebastián los pendientes del resto.

## Instalar, preparar y arrancar

Para revisión manual aislada:
[guía del entorno local de revisión](../../App/infra/revision/README.md).
Su guion solo arranca desde la rama `feature/sebastian-arquitectura`
(comprobación de `App/infra/revision/revision.py`); desde otra rama se rechaza.
Construye desde fuentes y aísla datos, proveedores, claves, cookies y puertos;
la primera carga demo es explícita y los siguientes arranques conservan cambios.
Los comandos generales de desarrollo que siguen no sustituyen ese aislamiento.

Desde App/backend, Node **22.22.3** (`nvm install && nvm use`):

```bash
npm ci
cp .env.example .env
npm run lint
npm run build
npm run build:boleteria
npm run build:trabajador
```

Editar destinos antes de escribir. Una sola POSTGRES_BD=hexacore y coordenadas
POSTGRES_HOST/PUERTO/USUARIO/CONTRASENA comunes. Las variables antiguas POSTGRES_BASE,
POSTGRES_BD_* por módulo y DB_* se rechazan. Cada conexión nombrada usa un esquema.
La base debe existir; en instalación Docker **nueva** initdb la crea.

```bash
npm run datos:preparar                  # una vez, antes de habilitar apps
npm run migracion:identidad:estado
npm run migracion:postventa:estado
PUERTO=3002 npm run start:prod          # terminal 1
PUERTO=3001 npm run start:boleteria      # terminal 2
cp apps/trabajador/.env.example .env.trabajador
npm run start:trabajador               # terminal 3, solo broker/correo
```

No poner migraciones en bootstraps ni en cada réplica. synchronize/migrationsRun=false.
Las 18 fuentes históricas permanecen congeladas. Una migración futura debe registrarse
en la preparación coordinada y ampliar sus comprobaciones, **sin editar ni renombrar
los historiales originales**; actualmente se valida el conjunto de 18 conocido.

Solo Núcleo recibe privada JWT/HMAC. Boletería y gateway reciben pública y usan
revocación. Trabajador no necesita claves, SQL, Redis ni Finanzas. Pagos se importa
por API pública; no crear endpoints de cobro/reembolso al importar el módulo.

En instalación nueva con Docker, después de revisar configuración:

```bash
docker compose -f App/infra/docker-compose.yml --profile servicios config -q
# Desde raíz y SOLO en instalación nueva o después del corte autorizado:
docker compose -f App/infra/docker-compose.yml --profile servicios up -d --build --wait
```

No ejecutar ese up sobre el entorno habitual anterior para migrarlo. Su procedimiento
está en [CORTE-Y-REVERSIÓN](CORTE-Y-REVERSION.md), todavía **no ejecutado**.
Semillas destructivas no son instalación de esquema ni prueba de migración.

## Probar y revisar cambios

[Guía A/B](../../App/backend/test/base-unica/README.md) y [guía general](../../App/backend/test/README.md).
No usar bases habituales ni los guiones HTTP históricos que siembran/pausan recursos.
Los recursos A/B conservados son referencias: las pruebas que escriben usan copias.

```bash
npm run verificar:infra
npm run test:infra
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16384 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16384 npm test -- --runInBand
npm run test:e2e
npm run test:boleteria
npm run test:imagen:infra
npm run test:imagen
npm run test:boleteria:imagen
npm run test:pagos:contratos
npm run test:pagos:convivencia
npm run test:limpiar                    # stop propio; conserva volúmenes
```

Parar imágenes antes de las suites por proceso; detalles/variables A/B en la guía.
Los tests financieros comprueban que webhook no finaliza pedidos inciertos: eso es
F12 caracterizado, no resuelto. Las esperas QR son convergencia, no garantía inmediata.
No interpretar la repetición aprobada como solución de F13/F15 intermitentes.

Integrar hacia develop por PR revisado, sin auto-merge. Coordinar archivos compartidos
(package.json/lockfile, composición, preparación y contratos), mantener una fuente de
reglas por dominio y agregar pruebas relevantes. La migración ya está en develop.

## Datos de demostración

Las semillas de Entradas (Ventas, Catálogo, Postventa y Acceso QR) contienen solo
eventos publicados y vigentes: HEXACORE Fest, Rock Nacional, Gala, Feria Gastronómica,
Sinfónica, Clásico, Salsa al Parque, Coffee Week y Stand-up. Se retiraron los fixtures
que la aplicación no podía usar: Jazz al Atardecer (fuera de plazo), Festival de
Verano (pasado), El Mago de Oz (borrador), Torneo de Voleibol (cancelado), sus
localidades, las entradas usada/anulada/de evento pasado y los cupones `ULTIMO` y
`VERANO5`. Los casos de las pruebas Python que dependían de ellos (compra parcial,
evento no a la venta, cupón vencido o agotado, cancelación fuera de plazo, puerta de
evento cancelado, borrador/cancelado/pasado en cartelera) se quitaron y deben
rehacerse con datos propios de cada prueba. Los volcados SQL de las ocho bases
antiguas (`App/infra/datos-demo/*.sql`) se eliminaron. Detalle en ESTADO-MIGRACION §26.

## Evidencia y documentos

ADR-16 / ArquitecturaVigente.tex y los siete diagramas de Diagrams/Archify (incluidos en
LaTeX desde Diagrams/ArchifyPDF) son fuentes actuales; §26 de ESTADO-MIGRACION registra
la integración a develop. Historico, ADR anteriores y PoCs conservan decisiones/mediciones previas, no inventario
vigente. ESTADO-MIGRACION §23 guarda referencia local; §24 registra CI/CD reales,
digests y bloqueos. Los PDF solo se actualizan después de compilar las fuentes.

El archivo local App/services/pedidos/src/pagos/eventos/publicador-pedidos.service.ts
está fuera del workspace y no se publica: contiene una llave adicional que impide
parsearlo y referencias locales ausentes. Revisarlo después con su propietario,
comparando con la implementación vigente de Alimentos; no copiarlo sin revisión.
