# Microservicio de Notificaciones

Envío asíncrono de correos. Transversal: lo usa casi todo el sistema.

Salió del Núcleo en la **fase A** de la migración a ADR-14
(ver `Documentation/Work/MIGRACION-ADR-14.md`).

## Por qué es un microservicio

Cumple tres de los cuatro criterios de extracción:

2. **Lo usan varios dominios.** Registro, verificación, recuperación, avisos de
   bloqueo… y le llegarán los de compra y evacuación.
1. **Su carga son ráfagas, no caudal.** Escala por *longitud de cola* y no por
   CPU: con 50 000 mensajes pendientes el procesador puede estar ocioso, y un
   autoescalador que mire CPU no reaccionaría.
4. **Aísla un tercero.** El proveedor de correo y push es externo. Si se cuelga,
   esa latencia no puede meterse dentro de un registro ni de una compra.

## Qué NO tiene

**Base de datos.** Su estado es la cola: lo pendiente está en `cuentas.correos`
y lo que falló tres veces, en su DLQ. Por eso su sonda de salud mira el broker
y nada más — al revés que los servicios que venden, para los que perder el
broker no impide cobrar.

**El publicador.** Se quedó en Autenticación, que es quien tiene algo que
anunciar. Este servicio no sabe de cuentas ni de sesiones, solo de mensajes.
`topologia.ts` y `correo-pendiente.evento.ts` están en los dos lados a
propósito: son el contrato, y duplicarlo es lo que permite que cada servicio
arranque sin el otro (RNF-18).

## Arrancar

```bash
cp .env.example .env
npm install
npm run start:dev     # http://localhost:3006/api/v1/salud
```

Necesita el broker y el simulador de correo en marcha: `cd App/infra && ./iniciar.sh --rol datos`.
