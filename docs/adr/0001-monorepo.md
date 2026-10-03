# ADR 0001: Un solo monorepo

## Contexto
El proyecto tiene un cliente (TypeScript), un servidor de señalización (Java) e infraestructura. El protocolo entre cliente y servidor cambia en ambos lados a la vez.

## Decisión
Un único repositorio público `chasqui` con `apps/web`, `apps/signal`, `infra/` y `docs/`. El CI filtra por carpeta para construir solo lo que cambió. `docs/protocol.md` es el contrato entre ambos lados.

## Alternativas
- Tres repositorios (web, signal, infra): versiones desfasadas y PRs coordinados a mano.
- Monorepo con herramienta de orquestación (Nx, Turborepo): innecesario con solo dos apps de lenguajes distintos.

## Consecuencias
- Un cambio de protocolo es un solo commit y un solo PR.
- Mejor presentación para portafolio: un repo completo con README y diagramas.
- Se partirá solo si una pieza se vuelve reutilizable (por ejemplo, una librería `chasqui-protocol` en npm).
