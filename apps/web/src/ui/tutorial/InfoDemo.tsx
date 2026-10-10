import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TutorialAnimation } from './TutorialAnimation';

/**
 * Pone la animación del tutorial en la sección estática de index.html (#info-demo), debajo del QR.
 * Solo corre mientras se ve en pantalla.
 */
export function InfoDemo() {
  const [host] = useState(() => document.getElementById('info-demo'));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!host) return;
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)));
    io.observe(host);
    return () => io.disconnect();
  }, [host]);

  return host ? createPortal(<TutorialAnimation playing={visible} />, host) : null;
}
