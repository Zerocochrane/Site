import { toISO } from '../api.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/**
 * Month grid. `month` is a Date anywhere in the month shown.
 * `dayProps(iso, date)` returns { className, disabled, label } for each day cell.
 */
export default function Calendar({ month, onMonthChange, onDayClick, dayProps, minMonth }) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(year, m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const canGoBack = !minMonth || new Date(year, m, 1) > new Date(minMonth.getFullYear(), minMonth.getMonth(), 1);

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => onMonthChange(new Date(year, m - 1, 1))} disabled={!canGoBack} aria-label="Mês anterior">←</button>
        <h3 className="cal-title">
          {month.toLocaleDateString('pt-BR', { month: 'long' })} <span>{year}</span>
        </h3>
        <button className="cal-nav" onClick={() => onMonthChange(new Date(year, m + 1, 1))} aria-label="Próximo mês">→</button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-day empty" />;
          const iso = toISO(d);
          const p = dayProps(iso, d) || {};
          return (
            <button
              key={iso}
              className={`cal-day ${p.className || ''}`}
              disabled={p.disabled}
              onClick={() => onDayClick?.(iso, d)}
              title={p.label}
              aria-label={`${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${p.label ? ` — ${p.label}` : ''}`}
            >
              <span className="num">{d.getDate()}</span>
              {p.tag && <span className="tag">{p.tag}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
