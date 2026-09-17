# Claves de firma de tokens — SOLO DESARROLLO

> ⚠️ **Estas claves son públicas: están en el repositorio.** Cualquiera que lo lea puede fabricar
> un token de administrador firmado con `jwt-privada.pem`. Sirven para levantar el sistema en local
> sin configurar nada, y **para nada más**. El Servicio de Administración se niega a arrancar en
> producción si detecta que está usando esta pareja.

| Archivo | Quién lo usa | Para qué |
|---|---|---|
| `jwt-privada.pem` | **Solo** el Servicio de Administración | Firmar los tokens de sesión (RS256) |
| `jwt-publica.pem` | Todos los microservicios que exigen sesión | Verificar esos tokens |

## Por qué dos claves y no un secreto compartido

Con un secreto compartido (HS256), cada servicio que verifica tokens **también puede fabricarlos**:
bastaría con comprometer el servicio de parqueaderos para emitir un token de administrador. Con
RS256, la clave pública solo sirve para verificar. Ver `services/administracion/DECISIONES.md` §7.

## En producción

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-privada.pem
openssl pkey -in jwt-privada.pem -pubout -out jwt-publica.pem
```

La privada se entrega **únicamente** al Servicio de Administración (`AUTH_JWT_CLAVE_PRIVADA_ARCHIVO`);
la pública, a los demás (`AUTH_JWT_CLAVE_PUBLICA_ARCHIVO`). Ninguna de las dos va al repositorio.

El contrato completo del token está en `shared/seguridad/token-sesion.md`.
