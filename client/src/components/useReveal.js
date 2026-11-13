import { useEffect } from 'react';

/**
 * Faz os elementos com a classe "reveal" aparecerem (fade-in) quando entram na tela
 * e sumirem (fade-out) quando saem. Rode de novo quando a lista mudar (deps).
 */
export default function useReveal(deps = []) {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal')];
    if (!els.length) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)),
      { rootMargin: '-6% 0px -6% 0px', threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
