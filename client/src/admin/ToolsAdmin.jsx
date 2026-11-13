import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const plural = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

/** Configurações → Ferramentas: dados de demonstração e limpeza, sem precisar de SSH. */
export default function ToolsAdmin() {
  const [info, setInfo] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [keepDemo, setKeepDemo] = useState(false);
  const [confirm, setConfirm] = useState('');
  const logRef = useRef(null);

  const refresh = useCallback(() => api('/admin/tools').then((d) => {
    setInfo(d);
    setJob((cur) => d.running || cur || d.last || null);
  }).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);

  // Acompanha a tarefa em andamento
  useEffect(() => {
    if (job?.status !== 'running') return undefined;
    const t = setInterval(async () => {
      try {
        const j = await api(`/admin/tools/jobs/${job.id}`);
        setJob(j);
        if (j.status !== 'running') refresh();
      } catch { /* tenta de novo */ }
    }, 1500);
    return () => clearInterval(t);
  }, [job?.id, job?.status, refresh]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job?.log]);

  const run = async (tool, body = {}) => {
    setError('');
    try {
      setJob(await api('/admin/tools/run', { method: 'POST', body: { tool, ...body } }));
      if (tool.startsWith('clear') && !tool.includes('preview')) setConfirm('');
    } catch (e) {
      setError(e.message);
      if (e.status === 409) refresh();
    }
  };

  if (!info) return <div className="tools"><p className="muted">{error || 'Carregando ferramentas…'}</p></div>;
  const busy = job?.status === 'running';
  const word = info.confirmWord;

  return (
    <div className="tools">
      <div className="admin-sub-head"><h2>Ferramentas</h2></div>
      <p className="hint">Crie dados de exemplo para testar o site ou apague tudo para começar de novo. Uma tarefa por vez; você pode sair desta página enquanto ela roda.</p>

      {error && <p className="err">{error}</p>}
      {job && (
        <div className={`panel job-panel ${job.status}`}>
          <div className="job-head">
            <b>{job.label}</b>
            <span className={`status-tag ${job.status === 'done' ? 'confirmed' : job.status === 'failed' ? 'declined' : 'new'}`}>
              {job.status === 'running' ? 'Rodando…' : job.status === 'done' ? 'Concluído' : 'Falhou'}
            </span>
          </div>
          {job.progress && (
            <div className="job-progress" aria-label={`${job.progress.done} de ${job.progress.total} fotos`}>
              <i style={{ width: `${Math.round((job.progress.done / job.progress.total) * 100)}%` }} />
              <span>{job.progress.done} / {job.progress.total} fotos</span>
            </div>
          )}
          <pre ref={logRef} className="job-log">{job.log || 'Iniciando…'}</pre>
        </div>
      )}

      <div className="panel tool-panel">
        <h3>Dados de demonstração</h3>
        <div className="tool-row">
          <div>
            <b>Portfólio</b>
            <p className="muted small">8–10 grupos, 3–5 subgrupos cada, 8–10 fotos por subgrupo (fotos gratuitas do Unsplash). Leva alguns minutos.
              {info.demo.portfolioGroups > 0 && <> Agora: <b>{plural(info.demo.portfolioGroups, 'grupo', 'grupos')}</b> de demonstração — criar de novo substitui.</>}</p>
          </div>
          <div className="tool-actions">
            <button className="btn btn-accent small" disabled={busy} onClick={() => run('portfolio-demo')}>Criar</button>
            <button className="btn btn-line small" disabled={busy} onClick={() => run('portfolio-demo-offline')} title="Não baixa nada: gera imagens em tons suaves">Criar sem internet</button>
            <button className="btn btn-line small" disabled={busy || !info.demo.portfolioGroups} onClick={() => run('portfolio-demo-remove')}>Remover</button>
          </div>
        </div>
        <div className="tool-row">
          <div>
            <b>Clientes (Financeiro)</b>
            <p className="muted small">28 clientes fictícios de maio até hoje, com pagamento e contrato. Nenhum e-mail é enviado.
              {info.demo.financeClients > 0 && <> Agora: <b>{plural(info.demo.financeClients, 'cliente', 'clientes')}</b>.</>}</p>
          </div>
          <div className="tool-actions">
            <button className="btn btn-accent small" disabled={busy} onClick={() => run('finance-demo')}>Criar</button>
            <button className="btn btn-line small" disabled={busy || !info.demo.financeClients} onClick={() => run('finance-demo-remove')}>Remover</button>
          </div>
        </div>
        <div className="tool-row">
          <div>
            <b>Visitas (Tráfego)</b>
            <p className="muted small">Cerca de 1.500 visitas fictícias dos últimos 6 meses.
              {info.demo.trafficVisits > 0 && <> Agora: <b>{plural(info.demo.trafficVisits, 'visita', 'visitas')}</b>.</>}</p>
          </div>
          <div className="tool-actions">
            <button className="btn btn-accent small" disabled={busy} onClick={() => run('traffic-demo')}>Criar</button>
            <button className="btn btn-line small" disabled={busy || !info.demo.trafficVisits} onClick={() => run('traffic-demo-remove')}>Remover</button>
          </div>
        </div>
      </div>

      <div className="panel tool-panel danger-panel">
        <h3>Apagar fotos e clientes</h3>
        <p className="small">Apaga <b>todos</b> os grupos, subgrupos e fotos do portfólio e <b>todos</b> os clientes, com fotos, pagamentos e contratos.
          Ficam: configurações, categorias, dias da agenda, pedidos de agendamento e tráfego. <b>Não tem como desfazer.</b></p>
        <label className="check"><input type="checkbox" checked={keepDemo} onChange={(e) => setKeepDemo(e.target.checked)} /> Manter os clientes de demonstração</label>
        <div className="tool-actions">
          <button className="btn btn-line small" disabled={busy} onClick={() => run(keepDemo ? 'clear-preview-keep' : 'clear-preview')}>Ver o que será apagado</button>
        </div>
        <div className="confirm-row">
          <label>Para confirmar, digite <b>{word}</b>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={word} autoComplete="off" />
          </label>
          <button className="btn small danger-btn" disabled={busy || confirm.trim().toUpperCase() !== word} onClick={() => run(keepDemo ? 'clear-keep' : 'clear', { confirm })}>
            Apagar fotos e clientes
          </button>
        </div>
      </div>

          </div>
  );
}
