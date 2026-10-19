# ADR 0006: Relevo TURN sin tope de velocidad y plan para su costo

## Contexto
El 2026-10-13, un envío de la PC del trabajo al celular por el relevo TURN arrancó a toda velocidad y luego se quedó en 4 a 15 KB/s. Un video de 248 MB llegó al 1% a 6,6 KB/s, con 639 min estimados. Teníamos dos topes en coturn: `max-bps=2000000` por sesión, desde el inicio, y `bps-capacity=10000000` en total, añadido el 2026-10-12.

Lo medido (webrtc-internals de producción, RTT 170 ms): la PC soltó unos 6 MB en 2 s (pico de 38 Mbps) y después mandó 7 KB/s fijos durante más de un minuto.

Por qué pasa:
- coturn aplica `max-bps` descartando lo que pasa del tope en cada ventana de 1 s, sin encolarlo (`ioa_socket_check_bandwidth`). El canal de datos (SCTP) arranca con una ráfaga de varios MB y el tope tira casi todo. SCTP recupera esas pérdidas a un paquete por RTT, más o menos: 1,2 kB cada 0,17 s ≈ 7 KB/s.
- Reproducido en local (coturn 4.18.0 en Docker, Chromium solo por relevo, 120 ms de RTT simulado, tope en 200 kB/s): 4 MB tardaron 45 s, 18 de ellos a ~8 KB/s. Sin tope, 9,7 s.
- `bps-capacity` reserva `max-bps` del total por cada allocation, transmita o no. Cada navegador abre hasta 3 (udp, tcp y tls), y las de una pestaña que muere de golpe siguen vivas hasta ~10 min. Con 10 MB/s solo cabían 5, así que el relevo rechazaba conexiones nuevas con 486.

