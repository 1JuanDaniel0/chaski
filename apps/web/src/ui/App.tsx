import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { Controller } from '../app/controller';
import { QrCode } from './QrCode';
import { TransferList } from './TransferList';

export function App() {
  const ctl = useMemo(() => new Controller(), []);
  const v = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [text, setText] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ctl.init();
  }, [ctl]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (v.phase === 'connected') ctl.sendFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`app${drag ? ' drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <header>
        <h1>Chasqui</h1>
      </header>

      <main>
        {v.warning && (
          <div className="alert" role="alert">
            {v.warning} <button type="button" onClick={() => ctl.dismissWarning()}>Entendido</button>
          </div>
        )}

        {(v.phase === 'starting' || v.phase === 'waiting') && (
          <section className="center">
            {v.shareUrl ? (
              <>
                <QrCode text={v.shareUrl} />
                <p>Escanea con el celular para conectar.</p>
              </>
            ) : null}
            <p className="muted">Esperando al otro dispositivo…</p>
            {v.shareUrl && <p className="muted small">El código se renueva solo a los 10 minutos.</p>}
          </section>
        )}

        {v.phase === 'connecting' && <p className="center muted">Conectando…</p>}

        {v.phase === 'connected' && (
          <section>
            <div className="status">
              <span>Conectado con <strong>{v.peerDevice ?? 'otro dispositivo'}</strong></span>
              {v.isOwner && <button type="button" className="danger" onClick={() => ctl.kick()}>Expulsar</button>}
            </div>
            <div className="send">
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) ctl.sendFiles(e.target.files); e.target.value = ''; }} />
              <button type="button" className="primary big" onClick={() => fileRef.current?.click()}>Elegir archivos</button>
              <p className="muted small hint">o arrástralos a esta ventana</p>
              <label htmlFor="txt">Enviar texto</label>
              <textarea id="txt" rows={3} maxLength={50000} value={text} onChange={(e) => setText(e.target.value)} />
              <button type="button" disabled={!text.trim()} onClick={() => { ctl.sendText(text); setText(''); }}>Enviar texto</button>
            </div>
          </section>
        )}

        {v.phase === 'peer-left' && (
          <section className="center">
            <p>El otro dispositivo se desconectó.</p>
            <button type="button" className="primary" onClick={() => ctl.newRoom()}>Nueva sala</button>
          </section>
        )}
        {v.phase === 'kicked' && (
          <section className="center">
            <p>Te expulsaron de la sala.</p>
            <button type="button" className="primary" onClick={() => ctl.newRoom()}>Nueva sala</button>
          </section>
        )}
        {v.phase === 'error' && (
          <section className="center">
            <p role="alert">{v.error}</p>
            <button type="button" className="primary" onClick={() => ctl.newRoom()}>Nueva sala</button>
          </section>
        )}

        <TransferList items={v.items} onCancel={(i) => ctl.cancel(i)} />
      </main>

      <footer>El cifrado protege el trayecto, no la PC. Borra lo descargado al terminar.</footer>
    </div>
  );
}
