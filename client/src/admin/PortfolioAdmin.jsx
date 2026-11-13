import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { SortableGrid, moveBy, DragGrip } from './Sortable.jsx';
import SaveBar from './SaveBar.jsx';
import { useDraft, useUnsaved } from './unsaved.jsx';
import useFlash from './useFlash.js';
import Help from './Help.jsx';

export default function PortfolioAdmin() {
  const { saved, draft: groups, setDraft, dirty, load, commit, discard } = useDraft(null);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef(null);
  const [msg, flash] = useFlash();
  const navigate = useNavigate();
  const { confirmLeave } = useUnsaved();

  useEffect(() => { api('/groups?all=1').then(load); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setNameErr(true); nameRef.current?.focus(); return; }
    if (!confirmLeave()) return;
    try {
      const g = await api('/groups', { method: 'POST', body: { name } });
      navigate(`/admin/portfolio/${g.id}`);
    } catch (err) { flash(err.message); }
  };

  const reorder = (next) => next && setDraft(next);

  const save = async () => {
    await api('/groups/order', { method: 'PUT', body: { ids: groups.map((g) => g.id) } });
    commit(groups);
  };

  return (
    <section className="admin-section has-save-bar">
      <div className="admin-title-row">
        <h1>Portfólio <span className="count">{groups?.length ?? '…'} grupos</span></h1>
        {msg && <p className="toast">{msg}</p>}
      </div>
      <Help>Cada grupo é um tema (Casamentos, Retratos, Espetáculos…) e contém subgrupos com as fotos. Os visitantes veem os grupos nesta ordem, abrem um e escolhem um subgrupo para ver as fotos. Grupos sem fotos ficam ocultos no site.</Help>

      <form className="new-group" onSubmit={create}>
        <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setNameErr(false); }} placeholder="Nome do novo grupo — ex.: “Casamentos”" maxLength={120} aria-invalid={nameErr || undefined} />
        <button className="btn btn-accent">+ Criar grupo</button>
        {nameErr && <span className="err new-group-err">Digite o nome do grupo primeiro.</span>}
      </form>

      {groups?.length === 0 && <p className="muted">Nenhum grupo ainda. Crie o primeiro acima.</p>}
      {groups?.length > 1 && <p className="hint">Arraste os grupos para mudar a ordem e depois clique em <b>Salvar alterações</b>.</p>}

      {groups && (
        <SortableGrid
          items={groups}
          className="group-grid"
          onReorder={reorder}
          renderOverlay={(g) => <div className="group-card overlay"><Cover g={g} /></div>}
          renderItem={(g, i, handle, dragging) => (
            <div className={`group-card ${dragging ? 'dragging' : ''} ${saved && saved[i]?.id !== g.id ? 'moved' : ''}`}>
              <div className="handle" {...handle} title="Arraste para reordenar">
                <DragGrip />
                <Cover g={g} />
                <span className="pos">{i + 1}</span>
                {g.photoCount === 0 && <span className="hidden-badge">Oculto no site</span>}
              </div>
              <div className="group-card-body">
                <h3>{g.name}</h3>
                <p className="muted small">
                  {g.subgroupCount} subgrupo{g.subgroupCount === 1 ? '' : 's'} · {g.photoCount} foto{g.photoCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="card-actions">
                <button onClick={() => reorder(moveBy(groups, g.id, -1))} disabled={i === 0} title="Mover para antes">←</button>
                <button onClick={() => reorder(moveBy(groups, g.id, 1))} disabled={i === groups.length - 1} title="Mover para depois">→</button>
                <Link className="card-link" to={`/admin/portfolio/${g.id}`}>Abrir e editar</Link>
              </div>
            </div>
          )}
        />
      )}

      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} label="Ordem não salva" />
    </section>
  );
}

function Cover({ g }) {
  return g.coverUrl
    ? <img src={g.coverUrl} alt="" loading="lazy" draggable={false} />
    : <div className="cover-empty">Sem fotos ainda</div>;
}
