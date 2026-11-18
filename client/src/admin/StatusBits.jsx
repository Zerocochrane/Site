// Status colorido do cliente: selo, legenda (lista de clientes) e etapas (página do cliente).
import { STATUS, STATUS_LIST } from './clientUtils.js';

const fmtDay = (v) => {
  if (!v) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function StatusBadge({ status, big = false }) {
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span className={`status-badge st-${s.key} ${big ? 'big' : ''}`} title={s.long || s.label}>
      <span className="st-dot" aria-hidden="true" />{s.label}
    </span>
  );
}

/** Legenda das cores, com a quantidade de clientes em cada status; clicar filtra a lista. */
export function StatusKey({ counts = {}, active, onPick }) {
  return (
    <div className="status-key">
      <h3>Legenda dos status</h3>
      <ol>
        {STATUS_LIST.map((s, i) => {
          const n = counts[s.key] || 0;
          const on = active === s.key;
          return (
            <li key={s.key} className={`st-${s.key} ${on ? 'on' : ''} ${n ? '' : 'none'}`}>
              <button type="button" onClick={() => onPick?.(on ? null : s.key)} aria-pressed={on} title={s.how}>
                <span className="st-dot" aria-hidden="true" />
                <span className="st-name">{i + 1}. {s.long || s.label}{s.manual && <em className="st-manual">manual</em>}</span>
                <span className="st-count">{n}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="muted small"><em className="st-manual">manual</em> = você marca na página do cliente. As outras etapas mudam sozinhas. {onPick && 'Toque em um status para filtrar.'}</p>
    </div>
  );
}

/** Linha do tempo do cliente; as etapas manuais têm botão para marcar/desmarcar. */
export function StatusSteps({ steps, current, autoIndex, busy, onToggle }) {
  return (
    <div className="status-steps">
      <h3>Status</h3>
      <ol>
        {steps.map((step, i) => {
          const s = STATUS[step.key];
          const isCurrent = step.key === current;
          const marked = step.manual && !!step.at;
          const canMark = step.manual && i > autoIndex;
          return (
            <li key={step.key} className={`st-${step.key} ${isCurrent ? 'current' : ''} ${step.reached ? 'reached' : ''}`} aria-current={isCurrent ? 'step' : undefined}>
              <span className="st-dot" aria-hidden="true">{step.reached && !isCurrent ? '✓' : ''}</span>
              <div className="st-text">
                <b>{s.long || s.label}</b>
                <span className="muted small">
                  {step.at && (step.reached || step.manual) ? fmtDay(step.at) : s.manual ? 'manual' : s.how}
                </span>
              </div>
              {canMark && (
                <button type="button" className={`link-btn small ${marked ? 'danger' : ''}`} disabled={busy} onClick={() => onToggle(step.key, !marked)}>
                  {marked ? 'Desmarcar' : 'Marcar'}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="muted small">O status é a etapa mais avançada já alcançada. As etapas automáticas passam na frente das manuais sozinhas.</p>
    </div>
  );
}
