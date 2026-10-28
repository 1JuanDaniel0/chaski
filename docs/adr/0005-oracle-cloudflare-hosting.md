# ADR 0005: Hosting en Cloudflare Pages y Oracle Cloud Always Free

## Estado
Aceptada. Desde el 2026-10-15 la señalización y coturn corren en una VM Ampere A1 de Oracle Cloud en Santiago (`sa-santiago-1`), con cuenta Pay As You Go y dentro de Always Free. El presupuesto y la cuota están en [despliegue, sección 8](../despliegue.md#8-presupuesto-y-cuota-en-oracle).

Antes, del 2026-10-07 al 2026-10-15, la VM estuvo de forma temporal en AWS (São Paulo), pagada con un crédito, y se borró el 2026-10-19. Diferencias que se vieron ahí: el firewall de la nube es el Security Group (mismos puertos que la Security List), la IP fija es una Elastic IP, el Ubuntu de AWS no trae el REJECT de Oracle en iptables y la salida de datos se cobra (~0,09 USD/GB).

## Contexto
Meta de costo: US$0 al mes más el dominio. TURN consume ancho de banda de salida y necesita UDP y puertos propios.

## Decisión
- Frontend en Cloudflare Pages.
- Señalización detrás del proxy de Cloudflare (WebSocket) hacia la VM en el puerto 8443, abierto solo a los rangos de IP de Cloudflare.
- coturn en la misma VM (VM Ampere A1 de Oracle Cloud Always Free), con red del host y subdominio `turn.` sin proxy.
- La VM usa la mitad del A1 gratis (1 OCPU y 6 GB de los 2 OCPU y 12 GB que da Oracle desde junio de 2026) y una cuota del compartimento lo hace cumplir, para dejar la otra mitad a otros proyectos. Con Pay As You Go, lo que pase de Always Free se cobra; un presupuesto avisa desde el primer centavo. La salida gratis es de 10 TB al mes, y `TURN_MONTHLY_GB` está en 5000 para quedarse en la mitad.
- IP pública reservada, despliegue automatizado con Docker Compose y GHCR.

## Alternativas
- Droplet de DigitalOcean (aprox. US$6 al mes): plan B si Oracle falla.
- Todo en un solo proveedor de pago: más simple, pero rompe la meta de costo.

## Consecuencias
- Hay dos firewalls que configurar (VCN Security List y el del sistema operativo). El del sistema no filtra el 8443: Docker publica ese puerto con NAT y el tráfico no pasa por la cadena `INPUT`, así que su filtro dentro de la VM va en la cadena `DOCKER-USER` (`infra/scripts/firewall-8443.sh`), además de la Security List.
- Oracle puede no tener capacidad ARM (y, sin Pay As You Go, reclamar instancias con poco uso); se mitiga automatizando el despliegue para recrear la VM en minutos.
- Las imágenes deben ser `linux/arm64`.
- coturn necesita `external-ip=<pública>/<privada>` por el NAT 1:1 de la VM.
