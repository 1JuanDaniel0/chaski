import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* Video de la escena 3D (el celular escanea el QR de la laptop y le pasa un archivo), en claro y oscuro.
   Se genera con Three.js fuera del repo; ver docs/caracteristicas.md. */
const SRC = { light: '/demo/chaski-3d-light', dark: '/demo/chaski-3d-dark' } as const;
type Theme = keyof typeof SRC;
const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/**
 * Pone el video en la sección estática de index.html (#info-demo), debajo del QR.
 * Lo descarga recién al verse, solo corre mientras está en pantalla y sigue el tema.
 * Con "reducir movimiento" queda el póster (el archivo ya recibido).
 */
export function InfoDemo() {
  const [host] = useState(() => document.getElementById('info-demo'));
  const [theme, setTheme] = useState(currentTheme);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  const [still] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (!host) return;
    const io = new IntersectionObserver((entries) => {
      const on = entries.some((e) => e.isIntersecting);
      setVisible(on);
      if (on) setSeen(true);
    });
    io.observe(host);
    return () => io.disconnect();
  }, [host]);

  useEffect(() => {
    const v = video.current;
    if (!v || still || !seen) return;
    // Las fuentes se agregan al verse por primera vez (o al cambiar de tema): hay que recargar.
    if (v.dataset.loaded !== theme) {
      v.load();
      v.dataset.loaded = theme;
    }
    if (visible) v.play().catch(() => {});
    else v.pause();
  }, [visible, theme, seen, still]);

  if (!host) return null;
  const base = SRC[theme];
  return createPortal(
    <video
      ref={video}
      key={theme}
      className="block h-auto w-full"
      width={1200}
      height={900}
      poster={`${base}.webp`}
      muted
      loop
      playsInline
      preload="none"
      aria-label="El celular escanea el QR de la laptop, se conectan y el archivo pasa del celular a la PC"
    >
      {seen && !still && (
        <>
          <source src={`${base}.webm`} type="video/webm" />
          <source src={`${base}.mp4`} type="video/mp4" />
        </>
      )}
    </video>,
    host,
  );
}
