import { useEffect } from 'react';
import { useSettings } from './settings.jsx';

/**
 * Browser tab title for a public page: "Casamentos — Ana Lima", "Júlia & Rafa — Casamentos — Ana Lima".
 * With no parts (home page): "Ana Lima — Fotografia".
 */
export default function usePageTitle(...parts) {
  const { settings } = useSettings();
  const name = settings?.name || '';
  const skip = parts[0] === false; // usePageTitle(false): this component doesn't own the title right now
  const key = parts.join('\u0001');
  useEffect(() => {
    if (skip) return;
    const list = parts.filter(Boolean);
    document.title = list.length ? [...list, name].filter(Boolean).join(' — ') : [name, 'Fotografia'].filter(Boolean).join(' — ');
  }, [key, name, skip]); // eslint-disable-line react-hooks/exhaustive-deps
}
