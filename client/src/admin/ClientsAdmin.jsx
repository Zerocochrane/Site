import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import WhatsAppButton from './WhatsAppButton.jsx';
import { timeLeft, fmtDateTime, suggestLogin, FINISHED } from './clientUtils.js';
import { StatusBadge, StatusKey } from './StatusBits.jsx';
import Help from './Help.jsx';
import { HashValidator } from '../components/ContractBits.jsx';

const EMPTY = { name: '', email: '', phone: '', username: '', selectionLimit: 30, days: 7 };

export default function ClientsAdmin() {
  const [clients, setClients] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loginTouched, setLoginTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('active');
  const [statusFilter, setStatusFilter] = useState(null);
  // No celular o formulário começa fechado para a lista aparecer logo
  const [showNew, setShowNew] = useState(() => !window.matchMedia?.('(max-width: 700px)').matches);
  const [showCheck, setShowCheck] = useState(() => window.location.hash === '#validar');
  const navigate = useNavigate();

  useEffect(() => { api('/admin/clients').then(setClients); }, []);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v, ...(k === 'name' && !loginTouched ? { username: suggestLogin(v) } : {}) }));
    if (k === 'username') setLoginTouched(true);
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const c = await api('/admin/clients', { method: 'POST', body: { ...form, selectionLimit: Number(form.selectionLimit), days: Number(form.days) } });
      navigate(`/admin/clients/${c.id}`);
    } catch (err) {
      setErrors(err.details || { form: err.message });
    } finally { setBusy(false); }
  };

  const finished = (c) => !!c.archivedAt || FINISHED.includes(c.status);
  const counts = (clients || []).reduce((m, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {});
  const shown = (clients || []).filter((c) => (statusFilter
    ? c.status === statusFilter
    : filter === 'all' ? true : filter === 'active' ? !finished(c) : finished(c)));
  // avisos que pedem atenção, além do status
  const alert = (c) => (c.stage === 'to-sign' ? ['attention', 'Falta sua assinatura']
    : c.stage === 'sign-expired' ? ['danger', 'Prazo de assinatura expirou']
    : c.stage === 'expired' ? ['danger', 'Prazo de escolha expirou']
    : c.archivedAt ? ['muted', 'Arquivado'] : null);

  return (
    <section className="admin-section">
      <div className="admin-title-row"><h1>Clientes <span className="count">{clients?.length ?? '…'}</span></h1></div>
      <Help>
        Cada cliente recebe uma área privada. Ao aceitar um pedido, o cliente é criado aqui. Envie o contrato em PDF para assinatura: a senha é criada nesse momento
        e o cliente assina digitalmente (prazo padrão de 7 dias); depois você assina. Com o contrato assinado, envie as fotos para escolha e avise o cliente — o prazo de seleção começa no aviso.
      </Help>

      <div className="panel hash-panel" id="validar">
        <button type="button" className="hash-panel-toggle" aria-expanded={showCheck} onClick={() => setShowCheck((v) => !v)}>
          <h3>Validar código de contrato ou assinatura</h3><span aria-hidden="true">{showCheck ? '−' : '+'}</span>
        </button>
        {showCheck && (
          <HashValidator
            intro="Cole o código do contrato, da assinatura de um cliente ou da sua assinatura. Mostra a quem ele pertence, a data e a hora, e se os dados continuam intactos."
            check={(hash) => api('/admin/clients/validate', { method: 'POST', body: { hash } })}
          />
        )}
      </div>

      {!showNew && <button className="btn btn-accent wide new-client-btn" onClick={() => setShowNew(true)}>+ Novo cliente</button>}
      {showNew && <form className="client-new" onSubmit={create} noValidate>
        <h2>Novo cliente</h2>
        <div className="client-new-grid">
          <label>Nome<input value={form.name} onChange={set('name')} placeholder="Maria Souza" />{errors.name && <span className="err">{errors.name}</span>}</label>
          <label>E-mail<input type="email" value={form.email} onChange={set('email')} placeholder="maria@email.com" />{errors.email && <span className="err">{errors.email}</span>}</label>
          <label>WhatsApp / telefone <span className="muted">(opcional)</span><input type="tel" value={form.phone} onChange={set('phone')} placeholder="(32) 99999-0000" />{errors.phone && <span className="err">{errors.phone}</span>}</label>
          <label>Login<input value={form.username} onChange={set('username')} placeholder="maria.souza" autoCapitalize="none" />{errors.username && <span className="err">{errors.username}</span>}</label>
          <label>Fotos que pode escolher<input type="number" min="1" value={form.selectionLimit} onChange={set('selectionLimit')} />{errors.selectionLimit && <span className="err">{errors.selectionLimit}</span>}</label>
          <label>Dias para escolher<input type="number" min="1" max="365" value={form.days} onChange={set('days')} />{errors.days && <span className="err">{errors.days}</span>}</label>
        </div>
        {errors.form && <p className="err">{errors.form}</p>}
        <button className="btn btn-accent" disabled={busy || !form.name.trim()}>{busy ? 'Criando…' : '+ Cadastrar cliente'}</button>
      </form>}

      <div className="clients-layout">
      <aside className="clients-aside">
        <details className="key-details" open={typeof window !== 'undefined' && !window.matchMedia?.('(max-width: 1099px)').matches}>
          <summary>Legenda dos status</summary>
          <StatusKey counts={counts} active={statusFilter} onPick={setStatusFilter} />
        </details>
      </aside>
      <div className="clients-main">
      <div className="admin-title-row client-list-head">
        <h2 className="h2-display">Todos os clientes</h2>
        <div className="filters">
          {[['active', 'Em andamento'], ['delivered', 'Entregues e arquivados'], ['all', 'Todos']].map(([k, l]) => (
            <button key={k} className={`chip ${!statusFilter && filter === k ? 'on' : ''}`} onClick={() => { setFilter(k); setStatusFilter(null); }}>{l}</button>
          ))}
        </div>
      </div>
      {statusFilter && (
        <p className="status-filter-note">
          Mostrando só <StatusBadge status={statusFilter} /> <button className="link-btn small" onClick={() => setStatusFilter(null)}>Mostrar todos</button>
        </p>
      )}
      {clients === null && <p className="muted">Carregando…</p>}
      {clients && shown.length === 0 && <p className="muted">Nenhum cliente aqui ainda.</p>}

      <div className="client-list">
        {shown.map((c) => (
          <Link key={c.id} to={`/admin/clients/${c.id}`} className={`client-row st-${c.status}`}>
            <div className="client-row-main">
              <h3>{c.name}</h3>
              <p className="muted small">{c.username} · {c.email}{c.phone && ` · ${c.phone}`}</p>
            </div>
            <WhatsAppButton client={c} compact />
            <span className="client-row-status">
              <StatusBadge status={c.status} />
              {alert(c) && <span className={`row-alert ${alert(c)[0]}`}>{alert(c)[1]}</span>}
            </span>
            <div className="client-row-num"><b>{c.selected}</b>/{c.selectionLimit}<span>escolhidas</span></div>
            <div className="client-row-num"><b>{c.proofCount}</b><span>para escolher</span></div>
            <div className="client-row-num"><b>{c.doneCount}</b><span>editadas</span></div>
            <div className="client-row-when">
              {c.archivedAt ? <><b>Fotos excluídas</b><span>{fmtDateTime(c.archivedAt)}</span></>
                : c.deleteAfter ? <><b className="danger">Fotos excluídas em</b><span>{fmtDateTime(c.deleteAfter)}</span></>
                : c.noExpiry ? <><b>Sem prazo</b><span>seleção confirmada</span></>
                : c.expiresAt ? <><b className={c.expired ? 'danger' : ''}>{timeLeft(c.expiresAt)}</b><span>{fmtDateTime(c.expiresAt)}</span></>
                : ['signing', 'sign-expired'].includes(c.stage) ? <><b className={c.stage === 'sign-expired' ? 'danger' : ''}>{timeLeft(c.signing.deadline)}</b><span>para assinar</span></>
                : c.stage === 'to-sign' ? <><b>Assine o contrato</b><span>o cliente já assinou</span></>
                : c.stage === 'signed' ? <><b>Prazo parado</b><span>aguardando as fotos</span></>
                : <span>{c.days} dias após o envio</span>}
            </div>
          </Link>
        ))}
      </div>
      </div>
      </div>
    </section>
  );
}
