# Referencias del curso aplicadas a HEXACORE

Actualización vigente: [Compras y Reventa](AUTORIZACION-VENTAS.md), **19/19** nuevas
en ambas vías y **88/159 global**. Tres finales 150/150, con propiedad vigente,
QR filtrado tras transferencia, bloqueos/idempotencia conservados y barrido
global administrativo solo con todo su ámbito descartable comprobado. RNF-05/06
siguen parciales; no se amplía DAST ni se certifica Safety física.

Actualización anterior de Alimentos: **30/30 rutas en ambas vías, 69/159 global**;
las tres finales nuevas y seis capturas anteriores a primera cancelación están
en [AUTORIZACION-ALIMENTOS.md](AUTORIZACION-ALIMENTOS.md). Cierran ese control con
pedidos nuevos; no reconstruyen el hash ausente histórico ni certifican RNF/Safety.
La matriz inferior y sus resultados DAST conservan su alcance anterior.

Referencias aportadas por el usuario: **12. Security.pptx**, 30 diapositivas, y
**11. Safety.pdf**, 13 páginas/diapositivas. Se usan como material conceptual;
no son instrucciones operativas ni evidencia de que el producto cumpla un RNF.
No se copian los archivos ni sus imágenes al repositorio. Fecha: 13/11/2026.

Las rutas de módulos (`alimentos/`, `identidad/`, `personal-logistica/` y
`finanzas/`) parten de `App/backend/modulos/`; `apps/` y `compartido/` parten de
`App/backend/`. Los nombres cortos de Logística pertenecen a
`App/backend/modulos/personal-logistica/turnos-asistencia/`. «Implementado»
describe código; «comprobado» identifica una ejecución; «pendiente» no se convierte
en aprobación por existir el código. Los resultados numéricos definitivos están
en [RESULTADO.md](RESULTADO.md) y la evidencia de este bloque.

