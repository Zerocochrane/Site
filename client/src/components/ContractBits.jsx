// Peças do contrato assinado, usadas na área do cliente e no painel da fotógrafa.
import { useState } from 'react';

/** Código SHA-256 em 4 blocos de 16 caracteres, com botão de copiar. */
export function Hash({ value, label }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  return (
    <div className="hash">
      {label && <span className="hash-label">{label}</span>}
      <code aria-label={value}>{value.match(/.{1,16}/g).map((part, i) => <span key={i}>{part}</span>)}</code>
      <button type="button" className="link-btn small" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
    </div>
  );
}

/** Bloco de uma assinatura: nome, data e hora com segundos, código. */
export function SignatureCard({ role, name, signedText, hash, pending }) {
  return (
    <div className={`sig-card ${pending ? 'pending' : ''}`}>
      <span className="sig-role">{role}</span>
      {pending ? <p className="muted">{pending}</p> : (
        <>
          <b className="sig-name">{name}</b>
          <span className="sig-when">Assinado em {signedText} <span className="muted">(horário de Brasília)</span></span>
          <Hash value={hash} label="Código da assinatura" />
        </>
      )}
    </div>
  );
}

const KIND = { job: 'Código do contrato', client: 'Assinatura do cliente', photographer: 'Assinatura da fotógrafa' };

/** Caixa "Validar código". `check(hash)` chama a API certa (cliente ou painel). */
export function HashValidator({ check, intro }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const clean = value.toLowerCase().replace(/[^0-9a-f]/g, '');
    setResult(null);
    if (clean.length !== 64) { setError(`O código tem 64 caracteres (números e letras de a a f). Você colou ${clean.length}.`); return; }
    setBusy(true); setError('');
    try { setResult(await check(clean)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const ok = result && result.intact && (result.current || result.clientDeleted);
  return (
    <form className="hash-check" onSubmit={submit} noValidate>
      {intro && <p className="muted small">{intro}</p>}
      <div className="hash-check-row">
        <label className="sr-only" htmlFor="hash-input">Código</label>
        <input id="hash-input" value={value} onChange={(e) => { setValue(e.target.value); setError(''); setResult(null); }}
          placeholder="Cole aqui o código de 64 caracteres" autoCapitalize="none" autoComplete="off" spellCheck="false" aria-invalid={error ? true : undefined} />
        <button className="btn btn-dark small" disabled={busy || !value.trim()}>{busy ? 'Verificando…' : 'Validar'}</button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {result && (
        <div className={`hash-result ${ok ? 'ok' : 'bad'}`} role="status">
          <b>{ok ? '✓ Código válido' : !result.intact ? '✗ Os dados deste código foram alterados' : '✗ Código cancelado'}</b>
          <span>{KIND[result.kind]}{result.contract ? ` · ${result.contract}` : ''}</span>
          {result.kind === 'job'
            ? <span>Cliente: {result.client}{result.event ? ` · ${result.event}` : ''} · enviado para assinatura em {new Date(result.sentAt).toLocaleString('pt-BR')}</span>
            : <span>Assinado por <b>{result.name}</b> em {result.signedAtText}</span>}
          {result.clientDeleted && result.intact && <span className="muted small">O cliente foi excluído do sistema, mas o registro desta assinatura continua guardado e íntegro.</span>}
          {!result.current && !result.clientDeleted && result.intact && <span>Este código foi substituído ou o envio do contrato foi cancelado{result.revokedAt ? ` em ${new Date(result.revokedAt).toLocaleString('pt-BR')}` : ''}.</span>}
          {result.kind !== 'job' && result.current && <span className="muted small">Código do contrato: {result.jobHash}</span>}
        </div>
      )}
    </form>
  );
}
