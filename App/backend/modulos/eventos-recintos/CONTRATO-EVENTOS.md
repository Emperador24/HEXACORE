# Contrato: cambios de eventos hacia Boletería

Productor: `modulos/eventos-recintos` (Núcleo, CU-026). Consumidores previstos: Ventas,
Catálogo, Postventa y Acceso QR (Boletería). Fuente de verdad del formato:
`eventos/contrato.ts`.

## Transporte

- Exchange `eventos.gestion`, tipo `topic`, durable. Mensajes persistentes, JSON.
- Claves: `evento.publicado`, `evento.actualizado`, `evento.cancelado`.
- Publicación desde bandeja de salida (outbox): **al menos una vez** y en el orden en que se
  escribieron. `messageId` = `id` del mensaje; `type` = `tipo`.
- Cada consumidor declara su propia cola durable con DLQ y la ata a las claves que necesite.

## Cuerpo

```jsonc
{
  "id": "uuid del mensaje",          // descartar repetidos
  "tipo": "EVENTO_PUBLICADO",        // | EVENTO_ACTUALIZADO | EVENTO_CANCELADO
  "versionContrato": 1,
  "ocurridoEn": "2026-11-03T10:41:00.000Z",
  "secuencia": 42,                   // orden de escritura en la bandeja
  "eventoId": "uuid",                // = eventos_referencia.evento_id
  "versionEvento": 2,                // ignorar si ≤ a la última aplicada
  "evento": {
    "nombre": "…", "descripcion": null, "categoria": "Conciertos", "artista": null,
    "imagenUrl": null, "fechaInicio": "ISO", "fechaFin": "ISO", "aforoMaximo": 14000,
    "permiteReventa": true, "estado": "PUBLICADO", "lugar": "Movistar Arena", "ciudad": "Bogotá"
  },
  "localidades": [
    { "localidadId": "uuid", "nombre": "General", "precio": 80000, "cantidad": 300, "orden": 1 }
  ],
  "cancelacion": { "motivo": "…", "requiereDevolucion": true }   // solo en EVENTO_CANCELADO
}
```

## Qué se espera de cada consumidor

| Mensaje | Catálogo | Ventas | Postventa | Acceso QR |
|---|---|---|---|---|
| Publicado / actualizado | Upsert de `eventos_referencia` y `localidades_evento` (`cantidad` → `aforo`) | Igual, **sin tocar** `vendidas` ni `reservadas` | Upsert de su copia (`permiteReventa`, fecha) | Upsert de su copia (`aforoMaximo`), sin tocar `asistentes` |
| Cancelado | Estado CANCELADO: sale de la cartelera | Estado CANCELADO, no vende más y, si `requiereDevolucion`, devuelve cada compra pagada con la cancelación del CU-003 | Retirar publicaciones de reventa | Rechazar ingresos |

Reglas comunes: idempotencia por `id`; descartar `versionEvento` menor o igual a la aplicada;
una localidad ya no se elimina ni reduce en un evento publicado (el productor lo impide), así
que el upsert nunca tiene que bajar un `aforo` por debajo de lo vendido.

**Estado actual:** el productor está hecho y probado; ningún consumidor existe todavía.
