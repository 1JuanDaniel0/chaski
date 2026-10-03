import { useRef, useState, type KeyboardEvent } from 'react';
import { m } from 'motion/react';
import { ArrowUp, UploadSimple } from '@phosphor-icons/react';
import { rise, stagger } from '../motion';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Conectados: enviar archivos es la acción principal (tile grande); el texto, la secundaria. */
export function RoomScreen({ dragging, onFiles, onText }: { dragging: boolean; onFiles: (f: FileList) => void; onText: (t: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim()) return;
    onText(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!coarse && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <m.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-12">
      <m.button
        variants={rise}
        type="button"
        onClick={() => fileRef.current?.click()}
        animate={dragging ? { scale: 1.01 } : { scale: 1 }}
        className={`tile press relative flex min-h-[220px] flex-col justify-between overflow-hidden p-6 text-left transition-colors duration-200 sm:min-h-[300px] sm:p-8 md:col-span-7 ${
          dragging ? 'bg-brand text-on-ink' : 'bg-peach text-ink hover:brightness-[0.985]'
        }`}
      >
        <UploadSimple size={36} weight="regular" aria-hidden="true" />
        <span>
          <span className="block font-display text-[40px] leading-[1.02] tracking-[-0.02em] sm:text-[56px]">
            {dragging ? 'Suéltalos' : 'Enviar archivos'}
          </span>
          {!coarse && !dragging && <span className="mt-2 block text-[15px] font-medium text-muted">o arrástralos aquí</span>}
        </span>
      </m.button>
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

      <m.form
        variants={rise}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="tile flex min-h-[150px] flex-col bg-surface p-5 ring-1 ring-line sm:p-6 md:col-span-5"
      >
        <label htmlFor="txt" className="sr-only">
          Texto para enviar
        </label>
        <textarea
          id="txt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={50000}
          placeholder="Escribe o pega un texto"
          className="min-h-[64px] w-full flex-1 resize-none bg-transparent text-[19px] leading-snug outline-none placeholder:text-muted/70"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            aria-label="Enviar texto"
            disabled={!text.trim()}
            className="press flex size-12 items-center justify-center rounded-full bg-ink text-on-ink disabled:opacity-20"
          >
            <ArrowUp size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </m.form>
    </m.div>
  );
}
