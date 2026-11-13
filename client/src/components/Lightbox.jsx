import { useEffect } from 'react';

export default function Lightbox({ photos, index, onClose, onIndex }) {
  const photo = photos[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lb-close" onClick={onClose} aria-label="Fechar">×</button>
      <button className="lb-arrow left" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + photos.length) % photos.length); }} aria-label="Anterior">←</button>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={photo.url} alt={photo.title || ''} />
        <figcaption>
          <span>{photo.title || ''}</span>
          <span>{String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span>
        </figcaption>
      </figure>
      <button className="lb-arrow right" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % photos.length); }} aria-label="Próxima">→</button>
    </div>
  );
}
