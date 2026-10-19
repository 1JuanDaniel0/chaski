# Despliegue

Cómo montar una instancia propia de Chaski: el frontend en Cloudflare Pages y la señalización con coturn en una VM con Docker Compose. Los pasos usan Oracle Cloud (Always Free) y Cloudflare, que es lo que usa [chaski.me](https://chaski.me) (ver [ADR 0005](adr/0005-oracle-cloudflare-hosting.md)), pero sirven para cualquier VM con Ubuntu e IP pública fija.

Antes de empezar, reemplaza `chaski.me` por tu dominio en `infra/docker-compose.yml`, `infra/coturn/turnserver.conf` y `apps/web` (búscalo con `grep -rn chaski.me apps/web/src apps/web/public apps/web/index.html`; la URL de la señalización también se puede dar con `VITE_SIGNAL_URL` en Pages).

## 1. Requisitos

- Un dominio con el DNS en Cloudflare (el plan gratuito basta).
- Una VM Linux con IP pública fija y al menos 1 vCPU y 1 GB de RAM. TURN es lo que más consume: ancho de banda de salida, no CPU.
- Una cuenta de GitHub con el repo (o un fork), para que Actions publique la imagen de la señalización en GHCR.

## 2. VM en Oracle Cloud

**Límites Always Free que importan** (página *Recursos Siempre gratis* de Oracle, octubre de 2026; en la consola están en *Gobernanza y administración, Límites, cuotas y uso*):

| Recurso | Gratis por cuenta | Recomendado para Chaski |
|---------|-------------------|-------------------------|
| Ampere A1 (VM.Standard.A1.Flex) | 2 OCPU y 12 GB de RAM en total (1.500 OCPU-hora y 9.000 GB-hora al mes) | 1 OCPU y 6 GB |
| Disco (boot + block, en conjunto) | 200 GB (boot mínimo de 47 GB) | 50 GB de boot |
| Salida de datos a internet | 10 TB al mes | Lo que pase por TURN |

- Lo gratis solo existe en la **región de origen** (home region) de la cuenta, que no se puede cambiar. Si sale "Out of capacity" al crear la VM, reintenta más tarde.
- Oracle puede reclamar VM Always Free inactivas, y Chaski casi siempre lo parecería. Según correos de Oracle citados en foros, eso no aplica a cuentas Pay As You Go, pero en ellas lo que pase de Always Free **se cobra**: usa la cuota y el presupuesto de la [sección 8](#8-presupuesto-y-cuota-en-oracle). Lo gratis lleva la etiqueta *Always Free-eligible* en la consola.
- El A1 tiene 1 Gbps por OCPU, así que 1 OCPU basta para TURN.

Pasos:

- [ ] En *Identity, Compartments*, crea un compartimento `chaski` y crea todo dentro de él, para que la cuota de la sección 8 lo limite solo a él.
- [ ] Crea una instancia **Ampere A1** con **1 OCPU y 6 GB**, imagen *Canonical Ubuntu 24.04* (aarch64), boot volume de **50 GB** *Balanced* y tu llave SSH pública.
- [ ] Deja que el asistente cree la VCN con subred pública y cambia la IP pública efímera de la VNIC por una **IP pública reservada**.
- [ ] Edita la **Security List** de la subred pública (reglas de entrada *stateful*):

| Puerto | Protocolo | Origen |
|--------|-----------|--------|
| 22 | TCP | Solo tu IP |
| 3478 | TCP y UDP | 0.0.0.0/0 |
| 443 | TCP | 0.0.0.0/0 |
| 49160-49360 | UDP | 0.0.0.0/0 |
| 8443 | TCP | Rangos de Cloudflare (https://www.cloudflare.com/ips-v4), una regla por rango |

- [ ] Entra por SSH (`ubuntu@<IP>`) y clona el repo: `git clone https://github.com/1JuanDaniel0/chaski.git ~/chasqui` (los scripts y el cron asumen `~/chasqui`).
- [ ] Ejecuta `sudo infra/scripts/provision-vm.sh`. Instala Docker y abre el firewall del sistema: el Ubuntu de Oracle trae iptables con un REJECT por defecto, así que sin este script nada llega a coturn. Ojo: Docker publica el 8443 con NAT y ese tráfico no pasa por la cadena `INPUT`, así que **quien deja el 8443 solo para Cloudflare es la Security List**; no lo abras ahí a 0.0.0.0/0. Para ver si llegan conexiones: `sudo iptables -L DOCKER -n -v -x | grep dpt:8443`.
- [ ] Anota la IP pública y la privada (`ip a`, suele ser `10.0.0.x`) para `TURN_EXTERNAL_IP`.

En otra nube los pasos equivalen: la Security List es el firewall de la nube (Security Group en AWS) y la IP reservada es la IP fija (Elastic IP en AWS).

## 3. Cloudflare: Pages y DNS

| Registro | Tipo | Destino | Proxy |
|----------|------|---------|-------|
| `@` y `app` | CNAME | Tu proyecto de Cloudflare Pages (`<proyecto>.pages.dev`), lo crea Pages al añadir el dominio | Activado |
| `signal` | A | IP reservada de la VM | **Activado** |
| `turn` | A | IP reservada de la VM | **Desactivado** (solo DNS): TURN no pasa por el proxy |

- [ ] En Pages: conecta el repo, directorio raíz `apps/web`, comando `pnpm build`, salida `dist`, y añade tu dominio. Pages publica cada merge a `main` y crea vistas previas por PR (en ellas no se pueden probar llamadas, porque la señalización solo acepta los orígenes de `ALLOWED_ORIGINS`).
- [ ] En SSL/TLS pon el modo **Full (strict)**.
- [ ] **Origin Rule** para la señalización: el navegador entra por el 443, pero en la VM el 443 es de coturn y la señalización escucha en el 8443. En *Rules, Origin Rules*: `Hostname` igual a `signal.<dominio>` y *Destination Port* reescrito a `8443`. Sin esta regla la app muestra "Sin conexión con el servidor".
- [ ] Si usas `app.<dominio>`, redirígelo a `https://<dominio>/` con una Redirect Rule (301, conservando ruta y query) para que los buscadores vean una sola dirección.

## 4. Certificados

**Señalización (8443), certificado de origen de Cloudflare:**

- [ ] En *SSL/TLS, Origin Server*, crea un certificado para `signal.<dominio>` (o `*.<dominio>`).
- [ ] Guárdalo en la VM como `infra/certs/origin/origin.pem` y `origin.key`. El contenedor corre con el usuario 10001, así que la llave tiene que ser suya: `sudo chown 10001:10001 infra/certs/origin/origin.key && sudo chmod 400 infra/certs/origin/origin.key`. Si no, la señalización se reinicia en bucle con `AccessDeniedException: /certs/origin/origin.key`.

**TURN (443), Let's Encrypt con desafío DNS:**

- [ ] Crea un API token de Cloudflare con permiso **Zone: DNS: Edit** solo para tu zona.
- [ ] En la VM crea `/etc/letsencrypt/cloudflare.ini` con `dns_cloudflare_api_token = <token>` y `chmod 600`.
- [ ] Ejecuta `sudo infra/scripts/renew-turn-cert.sh` (la primera vez falla el reinicio de coturn si aún no está levantado; es normal).
- [ ] Programa la renovación con `sudo crontab -e`: `0 4 * * 1 /home/ubuntu/chasqui/infra/scripts/renew-turn-cert.sh`.

## 5. Configurar y arrancar

- [ ] `cp infra/.env.example infra/.env` y rellena `TURN_SECRET` (`openssl rand -hex 32`), `TURN_EXTERNAL_IP` (`IPpública/IPprivada`) y `SIGNAL_TAG`.
- [ ] Ajusta `TURN_MONTHLY_GB`: los GB que pueden salir de la VM al mes antes de apagar el relevo (ver [ADR 0006](adr/0006-relevo-sin-tope-y-costo.md)). En Oracle, con 10 TB gratis, puede ser varios miles.
- [ ] El paquete `chasqui-signal` de GHCR tiene que ser público, o haz `docker login ghcr.io` en la VM con un token de solo lectura. La primera imagen aparece cuando un push a `main` toca `apps/signal`.
- [ ] Primer despliegue: `infra/scripts/deploy.sh`. También pone en cron el tope de salida (`turn-budget.sh`) y el despliegue automático (sección 7).
- [ ] Prueba: `curl -I https://signal.<dominio>` y sigue la sección 6.

## 6. Prueba de punta a punta

Comprueba por separado la señalización, el relevo TURN y una transferencia real entre dos redes distintas (por ejemplo, la PC en un wifi y el celular con datos móviles).

**Señalización** (desde cualquier PC con Node 22):

```bash
node infra/scripts/smoke-signal.mjs wss://signal.<dominio>/ws https://<dominio>
```

Abre dos WebSocket con el `Origin` indicado, los une a una sala nueva y comprueba `joined`, `peer-joined` y el reenvío de un `signal`. Al final imprime las credenciales TURN que entrega el servidor. Si falla al abrir, revisa `ALLOWED_ORIGINS` y que el proxy de Cloudflare deje pasar WebSocket. Si `joined` no trae `turn`, faltan `TURN_SECRET` o `TURN_URLS`.

**TURN** (en cada red):

- [ ] En [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/), borra el servidor por defecto y agrega cada URI que imprimió el script con su `username` y `credential`.
- [ ] Elige "relay" en *ICE Transport Policy* y pulsa *Gather candidates*. Debe salir al menos un candidato `relay` con la IP pública de la VM. Si `turn:...?transport=udp` no da nada pero `turns:...:443` sí, esa red bloquea UDP y el relevo por 443 es el que la salva.
- [ ] Si no sale ningún `relay`: revisa los dos firewalls (Security List y `sudo iptables -L INPUT -n`), `TURN_EXTERNAL_IP` y que el certificado de `turn.<dominio>` no haya vencido.

**Transferencia real:**

- [ ] En la PC abre `https://<dominio>` y, en otra pestaña, `chrome://webrtc-internals`. Escanea el QR con el celular en datos móviles y manda un archivo y un texto en cada sentido.
- [ ] En `webrtc-internals`, el par de candidatos `succeeded` y `nominated` dice la ruta: `host` o `srflx` es directa (lo normal), `relay` pasó por TURN. Para forzar el relevo, prueba una red que bloquee UDP o datos móviles en ambos lados.
- [ ] En la VM: `curl -s localhost:9090/actuator/prometheus | grep chasqui_reports` muestra qué rutas reportaron los clientes.

## 7. Despliegue automático

Cada 5 minutos `infra/scripts/auto-deploy.sh` trae `main` y, si la VM no corre la imagen del último commit de `main` que tocó `apps/signal`, `infra/` o el workflow, espera a que el workflow `signal` la publique en GHCR y ejecuta `deploy.sh` con ella. Si solo cambió la web o los docs, avanza el repo sin reiniciar nada. Así GitHub nunca entra a la VM y el puerto 22 sigue abierto solo para tu IP.

- [ ] `crontab -l` debe mostrar las líneas de `turn-budget.sh` y `auto-deploy.sh`.
- [ ] Tras mergear un cambio de la señalización, `tail infra/auto-deploy.log` muestra "esperando la imagen …" y luego "desplegando …". Si se queda esperando, el job `image` de ese commit falló.
- [ ] Rollback: revierte el PR y el automático despliega el revert. Para volver ya mismo: `SIGNAL_TAG=<sha completo del commit bueno> infra/scripts/deploy.sh`, pero en la siguiente pasada el automático vuelve a la imagen de `main`, así que revierte igual.

## 8. Presupuesto y cuota en Oracle

- [ ] **Presupuesto.** *Billing & Cost Management, Budgets*: alcance la tenencia completa, mensual, 5 USD, con alertas por correo cuando el gasto **real** llegue a 0,01 USD (el primer cobro), al 100% y cuando el **pronosticado** llegue al 100%. Solo avisa, no apaga nada.
- [ ] **Cuota del compartimento.** *Governance, Quota Policies*, en el compartimento raíz:

```
set compute-core quota standard-a1-core-count to 1 in compartment chaski
set compute-memory quota standard-a1-memory-count to 6 in compartment chaski
set block-storage quota total-storage-gb to 60 in compartment chaski
```

  Así nada dentro de `chaski` pasa de 1 OCPU, 6 GB y 60 GB de disco, y la otra mitad del Always Free queda libre.
- [ ] Al día siguiente de crear la VM, *Cost Analysis* debe marcar 0.

## 9. GitHub

- [ ] *Settings, Branches* (o *Rulesets*), regla para `main`: pull request obligatorio, checks `web`, `signal` y `security`, y sin force-push ni borrado.
- [ ] *Settings, Code security*: Dependabot alerts, secret scanning, push protection y *Private vulnerability reporting* (lo que pide [SECURITY.md](../SECURITY.md)).

## 10. Operación

- **Resumen diario.** A medianoche (hora de Lima) la señalización escribe una línea con las salas creadas y emparejadas, las reconexiones y cuántas conexiones fueron directas o por relevo. Sin analítica en la web, es la forma de medir el uso: `docker compose -f infra/docker-compose.yml logs signal | grep "resumen diario"`. Los logs se pierden al redesplegar.
- **Salida del mes:** `infra/scripts/turn-budget.sh --status`.
- **Estado:** `docker compose -f infra/docker-compose.yml ps` y `curl -s localhost:9090/actuator/health`.
