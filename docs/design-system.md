# Sistema de diseño

Estilo: **formato de chat**, como WhatsApp. La sesión entre tus dos dispositivos es una conversación:
lo que llega va a la izquierda, lo que envías a la derecha, y abajo está la barra para adjuntar o escribir.
Es la zona de confort de cualquiera, así que no hacen falta textos de ayuda.
Mockups en Figma: https://www.figma.com/design/W1hAMAATgjW8lKNwmseH4u (dirección A · Conversación).
Todo vive en `apps/web/src/ui/styles.css`; los colores por defecto de Tailwind están desactivados.

## Reglas

- **1 color de marca:** naranja `#FF5A36` (el folder del chaski). Logo, botón de enviar, progreso, "Copiar", ruta entre dispositivos.
- **Neutros:** fondo blanco, tinta `#111114` (texto, burbujas propias, botones redondos) y gris suave `#F3F3F5` (burbujas recibidas, barra de escritura).
- **Burbujas:** radio 24 px con la esquina del remitente en 8 px (`.bubble-in` / `.bubble-out`). Máximo 82 % del ancho o 440 px.
- **Sin cards:** no hay cajas decorativas. Solo burbujas, la barra de escritura y botones.
- **Radios:** 8 / 12 / 20 / 24 px y círculo completo. Nada más.
- **1 fuente:** Outfit (variable). Títulos en 600 con tracking negativo. Autoalojada (la CSP solo permite `font-src 'self'`).
- **Iconos:** solo Phosphor. Nunca dentro de un cuadrado.
- **Prohibido:** degradados, glassmorphism, sombras, emojis como iconos.

## Pantallas

- **PC esperando:** "Pasa archivos a esta PC", tres pasos numerados y el QR grande sobre blanco.
- **Conectados:** cabecera con "Esta PC ····· dispositivo" (la ruta punteada avanza mientras hay conexión),
  conversación y barra de escritura. Imágenes con miniatura real; archivos con icono, tamaño, hora y botón de descarga.
  Arrastrar archivos muestra "Suelta para enviar"; pegar (Ctrl+V) un archivo lo envía.
- **Desconectados:** aviso en la conversación y la barra se reemplaza por "Nueva sala". Lo recibido sigue descargable.

## Movimiento

- Una sola curva: `cubic-bezier(0.22, 1, 0.36, 1)` (sale rápido y frena suave).
- Entradas: subir 12 px + aparecer, 420 ms, en cascada de 60 ms.
- Burbujas: aparecen con un spring desde la esquina del remitente.
- Cambio de pantalla: 320 ms de entrada, 180 ms de salida.
- Listas: spring (`stiffness 520, damping 42`) con `layout` para que los elementos se reacomoden solos.
- Botones: escala 0.97 al presionar.
- `prefers-reduced-motion` desactiva todo.

## Marca

- **Nombre:** Chaski, la escritura quechua original de "chasqui", el mensajero inca de relevos.
- **Logo:** un chaski moderno corriendo con un folder. Su cuerpo forma la "k" del nombre y las cintas
  de su tocado (llauto) ondean hacia atrás por la velocidad. Componente `LogoMark` en `src/ui/brand/Logo.tsx`;
  con `running` rebota y las cintas ondean (se usa en "Conectando" y en el tutorial, donde lleva el archivo).
- **Ícono de app:** fondo casi negro, chaski blanco, folder y cintas naranjas (`public/icon-*.png`, con versión maskable).

## Modo oscuro

Los mismos tokens se redefinen con `prefers-color-scheme: dark`. El QR sigue negro sobre blanco
en ambos modos porque es lo que las cámaras leen mejor.
