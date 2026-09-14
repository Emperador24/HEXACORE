# Pruebas de concepto (PoCs)

Código **real y ejecutable** que respalda con evidencia medida las decisiones arquitectónicas del
proyecto, en vez de justificarlas sólo con razonamiento. Cada PoC tiene su `README.md` con el
desafío, las alternativas comparadas, cómo correrlo y el resultado obtenido.

| PoC | Desafío | Atributo | Estado |
|---|---|---|---|
| [`poc-04-lenguaje-backend`](poc-04-lenguaje-backend/) | ¿Qué lenguaje/framework para `services/*`? NestJS vs Spring Boot | Rendimiento (ASR-04), Modificabilidad, Desplegabilidad | ✅ Medido → ADR-09 |
| [`poc-05-cola-mensajes`](poc-05-cola-mensajes/) | ¿RabbitMQ o Kafka? ADR-04 decía ambos | Desacoplamiento, Safety (ASR-13), Trazabilidad (ASR-07) | ✅ Medido → ADR-10 |

## Cómo se escribe un PoC aquí

1. **Código ejecutable**, no pseudocódigo: si alguien clona el repo debe poder correrlo.
2. **Mínimo dos alternativas** comparadas en igualdad de condiciones.
3. **Resultado medido** en el README, con los números crudos guardados (p. ej. `resultados.txt`).
4. **Limitaciones explícitas**: qué no cubre la medición y por qué.
5. Enlace desde el ADR correspondiente y entrada en la Bitácora.

La regla que más veces ha salvado un PoC aquí: **comprobar que el resultado sea internamente
coherente antes de creerle**. En el PoC-04, unos números aparentemente buenos escondían que se
estaba midiendo la política de *keep-alive* del servidor y el modo de ejecución del intérprete, no
los frameworks.
