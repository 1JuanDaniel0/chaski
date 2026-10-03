# ADR 0005: Hosting en Cloudflare Pages y Oracle Cloud Always Free

## Contexto
Meta de costo: US$0 al mes más el dominio. TURN consume ancho de banda de salida y necesita UDP y puertos propios.

## Decisión
- Frontend en Cloudflare Pages.
- Señalización detrás del proxy de Cloudflare (WebSocket) hacia la VM en el puerto 8443, abierto solo a los rangos de IP de Cloudflare.
- coturn en la misma VM (VM Ampere A1 de Oracle Cloud Always Free), con red del host y subdominio `turn.` sin proxy.
- IP pública reservada, despliegue automatizado con Docker Compose y GHCR.

## Alternativas
- Droplet de DigitalOcean (aprox. US$6 al mes): plan B si Oracle falla.
- Todo en un solo proveedor de pago: más simple, pero rompe la meta de costo.

## Consecuencias
- Hay dos firewalls que configurar (VCN Security List y el del sistema operativo).
- Oracle puede reclamar instancias Always Free con poco uso o no tener capacidad ARM; se mitiga automatizando el despliegue para recrear la VM en minutos.
- Las imágenes deben ser `linux/arm64`.
- coturn necesita `external-ip=<pública>/<privada>` por el NAT 1:1 de la VM.
