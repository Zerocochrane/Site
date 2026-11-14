// Light / dark theme for the public site.
// The choice is kept per browser; with no choice yet, the device setting decides (prefers-color-scheme).
// index.html sets data-theme before the page is drawn, so there is never a white flash.
import { useSyncExternalStore } from 'react';

const KEY = 'site_theme';
const root = () => document.documentElement;
const listeners = new Set();

export const currentTheme = () => (root().dataset.theme === 'dark' ? 'dark' : 'light');

function apply(theme) {
  root().dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121417' : '#ffffff');
  listeners.forEach((l) => l());
}

/** Switch theme. The new colours "wash" down the page like a wave (View Transitions API), or fade where unsupported. */
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return apply(next);
  if (document.startViewTransition) {
    root().classList.add('theme-wave');
    const t = document.startViewTransition(() => apply(next));
    t.finished.finally(() => root().classList.remove('theme-wave'));
  } else {
    root().classList.add('theme-fade');
    apply(next);
    setTimeout(() => root().classList.remove('theme-fade'), 700);
  }
}

/** React hook: 'light' | 'dark', re-renders on change. */
export function useTheme() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, currentTheme, () => 'light');
}
