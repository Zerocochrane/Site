import { Router } from 'express';
import fs from 'node:fs';
import archiver from 'archiver';
import db, { getClient, clientPhotos, isExpired, nowIso, countPhotos, addMonths, RETENTION_MONTHS } from '../clientsDb.js';
import { getSettings, toSlug } from '../db.js';
import { createClientToken, requireClientToken } from '../auth.js';
import { verifyPassword } from '../passwords.js';
import { variantPath } from '../clientFiles.js';
import { mediaUrl, zipUrl, checkZipSig } from '../media.js';
import { sendSelectionToPhotographer, sendClientSignedToPhotographer } from '../clientEmails.js';
import { siteUrl } from '../mail.js';
import { contractStage, newClientSignHash, buildSignedPdf, signedPath, lookupHash, fmtSigned } from '../signatures.js';

/** Nome digitado x nome do cadastro: ignora maiúsculas, acentos e espaços a mais. */
const sameName = (a, b) => {
  const n = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return n(a) && n(a) === n(b);
};

const router = Router();
const EXPIRED = { error: 'O seu prazo de acesso terminou. Fale com a fotógrafa se precisar de mais tempo.', code: 'expired' };
const expiredFor = (c) => (c.contract_sent_at && !c.client_signed_at && !c.access_sent_at
  ? { error: 'O prazo para assinar o contrato terminou. Fale com a fotógrafa para receber um novo prazo.', code: 'expired' }
  : EXPIRED);

