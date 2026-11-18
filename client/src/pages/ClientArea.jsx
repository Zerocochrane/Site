import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientApi, clientAuth, downloadFile } from '../api.js';
import { Hash, SignatureCard, HashValidator } from '../components/ContractBits.jsx';
import { useSettings } from '../settings.jsx';
import useImageProtection from '../components/useImageProtection.js';
import { contactLinks } from '../contact.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function left(iso) {
  const ms = Date.parse(iso) - Date.now();
  const h = Math.floor(ms / 3600000);
  return ms >= 47 * 3600000 ? `${Math.round(ms / 86400000)} dias` : h >= 1 ? `${h} hora${h === 1 ? '' : 's'}` : 'menos de uma hora';
}

export default function ClientArea() {
  const [me, setMe] = useState(null);
  const [state, setState] = useState(clientAuth.get() ? 'loading' : 'login'); // loading | login | ready
  const [loginError, setLoginError] = useState('');
  const { settings } = useSettings();

  const load = useCallback(async () => {
    try {
      setMe(await clientApi('/client/me'));
      setState('ready');
    } catch (err) {
      clientAuth.clear();
      setLoginError(err.code === 'expired' ? err.message : err.status === 401 ? '' : err.message);
      setState('login');
    }
  }, []);
  useEffect(() => { if (state === 'loading') load(); }, [state, load]);
  useEffect(() => { document.title = `Área do cliente — ${settings?.name || ''}`; }, [settings?.name]);

  useImageProtection(state === 'ready');

  const logout = () => { clientAuth.clear(); setMe(null); setState('login'); };
  const expire = (msg) => { clientAuth.clear(); setLoginError(msg); setState('login'); };

  return (
    <div className="ca">
      <header className="ca-header">
        <Link to="/" className="logo">{settings?.name || ' '}</Link>
        <span className="ca-label">Área do cliente</span>
        <span className="ca-header-right">
          <ThemeToggle />
          {state === 'ready' && <button className="link-btn" onClick={logout}>Sair</button>}
        </span>
      </header>
      {state === 'loading' && <p className="ca-wrap muted">Carregando…</p>}
      {state === 'login' && <ClientLogin error={loginError} onIn={() => { setLoginError(''); setState('loading'); }} />}
      {state === 'ready' && me && (me.photosReleased
        ? <Gallery me={me} setMe={setMe} onExpired={expire} />
        : <ContractHome me={me} setMe={setMe} onExpired={expire} />)}
    </div>
  );
}

