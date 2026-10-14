# ADR 0005: Hosting en Cloudflare Pages y Oracle Cloud Always Free

## Estado
Aceptada, con una excepción temporal (octubre de 2026): la señalización y coturn corren en una VM de AWS mientras dure un crédito de US$100, previsto para varios meses. Cuando se acabe, la idea es volver a Oracle Cloud Always Free (o al plan B). En octubre de 2026 la cuenta de Oracle pasó a Pay As You Go y la mudanza está descrita en [primeros pasos, sección 11](../primeros-pasos.md#11-mudanza-de-aws-a-oracle). Todo lo demás de esta decisión sigue igual: Cloudflare Pages, proxy de Cloudflare para la señalización, `turn.` sin proxy y despliegue con Docker Compose y GHCR.

Diferencias de la VM en AWS:
- El firewall de la nube es el Security Group (mismos puertos que la Security List de Oracle, ver [primeros pasos](../primeros-pasos.md#3-cuenta-de-oracle-y-vm)). El Ubuntu de AWS no trae el REJECT por defecto de Oracle, así que el Security Group es el único filtro que deja el 8443 solo para Cloudflare.
- La IP pública fija es una Elastic IP.
- La imagen se publica para `linux/arm64` y `linux/amd64`, así que sirve con cualquier tipo de instancia.
- Hay que vigilar el saldo del crédito y la salida de datos (TURN), que en AWS sí se cobra.

## Contexto
Meta de costo: US$0 al mes más el dominio. TURN consume ancho de banda de salida y necesita UDP y puertos propios.

## Decisión
- Frontend en Cloudflare Pages.
- Señalización detrás del proxy de Cloudflare (WebSocket) hacia la VM en el puerto 8443, abierto solo a los rangos de IP de Cloudflare.
- coturn en la misma VM (VM Ampere A1 de Oracle Cloud Always Free), con red del host y subdominio `turn.` sin proxy.
- La VM usa la mitad del A1 gratis (1 OCPU y 6 GB de los 2 OCPU y 12 GB que da Oracle desde junio de 2026) y una cuota del compartimento lo hace cumplir, para dejar la otra mitad a otros proyectos. Con Pay As You Go, lo que pase de Always Free se cobra; un presupuesto avisa desde el primer centavo.
- IP pública reservada, despliegue automatizado con Docker Compose y GHCR.

## Alternativas
- Droplet de DigitalOcean (aprox. US$6 al mes): plan B si Oracle falla.
- Todo en un solo proveedor de pago: más simple, pero rompe la meta de costo.

## Consecuencias
- Hay dos firewalls que configurar (VCN Security List y el del sistema operativo).
- Oracle puede no tener capacidad ARM (y, sin Pay As You Go, reclamar instancias con poco uso); se mitiga automatizando el despliegue para recrear la VM en minutos.
- Las imágenes deben ser `linux/arm64`.
- coturn necesita `external-ip=<pública>/<privada>` por el NAT 1:1 de la VM.
