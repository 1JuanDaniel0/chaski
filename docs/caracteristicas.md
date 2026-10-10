# Qué hace Chaski

Chaski pasa archivos y texto entre tu celular y una PC escaneando un QR. Está pensado para la **PC ajena** (trabajo, universidad, cabina): no inicias sesión en ella, no instalas nada y no queda nada guardado en ningún servidor.

## Funciones

### Conectar
- **Un QR y listo.** La PC muestra un QR al instante. Lo escaneas con la cámara del celular y se conectan solos.
- **Escáner dentro de la app** (Android, Chrome): botón "Escanear el QR de la PC", sin salir de Chaski.
- **Sin cuentas ni registro.** No hay usuario, correo ni contraseña.
- **Sin instalar nada.** Funciona en el navegador. En Android se puede instalar como app (PWA) de forma opcional.
- **Funciona entre redes distintas.** Por ejemplo, la PC en el wifi del trabajo y el celular con datos móviles. Si no hay ruta directa, usa un relevo (TURN), y los datos siguen cifrados.
- **Si el servidor no responde**, lo dice y ofrece "Reintentar". Al volver la red, reintenta solo.
- **Reconexión automática.** Si se corta la conexión ya emparejados (pasar de wifi a datos, bloquear el celular, un microcorte), muestra "Reconectando…" y vuelve sola, sin escanear de nuevo. Lo que se estaba enviando sigue desde donde quedó. Si en 2 minutos no lo logra, avisa que se perdió la conexión.

### Enviar
- **Archivos en ambos sentidos**, varios a la vez y de cualquier tipo, hasta 500 MB por archivo.
- **Texto con "Copiar" en un toque**: contraseñas de wifi, enlaces, códigos.
- **Formato de chat**, como WhatsApp: lo tuyo a la derecha y lo que llega a la izquierda, con hora y doble check.
- **Arrastrar y soltar** archivos en la PC, o pegarlos con Ctrl+V.
- **Botón "Pegar" en el celular**: una imagen copiada se envía y el texto queda listo para revisarlo.
- **"Compartir con Chaski" en Android**: desde la galería o cualquier app.
- **Progreso con velocidad y tiempo restante**, y botón para cancelar.
- **La pantalla del celular no se apaga** mientras haya un envío en curso. Si se apagara, el envío se cortaría.
- **Aviso al cerrar la pestaña** si algo está a medio enviar.
- **Modo claro u oscuro:** sigue al sistema por defecto, y el botón del encabezado lo fija a mano en claro u oscuro.

### Ver y descargar
- **Vistas previas:**
  - Miniaturas de fotos.
  - Mini reproductor de video y de audio, incluidas las notas de voz.
  - Primeras líneas de archivos de texto y de código.
  - Íconos por tipo (Word, Excel, PowerPoint, zip).
- **PDF: "Abrir"** en el visor del navegador sin descargarlo. En una PC ajena así no queda una copia en Descargas.
- **"Descargar todo"** cuando llegan varios archivos.
- **Aviso en programas ejecutables** (.exe, .apk…): ábrelos solo si confías en quien los envió.

### Privacidad y seguridad
- **Directo entre los dos dispositivos** (WebRTC P2P). Los archivos no se suben a ningún servidor.
- **Cifrado de extremo a extremo.** El secreto viaja en el QR y nunca llega al servidor. La negociación va cifrada con AES-GCM y los datos con DTLS.
- **Salas de solo 2 dispositivos**, que expiran solas.
- **"Terminar":** borra el chat en los dos dispositivos, saca al otro y genera un QR nuevo, se pulse en la PC o en el celular. Es lo que haces antes de irte de la cabina. Si la conexión se corta sin pulsarlo, lo recibido se conserva para que puedas descargarlo.
- **Nada se guarda:** sin historial, sin cookies, sin analítica y sin scripts de terceros. La CSP es estricta. Lo único que queda en el navegador es el tema si lo eliges a mano (claro u oscuro).
- **Código abierto** (AGPL-3.0).

### Diseño
- Interfaz mínima en español, sin textos de ayuda innecesarios, con un tutorial animado de 7 segundos.
- Modo claro y oscuro automáticos. Funciona en celular y en PC.
- Vista previa con imagen al compartir el enlace en WhatsApp, X o LinkedIn.
- Debajo del QR, una sección de qué es Chaski, para qué sirve y preguntas frecuentes, con la animación del tutorial. Está en HTML estático (`index.html`) para que Google y Bing la lean sin ejecutar JavaScript, y se oculta durante el chat y el escaneo.

## En qué se diferencia

| | Chaski | WhatsApp Web | Correo a ti mismo | Google Drive | PairDrop / Snapdrop | LocalSend | AirDrop / Quick Share |
|---|---|---|---|---|---|---|---|
| Iniciar sesión en la PC | **No** | Sí | Sí | Sí | No | No | No |
| Instalar algo en la PC | **No** | No | No | No | No | Sí | Sí, o el mismo ecosistema |
| Los archivos pasan por un servidor | **No** | Sí | Sí | Sí, quedan guardados | No (P2P) | No | No |
| Funciona entre redes distintas | **Sí** | Sí | Sí | Sí | Sí, con emparejamiento | No, solo red local | No, solo cercanía |
| Texto con copiar en un toque | **Sí** | Sí | Incómodo | No | Sí | Sí | Parcial |
| Señalización cifrada de extremo a extremo | **Sí** | No aplica | No aplica | No aplica | No ([pedido abierto](https://github.com/schlagmichdoch/PairDrop/issues/180)) | No aplica | No aplica |
| Pensado para una PC ajena | **Sí** | Deja la sesión abierta si olvidas cerrarla | Igual | Igual | Más pensado para tus propios dispositivos | No | No |

**En una frase:** Chaski es la forma de pasar algo del celular a una PC que no es tuya **sin iniciar sesión en ella y sin dejar rastro**.

## Límites conocidos
- iPhone: no hay "Compartir con Chaski" (Safari no lo soporta) ni escáner dentro de la app. Se usa la cámara del iPhone.
- Sin vista previa de Word, Excel ni PowerPoint: habría que subirlos a un servidor, y eso rompe la promesa de privacidad.
- Máximo 500 MB por archivo: los archivos se arman en memoria antes de descargarse. La escritura directa a disco, que quitaría ese límite, está en la hoja de ruta.
- Si se recarga o se cierra la pestaña, hay que volver a escanear: el secreto del QR solo vive en la memoria de la pestaña, a propósito.
- Si un dispositivo pierde el servidor de señalización pero el canal directo sigue abierto (pasa en Android al abrir el selector de archivos, que manda Chrome a segundo plano), la sesión sigue. Solo se avisa "El otro dispositivo se desconectó" cuando se cierra el canal directo.
