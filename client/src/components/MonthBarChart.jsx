import { useEffect, useRef, useState } from 'react';

const monthLabel = (ym, opts = { month: 'long', year: 'numeric' }) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const shortMonth = (ym) => monthLabel(ym, { month: 'short' }).replace('.', '');

/**
 * Gráfico de barras por mês (Financeiro, Tráfego). Clique numa barra para escolher o mês.
 * data: [{ month: 'AAAA-MM', value: number, detail?: string }]
 */
export default function MonthBarChart({ title, data, selected, onSelect, formatValue = String, formatTick, minStep = 0, totalLabel }) {
  const [hover, setHover] = useState(null);
  // Desenha no tamanho real do container (texto legível no celular, sem encolher o SVG)
  const box = useRef(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const narrow = width < 520;
  const W = width, H = narrow ? 220 : 260, L = narrow ? 52 : 64, R = 8, T = 16, B = 34;
  const max = Math.max(...data.map((c) => c.value), 0);
  let step = Math.max(minStep, niceStep(max / 5 || Math.max(minStep, 200)));
  if (minStep >= 1) step = Math.ceil(step); // contagens: só números inteiros no eixo
  const top = Math.max(step * 2, step * Math.ceil(max / step));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const slot = (W - L - R) / data.length;
  const barW = Math.min(24, slot * 0.6);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const total = data.reduce((n, c) => n + c.value, 0);
  const tick = formatTick || ((t) => formatValue(t));

  return (
    <div className="panel chart-panel">
      <div className="chart-head">
        <h3>{title}</h3>
        <span className="muted small">Últimos {data.length} meses · {totalLabel ? totalLabel(total) : formatValue(total)}</span>
      </div>
      <div className="chart-box" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${data.map((c) => `${monthLabel(c.month)} ${formatValue(c.value)}`).join('; ')}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{tick(t, narrow)}</text>
            </g>
          ))}
          {data.map((c, i) => {
            const cx = L + slot * i + slot / 2;
            const h = Math.max(0, y(0) - y(c.value));
            const isSel = c.month === selected;
            return (
              <g key={c.month}
                className={`bar-g ${isSel ? 'sel' : ''} ${hover === i ? 'hover' : ''}`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(c.month)}
                tabIndex={0} role="button"
                aria-label={`${monthLabel(c.month)}: ${formatValue(c.value)}${c.detail ? `, ${c.detail}` : ''}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect?.(c.month))}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <rect x={L + slot * i} y={T} width={slot} height={H - T - B} className="hit" />
                {h > 0 && <path className="bar" d={roundedTop(cx - barW / 2, y(c.value), barW, h, Math.min(4, h))} />}
                <text x={cx} y={H - B + 18} textAnchor="middle" className={`tick month ${isSel ? 'sel' : ''}`}>{slot < 30 ? shortMonth(c.month).charAt(0).toUpperCase() : shortMonth(c.month)}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${((L + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%` }}>
            <b>{cap(monthLabel(data[hover].month))}</b>
            <span>{formatValue(data[hover].value)}</span>
            {data[hover].detail && <span className="muted">{data[hover].detail}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const roundedTop = (x, y, w, h, r) => `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
