// Ferramentas do painel: roda os scripts de demonstração/limpeza sem precisar de SSH.
// Só o painel (admin) chama; só scripts e argumentos desta lista podem rodar — nada vem do navegador.
import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireAdmin } from '../auth.js';
import db from '../db.js';
import fs from 'node:fs';
import { upload } from '../upload.js';
import { DEMO_SOURCE_DIR } from '../paths.js';

const router = Router();
router.use(requireAdmin);
const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TOOLS = {
  'portfolio-demo': { script: 'demo-portfolio.js', args: [], label: 'Criar portfólio de demonstração' },
  'portfolio-demo-uploads': { script: 'demo-portfolio.js', args: ['--from-uploads'], label: 'Criar portfólio de demonstração (minhas fotos)' },
  'portfolio-demo-offline': { script: 'demo-portfolio.js', args: ['--offline'], label: 'Criar portfólio de demonstração (imagens geradas)' },
  'portfolio-demo-remove': { script: 'demo-portfolio.js', args: ['--remove'], label: 'Remover portfólio de demonstração' },
  'finance-demo': { script: 'finance-demo.js', args: [], label: 'Criar clientes de demonstração (Financeiro)' },
  'finance-demo-remove': { script: 'finance-demo.js', args: ['--remove'], label: 'Remover clientes de demonstração' },
  'traffic-demo': { script: 'traffic-demo.js', args: [], label: 'Criar visitas de demonstração (Tráfego)' },
  'traffic-demo-remove': { script: 'traffic-demo.js', args: ['--remove'], label: 'Remover visitas de demonstração' },
  'net-check': { script: 'net-check.js', args: [], label: 'Testar conexão com os bancos de imagens' },
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
  demo.sourcePhotos = sourcePhotos().length;
  const last = [...jobs.values()].pop();
  res.json({ confirmWord: CONFIRM_WORD, running: running ? shape(running) : null, last: last ? shape(last) : null, demo });
});

// ---- Fotos próprias para a demonstração (server/private/demo-source) ----
const MAX_SOURCE = 80;
const sourcePhotos = () => (fs.existsSync(DEMO_SOURCE_DIR) ? fs.readdirSync(DEMO_SOURCE_DIR).filter((f) => !f.startsWith('.')) : []);

router.post('/demo-photos', upload.array('photos', MAX_SOURCE), (req, res) => {
  const files = req.files || [];
  fs.mkdirSync(DEMO_SOURCE_DIR, { recursive: true });
  const room = Math.max(0, MAX_SOURCE - sourcePhotos().length);
  files.forEach((f, i) => {
    if (i < room) {
      const ext = (path.extname(f.originalname).toLowerCase().match(/^\.(jpe?g|png|webp|tiff?|avif)$/) || ['.jpg'])[0];
      const to = path.join(DEMO_SOURCE_DIR, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
      try { fs.renameSync(f.path, to); } catch { fs.copyFileSync(f.path, to); fs.rmSync(f.path, { force: true }); }
    } else fs.rmSync(f.path, { force: true });
  });
  const count = sourcePhotos().length;
  res.json({ count, skipped: Math.max(0, files.length - room), max: MAX_SOURCE });
});

router.delete('/demo-photos', (_req, res) => {
  if (running?.tool === 'portfolio-demo-uploads') return res.status(409).json({ error: 'Aguarde a demonstração terminar.' });
  fs.rmSync(DEMO_SOURCE_DIR, { recursive: true, force: true });
  res.json({ count: 0 });
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
