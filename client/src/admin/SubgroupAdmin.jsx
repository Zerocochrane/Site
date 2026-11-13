import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uploadPhotos } from '../api.js';
import { SortableGrid, moveBy, DragGrip } from './Sortable.jsx';
import DetailsEditor from './DetailsEditor.jsx';
import SaveBar from './SaveBar.jsx';
import { useDraft, useUnsaved } from './unsaved.jsx';
import useFlash from './useFlash.js';

// Editable parts (kept as a draft until "Save changes"). Photos: order + captions.
const editable = (s) => ({
  name: s.name,
  description: s.description,
  date: s.date || '',
  coverPhotoId: s.coverPhotoId,
  groupCoverPhotoId: s.group.coverPhotoId,
  photos: s.photos.map((p) => ({ id: p.id, title: p.title })),
});

export default function SubgroupAdmin() {
  const { id: groupId, subId } = useParams();
  const navigate = useNavigate();
  const { setDirty } = useUnsaved();
  const [sub, setSub] = useState(null);        // server data
  const [files, setFiles] = useState({});      // photo id -> photo (url etc.)
  const { saved, draft, setDraft, dirty, load, both, commit, discard } = useDraft(null);
  const [targets, setTargets] = useState([]);  // other subgroups, for "move to…"
  const [progress, setProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [missing, setMissing] = useState(false);
  const [msg, flash] = useFlash();
  const inputRef = useRef();

  useEffect(() => {
    api(`/subgroups/${subId}?all=1`)
      .then((s) => {
        setSub(s);
        setFiles(Object.fromEntries(s.photos.map((p) => [p.id, p])));
        load(editable(s));
      })
      .catch(() => setMissing(true));
    api('/groups?all=1').then(async (groups) => {
      const full = await Promise.all(groups.map((g) => api(`/groups/${g.id}?all=1`)));
      setTargets(full
        .map((g) => ({ id: g.id, name: g.name, subs: g.subgroups.filter((s) => String(s.id) !== String(subId)) }))
        .filter((g) => g.subs.length));
    });
  }, [subId, load]);

  if (missing) return <section className="admin-section"><p>Subgrupo não encontrado. <Link to={`/admin/portfolio/${groupId}`}>Voltar para o grupo</Link></p></section>;
  if (!sub || !draft) return <section className="admin-section"><p className="muted">Carregando…</p></section>;

  const photos = draft.photos.map((p) => ({ ...files[p.id], title: p.title })).filter((p) => p.url);
  const subCoverId = photos.some((p) => p.id === draft.coverPhotoId) ? draft.coverPhotoId : photos[0]?.id;
  const edit = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const savedTitle = (pid) => saved.photos.find((p) => p.id === pid)?.title;

  const save = async () => {
    const body = {};
    if (draft.name !== saved.name) body.name = draft.name;
    if (draft.description !== saved.description) body.description = draft.description;
    if (draft.date !== saved.date) body.date = draft.date;
    if (draft.coverPhotoId !== saved.coverPhotoId) body.coverPhotoId = draft.coverPhotoId;
    if (Object.keys(body).length) {
      const s = await api(`/subgroups/${subId}`, { method: 'PATCH', body });
      setSub((old) => ({ ...old, ...s }));
    }
    if (draft.groupCoverPhotoId !== saved.groupCoverPhotoId) {
      await api(`/groups/${sub.groupId}`, { method: 'PATCH', body: { coverPhotoId: draft.groupCoverPhotoId } });
    }
    const order = draft.photos.map((p) => p.id);
    if (JSON.stringify(order) !== JSON.stringify(saved.photos.map((p) => p.id))) {
      await api(`/subgroups/${subId}/photos/order`, { method: 'PUT', body: { ids: order } });
    }
    for (const p of draft.photos) {
      if (p.title !== savedTitle(p.id)) await api(`/photos/${p.id}`, { method: 'PATCH', body: { title: p.title } });
    }
    commit(draft);
  };

  // ---- Immediate actions (not part of the draft) ----

  const handleFiles = async (list) => {
    const images = [...list].filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setProgress(0);
    try {
      const created = await uploadPhotos(subId, images, setProgress);
      setFiles((f) => ({ ...f, ...Object.fromEntries(created.map((p) => [p.id, p])) }));
      const add = (d) => ({ ...d, photos: [...d.photos, ...created.map((p) => ({ id: p.id, title: p.title }))] });
      both(add);
      flash(`${created.length} foto${created.length > 1 ? 's enviadas' : ' enviada'}.`);
    } catch (err) {
      flash(err.message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const dropFromBoth = (pid, { clearGroupCover }) => both((d) => ({
    ...d,
    photos: d.photos.filter((x) => x.id !== pid),
    coverPhotoId: d.coverPhotoId === pid ? null : d.coverPhotoId,
    groupCoverPhotoId: clearGroupCover && d.groupCoverPhotoId === pid ? null : d.groupCoverPhotoId,
  }));

  const removePhoto = async (p) => {
    if (!window.confirm('Excluir esta foto? Isso não pode ser desfeito.')) return;
    await api(`/photos/${p.id}`, { method: 'DELETE' });
    dropFromBoth(p.id, { clearGroupCover: true });
    flash('Foto excluída.');
  };

  const moveTo = async (p, targetId) => {
    const target = targets.find((g) => g.subs.some((s) => String(s.id) === String(targetId)));
    const tSub = target?.subs.find((s) => String(s.id) === String(targetId));
    if (!window.confirm(`Mover esta foto para “${tSub?.name}”${target?.id !== sub.groupId ? ` em “${target?.name}”` : ''}? Isso acontece na hora.`)) return;
    await api(`/photos/${p.id}`, { method: 'PATCH', body: { subgroupId: Number(targetId) } });
    dropFromBoth(p.id, { clearGroupCover: target?.id !== sub.groupId });
    flash(`Movida para “${tSub?.name}”.`);
  };

  const deleteSub = async () => {
    const n = photos.length;
    if (!window.confirm(n ? `Excluir “${saved.name}” e suas ${n} foto${n > 1 ? 's' : ''}? Isso não pode ser desfeito.` : `Excluir “${saved.name}”?`)) return;
    await api(`/subgroups/${subId}`, { method: 'DELETE' });
    setDirty(false);
    navigate(`/admin/portfolio/${sub.groupId}`);
  };

  const reorder = (next) => next && edit({ photos: next.map((p) => ({ id: p.id, title: p.title })) });
  const setTitle = (pid, title) => edit({ photos: draft.photos.map((x) => (x.id === pid ? { ...x, title } : x)) });

  return (
    <section className="admin-section has-save-bar">
      <nav className="crumbs">
        <Link to="/admin/portfolio">Portfólio</Link><span>/</span>
        <Link to={`/admin/portfolio/${sub.groupId}`}>{sub.group?.name}</Link><span>/</span>
        <b>{saved.name}</b>
      </nav>

      <DetailsEditor name={draft.name} description={draft.description} onChange={edit} descriptionHint="opcional — local, uma frase sobre o trabalho">
        {msg && <p className="toast">{msg}</p>}
        {saved.photos.length > 0 && <a className="btn btn-line small" href={sub.path} target="_blank" rel="noreferrer">Ver no site ↗</a>}
        <button className="btn btn-line small danger-btn" onClick={deleteSub}>Excluir subgrupo</button>
      </DetailsEditor>
      <label className="desc-label date-label">
        Data do trabalho <span className="muted">(aparece no site)</span>
        <span className="date-field">
          <input type="date" value={draft.date} max="2100-12-31" onChange={(e) => edit({ date: e.target.value })} />
          {draft.date && <button type="button" className="btn btn-line small" onClick={() => edit({ date: '' })}>Limpar</button>}
        </span>
      </label>

      <div
        className={`dropzone ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        {progress === null ? (
          <>
            <strong>+ Adicionar fotos a “{saved.name}”</strong>
            <span>Solte aqui ou clique para escolher — as fotos enviadas são guardadas na hora</span>
          </>
        ) : (
          <>
            <strong>Enviando… {Math.round(progress * 100)}%</strong>
            <div className="bar"><div style={{ width: `${progress * 100}%` }} /></div>
          </>
        )}
      </div>

      {photos.length > 0 && (
        <p className="hint">
          Arraste para definir a ordem do carrossel e edite as legendas; depois clique em <b>Salvar alterações</b>. <b>★ Capa do grupo</b> torna a foto a capa de
          “{sub.group?.name}” na página inicial; <b>Capa do subgrupo</b> define a imagem que representa este subgrupo.
        </p>
      )}

      <SortableGrid
        items={photos}
        onReorder={reorder}
        renderOverlay={(p) => <div className="sort-card overlay"><img src={p.url} alt="" /></div>}
        renderItem={(p, i, handle, dragging) => (
          <PhotoCard
            key={p.id}
            photo={p}
            index={i}
            total={photos.length}
            moved={saved.photos[i]?.id !== p.id}
            captionChanged={p.title !== savedTitle(p.id)}
            isGroupCover={p.id === draft.groupCoverPhotoId}
            isSubCover={p.id === subCoverId}
            subCoverChosen={p.id === draft.coverPhotoId}
            dragging={dragging}
            handle={handle}
            targets={targets}
            onGroupCover={() => edit({ groupCoverPhotoId: p.id })}
            onSubCover={() => edit({ coverPhotoId: p.id })}
            onDelete={() => removePhoto(p)}
            onTitle={(t) => setTitle(p.id, t)}
            onMove={(dir) => reorder(moveBy(photos, p.id, dir))}
            onMoveTo={(sid) => moveTo(p, sid)}
          />
        )}
      />

      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} />
    </section>
  );
}

function PhotoCard({ photo, index, total, moved, captionChanged, isGroupCover, isSubCover, subCoverChosen, dragging, handle, targets, onGroupCover, onSubCover, onDelete, onTitle, onMove, onMoveTo }) {
  return (
    <div className={`sort-card ${dragging ? 'dragging' : ''} ${isGroupCover ? 'is-cover' : ''} ${moved ? 'moved' : ''}`}>
      <div className="handle" {...handle} title="Arraste para reordenar">
                <DragGrip />
        <img src={photo.url} alt={photo.title} loading="lazy" draggable={false} />
        <span className="pos">{index + 1}</span>
        <div className="badges">
          {isGroupCover && <span className="cover-badge">★ Capa do grupo</span>}
          {isSubCover && <span className="cover-badge dark">Capa do subgrupo{!subCoverChosen && ' (auto)'}</span>}
        </div>
      </div>
      <div className="cover-btns">
        <button className={`cover-btn ${isGroupCover ? 'on' : ''}`} onClick={onGroupCover} disabled={isGroupCover} title="Usar como capa do grupo inteiro">
          ★ Capa do grupo
        </button>
        <button className={`cover-btn alt ${subCoverChosen ? 'on' : ''}`} onClick={onSubCover} disabled={subCoverChosen} title="Usar como capa deste subgrupo">
          Capa do subgrupo
        </button>
      </div>
      <input
        className={`title-input ${captionChanged ? 'changed' : ''}`}
        value={photo.title}
        placeholder="Legenda (opcional)"
        maxLength={200}
        onChange={(e) => onTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {targets.length > 0 && (
        <select className="move-select" value="" onChange={(e) => e.target.value && onMoveTo(e.target.value)}>
          <option value="">Mover para outro subgrupo…</option>
          {targets.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {g.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
      )}
      <div className="card-actions">
        <button onClick={() => onMove('first')} disabled={index === 0} title="Mover para o início">⇤</button>
        <button onClick={() => onMove(-1)} disabled={index === 0} title="Mover para a esquerda">←</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} title="Mover para a direita">→</button>
        <button className="danger" onClick={onDelete} title="Excluir">Excluir</button>
      </div>
    </div>
  );
}
