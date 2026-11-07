# Cierre de Alimentos — Sebastián

Revisión inicial: 7 de noviembre de 2026 (America/Bogota). Rama
`feature/sebastian`, limpia en `a2e85d5517b8cee02a83df508dd9784fbff9de28`,
coincidente con origin antes de editar. ADR-16 conserva módulos y preparación
central; no autoriza el corte de las bases habituales.

| CU | Implementación encontrada | Comportamiento comprobado en esta entrega | Pendiente |
|---|---|---|---|
| 011 | Catálogo, checkout, reserva Redis, pagos, confirmación y QR | Por ejecutar: regresión real tras CU-015 | F12 y cancelación del establecimiento CU-011F siguen pendientes; no se resuelven al deshabilitar |
| 012 | Consulta de menú y activación de productos | Por ejecutar: límites de acceso por establecimiento | CRUD completo, precios, restricciones e inventario coordinado con reservas |
| 013 | Recepción de confirmados, solo lectura | Por ejecutar: acceso acotado al establecimiento | Preparación, tiempos, transiciones y avisos |
| 014 | QR de pedido generado por 011 | Sin evidencia nueva todavía | Validación, entrega única y registro durable |
| 015 | Entidad y consulta pública; sin contacto/horario ni gestión administrativa | Sin evidencia nueva todavía | Implementar y demostrar en esta misma entrega |

Orden: CU-015 completo → CU-012 → CU-013 → CU-014; mantener regresión CU-011
en cada etapa. La columna de comprobaciones se actualizará solo con resultados
ejecutados, distinguiendo código presente de comportamiento probado.

## Alcance y acuerdos

- CU-015 vigente es **Gestionar establecimientos de alimentos** (SRS, flujo
  básico y alternativos A/B). Las referencias antiguas a cancelaciones/reembolsos
  no crean otro CU. CU-011F y los requisitos de pedidos cancelados de CU-013/014
  se conservan como pendientes de reglas/transiciones de negocio.
- Acuerdo verificable: `git show 5950dea54c3dcafd20fe215ee392008a4663fa30:App/services/administracion/README.md`,
  líneas 16–17: CU-027 y CU-028 los implementa Samuel por acuerdo del equipo.
  CU-027 tiene cuentas, sesiones, recuperación, renovación/revocación y portal;
  reutilizarlos. CU-028 mantiene roles estáticos y guardas; permisos dinámicos
  son dependencia pendiente de Samuel, no parte de esta entrega.
- CU-029 implementado por Samuel: módulo Eventos/Recintos, migraciones, pantallas
  y pruebas existentes. Reutilizar la fuente de eventos CU-026 y revisar su API,
  sin rehacer CU-029. CU-030–032 no se reasignan a Sebastián.
- Sebastián lidera la validación de Seguridad RNF-05/06; los resultados aquí son
  evidencia acotada, no certificación global. Documenta pantallas/navegación de
  Alimentos para Usabilidad; Daniel consolida el atributo.

## Entorno y decisiones por verificar

Docker estaba detenido; se inició y se inventariaron los recursos. Existen el
entorno habitual, revisión de arquitectura y referencias A/B. Se conservarán:
CU-015 tendrá proyecto, volúmenes, red, claves, cookies y puertos propios.
Las tareas pesadas se ejecutan secuencialmente (Mac M2, 8 GB).

Horario diario con horas locales y zona IANA explícita (`America/Bogota` inicial),
cruce de medianoche y límites documentados. El estado y horario se consultan al
crear pedidos nuevos; nunca cancelan ni reembolsan pedidos anteriores.
La existencia/disponibilidad de eventos se obtiene por interfaz del dueño vigente,
sin considerar la proyección histórica de Alimentos como autoridad.

Las cuentas de Personal se reutilizarán mediante un vínculo persistente
cuenta–establecimiento. El rol Personal por sí solo no concederá acceso global.
Esto no implementa el sistema general de permisos dinámicos CU-028.

## Hitos

1. Revisión, trazabilidad y plan (este documento).
2. Backend CU-015, migración aditiva, frontera Eventos y autorización.
3. Portal administrativo y entorno aislado reproducible.
4. Playwright TypeScript con gateway/portales reales, regresión y publicación
   exclusiva en `origin/feature/sebastian`.

Los comandos, resultados, fallos previos, limitaciones y commits se registrarán
al verificar cada hito. El archivo respaldado `publicador-pedidos.service.ts`
fuera del repositorio se conserva allí y no se reincorpora.
