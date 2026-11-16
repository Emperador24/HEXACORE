# Identidad dentro de Núcleo

Fuente única trasladada desde `App/services/autenticacion`. Conserva cuentas,
sesiones, renovación, revocación y administración de cuentas; no equivale al
CRUD completo de permisos/recintos/proveedores del plan.

Instalar, compilar, migrar y arrancar desde [el workspace](../../README.md).
Usa la conexión TypeORM `identidad`, esquema `identidad` y destino común
POSTGRES_BD (hexacore por defecto). La variable antigua se rechaza. Sus tres migraciones y entidades se conservan sin modificar.
Las decisiones históricas de seguridad están en [DECISIONES.md](DECISIONES.md).
Las pruebas unitarias están junto a las fuentes; [la integración aislada](../../test/README.md)
comprueba la convivencia real con Alimentos. Los guiones `pruebas/` históricos
siguen disponibles, con sus efectos sobre datos documentados; no se ejecutaron
en el entorno habitual en esta etapa.
