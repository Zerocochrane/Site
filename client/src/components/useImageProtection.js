import { useEffect } from 'react';

/**
 * Blocks the usual ways of saving pictures: right-click menu, dragging images out,
 * long-press on phones, and Ctrl/Cmd+S / Ctrl/Cmd+P. (Screenshots can't be blocked by any website,
 * which is why proofs are also reduced and watermarked on the server.)
 */
export default function useImageProtection(active = true, scope = null, { keys = true } = {}) {
  // keys: also block Ctrl/Cmd+S/P/U (client area only — on the public site that just gets in the way)
  // scope: CSS selector; if given, the right-click menu is only blocked on/around those elements
  useEffect(() => {
    if (!active) return;
    const stop = (e) => { if (!scope || e.target.closest?.(scope)) e.preventDefault(); };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    document.addEventListener('contextmenu', stop);
    document.addEventListener('dragstart', stop);
    if (keys) document.addEventListener('keydown', onKey);
    document.body.classList.add('protect');
    return () => {
      document.removeEventListener('contextmenu', stop);
      document.removeEventListener('dragstart', stop);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('protect');
    };
  }, [active, scope, keys]);
}
