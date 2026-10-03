# ADR 0004: Señalización con Spring Boot (Java 21) y WebSocket simple

## Contexto
Hace falta un servidor de señalización que enrute mensajes cifrados entre dos dispositivos. Ya se necesita una VM para coturn y Java es el punto fuerte del autor.

## Decisión
Spring Boot 3 + Java 21 con WebSocket simple (JSON, sin STOMP), salas en memoria en una sola instancia, Actuator y Micrometer para métricas, contenedor endurecido (usuario no root, solo lectura).

## Alternativas
- Cloudflare Durable Objects: buen encaje técnico, pero igual se necesita una VM para coturn y se aleja de Java.
- STOMP: añade una capa de protocolo innecesaria para cuatro tipos de mensajes.
- Node.js: mismo lenguaje que el cliente, pero menos práctica para el autor.

## Consecuencias
- Consumo de memoria mayor que una solución mínima; la VM ARM tiene de sobra.
- Estado en memoria: reiniciar pierde las salas; escalar horizontalmente requeriría Redis o enrutado por `roomId`.
- El protocolo se define en `docs/protocol.md` porque cliente y servidor no comparten código.
