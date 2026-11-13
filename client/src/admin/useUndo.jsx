import { useCallback, useEffect, useRef, useState } from 'react';

let seq = 0;

/**
 * "Desfazer" notice for reversible actions (instead of an "Are you sure?" pop-up).
 * show(text, { onUndo, onCommit, ms }):
 *   - onUndo runs if the photographer clicks "Desfazer" within `ms` (default 8 s);
 *   - onCommit runs when the time is up — or right away if she leaves the page.
 * Render `element` somewhere on the page.
 */
export default function useUndo() {
  const [toast, setToast] = useState(null); // { id, text, onUndo }
  const pending = useRef(new Map());        // id → { timer, onCommit }

  const finish = useCallback((id) => {
    const p = pending.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.current.delete(id);
    p.onCommit?.();
    setToast((t) => (t?.id === id ? null : t));
  }, []);

  const show = useCallback((text, { onUndo, onCommit, ms = 8000 } = {}) => {
    const id = ++seq;
    pending.current.set(id, { onCommit, timer: setTimeout(() => finish(id), ms) });
    setToast({ id, text, onUndo });
  }, [finish]);

  const undo = () => {
    const t = toast;
    if (!t) return;
    const p = pending.current.get(t.id);
    if (p) { clearTimeout(p.timer); pending.current.delete(t.id); }
    setToast(null);
    t.onUndo?.();
  };

  // Leaving the page (or closing the tab) carries out everything still waiting
  useEffect(() => {
    const flush = () => [...pending.current.keys()].forEach(finish);
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [finish]);

  const element = toast && (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.onUndo && <button type="button" onClick={undo}>Desfazer</button>}
      <button type="button" className="undo-close" aria-label="Fechar" onClick={() => finish(toast.id)}>×</button>
    </div>
  );
  return { show, element };
}
