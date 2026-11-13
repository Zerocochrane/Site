import { useEffect } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';
import SaveBar from './SaveBar.jsx';
import ToolsAdmin from './ToolsAdmin.jsx';
import { useDraft } from './unsaved.jsx';

const toForm = (s) => ({ name: s.name, tagline: s.tagline, about: s.about, instagram: s.instagram });

export default function SettingsAdmin() {
  const { settings, setSettings } = useSettings();
  const { draft: form, setDraft, dirty, load, commit, discard } = useDraft(null);

  useEffect(() => { if (settings && !form) load(toForm(settings)); }, [settings, form, load]);

  if (!form) return <section className="admin-section"><p className="muted">Carregando…</p></section>;
  const set = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const updated = await api('/settings', { method: 'PUT', body: form });
    setSettings(updated);
    commit(toForm(updated));
  };

  return (
    <section className="admin-section narrow has-save-bar">
      <div className="admin-title-row"><h1>Configurações</h1></div>
      <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
        <label>Seu nome (aparece em destaque na página inicial)<input value={form.name} onChange={set('name')} /></label>
        <label>Frase de apresentação<input value={form.tagline} onChange={set('tagline')} /></label>
        <label>Sobre você<textarea rows={4} value={form.about} onChange={set('about')} /></label>
        <label>Instagram <span className="muted">(opcional)</span><input value={form.instagram} onChange={set('instagram')} placeholder="@seunome" /></label>
      </form>
      <ToolsAdmin />
      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} />
    </section>
  );
}
