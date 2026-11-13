import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the current admin screen has unsaved changes and stops the
 * photographer from losing them: links, the browser's reload/close, and
 * in-app navigation all ask for confirmation first.
 */
const Ctx = createContext({ setDirty: () => {}, confirmLeave: () => true });
const MESSAGE = 'Você tem alterações não salvas. Sair desta página sem salvá-las?';

export function UnsavedProvider({ children }) {
  const dirtyRef = useRef(false);
  const [, force] = useState(0);

  const setDirty = useCallback((v) => {
    if (dirtyRef.current !== v) { dirtyRef.current = v; force((n) => n + 1); }
  }, []);

  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    const ok = window.confirm(MESSAGE);
    if (ok) dirtyRef.current = false;
    return ok;
  }, []);

  useEffect(() => {
    // Reload / close tab / typing another address
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Any link click inside the app (runs before React Router's own handler)
    const onClick = (e) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!confirmLeave()) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [confirmLeave]);

  return <Ctx.Provider value={{ setDirty, confirmLeave }}>{children}</Ctx.Provider>;
}

export const useUnsaved = () => useContext(Ctx);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keeps a "saved" copy and a "draft" copy of a screen's editable data.
 * - setDraft: edit the draft (nothing is sent to the server)
 * - both: apply a change to saved AND draft (for actions that already hit the server, like uploads)
 * - commit(next): after a successful save, make `next` the new saved state
 * - discard(): throw the draft away
 */
export function useDraft(initial = null) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const dirty = saved !== null && !same(saved, draft);
  const load = useCallback((v) => { setSaved(v); setDraft(v); }, []);
  const both = useCallback((fn) => { setSaved(fn); setDraft(fn); }, []);
  const discard = useCallback(() => setDraft(saved), [saved]);
  return { saved, draft, setDraft, setSaved, dirty, load, both, commit: load, discard };
}
