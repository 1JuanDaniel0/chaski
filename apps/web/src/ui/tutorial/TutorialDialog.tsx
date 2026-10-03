import { useEffect, useId, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { TutorialAnimation } from './TutorialAnimation';
import './tutorial.css';

export function TutorialDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="tut-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tut-dialog-body" tabIndex={-1} autoFocus>
        <button type="button" className="tut-close" aria-label="Cerrar" onClick={onClose}>
          <X size={20} weight="bold" />
        </button>
        <h2 id={titleId} className="font-display text-[36px] leading-tight text-ink m-0 mb-5 pr-12">
          Así de simple
        </h2>
        <TutorialAnimation playing={open} />
      </div>
    </dialog>
  );
}