// Login attempts: 8 per username+IP per 15 minutes
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, list);
  return list.length >= 8;
}

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${username}`;
  if (tooMany(key)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  const c = db.prepare('SELECT * FROM clients WHERE username = ?').get(username);
  if (!c || !c.password_hash || !verifyPassword(password, c.password_hash)) {
    attempts.get(key).push(Date.now());
    return res.status(401).json({ error: 'Login ou senha incorretos.' });
  }
  if (isExpired(c)) return res.status(403).json(expiredFor(c));
  attempts.delete(key);
  res.json({ token: createClientToken(c.id), name: c.name });
});

// Everything below needs a valid client login AND an access period that hasn't ended.
function requireActiveClient(req, res, next) {
  const c = getClient(req.clientId);
  if (!c || !c.password_hash) return res.status(401).json({ error: 'Faça login novamente.', code: 'login' });
  if (isExpired(c)) return res.status(403).json(expiredFor(c));
  req.client = c;
  next();
}

router.get('/me', requireClientToken, requireActiveClient, (req, res) => {
  const c = req.client;
  // fotos para escolher só aparecem depois do aviso "suas fotos estão prontas"
  const proofs = c.access_sent_at ? clientPhotos(c.id, 'proof') : [];
  const done = c.done_notified_at ? clientPhotos(c.id, 'done') : [];
  const settings = getSettings();
  res.json({
    name: c.name,
    photographer: settings.name,
    expiresAt: c.confirmed_at || !c.access_sent_at ? null : c.expires_at,   // no deadline once the selection is confirmed
    photosReleased: !!c.access_sent_at,
    contract: contractInfo(c, settings.name),
    deleteAfter: c.delete_after,                       // set by the first download
    retentionMonths: RETENTION_MONTHS,
    selectionLimit: c.selection_limit,
    confirmedAt: c.confirmed_at,
    selected: proofs.filter((p) => p.selected).length,
    photos: proofs.map((p, i) => ({
      id: p.id,
      number: i + 1,
      selected: !!p.selected,
      thumb: mediaUrl(c.id, p, 'thumb'),
      preview: mediaUrl(c.id, p, 'preview'),
    })),
    done: done.map((p, i) => ({ id: p.id, number: i + 1, thumb: mediaUrl(c.id, p, 'thumb'), view: mediaUrl(c.id, p, 'view') })),
    downloadUrl: done.length ? zipUrl(c.id) : null,
  });
});

function contractInfo(c, photographer) {
  if (!c.contract_sent_at) return null;
  return {
    stage: contractStage(c),                 // sent | client-signed | complete
    name: c.contract_name,
    deadline: c.client_signed_at ? null : c.sign_deadline,
    jobHash: c.job_hash,
    clientSignedAt: c.client_signed_at,
    clientSignedText: c.client_signed_at ? fmtSigned(c.client_signed_at) : null,
    clientSignHash: c.client_sign_hash,
    photographer: photographer || 'Fotógrafa',
    photographerSignedAt: c.photographer_signed_at,
    photographerSignedText: c.photographer_signed_at ? fmtSigned(c.photographer_signed_at) : null,
    photographerSignHash: c.photographer_sign_hash,
  };
}

// O contrato em PDF (com a página de assinaturas atualizada).
router.get('/contract', requireClientToken, requireActiveClient, (req, res) => {
  const c = req.client;
  if (!c.contract_sent_at || !fs.existsSync(signedPath(c.id))) return res.status(404).json({ error: 'Contrato não encontrado' });
  const base = c.contract_name.replace(/\.pdf$/i, '');
  res.download(signedPath(c.id), `${base}${c.photographer_signed_at ? ' - assinado' : ''}.pdf`);
});

router.post('/contract/sign', requireClientToken, requireActiveClient, async (req, res, next) => {
  try {
    const c = req.client;
    if (!c.contract_sent_at) return res.status(404).json({ error: 'Não há contrato para assinar.' });
    if (c.client_signed_at) return res.status(409).json({ error: 'Você já assinou este contrato.' });
    const errors = {};
    if (req.body?.agree !== true) errors.agree = 'Marque que você leu e concorda com o contrato.';
    const typed = String(req.body?.name || '').trim().slice(0, 160);
    if (!sameName(typed, c.name)) errors.name = `Digite o seu nome completo exatamente como no contrato: ${c.name}`;
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Confira os campos.', errors });
    const signedAt = nowIso();
    db.transaction(() => {
      const hash = newClientSignHash(c, { signedAt, ip: req.ip, userAgent: req.get('user-agent'), typedName: typed });
      db.prepare('UPDATE clients SET client_signed_at = ?, client_sign_hash = ? WHERE id = ?').run(signedAt, hash, c.id);
    })();
    const updated = getClient(c.id);
    await buildSignedPdf(updated, { photographerName: getSettings().name || 'Fotógrafa', siteUrl: siteUrl() });
    sendClientSignedToPhotographer(updated).catch((e) => console.error('Signature email failed:', e.message));
    res.json({ contract: contractInfo(updated, getSettings().name) });
  } catch (e) { next(e); }
});

// Validar um código (só os códigos do próprio contrato).
router.post('/validate', requireClientToken, requireActiveClient, (req, res) => {
  const r = lookupHash(req.body?.hash, { clientId: req.client.id });
  if (r?.invalid) return res.status(400).json({ error: 'O código tem 64 caracteres (números e letras de a a f).' });
  if (!r) return res.status(404).json({ error: 'Código não encontrado no seu contrato. Confira se foi copiado inteiro.' });
  res.json(r);
});

router.put('/photos/:id/select', requireClientToken, requireActiveClient, (req, res) => {
  const c = req.client;
  if (!c.access_sent_at) return res.status(409).json({ error: 'As fotos ainda não foram liberadas.' });
  if (c.confirmed_at) return res.status(409).json({ error: 'A sua seleção já foi confirmada e não pode mais ser alterada.' });
  const p = db.prepare("SELECT * FROM client_photos WHERE id = ? AND client_id = ? AND kind = 'proof'").get(req.params.id, c.id);
  if (!p) return res.status(404).json({ error: 'Foto não encontrada' });
  const want = !!req.body?.selected;
  if (want && !p.selected) {
    const n = countPhotos(c.id).selected || 0;
    if (n >= c.selection_limit) return res.status(409).json({ error: `Você pode escolher até ${c.selection_limit} fotos. Desmarque uma para escolher outra.` });
  }
  db.prepare('UPDATE client_photos SET selected = ? WHERE id = ?').run(want ? 1 : 0, p.id);
  res.json({ selected: countPhotos(c.id).selected || 0 });
});

router.post('/confirm', requireClientToken, requireActiveClient, async (req, res) => {
  const c = req.client;
  if (!c.access_sent_at) return res.status(409).json({ error: 'As fotos ainda não foram liberadas.' });
  if (c.confirmed_at) return res.status(409).json({ error: 'A sua seleção já foi confirmada.' });
  const chosen = db.prepare("SELECT original_name FROM client_photos WHERE client_id = ? AND kind = 'proof' AND selected = 1 ORDER BY position, id").all(c.id);
  if (!chosen.length) return res.status(400).json({ error: 'Escolha pelo menos uma foto antes de confirmar.' });
  if (chosen.length > c.selection_limit) return res.status(400).json({ error: `Você pode escolher até ${c.selection_limit} fotos.` });
  db.prepare('UPDATE clients SET confirmed_at = ? WHERE id = ?').run(nowIso(), c.id);
  sendSelectionToPhotographer(getClient(c.id), chosen.map((r) => r.original_name)).catch((e) => console.error('Selection email failed:', e.message));
  res.json({ confirmedAt: getClient(c.id).confirmed_at });
});

// All finished photos as one .zip (signed link from /me, so a plain download link works).
router.get('/download', (req, res) => {
  if (!checkZipSig(req.query)) return res.status(403).send('Este link de download expirou. Recarregue a página e tente novamente.');
  const c = getClient(req.query.c);
  if (!c || isExpired(c) || !c.done_notified_at) return res.status(403).send('O seu prazo de acesso terminou.');
  const photos = clientPhotos(c.id, 'done');
  if (!photos.length) return res.status(404).send('Ainda não há fotos.');
  const zipName = `${toSlug(getSettings().name || 'photos')}-${toSlug(c.name)}.zip`;
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${zipName}"` });
  const zip = archiver('zip', { store: true }); // photos are already compressed
  zip.on('error', (err) => { console.error('zip error', err.message); res.destroy(err); });
  // The first complete download starts the retention period; after it everything is deleted.
  res.on('finish', () => {
    const now = new Date();
    db.prepare('UPDATE clients SET downloaded_at = ?, delete_after = ? WHERE id = ? AND downloaded_at IS NULL')
      .run(now.toISOString(), addMonths(now, RETENTION_MONTHS).toISOString(), c.id);
  });
  zip.pipe(res);
  const used = new Set();
  for (const p of photos) {
    let name = p.original_name.replace(/[\\/:*?"<>|]+/g, '_');
    for (let i = 2; used.has(name.toLowerCase()); i++) name = p.original_name.replace(/(\.[^.]*)?$/, ` (${i})$1`);
    used.add(name.toLowerCase());
    const file = variantPath(c.id, 'done', 'orig', p.file);
    if (fs.existsSync(file)) zip.file(file, { name });
  }
  zip.finalize();
});

export default router;
