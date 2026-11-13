// Ferramentas do painel: roda os scripts de demonstração/limpeza sem precisar de SSH.
// Só o painel (admin) chama; só scripts e argumentos desta lista podem rodar — nada vem do navegador.
import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireAdmin } from '../auth.js';
import db from '../db.js';

const router = Router();
router.use(requireAdmin);
const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TOOLS = {
  'portfolio-demo': { script: 'demo-portfolio.js', args: [], label: 'Criar portfólio de demonstração' },
  'portfolio-demo-offline': { script: 'demo-portfolio.js', args: ['--offline'], label: 'Criar portfólio de demonstração (imagens geradas)' },
  'portfolio-demo-remove': { script: 'demo-portfolio.js', args: ['--remove'], label: 'Remover portfólio de demonstração' },
  'finance-demo': { script: 'finance-demo.js', args: [], label: 'Criar clientes de demonstração (Financeiro)' },
  'finance-demo-remove': { script: 'finance-demo.js', args: ['--remove'], label: 'Remover clientes de demonstração' },
  'traffic-demo': { script: 'traffic-demo.js', args: [], label: 'Criar visitas de demonstração (Tráfego)' },
  'traffic-demo-remove': { script: 'traffic-demo.js', args: ['--remove'], label: 'Remover visitas de demonstração' },
  rewatermark: { script: 'rewatermark.js', args: [], label: 'Refazer marcas d’água do portfólio' },
  'clear-preview': { script: 'clear-data.js', args: [], label: 'Ver o que será apagado' },
  'clear-preview-keep': { script: 'clear-data.js', args: ['--keep-demo'], label: 'Ver o que será apagado' },
  clear: { script: 'clear-data.js', args: ['--yes'], label: 'Apagar fotos e clientes', confirm: true },
  'clear-keep': { script: 'clear-data.js', args: ['--yes', '--keep-demo'], label: 'Apagar fotos e clientes (mantendo os de demonstração)', confirm: true },
};
export const CONFIRM_WORD = 'APAGAR';

const jobs = new Map();   // id → job (últimos 20)
let running = null;

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
function shape(j) {
  const m = [...j.log.matchAll(/(\d+)\/(\d+) fotos/g)].pop();
  return {
    id: j.id, tool: j.tool, label: j.label, status: j.status, startedAt: j.startedAt, finishedAt: j.finishedAt,
    exitCode: j.exitCode, progress: m ? { done: Number(m[1]), total: Number(m[2]) } : null,
    log: j.log.split('\n').slice(-60).join('\n'),
  };
}

router.get('/', (_req, res) => {
  let demo = { portfolioGroups: 0, financeClients: 0, trafficVisits: 0 };
  try {
    demo = {
      portfolioGroups: JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'demoGroupIds'").get()?.value || '[]').length,
      financeClients: db.prepare("SELECT COUNT(*) AS n FROM clients WHERE username LIKE 'demo-%'").get().n,
      trafficVisits: db.prepare("SELECT COUNT(*) AS n FROM visits WHERE visitor LIKE 'demo%'").get().n,
    };
  } catch { /* tabelas ainda não criadas */ }
  const last = [...jobs.values()].pop();
  res.json({ confirmWord: CONFIRM_WORD, running: running ? shape(running) : null, last: last ? shape(last) : null, demo });
});

router.get('/jobs/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Tarefa não encontrada' });
  res.json(shape(j));
});

router.post('/run', (req, res) => {
  const name = String(req.body?.tool || '');
  const tool = TOOLS[name];
  if (!tool) return res.status(400).json({ error: 'Ferramenta desconhecida.' });
  if (tool.confirm && String(req.body?.confirm || '').trim().toUpperCase() !== CONFIRM_WORD) {
    return res.status(400).json({ error: `Digite ${CONFIRM_WORD} para confirmar.` });
  }
  if (running) return res.status(409).json({ error: `Aguarde: "${running.label}" ainda está rodando.`, job: shape(running) });

  const job = { id: crypto.randomBytes(6).toString('hex'), tool: name, label: tool.label, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, log: '' };
  jobs.set(job.id, job);
  if (jobs.size > 20) jobs.delete(jobs.keys().next().value);
  running = job;

  const child = spawn(process.execPath, [path.join('scripts', tool.script), ...tool.args], {
    cwd: SERVER_DIR,
    // NODE_USE_ENV_PROXY: no Node 24 o fetch passa a respeitar HTTP(S)_PROXY (redes corporativas)
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const add = (buf) => { job.log = (job.log + strip(buf.toString())).slice(-60000); };
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  child.on('error', (e) => { add(`\nErro ao iniciar: ${e.message}\n`); });
  child.on('close', (code) => {
    job.exitCode = code;
    job.status = code === 0 ? 'done' : 'failed';
    job.finishedAt = new Date().toISOString();
    if (running === job) running = null;
    console.log(`Ferramenta "${job.label}" terminou (código ${code}).`);
  });
  res.status(202).json(shape(job));
});

export default router;
