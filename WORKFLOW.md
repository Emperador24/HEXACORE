# Flujo de trabajo del equipo

Convención acordada a partir de la indicación del profesor. Aplica desde que empecemos a escribir
código en `App/`.

## 1. Ramas en este repo (HEXACORE)

```
main                    protegida — solo recibe PR desde develop, cuando develop está estable
 └─ develop              rama de integración — aquí se junta el trabajo de todos
     ├─ feature/daniel    Daniel Cristancho
     ├─ feature/samuel    Samuel Emperador
     ├─ feature/sebastian Sebastián Sánchez
     └─ feature/diego     Diego Coronado
```

- Cada integrante trabaja en su propia rama `feature/<nombre>`, creada desde `develop`.
- Al terminar un cambio, se abre PR de `feature/<nombre>` hacia `develop` (no directo a `main`).
- Cuando `develop` está en un estado estable y probado, se abre PR de `develop` hacia `main`.
- `main` sigue protegida (ver `README.md`): nada se sube ahí directo.

Estas ramas todavía no se han creado en el repo (se crean cuando el equipo empiece a escribir
código, no como parte de este scaffold).

## 2. Repo personal de experimentación (uno por integrante, fuera de HEXACORE)

Además de este repo, **cada integrante mantiene su propio repositorio aparte** (en su cuenta
personal, no dentro de HEXACORE) para probar cómo funciona una táctica o patrón arquitectónico de
forma aislada — por ejemplo: circuit breaker, redundancia/failover, bloqueo distribuido, colas de
mensajes, caché — **antes** de aplicarlo en un servicio real de `App/`.

Ese repo no es una copia del proyecto ni corre contra sus servicios: es un sandbox pequeño y
desechable por patrón (puede ser un solo script o un mini-proyecto) para entender el mecanismo.

Ejemplos de lo que puede vivir ahí (no es una lista cerrada):
- Circuit breaker frente a un servicio externo simulado que falla.
- Redundancia/failover con dos instancias y un balanceador simple.
- Bloqueo distribuido (equivalente al uso de Redis en ADR-03) sobre un recurso compartido.
- Reintentos y colas para operaciones asíncronas (equivalente a ADR-04).

Nombre sugerido: `<nombre>-pattern-lab` (ej. `samuel-pattern-lab`). Cada quien decide su propio
stack para estas pruebas.

## Referencia

Ver `App/README.md` para la estructura de la aplicación y `Documentation/Work/DescripcionArquitecturaSoftware.tex`
para las decisiones (ADR) y atributos de calidad (ASR) que motivan cada patrón.
