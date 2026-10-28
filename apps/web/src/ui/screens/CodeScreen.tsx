import { useState, type FormEvent } from 'react';
import { m } from 'motion/react';
import { LockSimple } from '@phosphor-icons/react';
import { LogoMark } from '../brand/Logo';
import { rise, stagger } from '../motion';

/** Escribir el código de 6 dígitos que muestra la otra pantalla (RF6): sin cámara, o de PC a PC. */
export function CodeScreen({
  checking,
  error,
  onSubmit,
  onCancel,
}: {
  checking: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const digits = value.replace(/\D/g, '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!checking) onSubmit(digits);
  };

  return (
    <m.div variants={stagger} initial="hidden" animate="show" className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center gap-8 py-6">
      <m.div variants={rise} className="flex flex-col gap-4">
        <h1 className="text-[40px] font-semibold leading-[1] tracking-[-0.045em] sm:text-[56px]">Escribe el código</h1>
        <p className="text-[18px] text-muted">Es el número de 6 dígitos que aparece debajo del QR en la otra pantalla.</p>
      </m.div>

      <m.form variants={rise} onSubmit={submit} className="flex flex-col gap-4">
        <label htmlFor="pair-code" className="sr-only">
          Código de 6 dígitos
        </label>
        <input
          id="pair-code"
          // Sin type="number": así el teclado numérico aparece sin flechas y se aceptan espacios.
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          placeholder="000 000"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d ]/g, ''))}
          aria-invalid={!!error}
          aria-describedby="pair-code-status"
          className="h-20 w-full rounded-[20px] bg-soft text-center text-[40px] font-semibold tracking-[0.2em] tabular-nums outline-none placeholder:text-line focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={digits.length !== 6 || checking}
          className="press inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-ink text-[16px] font-semibold text-on-ink disabled:opacity-40"
        >
          {checking && <LogoMark size={22} running />}
          {checking ? 'Verificando' : 'Conectar'}
        </button>
        <p id="pair-code-status" role={error ? 'alert' : undefined} className={`min-h-[48px] text-center text-[16px] ${error ? 'text-danger' : 'text-muted'}`}>
          {error ?? (
            <span className="inline-flex items-center gap-2">
              <LockSimple size={15} aria-hidden="true" />
              El código nunca llega al servidor completo
            </span>
          )}
        </p>
      </m.form>

      <m.button variants={rise} type="button" onClick={onCancel} className="press mx-auto h-11 rounded-full px-5 text-[15px] font-semibold text-muted">
        Cancelar
      </m.button>
    </m.div>
  );
}
