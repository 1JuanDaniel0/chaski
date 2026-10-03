import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { m } from 'motion/react';
import { PaperPlaneRight, Paperclip, Plus } from '@phosphor-icons/react';

export const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Barra de escritura al estilo WhatsApp: adjuntar, escribir, enviar. Pegar archivos también los envía. */
export function Composer({ onFiles, onText }: { onFiles: (f: FileList | File[]) => void; onText: (t: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;

  const grow = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  const send = () => {
    if (!ready) return;
    onText(text);
    setText('');
    requestAnimationFrame(grow);
    area.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!coarse && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      onFiles(files);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex items-end gap-2 rounded-[30px] bg-soft p-2"
    >
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Adjuntar archivos"
        title="Adjuntar archivos"
        className="press flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink sm:size-12"
      >
        {coarse ? <Paperclip size={20} weight="bold" /> : <Plus size={22} weight="bold" />}
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <label htmlFor="txt" className="sr-only">
        Mensaje
      </label>
      <textarea
        id="txt"
        ref={area}
        rows={1}
        value={text}
        maxLength={50000}
        onChange={(e) => {
          setText(e.target.value);
          grow();
        }}
        onKeyDown={onKey}
        onPaste={onPaste}
        placeholder={coarse ? 'Mensaje' : 'Escribe, pega o suelta archivos aquí'}
        className="max-h-40 min-h-11 flex-1 resize-none self-center bg-transparent px-2 py-2.5 text-[17px] leading-[1.35] outline-none placeholder:text-muted sm:min-h-12 sm:py-3"
      />
      <m.button
        type="submit"
        aria-label="Enviar texto"
        disabled={!ready}
        animate={{ scale: ready ? 1 : 0.9, opacity: ready ? 1 : 0.35 }}
        transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-[#fff] sm:size-12"
      >
        <PaperPlaneRight size={20} weight="fill" />
      </m.button>
    </form>
  );
}
