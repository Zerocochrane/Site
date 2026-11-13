import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, prettyDate } from '../api.js';
import { STATUS_LABEL, KIND_LABEL, durationText } from './requestUtils.js';

const FILTER_LABEL = { open: 'Em aberto', confirmed: 'Aceitos', declined: 'Recusados', all: 'Todos' };

export default function RequestsAdmin() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('open');

  useEffect(() => { api('/inquiries').then(setItems); }, []);

  const shown = (items || []).filter((i) => (filter === 'open' ? ['new', 'replied'].includes(i.status) : filter === 'all' || i.status === filter));
  const newCount = (items || []).filter((i) => i.status === 'new').length;

  return (
    <section className="admin-section">
      <div className="admin-title-row">
        <h1>Pedidos {newCount > 0 && <span className="count accent">{newCount} novo{newCount > 1 ? 's' : ''}</span>}</h1>
        <div className="filters">
          {['open', 'confirmed', 'declined', 'all'].map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</button>
          ))}
        </div>
      </div>
      <p className="hint">Os pedidos também chegam por e-mail. Abra um pedido para <b>aceitar</b> ou <b>recusar</b>. Aceitar bloqueia o dia na sua agenda e libera o botão para adicioná-lo ao Google Agenda.</p>

      {items === null && <p className="muted">Carregando…</p>}
      {items && shown.length === 0 && <p className="muted">Nada por aqui.</p>}

      <div className="requests">
        {shown.map((i) => (
          <Link key={i.id} to={`/admin/requests/${i.id}`} className={`request request-link ${i.status}`}>
            {i.event_date ? (
              <div className="req-date">
                <span className="d">{new Date(`${i.event_date}T12:00`).getDate()}</span>
                <span className="m">{prettyDate(i.event_date, { month: 'short', year: 'numeric' })}</span>
              </div>
            ) : (
              <div className="req-date nodate"><span className="d">—</span><span className="m">sem data</span></div>
            )}
            <div className="req-body">
              <h3>{i.event_type}{durationText(i) && ` · ${durationText(i)}`}</h3>
              <p><strong>{i.name}</strong> — {i.email} · {i.phone}</p>
              <p className="muted small">{KIND_LABEL[i.category_kind] || 'Evento'} · recebido em {new Date(`${i.created_at}Z`).toLocaleString('pt-BR')}</p>
            </div>
            <div className="req-actions">
              <span className={`status-tag ${i.status}`}>{STATUS_LABEL[i.status]}</span>
              <span className="muted small">Abrir →</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
