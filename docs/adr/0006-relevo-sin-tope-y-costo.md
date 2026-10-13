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
- Se decide con los números de `ruta_relay` del resumen diario de la señalización y con el gasto real en AWS.

## Alternativas
- **Tope más alto en coturn:** sigue siendo un descarte por ventanas de 1 s. En cuanto SCTP lo alcanza, se repite el hundimiento.
- **Cobrar al usuario normal:** la alternativa gratis está a mano (WhatsApp Web, Drive), y la gente no paga por mandarse archivos a sí misma. Frenaría el crecimiento cuando el costo todavía es bajo.
- **Tope de gasto bien hecho:** limitar el ritmo en la app cuando la ruta es `relay`, o hacer shaping con el kernel en la VM (encolar en vez de descartar). Queda como opción si hace falta un tope duro.

## Consecuencias
- Las transferencias por relevo van al ritmo de la red más lenta del camino, ya no a un máximo artificial.
- No hay tope de velocidad en el relevo. El peor caso de abuso lo marca la tarjeta de red de la VM. La alerta de presupuesto avisa, pero no corta nada.
- Cada GB que pasa por el relevo cuesta unos 0,09 USD de salida en AWS. Las conexiones directas no cuestan nada.