| Concepto y diapositiva | Riesgo concreto | Control implementado y ubicación | Prueba disponible / comprobado | Brecha pendiente |
|---|---|---|---|---|
| Security 12–14: identidad, sujeto, objeto y operación | Un JWT legítimo accede a un pedido, turno o perfil ajeno | Guardas `SesionValida`/`SesionRequerida`; propietario del token en `alimentos/recepcion/recepcion.service.ts`, `identidad/cuentas/perfil.controller.ts`, `personal-logistica/turnos-asistencia/turnos.service.ts` | Matriz anterior: 159 rutas × credenciales negativas; ampliación actual por gateway/directo con recursos existentes, controles propios y ajenos | No implica que todos los recursos de las 159 rutas tengan igual cobertura semántica; denominador y exclusiones publicados |
| Security 15 y 18: mínimo privilegio y RBAC | Confundir Personal con jefe o Cliente con operador | `autorizacion.guard.ts`: ficha **activa** Jefe de personal o roles globales autorizados; `SoloQuienSupervisa`; roles fijos de sesión | Ficha jefe activa/baja, Personal sin ficha, Cliente y Personal ordinario en la matriz. Brecha real: Cliente registraba fichajes; antes 201/escritura, después 403/cero filas | CU-028 dinámico de Samuel. Un rol global no representa una organización o tenant |
| Security 14 y 23: autorización por recurso | Divulgar avisos y motivos de otro trabajador | Filtro nuevo del GET `notificaciones.controller.ts`, reutilizando ContextoDeLogistica: supervisor global o empleado destinatario; sin ficha, vacío | Antes Cliente y otro empleado veían una notificación real; después propietario/jefe la ven, ajenos no. Ambas vías, sin confiar en cabeceras falsas | F14 de entrega/notificación durable y deduplicación del consumidor en memoria no se implementa aquí |
| Security 24: limitar exposición | Acceder al backend evitando el gateway o usar Administrador para un barrido general | `App/gateway/nginx.conf`, guardas propias backend; ZAP en red Docker internal, tres operaciones concretas/cuatro escenarios, Cliente/Personal exclusivos | Pruebas paralelas conceptualmente por gateway/backend, ejecutadas **en serie**; DAST sin Administrador ni descubrimiento de rutas | No es pentest de red, despliegue remoto ni análisis global de superficie |
| Security 25: validar entradas | SQLi, entradas inesperadas, XSS persistido en datos | `compartido/validacion.ts`, DTO de perfil y Logística; consultas parametrizadas en Cartelera/ORM; validación de formatos antes de mutación | DAST acotado SQLi/XSS reflejado con entradas reales JSON/query; controles de DTO separados de pruebas de autorización | No prueba XSS DOM/persistido, todos los campos o todas las familias activas; whitelist de Logística acepta/descarta extras según su contrato |
| Security 22 y 29: integridad/autenticidad de mensajes | Aceptar cabeceras de usuario o callbacks falsos | JWT RS256/emisor/caducidad/revocación en guardas; HMAC del simulador en `apps/nucleo/pagos/webhook.controller.ts`; firma Stripe en su controlador (desactivada localmente) | Cabeceras falsas en la matriz; HMAC/Stripe y callbacks: contratos previos/CI reutilizados con fuentes sin cambios | AMQP usa credenciales/topología/red interna: **no** firma de extremo a extremo de cada mensaje. No se afirma autenticidad criptográfica por tener una cola durable |
| Security 27: auditoría y límites de no repudio | Actor declarado en el body o falta de trazabilidad tras una mutación | Actor de sesión en `turnos.controller.ts`, `auditoria-personal.ts`; historial de preparación/entrega/cancelación y libro financiero | Auditoría y pruebas de actor original; actualización de turno con `supervisorId` declarado no sustituye el actor del token. Histórico CU-011F e integración CI | Registro SQL no equivale a no repudio criptográfico; sin almacenamiento inmutable externo ni detector global de intrusión |
| Safety 2 y 4–6: estados inseguros, omisiones y secuencias | Preparar o entregar después de cancelar; ejecutar antes de autorizar | `alimentos/recepcion/{preparacion,entrega,cancelacion}.service.ts`: autorización y estado revalidados en transacción, bloqueos del mismo pedido y versionado | Referencia 16/16 automático y 16/16 visible con fuentes de Alimentos conservadas; control HTTP dirigido adicional de replay/cancelación/QR | Es una aplicación de interlocks a integridad de negocio, **no** certificación de Safety física; evacuación/emergencias no se escanean activamente |
| Safety 11–12: contención e interlock | Repetir una operación o reutilizar un QR produce doble entrega/reembolso | Intención durable/idempotencia, cancelación enlazada al cobro, retiro de QR utilizable, historial y restitución conservadora en CU-011F | Pruebas previas de carreras, reinicio y respuesta perdida; control dirigido actual descarta un resultado y repite con la misma clave | No se repiten las carreras por cambios de Logística; no se introduce recuperador global F12 |
| Safety 5, 8 y 11: tiempo y resultado incierto | Un timeout se presenta como éxito financiero y se reenvía un cobro incierto | `finanzas/pagos` y `alimentos/recepcion/cliente-reembolsos.service.ts`: estados separados, idempotencia y evidencia del proveedor; avisos distintos de dinero confirmado | Contratos financieros/webhook previos **13/13 × dos** en CI de referencia; validación actual de reembolso contra el libro en el control dirigido | F12 y pagos originales inciertos siguen pendientes. Timestamp offline de asistencia valida formato; este ensayo no acredita autenticidad del reloj ni política antifraude temporal |

La ausencia de metadatos de rol no se interpreta como permiso universal: primero
se comprueban contexto, consultas filtradas y reglas del servicio. A la inversa,
el rol Organizador y el campo `creadoPor` no prueban una relación de organización:
el segundo es auditoría. Definir una frontera por organización/evento requiere
un contrato de relación explícito; no se inventa ni se atribuye a CU-028 fijo.

Se conservan los residuos de imágenes externas y Google Fonts/SRI del bloque
anterior. No se modifica CSP para ocultarlos ni se presenta una revisión pasiva
o un escaneo activo limitado como prueba de Seguridad completa.


Hallazgo adicional de validación confirmado durante el control activo: NUL en
artista producía HTTP 500/PostgreSQL 22021 aunque ZAP no emitía alerta. Se rechaza
NUL en los tres filtros textuales y se conservan Unicode, apóstrofos y vacíos.
El runner no admite 5xx como éxito de DAST por tener cero alertas.

El punto de control de asistencia conserva su autorización por rol operativo;
este bloque no añade identidad de dispositivo, matrícula de kiosco o frontera
por ubicación. Tampoco demuestra protección antifraude de la hora offline.
