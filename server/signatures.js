// Assinatura eletrônica do contrato.
//
// Fluxo: a fotógrafa aceita o pedido (cria o cliente) → envia o contrato em PDF para assinatura
// (gera a senha do cliente e o prazo para assinar) → o cliente assina na área do cliente
// (o prazo para) → a fotógrafa assina no painel → contrato concluído; depois vêm as fotos.
//
// Três códigos SHA-256 (64 caracteres hexadecimais), todos únicos e guardados com os dados
// que os geraram, para que qualquer um deles possa ser validado depois:
//   - job:          liga o serviço (pedido/evento) ao cliente e ao PDF exato enviado;
//   - client:       a assinatura do cliente (nome, data/hora, IP, navegador + código do serviço);
//   - photographer: a assinatura da fotógrafa (inclui também o código da assinatura do cliente).
// Validar = procurar o código e recalcular o SHA-256 dos dados guardados: se bater, nada foi alterado.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import db from './clientsDb.js';
import { clientDir } from './clientFiles.js';
import { contractPath } from './contracts.js';

export const DEFAULT_SIGN_DAYS = 7;
export const TZ = 'America/Sao_Paulo';

const cols = db.prepare('PRAGMA table_info(clients)').all().map((c) => c.name);
for (const [name, def] of [
  ['contract_sha256', 'TEXT'],             // SHA-256 do PDF original
  ['sign_days', `INTEGER NOT NULL DEFAULT ${DEFAULT_SIGN_DAYS}`],
  ['contract_sent_at', 'TEXT'],            // enviado para assinatura (senha criada aqui)
  ['sign_deadline', 'TEXT'],               // prazo do cliente para assinar
  ['sign_reminder_sent_at', 'TEXT'],
  ['job_hash', 'TEXT'],
  ['client_signed_at', 'TEXT'],
  ['client_sign_hash', 'TEXT'],
  ['photographer_signed_at', 'TEXT'],
  ['photographer_sign_hash', 'TEXT'],
]) if (!cols.includes(name)) db.exec(`ALTER TABLE clients ADD COLUMN ${name} ${def}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contract_hashes (
    hash        TEXT PRIMARY KEY,                 -- SHA-256 em hexadecimal (minúsculas)
    kind        TEXT NOT NULL CHECK (kind IN ('job', 'client', 'photographer')),
    client_id   INTEGER NOT NULL,                 -- sem FK: o registro continua válido mesmo se o cliente for excluído
    payload     TEXT NOT NULL,                    -- JSON exato que foi passado pelo SHA-256
    revoked_at  TEXT,                             -- envio cancelado antes da assinatura do cliente
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_contract_hashes_client ON contract_hashes(client_id);
`);

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const sha256File = (file) => sha256(fs.readFileSync(file));

/** Grava um novo código. Os dados levam um valor aleatório, então o código nunca se repete. */
function record(kind, clientId, data) {
  for (;;) {
    const payload = JSON.stringify({ v: 1, kind, ...data, nonce: crypto.randomBytes(16).toString('hex') });
    const hash = sha256(payload);
    try {
      db.prepare('INSERT INTO contract_hashes (hash, kind, client_id, payload) VALUES (?, ?, ?, ?)').run(hash, kind, clientId, payload);
      return hash;
    } catch (e) { if (!/UNIQUE/.test(e.message)) throw e; } // colisão (praticamente impossível): tenta outro valor
  }
}

