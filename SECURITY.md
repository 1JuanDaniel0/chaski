# Política de seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa los avisos de seguridad privados de GitHub:

1. Ve a la pestaña **Security** del repositorio.
2. Pulsa **Report a vulnerability** (GitHub Security Advisories).
3. Describe el problema, los pasos para reproducirlo y el impacto que crees que tiene.

Intento responder en unos 7 días. Es un proyecto personal y de código abierto, así que no hay recompensas, pero sí daré crédito si lo deseas.

## Qué está dentro del alcance

- El cliente web (`apps/web`): XSS, fuga del secreto del fragmento (`#k=`), fallos de criptografía, CSP.
- El servidor de señalización (`apps/signal`): validación de `Origin`, límites, fuga de datos, enrutamiento entre salas.
- El protocolo (`docs/protocol.md`): debilidades de diseño (por ejemplo, una forma de hacer MITM pese a la señalización cifrada).
- La configuración de infraestructura en `infra/` (coturn, Compose, scripts): por ejemplo, TURN usable como proxy hacia redes internas.
- Las cabeceras y la configuración de despliegue de la web.

## Fuera de alcance

- Una **PC de destino comprometida** o con monitoreo, antivirus o keyloggers: Chasqui protege el trayecto, no la PC.
- Alguien que **fotografía o copia el QR** mientras está visible (mitigado con salas de 2 dispositivos y expiración, pero es un riesgo aceptado).
- Ataques que requieren acceso físico o control previo del navegador de la víctima.
- Denegación de servicio por fuerza bruta de volumen (Cloudflare y los límites ya existen; sí interesan los DoS de bajo costo).
- Reportes automáticos sin prueba de concepto, falta de cabeceras sin impacto real, y vulnerabilidades de servicios de terceros (Cloudflare, AWS, Oracle, GitHub).
- Redes con proxies que inspeccionan TLS (limitación conocida).

## Versiones con soporte

Solo la última versión en `main` y la última etiqueta publicada.
