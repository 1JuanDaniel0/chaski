import { useState } from 'react';
import { m } from 'motion/react';
import { Check, ShareNetwork } from '@phosphor-icons/react';
import { coarse } from './Composer';

const URL_SHARED = 'https://chaski.me/';
const TEXT = 'Pasa archivos del celular a la PC escaneando un QR, sin cable ni cuenta.';

/**
 * Invitación discreta a recomendar Chaski, solo después de un envío que salió bien.
 * Nunca lleva nada de la sesión: ni nombres de archivo ni el enlace de la sala.
 */
export function ShareChaski({ received }: { received: boolean }) {
  const [copied, setCopied] = useState(false);
  // En el celular abre el menú Compartir; en la PC copia el enlace, que es lo que se pega en un chat.
  const native = coarse && typeof navigator.share === 'function';

  const share = async () => {
    if (native) {
      await navigator.share({ title: 'Chaski', text: TEXT, url: URL_SHARED }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(URL_SHARED);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <m.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center pt-3">
      <span className="flex items-center gap-1 text-[13px] text-muted">
        {received ? 'Recibido con Chaski.' : '¿Te sirvió?'}
        <button type="button" onClick={() => void share()} className="press inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold text-brand">
          {copied ? <Check size={14} weight="bold" aria-hidden="true" /> : <ShareNetwork size={14} weight="bold" aria-hidden="true" />}
          {copied ? 'Enlace copiado' : native ? 'Compartir Chaski' : 'Copiar enlace'}
        </button>
      </span>
    </m.li>
  );
}