export const newJobHash = (c, sentAt) => record('job', c.id, {
  clientId: c.id, inquiryId: c.inquiry_id ?? null, client: c.name, email: c.email,
  event: c.event_type || '', eventDate: c.event_date || '', contract: c.contract_name, contractSha256: c.contract_sha256, sentAt,
});
export const newClientSignHash = (c, { signedAt, ip, userAgent, typedName }) => record('client', c.id, {
  jobHash: c.job_hash, name: c.name, typedName, signedAt, ip, userAgent: String(userAgent || '').slice(0, 300), contractSha256: c.contract_sha256,
});
export const newPhotographerSignHash = (c, { signedAt, name }) => record('photographer', c.id, {
  jobHash: c.job_hash, clientSignHash: c.client_sign_hash, name, signedAt, contractSha256: c.contract_sha256,
});
export const revokeHashes = (clientId) =>
  db.prepare("UPDATE contract_hashes SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE client_id = ? AND revoked_at IS NULL").run(clientId);

/** "18/11/2026 às 14:32:07" no horário de Brasília */
export function fmtSigned(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}:${p.second}`;
}

export const cleanHash = (s) => String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '');

/**
 * Procura um código. `clientId` limita a busca aos códigos de um cliente (área do cliente).
 * Devolve null se não existir; senão o que ele comprova e se os dados ainda batem com o código.
 */
export function lookupHash(input, { clientId } = {}) {
  const hash = cleanHash(input);
  if (hash.length !== 64) return { invalid: true };
  const row = db.prepare('SELECT * FROM contract_hashes WHERE hash = ?').get(hash);
  if (!row || (clientId && row.client_id !== clientId)) return null;
  const data = JSON.parse(row.payload);
  const intact = sha256(row.payload) === row.hash;
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(row.client_id);
  // ainda é o código em uso? (um envio cancelado ou um contrato trocado deixa os códigos antigos sem efeito)
  const current = !!c && [c.job_hash, c.client_sign_hash, c.photographer_sign_hash].includes(row.hash) && !row.revoked_at;
  const out = { hash: row.hash, kind: row.kind, intact, current, clientDeleted: !c && !row.revoked_at, revokedAt: row.revoked_at, createdAt: row.created_at, contract: data.contract || c?.contract_name || null };
  if (row.kind === 'job') Object.assign(out, { client: data.client, event: data.event, eventDate: data.eventDate, sentAt: data.sentAt, contractSha256: data.contractSha256 });
  else Object.assign(out, { name: data.name, signedAt: data.signedAt, signedAtText: fmtSigned(data.signedAt), jobHash: data.jobHash, contractSha256: data.contractSha256 });
  if (c) Object.assign(out, {
    clientName: c.name,
    status: c.photographer_signed_at ? 'complete' : c.client_signed_at ? 'client-signed' : c.contract_sent_at ? 'sent' : 'none',
  });
  return out;
}

// ---- PDF assinado: o original + rodapé com o código em cada página + página de assinaturas ----

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
export const signedPath = (clientId) => path.join(clientDir(clientId), 'contract-signed.pdf');

/** Recria o PDF com as assinaturas que já existem. */
export async function buildSignedPdf(c, { photographerName, siteUrl }) {
  const pdf = await PDFDocument.load(fs.readFileSync(contractPath(c.id)), { ignoreEncryption: true, updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans.ttf')), { subset: true });
  const bold = await pdf.embedFont(fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')), { subset: true });
  const ink = rgb(0.16, 0.18, 0.21), muted = rgb(0.42, 0.45, 0.5), line = rgb(0.8, 0.82, 0.85), ok = rgb(0.13, 0.45, 0.3);

  const originals = pdf.getPages();
  const total = originals.length + 1;
  originals.forEach((page, i) => {
    const { width } = page.getSize();
    const text = `Código do contrato: ${c.job_hash} · página ${i + 1} de ${total}`;
    const size = 6.5;
    page.drawText(text, { x: Math.max(12, (width - font.widthOfTextAtSize(text, size)) / 2), y: 12, size, font, color: muted });
  });

  const page = pdf.addPage([595.28, 841.89]); // A4
  const W = 595.28, M = 56;
  let y = 841.89 - M;
  const text = (t, { f = font, size = 10, color = ink, x = M, gap = 1.45 } = {}) => { page.drawText(String(t), { x, y, size, font: f, color }); y -= size * gap; };
  // quebra texto longo em linhas que cabem na largura
  const wrap = (t, { f = font, size = 9, color = ink, x = M, width = W - M - x } = {}) => {
    let cur = '';
    for (const word of String(t).split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > width && cur) { text(cur, { f, size, color, x }); cur = word; } else cur = next;
    }
    if (cur) text(cur, { f, size, color, x });
  };
  const mono = (h, opts = {}) => text(h.replace(/(.{32})/, '$1 '), { size: 8.6, ...opts }); // 64 caracteres em duas metades legíveis

  text('Assinaturas eletrônicas', { f: bold, size: 18, gap: 1.6 });
  wrap(`Documento: ${c.contract_name}`, { size: 9.5, color: muted });
  text('Código do contrato (liga este serviço a este cliente):', { size: 9.5, color: muted });
  mono(c.job_hash, { f: bold });
  text(`SHA-256 do PDF original: ${c.contract_sha256}`, { size: 6.8, color: muted, gap: 2.6 });

  const block = (title, { name, signedAt, hash, pending }) => {
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.6, color: line });
    y -= 12;
    text(title, { f: bold, size: 11, color: muted, gap: 1.8 });
    if (pending) { text(pending, { size: 10.5, color: muted, gap: 2.4 }); return; }
    text(name, { f: bold, size: 15, gap: 1.6 });
    text(`Assinado em ${fmtSigned(signedAt)} (horário de Brasília)`, { size: 10.5, gap: 1.7 });
    text('Código da assinatura:', { size: 9.5, color: muted });
    mono(hash, { f: bold, color: ok, gap: 2.6 });
  };
  block('CONTRATANTE (CLIENTE)', c.client_signed_at
    ? { name: c.name, signedAt: c.client_signed_at, hash: c.client_sign_hash }
    : { pending: 'Aguardando a assinatura do cliente.' });
  block('CONTRATADA (FOTÓGRAFA)', c.photographer_signed_at
    ? { name: photographerName, signedAt: c.photographer_signed_at, hash: c.photographer_sign_hash }
    : { pending: c.client_signed_at ? 'Aguardando a assinatura da fotógrafa.' : 'A fotógrafa assina depois do cliente.' });

  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.6, color: line });
  y -= 10;
  wrap('Assinaturas eletrônicas feitas na área do cliente e no painel da fotógrafa, com login e senha pessoais, aceitas pelas partes como válidas (Lei nº 14.063/2020 e MP nº 2.200-2/2001, art. 10, § 2º). Cada código é o resumo SHA-256 dos dados da assinatura (nome, data e hora, código do contrato e, para o cliente, IP e navegador); qualquer alteração produziria outro código.', { size: 8, color: muted });
  y -= 4;
  wrap(`Para validar, informe um dos códigos em “Validar código” na área do cliente (${siteUrl}/cliente) ou peça à fotógrafa.`, { size: 8, color: muted });
  page.drawText(`Código do contrato: ${c.job_hash} · página ${total} de ${total}`, { x: M, y: 12, size: 6.5, font, color: muted });

  pdf.setTitle(`${c.contract_name} — assinado`);
  pdf.setProducer('Área do cliente');
  fs.mkdirSync(clientDir(c.id), { recursive: true });
  fs.writeFileSync(signedPath(c.id), await pdf.save());
}

export const removeSignedPdf = (clientId) => fs.rmSync(signedPath(clientId), { force: true });

/** Etapa do contrato, para o painel e para a área do cliente. */
export function contractStage(c) {
  if (c.photographer_signed_at) return 'complete';
  if (c.client_signed_at) return 'client-signed';
  if (c.contract_sent_at) return c.sign_deadline && Date.parse(c.sign_deadline) <= Date.now() ? 'expired' : 'sent';
  return c.contract_name ? 'uploaded' : 'none';
}
