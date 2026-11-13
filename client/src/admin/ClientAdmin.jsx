import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, auth, downloadFile, uploadFile } from '../api.js';
import SaveBar from './SaveBar.jsx';
import PhotoDrop from './PhotoDrop.jsx';
import Lightbox from '../components/Lightbox.jsx';
import { useDraft, useUnsaved } from './unsaved.jsx';
import WhatsAppButton from './WhatsAppButton.jsx';
import { STAGES, timeLeft, fmtDateTime } from './clientUtils.js';

const editable = (c) => ({
  name: c.name, email: c.email, phone: c.phone || '', username: c.username, selectionLimit: c.selectionLimit, days: c.days,
  eventType: c.eventType || '', eventDate: c.eventDate || '', durationHours: c.durationHours ?? '',
  paymentMethod: c.paymentMethod || '', amountPaid: c.amountPaid === null || c.amountPaid === undefined ? '' : Number(c.amountPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  installments: c.installments ?? '',
  notes: c.notes || '',
});
const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Transferência', 'Boleto'];

export default function ClientAdmin() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setDirty } = useUnsaved();
  const [c, setC] = useState(null);
  const [missing, setMissing] = useState(false);
  const { saved, draft, setDraft, dirty, load, commit, discard } = useDraft(null);
  const [errors, setErrors] = useState({});
  const [access, setAccess] = useState(null);    // { password, emailed } shown once after sending
  const [notice, setNotice] = useState('');
  const [extendDays, setExtendDays] = useState(3);
  const [extendNotify, setExtendNotify] = useState(true);
  const [reopenDays, setReopenDays] = useState(3);
  const [proofFilter, setProofFilter] = useState('all');
  const [view, setView] = useState(null);         // { list, index } for the lightbox
  const [busy, setBusy] = useState('');
  const [categories, setCategories] = useState([]);
  useEffect(() => { api('/categories').then(setCategories).catch(() => {}); }, []);

  const refresh = useCallback(() => api(`/admin/clients/${id}`).then((d) => { setC(d); return d; }), [id]);
  useEffect(() => {
    refresh().then((d) => load(editable(d))).catch(() => setMissing(true));
  }, [refresh, load]);

  if (missing) return <section className="admin-section"><p>Cliente não encontrado. <Link to="/admin/clients">Voltar para clientes</Link></p></section>;
  if (!c || !draft) return <section className="admin-section"><p className="muted">Carregando…</p></section>;

  const stage = STAGES[c.stage];
  const sent = !!c.accessSentAt;
  const loginLink = `${window.location.origin}/cliente`;
  const selected = c.proofs.filter((p) => p.selected);
  const say = (t) => { setNotice(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const emailNote = (r) => (r.emailed ? 'E-mail enviado ao cliente.' : r.emailError ? `Não foi possível enviar o e-mail (${r.emailError}).` : 'O e-mail não está configurado no servidor, então nada foi enviado — compartilhe os dados você mesma.');

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) { say(err.message); } finally { setBusy(''); }
  };

  const save = async () => {
    setErrors({});
    try {
      const body = { ...draft, selectionLimit: Number(draft.selectionLimit), days: Number(draft.days) };
      const updated = await api(`/admin/clients/${id}`, { method: 'PATCH', body });
      setC((old) => ({ ...old, ...updated, proofs: old.proofs, donePhotos: old.donePhotos }));
      commit(editable(updated));
    } catch (err) {
      setErrors(err.details || {});
      throw err;
    }
  };

  const sendAccess = () => run('access', async () => {
    if (sent && !window.confirm('Isso cria uma NOVA senha (a antiga deixa de funcionar) e envia por e-mail ao cliente. Continuar?')) return;
    const r = await api(`/admin/clients/${id}/send-access`, { method: 'POST' });
    setAccess({ password: r.password, emailed: r.emailed, note: emailNote(r), reset: sent });
    await refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const extend = () => run('extend', async () => {
    const r = await api(`/admin/clients/${id}/extend`, { method: 'POST', body: { days: Number(extendDays), notify: extendNotify } });
    await refresh();
    say(`Acesso estendido até ${fmtDateTime(r.client.expiresAt)}.${extendNotify ? ` ${emailNote(r)}` : ''}`);
  });

  const reopen = () => run('reopen', async () => {
    if (!window.confirm(`Permitir que o cliente altere a seleção novamente? Ele terá ${reopenDays} dia(s) e precisará confirmar de novo — até lá, o prazo volta a valer.`)) return;
    const r = await api(`/admin/clients/${id}/reopen`, { method: 'POST', body: { days: Number(reopenDays) } });
    await refresh();
    say(`A seleção está aberta novamente até ${fmtDateTime(r.expiresAt)}.`);
  });

  const notifyDone = () => run('done', async () => {
    const again = c.doneNotifiedAt ? ' novamente' : '';
    if (!window.confirm(`Avisar ${c.name}${again} por e-mail que as ${c.donePhotos.length} fotos estão prontas?`)) return;
    const r = await api(`/admin/clients/${id}/notify-done`, { method: 'POST' });
    await refresh();
    say(`Cliente avisado — agora ele pode ver e baixar as fotos. ${emailNote(r)}`);
  });

  const removePhoto = (p, kind) => run(`del${p.id}`, async () => {
    if (!window.confirm(`Excluir “${p.name}”? Isso não pode ser desfeito.`)) return;
    await api(`/admin/clients/${id}/photos/${p.id}`, { method: 'DELETE' });
    setC((old) => ({ ...old, [kind]: old[kind].filter((x) => x.id !== p.id) }));
  });

  const uploadContract = (file) => run('contract', async () => {
    if (!file) return;
    if (c.contract && !window.confirm(`Substituir o contrato atual (${c.contract.name})?`)) return;
    const updated = await uploadFile(`/admin/clients/${id}/contract`, 'contract', file);
    setC((old) => ({ ...old, contract: updated.contract }));
    say('Contrato enviado.');
  });
  const removeContract = () => run('contract', async () => {
    if (!window.confirm('Excluir o contrato deste cliente?')) return;
    const updated = await api(`/admin/clients/${id}/contract`, { method: 'DELETE' });
    setC((old) => ({ ...old, contract: updated.contract }));
  });

  const removeClient = () => run('delete', async () => {
    if (!window.confirm(`Excluir ${c.name} definitivamente? Isso apaga ${c.archivedAt ? '' : `todas as fotos (${c.proofs.length + c.donePhotos.length}), `}os dados de pagamento e o contrato, e o cliente sai do Financeiro. Isso não pode ser desfeito.`)) return;
    await api(`/admin/clients/${id}`, { method: 'DELETE' });
    setDirty(false);
    navigate('/admin/clients');
  });

  const downloadList = async () => {
    const res = await fetch(`/api/admin/clients/${id}/selection.txt`, { headers: { Authorization: `Bearer ${auth.get()}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `selecao-${c.username}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = (text, what) => navigator.clipboard?.writeText(text).then(() => say(`${what} copiado(s).`));

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const proofs = proofFilter === 'selected' ? selected : c.proofs;

  return (
    <section className="admin-section has-save-bar client-admin">
      <nav className="crumbs"><Link to="/admin/clients">Clientes</Link><span>/</span><b>{saved.name}</b></nav>

      <div className="client-head">
        <div>
          <h1 className="client-title">{saved.name}</h1>
          <p className="muted">{saved.username} · {saved.email}{saved.phone && ` · ${saved.phone}`}</p>
        </div>
        <div className="client-head-actions">
          <WhatsAppButton client={saved} />
          <span className={`stage big ${stage.cls}`}>{stage.label}</span>
        </div>
      </div>

      {notice && <p className="notice" onClick={() => setNotice('')}>{notice}</p>}

      {access && (
        <div className="access-box">
          <h3>{access.reset ? 'Nova senha criada' : 'Acesso enviado'}</h3>
          <p>{access.note} A senha aparece só agora — ela é guardada criptografada e não pode ser consultada depois.</p>
          <dl>
            <dt>Login</dt><dd>{c.username}</dd>
            <dt>Senha</dt><dd className="mono">{access.password}</dd>
            <dt>Link</dt><dd>{loginLink}</dd>
          </dl>
          <button className="btn btn-line small" onClick={() => copy(`Login: ${c.username}\nSenha: ${access.password}\nLink: ${loginLink}`, 'Dados de acesso')}>Copiar dados de acesso</button>
        </div>
      )}

      {c.archivedAt && (
        <div className="panel archived-panel">
          <h3>Cliente arquivado</h3>
          <p>O período de guarda terminou e as fotos foram excluídas em <b>{fmtDateTime(c.archivedAt)}</b>. O login do cliente está bloqueado.</p>
          <p className="muted small">Nome, contato, evento, pagamento e contrato continuam guardados e aparecem no Financeiro.</p>
        </div>
      )}

      {/* ---- Access ---- */}
      {!c.archivedAt && <div className="client-panels">
        <div className="panel">
          <h3>Acesso</h3>
          {!sent ? (
            <>
              <p>O cliente ainda não consegue entrar. Envie as fotos para escolha e depois envie o acesso. O prazo de <b>{saved.days} dias</b> começa no envio.</p>
              <button className="btn btn-accent" onClick={sendAccess} disabled={busy === 'access' || !c.proofs.length || dirty}>
                {busy === 'access' ? 'Enviando…' : 'Enviar acesso por e-mail'}
              </button>
              {!c.proofs.length && <p className="muted small">Envie pelo menos uma foto primeiro.</p>}
              {dirty && <p className="muted small">Salve suas alterações primeiro.</p>}
            </>
          ) : c.deleteAfter ? (
            <>
              <p className="big-when">
                <b className="danger">{timeLeft(c.deleteAfter).replace(/^Faltam? /, '')} até a exclusão das fotos</b>
                <span>As fotos deste cliente serão excluídas automaticamente em {fmtDateTime(c.deleteAfter)}. Nome, contato, pagamento e contrato continuam guardados.</span>
              </p>
              <p className="muted small">Primeiro download das fotos finais: {fmtDateTime(c.downloadedAt)} (+{c.retentionMonths} meses). Até lá o cliente mantém o acesso.</p>
              <button className="link-btn" onClick={sendAccess} disabled={busy === 'access'}>Criar nova senha e enviar por e-mail</button>
            </>
          ) : c.noExpiry ? (
            <>
              <p className="big-when"><b>Sem prazo</b><span>A seleção foi confirmada, então o acesso do cliente continua liberado.</span></p>
              <p className="muted small">
                Acesso enviado em {fmtDateTime(c.accessSentAt)}. Quando o cliente baixar as fotos finais pela primeira vez, as fotos ficam guardadas por mais {c.retentionMonths} meses e depois são excluídas automaticamente (os dados de pagamento e o contrato ficam).
              </p>
              <button className="link-btn" onClick={sendAccess} disabled={busy === 'access'}>Criar nova senha e enviar por e-mail</button>
            </>
          ) : (
            <>
              <p className="big-when">
                <b className={c.expired ? 'danger' : ''}>{timeLeft(c.expiresAt)}</b>
                <span>{c.expired ? 'Login bloqueado desde' : 'Login liberado até'} {fmtDateTime(c.expiresAt)}</span>
              </p>
              <p className="muted small">
                Acesso enviado em {fmtDateTime(c.accessSentAt)}
                {c.reminderSentAt && <> · Lembrete de 2 dias enviado em {fmtDateTime(c.reminderSentAt)}</>}
                {' '}· O prazo deixa de valer quando o cliente confirmar.
              </p>
              <div className="extend-row">
                <label>Adicionar<input type="number" min="1" max="365" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />dias</label>
                <button className="btn btn-dark small" onClick={extend} disabled={busy === 'extend'}>{c.expired ? 'Reabrir acesso' : 'Estender'}</button>
              </div>
              <label className="check"><input type="checkbox" checked={extendNotify} onChange={(e) => setExtendNotify(e.target.checked)} /> Enviar o novo prazo ao cliente por e-mail</label>
              <p className="muted small">{c.expired ? 'O novo prazo começa agora, então o cliente pode entrar de novo.' : 'Os dias são somados ao prazo atual.'}</p>
              <button className="link-btn" onClick={sendAccess} disabled={busy === 'access'}>Criar nova senha e enviar por e-mail</button>
            </>
          )}
        </div>

        <div className="panel">
          <h3>Seleção</h3>
          <p className="big-when"><b>{selected.length} / {c.selectionLimit}</b><span>fotos escolhidas</span></p>
          {c.confirmedAt
            ? <p>✓ Confirmada em {fmtDateTime(c.confirmedAt)} — o cliente não pode mais alterar.</p>
            : <p className="muted">{sent ? 'Ainda não confirmada. O cliente pode mudar a escolha até confirmar.' : 'Aguardando o envio do acesso.'}</p>}
          {selected.length > 0 && (
            <div className="btn-row">
              <button className="btn btn-line small" onClick={downloadList}>Baixar lista (.txt)</button>
              <button className="btn btn-line small" onClick={() => copy(selected.map((p) => p.name).join('\n'), 'Nomes dos arquivos')}>Copiar nomes dos arquivos</button>
            </div>
          )}
          {c.confirmedAt && !c.doneNotifiedAt && (
            <div className="extend-row">
              <button className="btn btn-line small" onClick={reopen} disabled={busy === 'reopen'}>Permitir que o cliente altere</button>
              <label>por<input type="number" min="1" max="365" value={reopenDays} onChange={(e) => setReopenDays(e.target.value)} />dias</label>
            </div>
          )}
        </div>
      </div>}

      {/* ---- Details (saved with the Save button) ---- */}
      <div className="admin-sub-head"><h2>Dados</h2></div>
      <div className="client-new-grid details">
        <label>Nome<input value={draft.name} onChange={set('name')} />{errors.name && <span className="err">{errors.name}</span>}</label>
        <label>E-mail<input type="email" value={draft.email} onChange={set('email')} />{errors.email && <span className="err">{errors.email}</span>}</label>
        <label>WhatsApp / telefone<input type="tel" value={draft.phone} onChange={set('phone')} placeholder="(32) 99999-0000" />{errors.phone && <span className="err">{errors.phone}</span>}</label>
        <label>Login<input value={draft.username} onChange={set('username')} autoCapitalize="none" />{errors.username && <span className="err">{errors.username}</span>}</label>
        <label>Fotos que pode escolher
          <input type="number" min="1" value={draft.selectionLimit} onChange={set('selectionLimit')} disabled={!!c.confirmedAt} />
          {errors.selectionLimit && <span className="err">{errors.selectionLimit}</span>}
        </label>
        <label>Dias para escolher
          <input type="number" min="1" max="365" value={draft.days} onChange={set('days')} disabled={sent} />
          {sent && !c.archivedAt && <span className="muted small">Use “Estender” acima para adicionar dias.</span>}
          {errors.days && <span className="err">{errors.days}</span>}
        </label>
        <label className="notes-field">Anotações <span className="muted">(só você vê)</span>
          <textarea rows={4} value={draft.notes} onChange={set('notes')} placeholder="Detalhes do evento, combinados com o cliente…" />
        </label>
      </div>
      {c.inquiryId && <p className="muted small">Cliente criado a partir do <Link to={`/admin/requests/${c.inquiryId}`}>pedido de agendamento nº {c.inquiryId}</Link>.</p>}

      {/* ---- Evento, pagamento e contrato ---- */}
      <div className="admin-sub-head"><h2>Evento e pagamento</h2></div>
      <p className="hint">Aparecem na página <b>Financeiro</b>. A receita entra no mês da <b>data do evento</b>.</p>
      <div className="client-new-grid details">
        <label>Evento
          <input list="client-event-types" value={draft.eventType} onChange={set('eventType')} placeholder="Ex.: Casamento" />
          <datalist id="client-event-types">{categories.map((k) => <option key={k.id} value={k.name} />)}</datalist>
        </label>
        <label>Data do evento<input type="date" value={draft.eventDate} onChange={set('eventDate')} />{errors.eventDate && <span className="err">{errors.eventDate}</span>}</label>
        <label>Duração (horas)<input type="number" min="0.5" step="0.5" inputMode="decimal" value={draft.durationHours} onChange={set('durationHours')} />{errors.durationHours && <span className="err">{errors.durationHours}</span>}</label>
        <label>Forma de pagamento
          <select value={draft.paymentMethod} onChange={set('paymentMethod')}>
            <option value="">Selecione…</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {errors.paymentMethod && <span className="err">{errors.paymentMethod}</span>}
        </label>
        <label>Valor pago
          <span className="money-input"><span>R$</span><input inputMode="decimal" placeholder="0,00" value={draft.amountPaid} onChange={set('amountPaid')} /></span>
          {errors.amountPaid && <span className="err">{errors.amountPaid}</span>}
        </label>
        <label>Parcelas<input type="number" min="1" max="48" value={draft.installments} onChange={set('installments')} placeholder="1" />{errors.installments && <span className="err">{errors.installments}</span>}</label>
      </div>

      <div className="panel contract-panel">
        <h3>Contrato</h3>
        {c.contract ? (
          <div className="contract-row">
            <span className="contract-file">{c.contract.name}</span>
            <span className="muted small">enviado em {fmtDateTime(c.contract.uploadedAt)}</span>
            <button className="btn btn-dark small" onClick={() => run('contract', () => downloadFile(`/admin/clients/${id}/contract`, c.contract.name))}>Baixar</button>
            <label className="btn btn-line small file-btn">Substituir<input type="file" accept="application/pdf,.pdf" onChange={(e) => { uploadContract(e.target.files[0]); e.target.value = ''; }} /></label>
            <button className="link-btn danger" onClick={removeContract}>Excluir</button>
          </div>
        ) : (
          <label className={`btn btn-line file-btn ${busy === 'contract' ? 'disabled' : ''}`}>
            {busy === 'contract' ? 'Enviando…' : '+ Enviar contrato (PDF)'}
            <input type="file" accept="application/pdf,.pdf" disabled={busy === 'contract'} onChange={(e) => { uploadContract(e.target.files[0]); e.target.value = ''; }} />
          </label>
        )}
        <p className="muted small">Apenas PDF, até 25 MB. O contrato fica guardado de forma privada e só você pode baixá-lo.</p>
      </div>

      {!c.archivedAt && <>
      {/* ---- Photos to choose from ---- */}
      <div className="admin-sub-head">
        <h2>Fotos para escolha <span className="count">{c.proofs.length}</span></h2>
        {selected.length > 0 && (
          <div className="filters">
            <button className={`chip ${proofFilter === 'all' ? 'on' : ''}`} onClick={() => setProofFilter('all')}>Todas</button>
            <button className={`chip ${proofFilter === 'selected' ? 'on' : ''}`} onClick={() => setProofFilter('selected')}>Escolhidas ({selected.length})</button>
          </div>
        )}
      </div>
      <PhotoDrop
        clientId={id}
        kind="proof"
        disabled={!!c.confirmedAt}
        title={c.confirmedAt ? 'Seleção confirmada' : '+ Adicionar fotos para o cliente escolher'}
        hint={c.confirmedAt ? 'Não é possível adicionar mais fotos.' : 'JPG, PNG, WEBP ou TIFF, até 80 MB cada. O cliente só vê cópias reduzidas com a sua marca d’água.'}
        onUploaded={(created) => setC((old) => ({ ...old, proofs: [...old.proofs, ...created] }))}
      />
      <div className="client-grid">
        {proofs.map((p, i) => (
          <figure key={p.id} className={`client-tile ${p.selected ? 'chosen' : ''}`}>
            <button className="tile-img" onClick={() => setView({ list: proofs, index: i })}><img src={p.thumb} alt={p.name} loading="lazy" /></button>
            {p.selected && <span className="chosen-badge">✓ Escolhida</span>}
            <figcaption>
              <span title={p.name}>{p.name}</span>
              {!(c.confirmedAt && p.selected) && <button className="link-btn danger" onClick={() => removePhoto(p, 'proofs')}>Excluir</button>}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* ---- Finished photos ---- */}
      <div className="admin-sub-head"><h2>Fotos finalizadas <span className="count">{c.donePhotos.length}</span></h2></div>
      <p className="hint">Envie aqui as fotos editadas. O cliente só as vê (e pode baixar todas em .zip) depois que você enviar o e-mail “suas fotos estão prontas”.</p>
      <PhotoDrop
        clientId={id}
        kind="done"
        title="+ Adicionar fotos finalizadas"
        hint="Arquivos em qualidade total — o cliente baixa exatamente o que você enviar."
        onUploaded={(created) => setC((old) => ({ ...old, donePhotos: [...old.donePhotos, ...created] }))}
      />
      <div className="client-grid">
        {c.donePhotos.map((p, i) => (
          <figure key={p.id} className="client-tile">
            <button className="tile-img" onClick={() => setView({ list: c.donePhotos, index: i })}><img src={p.thumb} alt={p.name} loading="lazy" /></button>
            <figcaption><span title={p.name}>{p.name}</span><button className="link-btn danger" onClick={() => removePhoto(p, 'donePhotos')}>Excluir</button></figcaption>
          </figure>
        ))}
      </div>
      {c.donePhotos.length > 0 && (
        <div className="panel done-panel">
          <h3>{c.doneNotifiedAt ? `Cliente avisado em ${fmtDateTime(c.doneNotifiedAt)}` : 'Avise o cliente que as fotos estão prontas'}</h3>
          <p>
            O cliente poderá ver as fotos e baixar todas em .zip.
            {!c.confirmedAt && ' Enviar este aviso também encerra a fase de seleção (sem mais prazo).'}
          </p>
          <button className="btn btn-accent" onClick={notifyDone} disabled={busy === 'done' || !sent}>{c.doneNotifiedAt ? 'Enviar o e-mail novamente' : 'Enviar e-mail: suas fotos estão prontas'}</button>
          {!sent && <p className="muted small">Envie o acesso primeiro.</p>}
          <p className="muted small" style={{ marginTop: 12 }}>
            {c.downloadedAt
              ? `Primeiro download em ${fmtDateTime(c.downloadedAt)} — as fotos serão excluídas em ${fmtDateTime(c.deleteAfter)}.`
              : `Ainda não baixadas. Depois do primeiro download, as fotos ficam guardadas por ${c.retentionMonths} meses e depois são excluídas automaticamente.`}
          </p>
        </div>
      )}

      </>}

      <div className="danger-zone">
        <button className="btn btn-line small danger-btn" onClick={removeClient}>{c.archivedAt ? 'Excluir cliente definitivamente' : 'Excluir cliente e todas as fotos'}</button>
      </div>

      {view && (
        <Lightbox
          photos={view.list.map((p) => ({ url: p.large, title: p.name }))}
          index={view.index}
          onIndex={(i) => setView((v) => ({ ...v, index: i }))}
          onClose={() => setView(null)}
        />
      )}

      <SaveBar dirty={dirty} onSave={save} onDiscard={() => { discard(); setErrors({}); }} label="Dados do cliente não salvos" />
    </section>
  );
}