function ClientLogin({ error, onIn }) {
  const { settings } = useSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(error);
  const [missing, setMissing] = useState({}); // campos vazios ao tentar entrar
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const userRef = useRef(null);
  const passRef = useRef(null);
  useEffect(() => setMsg(error), [error]);

  const photographer = settings?.name || 'a fotógrafa';
  const contact = contactLinks(settings, `Olá! Esqueci a senha da minha área do cliente.${username ? ` Meu login é: ${username}` : ''}`);

  const submit = async (e) => {
    e.preventDefault();
    const empty = { username: !username.trim(), password: !password };
    if (empty.username || empty.password) {
      setMissing(empty);
      setMsg('');
      (empty.username ? userRef : passRef).current?.focus();
      return;
    }
    setMissing({});
    setBusy(true); setMsg('');
    try {
      const { token } = await clientApi('/client/login', { method: 'POST', body: { username, password } });
      clientAuth.set(token);
      onIn();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="ca-login">
      <form onSubmit={submit}>
        <h1>Suas<br />fotos</h1>
        <p className="muted">Entre com o login e a senha que você recebeu por e-mail.</p>
        <label>Login
          <input ref={userRef} value={username} onChange={(e) => { setUsername(e.target.value); setMissing((m) => ({ ...m, username: false })); }}
            autoComplete="username" autoCapitalize="none" autoFocus aria-invalid={missing.username || undefined} />
          {missing.username && <span className="err">Digite o seu login.</span>}
        </label>
        <label>Senha
          <span className="pw">
            <input ref={passRef} type={show ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setMissing((m) => ({ ...m, password: false })); }}
              autoComplete="current-password" aria-invalid={missing.password || undefined} />
            <button type="button" className="link-btn" onClick={() => setShow((s) => !s)}>{show ? 'Ocultar' : 'Mostrar'}</button>
          </span>
          {missing.password && <span className="err">Digite a sua senha.</span>}
        </label>
        {msg && <p className="err" role="alert">{msg}</p>}
        <button className="btn btn-accent wide" disabled={busy}>{busy ? 'Verificando…' : 'Entrar →'}</button>
        <button type="button" className="link-btn ca-forgot" aria-expanded={forgot} onClick={() => setForgot((f) => !f)}>Esqueci minha senha</button>
        {forgot && (
          <div className="ca-forgot-box" role="region" aria-label="Esqueci minha senha">
            <p>Por segurança, a senha não pode ser recuperada pelo site. Peça uma nova para {photographer}: ela envia uma nova senha para o seu e-mail.</p>
            <p className="muted small">O seu login está no e-mail em que você recebeu o contrato para assinar.</p>
            {contact.any ? (
              <div className="ca-forgot-actions">
                {contact.whatsapp && <a className="btn btn-accent small" href={contact.whatsapp} target="_blank" rel="noreferrer">Pedir pelo WhatsApp</a>}
                {contact.email && <a className="btn btn-line small" href={`${contact.email}?subject=${encodeURIComponent('Nova senha da área do cliente')}`}>Pedir por e-mail</a>}
              </div>
            ) : (
              <p className="muted small">Responda ao e-mail em que você recebeu o acesso.</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function Gallery({ me, setMe, onExpired }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null); // { list: 'proof'|'done', ids: [...] (fixed when opened), index }
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmed = !!me.confirmedAt;
  const full = me.selected >= me.selectionLimit;
  const msgTimer = useRef();

  const flash = (t) => { setMsg(t); clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(''), 4000); };
  const handle = (err) => (err.code === 'expired' || err.status === 401 ? onExpired(err.message) : flash(err.message));
  const refresh = () => clientApi('/client/me').then(setMe).catch(() => {});

  const toggle = async (photo) => {
    if (confirmed) return;
    const want = !photo.selected;
    if (want && full) { flash(`Você pode escolher até ${me.selectionLimit} fotos. Desmarque uma para escolher outra.`); return; }
    setMe((m) => ({ ...m, selected: m.selected + (want ? 1 : -1), photos: m.photos.map((p) => (p.id === photo.id ? { ...p, selected: want } : p)) }));
    try {
      const r = await clientApi(`/client/photos/${photo.id}/select`, { method: 'PUT', body: { selected: want } });
      setMe((m) => ({ ...m, selected: r.selected }));
    } catch (err) {
      setMe((m) => ({ ...m, selected: m.selected - (want ? 1 : -1), photos: m.photos.map((p) => (p.id === photo.id ? { ...p, selected: !want } : p)) }));
      handle(err);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await clientApi('/client/confirm', { method: 'POST' });
      setMe((m) => ({ ...m, confirmedAt: r.confirmedAt }));
      setConfirming(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setConfirming(false); handle(err); } finally { setBusy(false); }
  };

  const chosen = me.photos.filter((p) => p.selected);
  const proofs = confirmed || filter === 'selected' ? chosen : me.photos;
  const delivered = me.done.length > 0;

  return (
    <div className="ca-wrap">
      <section className="ca-intro">
        <p className="eyebrow">Olá, {me.name.split(' ')[0]}</p>
        {delivered ? (
          <>
            <h1 className="ca-title">Suas fotos<br />estão prontas</h1>
            <p className="ca-lead">
              {me.done.length} foto{me.done.length === 1 ? ' editada pronta' : 's editadas prontas'} para baixar.{' '}
              {me.deleteAfter
                ? <>Elas ficam disponíveis aqui até <b>{fmt(me.deleteAfter)}</b> e depois serão excluídas — guarde a sua cópia em um lugar seguro.</>
                : <>Depois do primeiro download, elas ficam disponíveis aqui por <b>{me.retentionMonths} meses</b> e depois serão excluídas — guarde a sua cópia em um lugar seguro.</>}
            </p>
            <a className="btn btn-accent" href={me.downloadUrl} download onClick={() => setTimeout(refresh, 8000)}>Baixar todas as fotos (.zip)</a>
          </>
        ) : confirmed ? (
          <>
            <h1 className="ca-title">Seleção<br />confirmada</h1>
            <p className="ca-lead">Obrigada! Você escolheu {chosen.length} foto{chosen.length === 1 ? '' : 's'} em {fmt(me.confirmedAt)}. {me.photographer} já está editando — você vai receber um e-mail quando estiverem prontas.</p>
          </>
        ) : (
          <>
            <h1 className="ca-title">Escolha suas<br />favoritas</h1>
            <p className="ca-lead">
              Toque no <b>♡</b> de até <b>{me.selectionLimit}</b> fotos e depois em <b>Confirmar seleção</b>.
              Você tem <b>{left(me.expiresAt)}</b> (até {fmt(me.expiresAt)}). Depois disso, o seu acesso será encerrado.
            </p>
          </>
        )}
      </section>

      {delivered && (
        <section className="ca-section">
          <div className="ca-grid">
            {me.done.map((p, i) => (
              <button key={p.id} className="ca-tile" onClick={() => setOpen({ list: 'done', ids: me.done.map((x) => x.id), index: i })} aria-label={`Abrir foto ${p.number}`}>
                <img src={p.thumb} alt="" draggable={false} />
                <span className="shield" />
              </button>
            ))}
          </div>
        </section>
      )}

      {!delivered && !confirmed && (
        <div className="ca-bar">
          <div className="ca-count">
            <b>{me.selected}</b> / {me.selectionLimit} <span>escolhidas</span>
            <div className="ca-meter"><div style={{ width: `${Math.min(100, (me.selected / me.selectionLimit) * 100)}%` }} /></div>
          </div>
          <div className="filters">
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Todas ({me.photos.length})</button>
            <button className={`chip ${filter === 'selected' ? 'on' : ''}`} onClick={() => setFilter('selected')}>Escolhidas ({me.selected})</button>
          </div>
          <button className="btn btn-accent" disabled={!me.selected} onClick={() => setConfirming(true)}>Confirmar seleção</button>
        </div>
      )}
      {msg && <p className="ca-toast" role="status">{msg}</p>}

      {(!delivered || chosen.length > 0) && (
        <section className="ca-section">
          {delivered && <h2 className="ca-h2">As fotos que você escolheu</h2>}
          {confirmed && !delivered && <h2 className="ca-h2">Sua seleção</h2>}
          {!confirmed && filter === 'selected' && !chosen.length && <p className="muted">Você ainda não escolheu nenhuma foto.</p>}
          <div className={`ca-grid ${delivered ? 'small' : ''}`}>
            {proofs.map((p) => (
              <div key={p.id} className={`ca-tile ${p.selected ? 'on' : ''}`}>
                <button className="ca-open" onClick={() => setOpen({ list: 'proof', ids: proofs.map((x) => x.id), index: proofs.indexOf(p) })} aria-label={`Abrir foto ${p.number}`}>
                  <img src={p.thumb} alt="" draggable={false} />
                  <span className="shield" />
                </button>
                <span className="ca-num">{p.number}</span>
                {!confirmed ? (
                  <button className={`ca-heart ${p.selected ? 'on' : ''} ${!p.selected && full ? 'limit' : ''}`} onClick={() => toggle(p)} aria-pressed={p.selected}
                    aria-label={p.selected ? 'Remover da seleção' : full ? `Limite de ${me.selectionLimit} fotos atingido` : 'Escolher esta foto'}>
                    {p.selected ? '♥' : '♡'}
                  </button>
                ) : <span className="ca-heart on static">♥</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {open && (
        <Viewer
          items={open.list === 'done'
            ? open.ids.map((id) => me.done.find((p) => p.id === id)).filter(Boolean).map((p) => ({ ...p, src: p.view }))
            : open.ids.map((id) => me.photos.find((p) => p.id === id)).filter(Boolean).map((p) => ({ ...p, src: p.preview }))}
          index={open.index}
          onIndex={(index) => setOpen((o) => ({ ...o, index }))}
          onClose={() => setOpen(null)}
          selectable={open.list === 'proof' && !confirmed}
          full={full}
          onToggle={toggle}
          live={open.list === 'proof' ? me.photos : null}
        />
      )}

      {me.contract && <ContractSection me={me} onExpired={onExpired} />}

      {confirming && (
        <div className="ca-modal" role="dialog" aria-modal="true">
          <div className="ca-modal-box">
            <h2>Confirmar a seleção?</h2>
            <p>Você escolheu <b>{me.selected}</b> de {me.selectionLimit} fotos.{me.selected < me.selectionLimit && <> Você ainda pode escolher mais <b>{me.selectionLimit - me.selected}</b>.</>}</p>
            <p className="warn">Depois de confirmar, você <b>não poderá mudar</b> a sua seleção.</p>
            <div className="btn-row">
              <button className="btn btn-line" onClick={() => setConfirming(false)} disabled={busy}>Continuar escolhendo</button>
              <button className="btn btn-accent" onClick={confirm} disabled={busy}>{busy ? 'Confirmando…' : 'Sim, confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fmtShort = (iso) => new Date(iso).toLocaleString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Antes das fotos: assinar o contrato, ou esperar a fotógrafa assinar / enviar as fotos. */
function ContractHome({ me, setMe, onExpired }) {
  const k = me.contract;
  const first = me.name.split(' ')[0];
  if (!k) {
    return (
      <div className="ca-wrap">
        <section className="ca-intro">
          <p className="eyebrow">Olá, {first}</p>
          <h1 className="ca-title">Suas fotos<br />estão a caminho</h1>
          <p className="ca-lead">Você vai receber um e-mail assim que elas estiverem prontas para você escolher.</p>
        </section>
      </div>
    );
  }
  return (
    <div className="ca-wrap">
      <section className="ca-intro">
        <p className="eyebrow">Olá, {first}</p>
        {k.stage === 'sent' ? (
          <>
            <h1 className="ca-title">Assine o seu<br />contrato</h1>
            <p className="ca-lead">
              Leia o contrato com atenção e assine logo abaixo. Você tem <b>{left(k.deadline)}</b> (até {fmtShort(k.deadline)}).
              Depois que você assinar, {k.photographer} assina também — e então é só esperar as fotos.
            </p>
          </>
        ) : k.stage === 'client-signed' ? (
          <>
            <h1 className="ca-title">Contrato<br />assinado</h1>
            <p className="ca-lead">Obrigada! Você assinou em <b>{k.clientSignedText}</b>. Agora falta a assinatura de {k.photographer} — você recebe um e-mail quando o contrato estiver assinado por ambas as partes.</p>
          </>
        ) : (
          <>
            <h1 className="ca-title">Contrato<br />assinado</h1>
            <p className="ca-lead">O contrato foi assinado por você e por {k.photographer}. Agora é só esperar: você recebe um e-mail quando as fotos estiverem prontas para você escolher.</p>
          </>
        )}
      </section>
      {k.stage === 'sent'
        ? <SignForm me={me} onSigned={(contract) => { setMe((m) => ({ ...m, contract })); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onExpired={onExpired} />
        : <ContractSection me={me} onExpired={onExpired} open />}
    </div>
  );
}

function OpenContract({ me, onExpired, label }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = async () => {
    setBusy(true); setErr('');
    try { await downloadFile('/client/contract', me.contract.name, clientAuth); } catch (e) {
      if (e.code === 'expired' || e.status === 401) onExpired(e.message); else setErr(e.message);
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className="btn btn-line" onClick={open} disabled={busy}>{busy ? 'Baixando…' : label}</button>
      {err && <p className="err">{err}</p>}
    </>
  );
}

function SignForm({ me, onSigned, onExpired }) {
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const local = {};
    if (!agree) local.agree = 'Marque que você leu e concorda com o contrato.';
    if (!name.trim()) local.name = 'Digite o seu nome completo.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const r = await clientApi('/client/contract/sign', { method: 'POST', body: { agree, name } });
      onSigned(r.contract);
    } catch (err) {
      if (err.code === 'expired' || err.status === 401) return onExpired(err.message);
      setErrors(err.details || { form: err.message });
    } finally { setBusy(false); }
  };
  return (
    <section className="ca-section contract-sign">
      <div className="contract-doc">
        <span className="contract-doc-icon" aria-hidden="true">PDF</span>
        <div><b>{me.contract.name}</b><span className="muted small">Código do contrato: {me.contract.jobHash.slice(0, 16)}…</span></div>
        <OpenContract me={me} onExpired={onExpired} label="Ler o contrato" />
      </div>
      <form className="sign-form" onSubmit={submit} noValidate>
        <h2 className="ca-h2">Assinatura</h2>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErrors((x) => ({ ...x, agree: undefined })); }} aria-invalid={errors.agree ? true : undefined} />
          Li o contrato e concordo com todos os termos.
        </label>
        {errors.agree && <span className="err">{errors.agree}</span>}
        <label>Digite o seu nome completo para assinar
          <input value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} placeholder={me.name}
            autoComplete="name" aria-invalid={errors.name ? true : undefined} />
          {errors.name && <span className="err">{errors.name}</span>}
        </label>
        <p className="muted small">Ao assinar, ficam registrados o seu nome, a data e a hora (com segundos), e um código único da sua assinatura. Ele aparece no contrato e você pode validá-lo aqui a qualquer momento.</p>
        {errors.form && <p className="err" role="alert">{errors.form}</p>}
        <button className="btn btn-accent" disabled={busy}>{busy ? 'Assinando…' : 'Assinar contrato'}</button>
      </form>
    </section>
  );
}

/** Contrato depois da assinatura: download, as duas assinaturas e a validação de códigos. */
function ContractSection({ me, onExpired, open = false }) {
  const k = me.contract;
  const [show, setShow] = useState(open);
  const complete = k.stage === 'complete';
  return (
    <section className="ca-section contract-done">
      {!open && (
        <button type="button" className="ca-h2 contract-toggle" aria-expanded={show} onClick={() => setShow((s) => !s)}>
          Seu contrato {complete ? '· assinado por ambas as partes' : ''} <span aria-hidden="true">{show ? '−' : '+'}</span>
        </button>
      )}
      {show && (
        <>
          <div className="contract-doc">
            <span className="contract-doc-icon" aria-hidden="true">PDF</span>
            <div><b>{k.name}</b><span className="muted small">{complete ? 'Assinado por ambas as partes' : 'Assinado por você · falta a fotógrafa'}</span></div>
            <OpenContract me={me} onExpired={onExpired} label={complete ? 'Baixar contrato assinado' : 'Baixar contrato'} />
          </div>
          <Hash value={k.jobHash} label="Código do contrato" />
          <div className="sig-cards">
            <SignatureCard role="Contratante (você)" name={me.name} signedText={k.clientSignedText} hash={k.clientSignHash} />
            <SignatureCard role="Contratada (fotógrafa)" name={k.photographer} signedText={k.photographerSignedText} hash={k.photographerSignHash}
              pending={k.photographerSignedAt ? null : 'Aguardando a assinatura da fotógrafa.'} />
          </div>
          <h3 className="ca-h3">Validar código</h3>
          <HashValidator
            intro="Cole um dos códigos do seu contrato para confirmar que ele é autêntico e não foi alterado."
            check={(hash) => clientApi('/client/validate', { method: 'POST', body: { hash } }).catch((err) => { if (err.code === 'expired' || err.status === 401) onExpired(err.message); throw err; })}
          />
        </>
      )}
    </section>
  );
}

function Viewer({ items, index, onIndex, onClose, selectable, full, onToggle, live }) {
  const item = items[index];
  const current = useMemo(() => (live ? live.find((p) => p.id === item?.id) : item), [live, item]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length);
      if (selectable && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onToggle(current); }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [index, items.length, onClose, onIndex, selectable, onToggle, current]);
  if (!item) return null;

  return (
    <div className="lightbox ca-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Fechar">×</button>
      <button className="lb-arrow left" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + items.length) % items.length); }} aria-label="Anterior">←</button>
      <figure onClick={(e) => e.stopPropagation()}>
        <div className="ca-viewer-img">
          <img src={item.src} alt="" draggable={false} />
          <span className="shield" />
        </div>
        <figcaption>
          <span>Foto {item.number} · {index + 1} / {items.length}</span>
          {selectable && (
            <button className={`btn small ${current?.selected ? 'btn-accent' : 'btn-line light'} ${!current?.selected && full ? 'limit' : ''}`} onClick={() => onToggle(current)}>
              {current?.selected ? '♥ Escolhida' : full ? 'Limite atingido' : '♡ Escolher'}
            </button>
          )}
        </figcaption>
      </figure>
      <button className="lb-arrow right" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % items.length); }} aria-label="Próxima">→</button>
    </div>
  );
}
