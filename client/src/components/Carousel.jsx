import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Photo carousel: arrows, keyboard (← →), swipe/drag, thumbnails.
 * Only slides near the current one load their image, so big groups stay fast.
 */
export default function Carousel({ photos, onOpen }) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  const stageRef = useRef(null);
  const thumbsRef = useRef(null);
  const n = photos.length;

  const go = useCallback((i) => setIndex(((i % n) + n) % n), [n]);

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (document.querySelector('.lightbox')) return; // lightbox handles keys itself
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  // Keep the active thumbnail visible
  // (scrolls only the strip sideways, never the page)
  useEffect(() => {
    const strip = thumbsRef.current;
    const el = strip?.children[index];
    if (!el) return;
    strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [index]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
  };
  const onPointerMove = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > 6) start.current.moved = true;
    setDrag(dx);
  };
  const onPointerUp = (e) => {
    if (!start.current) return;
    const { x, t, moved } = start.current;
    const dx = e.clientX - x;
    const width = stageRef.current?.offsetWidth || 1;
    const fast = Math.abs(dx) > 40 && Date.now() - t < 300;
    if (Math.abs(dx) > width * 0.18 || fast) go(index + (dx < 0 ? 1 : -1));
    else if (!moved) onOpen?.(index);
    start.current = null;
    setDrag(0);
  };

  if (!n) return null;
  const photo = photos[index];

  return (
    <div className="carousel">
      <div
        className="car-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setDrag(0); }}
        onPointerLeave={(e) => start.current && onPointerUp(e)}
      >
        <div
          className={`car-track ${drag ? 'dragging' : ''}`}
          style={{ transform: `translateX(calc(${-index * 100}% + ${drag}px))` }}
        >
          {photos.map((p, i) => (
            <div className="car-slide" key={p.id} aria-hidden={i !== index}>
              {Math.abs(i - index) <= 2 && <img src={p.url} alt={p.title} draggable={false} />}
            </div>
          ))}
        </div>

        {n > 1 && (
          <>
            <button className="car-arrow left" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(index - 1)} aria-label="Foto anterior">←</button>
            <button className="car-arrow right" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(index + 1)} aria-label="Próxima foto">→</button>
          </>
        )}
        <button className="car-expand" onPointerDown={(e) => e.stopPropagation()} onClick={() => onOpen?.(index)} aria-label="Tela cheia">⤢</button>
      </div>

      <div className="car-bar">
        <span className="car-count"><b>{String(index + 1).padStart(2, '0')}</b> / {String(n).padStart(2, '0')}</span>
        <span className="car-caption">{photo.title}</span>
        <div className="car-progress"><div style={{ width: `${((index + 1) / n) * 100}%` }} /></div>
      </div>

      {n > 1 && (
        <div className="car-thumbs" ref={thumbsRef}>
          {photos.map((p, i) => (
            <button key={p.id} className={i === index ? 'on' : ''} onClick={() => go(i)} aria-label={`Foto ${i + 1}`}>
              <img src={p.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
