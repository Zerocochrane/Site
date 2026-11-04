import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const Ctx = createContext({ settings: null, reload: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const reload = useCallback(() => api('/settings').then(setSettings).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (settings?.name) document.title = `${settings.name} — Fotografia`; }, [settings?.name]);
  return <Ctx.Provider value={{ settings, reload, setSettings }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
