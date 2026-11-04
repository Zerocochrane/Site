import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const INTERVAL = 5000;

/**
 * Cross-fading slideshow of subgroup covers. Each slide links to its subgroup.
 * Auto-advances every 5s; pauses on hover, keyboard focus, hidden tab, or "reduce motion".
 */
export default function Slideshow({ slides }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [tick, setTick] = useState(0); // restarts the timer/progress bar after manual navigation
  const start = useRef(null);
  const n = slides.length;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const running = n > 1 && !paused && !userPaused && !reduceMotion;

  const go = useCallback((i) => { setIndex(((i % n) + n) % n); setTick((t) => t + 1); }, [n]);

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % n), INTERVAL);
    return () => clearTimeout(t);
  }, [running, index, tick, n]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Swipe (touch or mouse drag) changes slide; a plain click/tap opens it
  const swiped = useRef(false);
  const onPointerDown = (e) => { start.current = e.clientX; swiped.current = false; };
  const onPointerUp = (e) => {
    if (start.current === null) return;
    const dx = e.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) > 50) { swiped.current = true; go(index + (dx < 0 ? 1 : -1)); }
  };

  if (!n) return null;

  return (
    <section
      className="slideshow"
      aria-roledescription="carousel"
      aria-label="Coleções"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div className="ss-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {slides.map((sl, i) => (
          <Link
            key={sl.id}
            to={sl.path}
            className={`ss-slide ${i === index ? 'on' : ''}`}
            aria-hidden={i !== index}
            aria-label={`${sl.name} — ${sl.photoCount} foto${sl.photoCount === 1 ? '' : 's'}`}
            title={sl.name}
            tabIndex={i === index ? 0 : -1}
            draggable={false}
            onClick={(e) => swiped.current && e.preventDefault()}
          >
            {sl.coverUrl && <img src={sl.coverUrl} alt={sl.name} loading={i < 2 ? 'eager' : 'lazy'} draggable={false} />}
          </Link>
        ))}

        {n > 1 && (
          <>
            <button className="ss-arrow left" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(index - 1)} aria-label="Coleção anterior"><svg viewBox="0 0 24 48" width="24" height="48" aria-hidden="true"><polyline points="18,6 6,24 18,42" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <button className="ss-arrow right" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(index + 1)} aria-label="Próxima coleção"><svg viewBox="0 0 24 48" width="24" height="48" aria-hidden="true"><polyline points="6,6 18,24 6,42" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          </>
        )}

      </div>

      {n > 1 && (
        <div className="ss-bar">
          <div className="ss-dots" role="tablist">
            {slides.map((sl, i) => (
              <button
                key={sl.id}
                role="tab"
                aria-selected={i === index}
                aria-label={sl.name}
                title={sl.name}
                className={i === index ? 'on' : ''}
                onClick={() => go(i)}
              >
                <span className="ss-dot-fill" key={`${index}-${tick}`} style={{ animationDuration: `${INTERVAL}ms`, animationPlayState: running ? 'running' : 'paused' }} />
              </button>
            ))}
          </div>
          {!reduceMotion && (
            <button className="ss-pause" onClick={() => setUserPaused((p) => !p)} aria-label={userPaused ? 'Continuar apresentação' : 'Pausar apresentação'}>
              {userPaused ? '▶ Continuar' : '❚❚ Pausar'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
