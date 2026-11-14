import { useEffect } from 'react';

/**
 * Faz os elementos com a classe "reveal" aparecerem (fade-in) quando entram na tela
 * e sumirem (fade-out) quando saem.
 * Também acompanha elementos que aparecem DEPOIS (ex.: o texto "Sobre", que só existe quando
 * as configurações chegam) — antes eles ficavam invisíveis para sempre.
 * O parâmetro deps é aceito por compatibilidade, mas não é mais necessário.
 */
export default function useReveal() {
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const io = reduced || typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
        (entries) => entries.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)),
        { rootMargin: '-6% 0px -6% 0px', threshold: 0.12 }
      );
    const seen = new WeakSet();
    const watch = (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (io) io.observe(el); else el.classList.add('in');
    };
    const scan = (node) => {
      if (node.nodeType !== 1) return;
      if (node.classList.contains('reveal')) watch(node);
      node.querySelectorAll('.reveal').forEach(watch);
    };
    scan(document.body);
    const mo = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scan)));
    mo?.observe(document.body, { childList: true, subtree: true });
    return () => { io?.disconnect(); mo?.disconnect(); };
  }, []);
}
