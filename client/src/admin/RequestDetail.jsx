import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, prettyDate } from '../api.js';
import WhatsAppButton from './WhatsAppButton.jsx';
import { STATUS_LABEL, KIND_LABEL, formatExtra, referralText, durationText, replyLink, estimateText } from './requestUtils.js';

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inq, setInq] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/inquiries/${id}`).then(setInq).catch((e) => setError(e.message)); }, [id]);

  const setStatus = async (status) => {
    setBusy(true);
    try { setInq(await api(`/inquiries/${id}`, { method: 'PATCH', body: { status } })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const createClient = async () => {
    setBusy(true);
    try { setInq(await api(`/inquiries/${id}/client`, { method: 'POST' })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Excluir este pedido?')) return;
    await api(`/inquiries/${id}`, { method: 'DELETE' });
    navigate('/admin/requests');
  };

  if (error && !inq) return <section className="admin-section narrow"><Link to="/admin/requests" className="back-link">← Pedidos</Link><p className="err">{error}</p></section>;
  if (!inq) return <section className="admin-section"><p className="muted">Carregando…</p></section>;

  const rows = [
    ['Categoria', `${inq.event_type} (${(KIND_LABEL[inq.category_kind] || 'Evento').toLowerCase()})`],
    ['Data', inq.event_date ? prettyDate(inq.event_date) : estimateText(inq) ? `Sem data definida — previsão: ${estimateText(inq)}` : 'Sem data definida (pedido de orçamento)'],
    ...(inq.duration_hours ? [['Duração', durationText(inq)]] : []),
    ['Nome', inq.name],
    ['E-mail', <a href={`mailto:${inq.email}`}>{inq.email}</a>],
    ['Telefone', <a href={`tel:${inq.phone.replace(/[^\d+]/g, '')}`}>{inq.phone || '—'}</a>],
    ...inq.extra.map((f) => [f.label, formatExtra(f)]),
    ['Como conheceu', referralText(inq) || '—'],
    ['Observações', inq.message || '—'],
    ['Recebido em', new Date(`${inq.created_at}Z`).toLocaleString('pt-BR')],
  ];
  const decided = inq.status === 'confirmed' || inq.status === 'declined';

  return (
    <section className="admin-section narrow">
      <Link to="/admin/requests" className="back-link">← Pedidos</Link>
      <div className="admin-title-row">
        <h1>{inq.event_type}</h1>
        <span className={`status-tag ${inq.status}`}>{STATUS_LABEL[inq.status]}</span>
      </div>

      <dl className="req-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>

      {inq.status === 'confirmed' && (
        <div className="panel accepted-panel">
          <h3>Pedido aceito</h3>
          {inq.event_date ? (
            <>
              <p>O dia {prettyDate(inq.event_date, { day: 'numeric', month: 'long' })} foi marcado como reservado na sua agenda do site.</p>
              <a className="btn btn-accent" href={inq.calendarUrl} target="_blank" rel="noreferrer">Adicionar ao Google Agenda ↗</a>
              <p className="muted small">Abre o Google Agenda com o compromisso já preenchido — é só clicar em <b>Salvar</b>.</p>
            </>
          ) : (
            <p>Este pedido não tinha data. Quando combinarem o dia, coloque a data na página do cliente e marque o dia como reservado no Calendário.</p>
          )}
          <div className="accepted-client">
            {inq.client ? (
              <>
                <p>✓ <b>{inq.client.name}</b> virou cliente (login <code className="login-tag">{inq.client.username}</code>), com contato, evento, data e duração do pedido.</p>
                <Link className="btn btn-dark" to={`/admin/clients/${inq.client.id}`}>Abrir ficha do cliente →</Link>
              </>
            ) : (
              <>
                <p>Este pedido ainda não tem uma ficha de cliente.</p>
                <button className="btn btn-dark" disabled={busy} onClick={createClient}>Criar cliente a partir do pedido</button>
              </>
            )}
          </div>
        </div>
      )}
      {error && <p className="err">{error}</p>}

      {inq.status !== 'confirmed' && <p className="muted small">Ao aceitar, o dia fica reservado na agenda e a pessoa vira cliente automaticamente.</p>}
      <div className="detail-actions">
        {inq.status !== 'confirmed' && <button className="btn btn-accent" disabled={busy} onClick={() => setStatus('confirmed')}>Aceitar</button>}
        {inq.status !== 'declined' && <button className="btn btn-line" disabled={busy} onClick={() => setStatus('declined')}>Recusar</button>}
        {decided && <button className="btn btn-line" disabled={busy} onClick={() => setStatus('replied')}>Voltar para em aberto</button>}
        <WhatsAppButton client={{ name: inq.name, phone: inq.phone }} />
        <a className="btn btn-dark" href={replyLink(inq)} onClick={() => inq.status === 'new' && setStatus('replied')}>Responder por e-mail</a>
        <button className="link-btn danger" onClick={remove}>Excluir pedido</button>
      </div>
    </section>
  );
}
