# Pruebas de Identidad

Las 43 pruebas unitarias propias y el doble de TypeORM (ahora compartido en
`../../test/dobles`) se ejecutan con `npm test` desde `App/backend`. El doble
acepta los tokens de conexión nombrados y se limita a las unitarias.

La [integración real](../../test/README.md) usa las conexiones auténticas de
Identidad y Alimentos y conserva el proceso compilado, sin mappers ni providers
reemplazados. Los guiones HTTP de `pruebas/` son históricos y no se ejecutaron
sobre los datos habituales.