## Decisión
- coturn queda sin `max-bps` y sin `bps-capacity` (PR #40 y #42). El abuso lo acotan las credenciales temporales (solo las recibe quien entra a una sala), `user-quota`, `total-quota` y la alerta de presupuesto de AWS.
- Chaski sigue siendo gratis para el usuario normal. Si el gasto del relevo crece, el orden de respuesta es:
  1. Límite suave por relevo, por ejemplo 2 GB al día por sala. Las conexiones directas siguen sin límite.
  2. Plan de pago para negocios, ligado a RF7 modo mostrador (imprentas o cabinas que reciben archivos todo el día).
  3. Botón de donación.
- Se decide con los números de `ruta_relay` del resumen diario de la señalización y con la salida real de la VM frente a los 10 TB gratis de Oracle (`turn-budget.sh --status`).

### Ventana de envío por relevo
Sin los topes, la PC del trabajo seguía atascándose al empezar: en los volcados de producción Chrome descartó entre 290 y 677 paquetes en el primer segundo (`packetsDiscardedOnSend`) y el canal pasó 1 a 2 minutos a ~6 KB/s. Un primer intento (PR #43: arrancar a 512 KiB/s y duplicar cada 0,5 s) solo acortó el atasco a 55 s. El 4.º volcado mostró además el patrón completo: al llegar a ~1,7 MB/s (el techo de ese camino) el RTT sube de 170 a 300 ms durante decenas de segundos, la PC descarta 380-500 paquetes de golpe y la velocidad cae a ~50 KB/s; tarda ~45 s en volver a subir y el ciclo se repite cada ~100 s. Es una cola que se llena hasta desbordar: SCTP solo reacciona a las pérdidas, y para entonces ya perdió cientos de paquetes.

Decisión: por el relevo, el emisor controla cuánto manda según la latencia, al estilo de TCP Vegas (`transfer/pacer.ts`):
- El receptor confirma lo recibido con `file-ack` (protocolo §5.1). El emisor limita los bytes en vuelo a una ventana y los reparte a lo largo del RTT.
- Mide el RTT de cada confirmación y lo compara con el mínimo: la diferencia es la cola que se está formando. Crece mientras la cola estimada sea menor que ~32 KB y baja si pasa de ~80 KB. Así la cola no llega a desbordar y el RTT se queda cerca del mínimo.
- Arranca con un solo trozo para medir el RTT sin cola, y la ventana crece x1,3 por vuelta hasta que aparece cola. Cada 30 s baja a un cuarto durante dos vueltas para volver a medir el RTT mínimo, por si la ruta cambió.
- Si el otro lado no manda `file-ack` (versión vieja), a los 2 s se envía como antes.
- Las conexiones directas no usan la ventana. Los `file-ack` sí sirven para que la barra del emisor muestre lo que ya llegó, no solo lo que salió.

En un simulador del camino del trabajo (1,7 MB/s, 170 ms, cola de 250 kB que descarta lo que no cabe), la ventana usa el 96 % del ancho sin descartar nada. Con cola de 120 kB tampoco descarta. Medido en local con Chromium y coturn solo por relevo, a través de un cuello de botella de 400 kB/s (120 ms, cola de ~240 kB), 24 MB: con ventana 73-82 s en tres envíos, sin caer de ~150 kB/s; sin ventana 111-134 s en dos envíos, con bajones a 50-80 kB/s. El laboratorio no reproduce exactamente el socket de la PC del trabajo, así que la prueba final es repetir el envío desde ahí.

### Tope de gasto
Un límite en la web no frena a un bot: no usa nuestra web, solo necesita entrar a una sala para recibir credenciales TURN. El tope tiene que estar en el servidor:
- **Tope mensual duro** (`infra/scripts/turn-budget.sh`): cada minuto suma lo que sale por la red de la VM en el mes (UTC, como la factura) y, al pasar `TURN_MONTHLY_GB` (50 GB por defecto, unos 4,5 USD en AWS), apaga coturn hasta el mes siguiente. Las conexiones directas siguen funcionando. `deploy.sh` lo instala en cron y lo vuelve a aplicar tras cada despliegue. En Oracle Cloud, con 10 TB de salida gratis al mes, se sube con la misma variable.
- **Credenciales por IP**: la señalización da como máximo `TURN_PER_IP_PER_DAY` (100) credenciales TURN por IP al día; pasado eso la sala funciona solo con conexión directa. Es alto porque una oficina entera puede salir por la misma IP; el que protege la factura es el tope mensual.
- **Cloudflare TURN** (más cerca que São Paulo, 0,05 USD/GB con 1.000 GB gratis al mes): permite revocar credenciales, pero no encontramos un tope de gasto. El tráfico tampoco pasaría por la VM, así que el tope mensual de arriba no lo cubriría. Queda descartado mientras no haya forma de cortar el gasto.

## Alternativas
- **Tope más alto en coturn:** sigue siendo un descarte por ventanas de 1 s. En cuanto SCTP lo alcanza, se repite el hundimiento.
- **Cobrar al usuario normal:** la alternativa gratis está a mano (WhatsApp Web, Drive), y la gente no paga por mandarse archivos a sí misma. Frenaría el crecimiento cuando el costo todavía es bajo.
- **Tope de gasto en la web:** un bot no usa nuestra web, así que no lo frena. Por eso el tope está en la VM y en la señalización.

## Consecuencias
- Las transferencias por relevo van al ritmo de la red más lenta del camino, ya no a un máximo artificial.
- No hay tope de velocidad en el relevo, pero sí de gasto: al pasar `TURN_MONTHLY_GB` en el mes, coturn se apaga hasta el mes siguiente y las conexiones que necesitan relevo dejan de conectarse.
- Cada GB que pasaba por el relevo costaba unos 0,09 USD de salida en AWS. Desde el 2026-10-15 la VM está en Oracle, con 10 TB de salida gratis al mes, y `TURN_MONTHLY_GB` subió a 5000. Las conexiones directas no cuestan nada.
