import { useRef, useState } from 'react';
import { uploadClientPhotos } from '../api.js';

/** Drop zone that uploads many photos to a client area in batches. */
export default function PhotoDrop({ clientId, kind, title, hint, disabled, onUploaded }) {
  const [progress, setProgress] = useState(null);
  const [count, setCount] = useState([0, 0]);
  const [over, setOver] = useState(false);
  const [report, setReport] = useState('');
  const input = useRef();

  const go = async (files) => {
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp|tiff)$/.test(f.type));
    const skipped = files.length - list.length;
    if (!list.length) { setReport(skipped ? 'Esses arquivos não são imagens JPG, PNG, WEBP ou TIFF.' : ''); return; }
    setReport(''); setProgress(0); setCount([0, list.length]);
    try {
      const { created, failed } = await uploadClientPhotos(clientId, kind, list, (p, done, total) => { setProgress(p); setCount([done, total]); });
      onUploaded(created);
      const bad = [...failed, ...(skipped ? [`${skipped} arquivo${skipped > 1 ? 's' : ''} não suportado${skipped > 1 ? 's' : ''}`] : [])];
      setReport(`${created.length} foto${created.length === 1 ? ' enviada' : 's enviadas'}.${bad.length ? ` Não enviadas: ${bad.join(', ')}` : ''}`);
    } catch (err) {
      setReport(err.message);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <div
        className={`dropzone ${over ? 'over' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled && progress === null) go(e.dataTransfer.files); }}
        onClick={() => !disabled && progress === null && input.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
      >
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/tiff" multiple hidden onChange={(e) => go(e.target.files)} />
        {progress === null ? (
          <><strong>{title}</strong><span>{hint}</span></>
        ) : (
          <>
            <strong>Enviando {count[0]} / {count[1]} — {Math.round(progress * 100)}%</strong>
            <div className="bar"><div style={{ width: `${progress * 100}%` }} /></div>
            <span>Arquivos grandes podem demorar. Mantenha esta página aberta.</span>
          </>
        )}
      </div>
      {report && <p className="upload-report">{report}</p>}
    </>
  );
}
