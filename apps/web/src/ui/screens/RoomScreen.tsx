import { useRef, useState, type KeyboardEvent } from 'react';
import { m } from 'motion/react';
import { ArrowDown, ArrowUp, TextAa, UploadSimple } from '@phosphor-icons/react';
import { formatSize } from '../../lib/format';
import type { TransferItem } from '../../transfer/manager';
import { HeroCard } from '../brand/HeroCard';
import { CardHead } from './PairScreen';
import { rise, stagger } from '../motion';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function totals(items: TransferItem[], dir: 'in' | 'out') {
  const done = items.filter((i) => i.dir === dir && i.status === 'done');
  return { n: done.length, bytes: done.reduce((s, i) => s + (i.kind === 'file' ? i.size : 0), 0) };
}

/** Conectados: enviar archivos es la card protagonista; el texto y el resumen, secundarias. */
export function RoomScreen({
  dragging,
  items,
  onFiles,
  onText,
}: {
  dragging: boolean;
  items: TransferItem[];
  onFiles: (f: FileList) => void;
  onText: (t: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const got = totals(items, 'in');
  const sent = totals(items, 'out');

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
    <m.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-12 md:grid-rows-[auto_auto]">
      <m.button
        variants={rise}
        type="button"
        onClick={() => fileRef.current?.click()}
        animate={dragging ? { scale: 1.015 } : { scale: 1 }}
        className="press text-left md:col-span-7 md:row-span-2"
      >
        <HeroCard className={`h-full min-h-[240px] sm:min-h-[340px] ${dragging ? 'ring-4 ring-brand' : ''}`}>
          <div className="flex h-full min-h-[inherit] flex-col justify-between p-6 sm:p-8">
            <span className="flex justify-end">
              <UploadSimple size={30} />
            </span>
            <span>
              <span className="block text-[38px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[52px]">
                {dragging ? 'Suéltalos' : 'Enviar archivos'}
              </span>
              {!coarse && <span className="mt-2 block text-[16px] text-on-hero/70">{dragging ? 'Se envían al instante' : 'o arrástralos aquí'}</span>}
            </span>
          </div>
        </HeroCard>
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
        className="flex min-h-[170px] flex-col gap-3 rounded-lg bg-mist p-5 md:col-span-5"
      >
        <span className="flex items-start justify-between">
          <label htmlFor="txt" className="text-[19px] font-semibold tracking-[-0.02em]">
            Texto
          </label>
          <TextAa size={24} aria-hidden="true" />
        </span>
        <textarea
          id="txt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={50000}
          rows={2}
          placeholder="Escribe o pega un texto"
          className="w-full flex-1 resize-none bg-transparent text-[18px] leading-snug outline-none placeholder:text-muted"
        />
        <span className="flex justify-end">
          <button
            type="submit"
            aria-label="Enviar texto"
            disabled={!text.trim()}
            className="press inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-on-ink disabled:opacity-25"
          >
            Enviar
            <ArrowUp size={16} weight="bold" aria-hidden="true" />
          </button>
        </span>
      </m.form>

      <m.section variants={rise} className="hidden min-h-[150px] flex-col justify-between rounded-lg bg-peach p-5 md:col-span-5 md:flex">
        <CardHead title="En esta sesión" icon={null} />
        <span className="flex items-end gap-8">
          <span>
            <span className="flex items-center gap-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em]">
              <ArrowDown size={22} weight="bold" className="text-brand" aria-label="Recibidos" />
              {got.n}
            </span>
            <span className="mt-1 block text-[14px] text-muted">{formatSize(got.bytes)} recibidos</span>
          </span>
          <span>
            <span className="flex items-center gap-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em]">
              <ArrowUp size={22} weight="bold" className="text-muted" aria-label="Enviados" />
              {sent.n}
            </span>
            <span className="mt-1 block text-[14px] text-muted">{formatSize(sent.bytes)} enviados</span>
          </span>
        </span>
      </m.section>
    </m.div>
  );
}
