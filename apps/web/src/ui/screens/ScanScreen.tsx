import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Camera } from '@phosphor-icons/react';
import type { Shared } from '../../app/share';
import { secretFromQr } from '../../app/share';
import { formatSize } from '../../lib/format';
import { FileIcon } from '../chat/Thread';
import { rise, stagger } from '../motion';

// BarcodeDetector aún no está en lib.dom de TypeScript.
interface Detector {
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => Detector;
  }
}

type Cam = 'starting' | 'on' | 'denied' | 'unsupported';

/** Celular que llegó con "Compartir con Chaski": lo que se enviará y el escáner del QR de la PC. */
export function ScanScreen({ outbox, onScan, onCancel }: { outbox: Shared | null; onScan: (s: Uint8Array<ArrayBuffer>) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<Cam>('starting');
  const [foreign, setForeign] = useState(false);
  const scanRef = useRef(onScan);
  scanRef.current = onScan;

  useEffect(() => {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setCam('unsupported');
      return;
    }
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = async () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2) {
        const codes = await detector.detect(v).catch(() => []);
        for (const c of codes) {
          const secret = secretFromQr(c.rawValue);
          if (secret) {
            stopped = true;
            scanRef.current(secret);
            return;
          }
          setForeign(true);
        }
      }
      timer = setTimeout(tick, 200);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        void video.current.play().catch(() => undefined);
        setCam('on');
        void tick();
      })
      .catch(() => setCam('denied'));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const files = outbox?.files ?? [];
  const shown = files.slice(0, 3);

  return (
    <m.div variants={stagger} initial="hidden" animate="show" className="flex flex-1 flex-col gap-6 py-4">
      <m.h1 variants={rise} className="text-[36px] font-semibold leading-[1] tracking-[-0.045em]">
        Envíalo a una PC
      </m.h1>

      <m.ul variants={rise} className="flex flex-col items-end gap-2" aria-label="Para enviar">
        {outbox?.text && (
          <li className="bubble-out max-w-[85%] bg-ink px-4 py-3 text-on-ink">
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-[16px] leading-[1.35]">{outbox.text}</p>
          </li>
        )}
        {shown.map((f, i) => (
          <li key={i} className="bubble-out flex max-w-[85%] items-center gap-3 bg-ink px-4 py-3 text-on-ink">
            <FileIcon mime={f.type} name={f.name} size={26} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{f.name}</span>
              <span className="text-[12px] text-on-ink/60">{formatSize(f.size)}</span>
            </span>
          </li>
        ))}
        {files.length > shown.length && <li className="text-[14px] font-medium text-muted">y {files.length - shown.length} más</li>}
      </m.ul>

      <m.div variants={rise} className="relative mx-auto aspect-square w-full max-w-[min(100%,48dvh)] overflow-hidden rounded-[24px] bg-[#111114]">
        <video ref={video} muted playsInline className={`size-full object-cover ${cam === 'on' ? '' : 'hidden'}`} />
        {cam === 'on' ? (
          <div className="pointer-events-none absolute inset-[18%] rounded-[20px] border-[3px] border-brand" aria-hidden="true" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-[16px] text-[#fff]/80">
            <Camera size={36} aria-hidden="true" />
            {cam === 'starting' && 'Abriendo la cámara'}
            {cam === 'denied' && 'Permite el acceso a la cámara para escanear'}
            {cam === 'unsupported' && 'Este navegador no puede escanear aquí. Abre Chaski en Chrome.'}
          </div>
        )}
      </m.div>

      <m.p variants={rise} className="text-center text-[16px] text-muted" aria-live="polite">
        {foreign ? 'Ese QR no es de Chaski' : 'Apunta al QR de chaski.me en la PC'}
      </m.p>

      <m.button variants={rise} type="button" onClick={onCancel} className="press mx-auto h-11 rounded-full px-5 text-[15px] font-semibold text-muted">
        Cancelar
      </m.button>
    </m.div>
  );
}
