import { useEffect, useRef, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, uploadPhotos } from '../api.js';

export default function PhotosAdmin() {
  const [photos, setPhotos] = useState([]);
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const inputRef = useRef();

  useEffect(() => { api('/photos').then(setPhotos); }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };

  const handleFiles = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setProgress(0);
    try {
      const created = await uploadPhotos(list, setProgress);
      setPhotos((p) => [...created, ...p]);
      flash(`${created.length} photo${created.length > 1 ? 's' : ''} added to the top of your portfolio.`);
    } catch (err) {
      flash(err.message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveOrder = (next) => {
    setPhotos(next);
    api('/photos/order', { method: 'PUT', body: { ids: next.map((p) => p.id) } })
      .then(() => flash('Order saved.'))
      .catch((e) => flash(e.message));
  };

  const onDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.id === active.id);
    const to = photos.findIndex((p) => p.id === over.id);
    saveOrder(arrayMove(photos, from, to));
  };

  const move = (id, dir) => {
    const i = photos.findIndex((p) => p.id === id);
    const j = dir === 'first' ? 0 : i + dir;
    if (j < 0 || j >= photos.length || i === j) return;
    saveOrder(arrayMove(photos, i, j));
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title || 'this photo'}"? This cannot be undone.`)) return;
    await api(`/photos/${p.id}`, { method: 'DELETE' });
    setPhotos((list) => list.filter((x) => x.id !== p.id));
  };

  const rename = async (p, title) => {
    if (title === p.title) return;
    const updated = await api(`/photos/${p.id}`, { method: 'PATCH', body: { title } });
    setPhotos((list) => list.map((x) => (x.id === p.id ? updated : x)));
  };

  const active = photos.find((p) => p.id === activeId);

  return (
    <section className="admin-section">
      <div className="admin-title-row">
        <h1>Photos <span className="count">{photos.length}</span></h1>
        {msg && <p className="toast">{msg}</p>}
      </div>

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
            <strong>+ Drop photos here</strong>
            <span>or click to choose — you can select many at once</span>
          </>
        ) : (
          <>
            <strong>Uploading… {Math.round(progress * 100)}%</strong>
            <div className="bar"><div style={{ width: `${progress * 100}%` }} /></div>
          </>
        )}
      </div>

      {photos.length > 0 && <p className="hint">Drag photos to change the order on your site. The first photo is shown first.</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="sort-grid">
            {photos.map((p, i) => (
              <SortablePhoto key={p.id} photo={p} index={i} total={photos.length} onDelete={remove} onRename={rename} onMove={move} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {active && <div className="sort-card overlay"><img src={active.url} alt="" /></div>}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function SortablePhoto({ photo, index, total, onDelete, onRename, onMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const [title, setTitle] = useState(photo.title);
  useEffect(() => setTitle(photo.title), [photo.title]);

  return (
    <div
      ref={setNodeRef}
      className={`sort-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="handle" {...attributes} {...listeners} title="Drag to reorder">
        <img src={photo.url} alt={photo.title} loading="lazy" draggable={false} />
        <span className="pos">{index + 1}</span>
      </div>
      <input
        className="title-input"
        value={title}
        placeholder="Title (optional)"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => onRename(photo, title)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <div className="card-actions">
        <button onClick={() => onMove(photo.id, 'first')} disabled={index === 0} title="Move to first">⇤</button>
        <button onClick={() => onMove(photo.id, -1)} disabled={index === 0} title="Move left">←</button>
        <button onClick={() => onMove(photo.id, 1)} disabled={index === total - 1} title="Move right">→</button>
        <button className="danger" onClick={() => onDelete(photo)} title="Delete">Delete</button>
      </div>
    </div>
  );
}
