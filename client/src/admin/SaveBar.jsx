import { useEffect, useState } from 'react';
import { useUnsaved } from './unsaved.jsx';

/**
 * Sticky bar at the bottom of an editing screen with Save / Discard.
 * `onSave` must return a promise; errors are shown in the bar and the changes stay unsaved.
 * Also: Ctrl+S / Cmd+S saves.
 */
export default function SaveBar({ dirty, onSave, onDiscard, label = 'Alterações não salvas' }) {
  const { setDirty } = useUnsaved();
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');

  useEffect(() => { setDirty(dirty); }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
  useEffect(() => { if (dirty && state === 'saved') setState('idle'); }, [dirty, state]);

  const save = async () => {
    if (!dirty || state === 'saving') return;
    setState('saving'); setError('');
    try {
      await onSave();
      setState('saved');
    } catch (err) {
      setError(err.message || 'Não foi possível salvar.');
      setState('error');
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={`save-bar ${dirty ? 'dirty' : ''} ${!dirty && state !== 'saving' && state !== 'error' ? 'idle' : ''}`} role="status" aria-live="polite">
      <span className="save-state">
        {state === 'saving' ? 'Salvando…'
          : state === 'error' ? <span className="err">Não salvo: {error}</span>
          : dirty ? <><i className="save-dot" /> {label}</>
          : state === 'saved' ? '✓ Todas as alterações foram salvas'
          : 'Nenhuma alteração pendente'}
      </span>
      <div className="save-actions">
        <button className="btn btn-line small" onClick={() => { onDiscard(); setState('idle'); setError(''); }} disabled={!dirty || state === 'saving'}>
          Descartar
        </button>
        <button className="btn btn-accent small" onClick={save} disabled={!dirty || state === 'saving'}>
          {state === 'saving' ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}
