import { useEffect } from 'react';
import { api } from '../api.js';
import SaveBar from './SaveBar.jsx';
import { useDraft } from './unsaved.jsx';
import AgendaTabs from './AgendaTabs.jsx';
import Help from './Help.jsx';

const TYPES = [
  { key: 'text', label: 'Texto' },
  { key: 'number', label: 'Número' },
  { key: 'date', label: 'Data' },
  { key: 'time', label: 'Horário' },
  { key: 'money', label: 'Valor (R$)' },
];
const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
const newField = () => ({ id: `f${hex()}`, label: '', type: 'text', required: false });
const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

export default function CategoriesAdmin() {
  const { saved, draft: cats, setDraft, dirty, load, commit, discard } = useDraft(null);

  useEffect(() => { api('/categories').then(load); }, [load]);
  if (!cats) return <section className="admin-section"><p className="muted">Carregando…</p></section>;

  const update = (i, patch) => setDraft((list) => list.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const updateField = (i, j, patch) =>
    setDraft((list) => list.map((c, k) => (k === i ? { ...c, fields: c.fields.map((f, n) => (n === j ? { ...f, ...patch } : f)) } : c)));
  const addCategory = () => {
    setDraft((list) => [...list, { id: `new-${hex()}`, name: '', kind: 'photoshoot', hasDuration: false, fields: [] }]);
    setTimeout(() => document.querySelector('.cat-card:last-child .cat-name')?.focus(), 50);
  };
  const removeCategory = (i) => {
    if (window.confirm(`Excluir a categoria "${cats[i].name || 'sem nome'}"? Os pedidos já recebidos continuam salvos.`)) {
      setDraft((list) => list.filter((_, k) => k !== i));
    }
  };

  const save = async () => {
    if (cats.some((c) => !c.name.trim())) throw new Error('Dê um nome a todas as categorias.');
    if (cats.some((c) => c.fields.some((f) => !f.label.trim()))) throw new Error('Dê um nome a todos os campos extras.');
    const before = Object.fromEntries(saved.map((c) => [c.id, c]));
    const keep = new Set(cats.map((c) => c.id));
    for (const c of saved) if (!keep.has(c.id)) await api(`/categories/${c.id}`, { method: 'DELETE' });
    const ids = [];
    for (const c of cats) {
      const body = { name: c.name, kind: c.kind, hasDuration: c.hasDuration, fields: c.fields };
      if (String(c.id).startsWith('new-')) {
        ids.push((await api('/categories', { method: 'POST', body })).id);
      } else {
        if (JSON.stringify(before[c.id]) !== JSON.stringify(c)) await api(`/categories/${c.id}`, { method: 'PATCH', body });
        ids.push(c.id);
      }
    }
    commit(await api('/categories/order', { method: 'PUT', body: { ids } }));
  };

  return (
    <section className="admin-section narrow has-save-bar">
      <div className="admin-title-row"><h1>Agenda</h1></div>
      <AgendaTabs />
      <div className="cat-toolbar">
        <h2 className="h2-display">Categorias</h2>
        <button className="btn btn-accent" onClick={addCategory}>+ Nova categoria</button>
      </div>
      <Help>
        As categorias aparecem no formulário de agendamento. Todos os formulários já pedem <b>Nome*</b>, <b>E-mail*</b>, <b>Telefone*</b>,{' '}
        <b>Como me conheceu</b> (com nome e Instagram de quem indicou) e <b>Observações</b>. Aqui você escolhe o tipo, a duração e os campos extras de cada categoria.
      </Help>

      {cats.length === 0 && <p className="muted">Nenhuma categoria ainda. Sem categorias, o formulário de agendamento fica vazio.</p>}

      <div className="cat-list">
        {cats.map((c, i) => (
          <article key={c.id} className="cat-card">
            <div className="cat-head">
              <input className="cat-name" value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Nome da categoria (ex.: Casamento)" />
              <div className="cat-order">
                <button className="icon-btn" title="Mover para cima" disabled={i === 0} onClick={() => setDraft((l) => move(l, i, -1))}>↑</button>
                <button className="icon-btn" title="Mover para baixo" disabled={i === cats.length - 1} onClick={() => setDraft((l) => move(l, i, 1))}>↓</button>
              </div>
            </div>

            <div className="cat-options">
              <div>
                <span className="opt-label">Tipo</span>
                <div className="chips">
                  <button type="button" className={`chip ${c.kind === 'event' ? 'on' : ''}`} onClick={() => update(i, { kind: 'event', hasDuration: true })}>Evento</button>
                  <button type="button" className={`chip ${c.kind === 'photoshoot' ? 'on' : ''}`} onClick={() => update(i, { kind: 'photoshoot' })}>Ensaio</button>
                </div>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={c.kind === 'event' || c.hasDuration}
                  disabled={c.kind === 'event'}
                  onChange={(e) => update(i, { hasDuration: e.target.checked })}
                />
                Pedir a duração (horas)
                <span className="muted small">{c.kind === 'event' ? ' — obrigatória em eventos' : ' — obrigatória quando ativada'}</span>
              </label>
            </div>

            <div className="cat-fields">
              <span className="opt-label">Campos extras</span>
              {c.fields.length === 0 && <p className="muted small">Nenhum campo extra.</p>}
              {c.fields.map((f, j) => (
                <div key={f.id} className="field-row">
                  <input value={f.label} onChange={(e) => updateField(i, j, { label: e.target.value })} placeholder="Pergunta (ex.: Número de convidados)" />
                  <select value={f.type} onChange={(e) => updateField(i, j, { type: e.target.value })}>
                    {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <label className="check">
                    <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, j, { required: e.target.checked })} /> Obrigatório
                  </label>
                  <div className="cat-order">
                    <button className="icon-btn" title="Mover para cima" disabled={j === 0} onClick={() => update(i, { fields: move(c.fields, j, -1) })}>↑</button>
                    <button className="icon-btn" title="Mover para baixo" disabled={j === c.fields.length - 1} onClick={() => update(i, { fields: move(c.fields, j, 1) })}>↓</button>
                    <button className="icon-btn" title="Remover campo" onClick={() => update(i, { fields: c.fields.filter((_, n) => n !== j) })}>×</button>
                  </div>
                </div>
              ))}
              <button className="btn btn-line small" onClick={() => update(i, { fields: [...c.fields, newField()] })}>+ Adicionar campo</button>
            </div>

            <div className="cat-foot">
              <button className="link-btn danger" onClick={() => removeCategory(i)}>Excluir categoria</button>
            </div>
          </article>
        ))}
      </div>

      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} />
    </section>
  );
}
