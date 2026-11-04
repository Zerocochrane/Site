import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { SortableGrid, moveBy, DragGrip } from './Sortable.jsx';
import DetailsEditor from './DetailsEditor.jsx';
import SaveBar from './SaveBar.jsx';
import { useDraft, useUnsaved } from './unsaved.jsx';
import useFlash from './useFlash.js';

// Editable parts of a group (kept as a draft until "Save changes")
const editable = (g) => ({
  name: g.name,
  description: g.description,
  coverPhotoId: g.coverPhotoId,
  subOrder: g.subgroups.map((s) => s.id),
});

export default function GroupAdmin() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirmLeave, setDirty } = useUnsaved();
  const [group, setGroup] = useState(null); // server data (subgroups with photos)
  const { saved, draft, setDraft, dirty, load, commit, discard } = useDraft(null);
  const [newName, setNewName] = useState('');
  const [missing, setMissing] = useState(false);
  const [msg, flash] = useFlash();

  const fetchGroup = useCallback(
    () => api(`/groups/${id}?all=1&photos=1`).then((g) => { setGroup(g); load(editable(g)); }).catch(() => setMissing(true)),
    [id, load]
  );
  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  if (missing) return <section className="admin-section"><p>Grupo não encontrado. <Link to="/admin/portfolio">Voltar para todos os grupos</Link></p></section>;
  if (!group || !draft) return <section className="admin-section"><p className="muted">Carregando…</p></section>;

  const byId = Object.fromEntries(group.subgroups.map((s) => [s.id, s]));
  const subs = draft.subOrder.map((sid) => byId[sid]).filter(Boolean);
  const allPhotos = subs.flatMap((s) => s.photos || []);
  const chosen = allPhotos.find((p) => p.id === draft.coverPhotoId);
  const coverPhoto = chosen || allPhotos[0];
  const edit = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const body = {};
    if (draft.name !== saved.name) body.name = draft.name;
    if (draft.description !== saved.description) body.description = draft.description;
    if (draft.coverPhotoId !== saved.coverPhotoId) body.coverPhotoId = draft.coverPhotoId;
    if (Object.keys(body).length) {
      const g = await api(`/groups/${id}`, { method: 'PATCH', body });
      setGroup((old) => ({ ...old, ...g, subgroups: old.subgroups }));
    }
    if (JSON.stringify(draft.subOrder) !== JSON.stringify(saved.subOrder)) {
      await api(`/groups/${id}/subgroups/order`, { method: 'PUT', body: { ids: draft.subOrder } });
    }
    commit(draft);
  };

  const createSub = async (e) => {
    e.preventDefault();
    if (!confirmLeave()) return;
    try {
      const s = await api(`/groups/${id}/subgroups`, { method: 'POST', body: { name: newName } });
      navigate(`/admin/portfolio/${id}/sub/${s.id}`);
    } catch (err) { flash(err.message); }
  };

  const deleteGroup = async () => {
    const n = allPhotos.length;
    const warning = `Excluir “${saved.name}”, seus ${subs.length} subgrupo${subs.length === 1 ? '' : 's'} e ${n} foto${n === 1 ? '' : 's'}? Isso não pode ser desfeito.`;
    if (!window.confirm(warning)) return;
    await api(`/groups/${id}`, { method: 'DELETE' });
    setDirty(false);
    navigate('/admin/portfolio');
  };

  const reorder = (next) => next && edit({ subOrder: next.map((s) => s.id) });

  return (
    <section className="admin-section has-save-bar">
      <nav className="crumbs"><Link to="/admin/portfolio">Portfólio</Link><span>/</span><b>{saved.name}</b></nav>

      <DetailsEditor name={draft.name} description={draft.description} onChange={edit} descriptionHint="opcional — aparece abaixo do nome do grupo">
        {msg && <p className="toast">{msg}</p>}
        {group.photoCount > 0 && <a className="btn btn-line small" href={group.path} target="_blank" rel="noreferrer">Ver no site ↗</a>}
        <button className="btn btn-line small danger-btn" onClick={deleteGroup}>Excluir grupo</button>
      </DetailsEditor>

      {/* ---- Subgroups ---- */}
      <div className="admin-sub-head">
        <h2>Subgrupos <span className="count">{subs.length}</span></h2>
      </div>
      <p className="hint">
        Os subgrupos guardam as fotos — ex.: um para cada casamento dentro de “Casamentos”. Os visitantes abrem o grupo e escolhem um subgrupo para ver as fotos.
        {subs.length > 1 && ' Arraste para mudar a ordem.'} Subgrupos vazios ficam ocultos no site.
      </p>
      <form className="new-group" onSubmit={createSub}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do novo subgrupo — ex.: “Júlia & Rafa”" maxLength={120} />
        <button className="btn btn-accent" disabled={!newName.trim()}>+ Criar subgrupo</button>
      </form>

      {subs.length === 0 && <p className="muted">Nenhum subgrupo ainda. Crie um acima e depois adicione fotos a ele.</p>}
      <SortableGrid
        items={subs}
        className="group-grid"
        onReorder={reorder}
        renderOverlay={(s) => <div className="group-card overlay"><Cover url={s.coverUrl} /></div>}
        renderItem={(s, i, handle, dragging) => (
          <div className={`group-card ${dragging ? 'dragging' : ''} ${saved.subOrder[i] !== s.id ? 'moved' : ''}`}>
            <div className="handle" {...handle} title="Arraste para reordenar">
                <DragGrip />
              <Cover url={s.coverUrl} />
              <span className="pos">{i + 1}</span>
              <div className="badges">
                {s.photos?.some((p) => p.id === coverPhoto?.id) && <span className="cover-badge">★ Capa do grupo</span>}
                {s.photoCount === 0 && <span className="hidden-badge">Oculto no site</span>}
              </div>
            </div>
            <div className="group-card-body">
              <h3>{s.name}</h3>
              <p className="muted small">{s.photoCount} foto{s.photoCount === 1 ? '' : 's'}</p>
            </div>
            <div className="card-actions">
              <button onClick={() => reorder(moveBy(subs, s.id, -1))} disabled={i === 0} title="Mover para antes">←</button>
              <button onClick={() => reorder(moveBy(subs, s.id, 1))} disabled={i === subs.length - 1} title="Mover para depois">→</button>
              <Link className="card-link" to={`/admin/portfolio/${id}/sub/${s.id}`}>Abrir e adicionar fotos</Link>
            </div>
          </div>
        )}
      />

      {/* ---- Group cover picker ---- */}
      <div className="admin-sub-head" id="cover">
        <h2>Capa do grupo</h2>
      </div>
      {allPhotos.length === 0 ? (
        <p className="muted">Adicione fotos a um subgrupo primeiro — depois escolha aqui qual delas representa o grupo na página inicial.</p>
      ) : (
        <div className="cover-picker">
          <div className={`cover-current ${draft.coverPhotoId !== saved.coverPhotoId ? 'changed' : ''}`}>
            <img src={coverPhoto.url} alt="Capa do grupo" />
            <p className="small">
              {chosen ? 'Capa escolhida' : 'Automática: primeira foto do primeiro subgrupo'}
              {chosen && <> · <button className="link-btn" onClick={() => edit({ coverPhotoId: null })}>usar automática</button></>}
            </p>
          </div>
          <div className="cover-options">
            <p className="hint">Clique em qualquer foto abaixo para torná-la a capa de <b>{draft.name || saved.name}</b>.</p>
            {subs.filter((s) => s.photos?.length).map((s) => (
              <div key={s.id} className="cover-row">
                <h4>{s.name}</h4>
                <div className="cover-thumbs">
                  {s.photos.map((p) => (
                    <button
                      key={p.id}
                      className={p.id === coverPhoto.id ? 'on' : ''}
                      onClick={() => edit({ coverPhotoId: p.id })}
                      title={p.id === coverPhoto.id ? 'Capa atual' : 'Usar como capa do grupo'}
                    >
                      <img src={p.url} alt={p.title} loading="lazy" />
                      {p.id === coverPhoto.id && <span>★</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} />
    </section>
  );
}

function Cover({ url }) {
  return url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <div className="cover-empty">Sem fotos ainda</div>;
}
