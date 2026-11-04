import { useEffect, useState } from 'react';

const columnsFor = (w) => (w < 640 ? 1 : w < 1100 ? 2 : 3);

/**
 * Masonry that keeps reading order left-to-right: each photo goes into the
 * currently shortest column, so the order set in the admin is the order visitors see.
 */
export default function Masonry({ items, render }) {
  const [cols, setCols] = useState(() => columnsFor(window.innerWidth));
  useEffect(() => {
    const onResize = () => setCols(columnsFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const columns = Array.from({ length: cols }, () => ({ h: 0, items: [] }));
  items.forEach((item, i) => {
    const ratio = item.width && item.height ? item.height / item.width : 1;
    const target = columns.reduce((min, c) => (c.h < min.h - 0.01 ? c : min), columns[0]);
    target.items.push({ item, i });
    target.h += ratio;
  });

  return (
    <div className="masonry" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {columns.map((c, ci) => (
        <div key={ci} className="masonry-col">{c.items.map(({ item, i }) => render(item, i))}</div>
      ))}
    </div>
  );
}
