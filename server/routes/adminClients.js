import { Router } from 'express';
import db, { PAYMENT_METHODS, getClient, countPhotos, clientPhotos, stage, isExpired, nowIso, RETENTION_MONTHS } from '../clientsDb.js';
import { getSettings } from '../db.js';
import { requireAdmin } from '../auth.js';
import { generatePassword, hashPassword } from '../passwords.js';
import { clientUpload, storePhoto, removePhotoFiles, removeClientFiles } from '../clientFiles.js';
import { mediaUrl } from '../media.js';
import { parseFieldValue } from '../bookingDb.js';
import { contractUpload, contractPath, saveContract, removeContract } from '../contracts.js';
import { mailConfigured } from '../mail.js';
import { sendAccessEmail, sendExtendedEmail, sendDoneEmail } from '../clientEmails.js';

const router = Router();
router.use(requireAdmin);

const DAY = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/i;

function summary(c) {
  const n = countPhotos(c.id);
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone || '',
    notes: c.notes || '',
    inquiryId: c.inquiry_id ?? null,
    eventType: c.event_type || '',
    eventDate: c.event_date || '',
    durationHours: c.duration_hours ?? null,
    paymentMethod: c.payment_method || '',
    amountPaid: c.amount_paid ?? null,
    installments: c.installments ?? null,
    contract: c.contract_name ? { name: c.contract_name, uploadedAt: c.contract_uploaded_at } : null,
    username: c.username,
    selectionLimit: c.selection_limit,
    days: c.days,
    accessSentAt: c.access_sent_at,
    expiresAt: c.expires_at,
    expired: c.access_sent_at ? isExpired(c) : false,
    noExpiry: !!c.confirmed_at && !c.delete_after,   // confirmed: access stays open
    downloadedAt: c.downloaded_at,
    archivedAt: c.archived_at,
    deleteAfter: c.delete_after,                      // everything is deleted after this
    retentionMonths: RETENTION_MONTHS,
    confirmedAt: c.confirmed_at,
    reminderSentAt: c.reminder_sent_at,
    doneNotifiedAt: c.done_notified_at,
    createdAt: c.created_at,
    stage: stage(c),
    proofCount: n.proofs || 0,
    doneCount: n.done || 0,
    selected: n.selected || 0,
  };
}

const photoOut = (p) => ({
  id: p.id,
  name: p.original_name,
  selected: !!p.selected,
  bytes: p.bytes,
  thumb: mediaUrl('a', p, 'thumb'),
  large: mediaUrl('a', p, p.kind === 'proof' ? 'preview' : 'view'),
});

function validate(b, { partial = false, selfId = 0 } = {}) {
  const out = {}, errors = {};
  if (!partial || b.name !== undefined) {
    out.name = String(b.name || '').trim().slice(0, 120);
    if (!out.name) errors.name = 'Informe o nome do cliente.';
  }
  if (!partial || b.email !== undefined) {
    out.email = String(b.email || '').trim().slice(0, 200);
    if (!EMAIL_RE.test(out.email)) errors.email = 'Informe um e-mail válido.';
  }
  if (!partial || b.phone !== undefined) {
    out.phone = String(b.phone || '').trim().slice(0, 40);
    const digits = out.phone.replace(/\D/g, '');
    if (out.phone && (digits.length < 10 || digits.length > 15)) errors.phone = 'Informe o telefone com DDD.';
  }
  if (!partial || b.notes !== undefined) out.notes = String(b.notes || '').slice(0, 5000);
  // Evento e pagamento (todos opcionais)
  if (!partial || b.eventType !== undefined) out.event_type = String(b.eventType || '').trim().slice(0, 80);
  if (!partial || b.eventDate !== undefined) {
    const v = String(b.eventDate || '').trim();
    out.event_date = v || null;
    if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) errors.eventDate = 'Informe uma data válida.';
  }
  if (!partial || b.durationHours !== undefined) {
    const v = String(b.durationHours ?? '').trim().replace(',', '.');
    out.duration_hours = v === '' ? null : Number(v);
    if (out.duration_hours !== null && !(out.duration_hours > 0 && out.duration_hours <= 240)) errors.durationHours = 'Informe a duração em horas.';
  }
  if (!partial || b.paymentMethod !== undefined) {
    out.payment_method = String(b.paymentMethod || '').trim();
    if (out.payment_method && !PAYMENT_METHODS.includes(out.payment_method)) errors.paymentMethod = 'Escolha a forma de pagamento.';
  }
  if (!partial || b.amountPaid !== undefined) {
    const [v, err] = parseFieldValue({ type: 'money' }, b.amountPaid);
    out.amount_paid = v;
    if (err) errors.amountPaid = err;
  }
  if (!partial || b.installments !== undefined) {
    const v = String(b.installments ?? '').trim();
    out.installments = v === '' ? null : Number(v);
    if (out.installments !== null && !(Number.isInteger(out.installments) && out.installments >= 1 && out.installments <= 48)) errors.installments = 'Informe de 1 a 48 parcelas.';
  }
  if (!partial || b.username !== undefined) {
    out.username = String(b.username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(out.username)) errors.username = 'Use de 3 a 40 letras, números, pontos, hífens ou sublinhados.';
    else if (db.prepare('SELECT 1 FROM clients WHERE username = ? AND id != ?').get(out.username, selfId)) errors.username = 'Este login já é usado por outro cliente.';
  }
  if (!partial || b.selectionLimit !== undefined) {
    out.selection_limit = Number(b.selectionLimit);
    if (!Number.isInteger(out.selection_limit) || out.selection_limit < 1 || out.selection_limit > 5000) errors.selectionLimit = 'Informe um número inteiro de fotos (1 ou mais).';
  }
  if (!partial || b.days !== undefined) {
    out.days = Number(b.days);
    if (!Number.isInteger(out.days) || out.days < 1 || out.days > 365) errors.days = 'Informe um número de dias entre 1 e 365.';
  }
  return { out, errors };
}

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY created_at DESC, id DESC').all().map(summary));
});

router.get('/:id', (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json({
    ...summary(c),
    mailConfigured: mailConfigured(),
    proofs: clientPhotos(c.id, 'proof').map(photoOut),
    donePhotos: clientPhotos(c.id, 'done').map(photoOut),
  });
});

router.post('/', (req, res) => {
  const { out, errors } = validate(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Confira o formulário.', errors });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO clients (name, email, phone, username, selection_limit, days, event_type, event_date, duration_hours, payment_method, amount_paid, installments, notes) VALUES (@name, @email, @phone, @username, @selection_limit, @days, @event_type, @event_date, @duration_hours, @payment_method, @amount_paid, @installments, @notes)')
    .run(out);
  res.status(201).json(summary(getClient(lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  const { out, errors } = validate(req.body || {}, { partial: true, selfId: c.id });
  if (out.selection_limit !== undefined && c.confirmed_at) delete out.selection_limit; // locked once confirmed
  if (out.selection_limit !== undefined && out.selection_limit < (countPhotos(c.id).selected || 0)) {
    errors.selectionLimit = `O cliente já escolheu ${countPhotos(c.id).selected} fotos.`;
  }
  if (out.days !== undefined && c.access_sent_at) delete out.days; // after sending, use "extend" instead
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Confira o formulário.', errors });
  const keys = Object.keys(out);
  if (keys.length) db.prepare(`UPDATE clients SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...out, id: c.id });
  res.json(summary(getClient(c.id)));
});

// Generates the password, starts the selection period and emails the client. Also used to resend (new password).
// Cliente arquivado (fotos já excluídas): só dados, pagamento e contrato podem mudar.
const ARCHIVED_ONLY = /^\/(\d+)\/(send-access|extend|reopen|photos|notify-done)/;
router.use((req, res, next) => {
  const m = req.method === 'POST' && req.path.match(ARCHIVED_ONLY);
  if (m && getClient(m[1])?.archived_at) return res.status(409).json({ error: 'As fotos deste cliente já foram excluídas; o acesso não pode mais ser reaberto.' });
  next();
});

router.post('/:id/send-access', async (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  const firstTime = !c.access_sent_at;
  if (firstTime && !(countPhotos(c.id).proofs > 0)) return res.status(400).json({ error: 'Primeiro envie as fotos para o cliente escolher.' });
  const password = generatePassword();
  if (firstTime) {
    const expires = new Date(Date.now() + c.days * DAY).toISOString();
    db.prepare('UPDATE clients SET password_hash = ?, access_sent_at = ?, expires_at = ?, reminder_sent_at = NULL WHERE id = ?')
      .run(hashPassword(password), nowIso(), expires, c.id);
  } else {
    db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hashPassword(password), c.id);
  }
  const updated = getClient(c.id);
  let emailed = false, emailError = null;
  try { emailed = (await sendAccessEmail(updated, password, { reset: !firstTime })).sent; } catch (err) { emailError = err.message; }
  res.json({ client: summary(updated), password, emailed, emailError });
});

// Adds days. If access has already expired, the new period starts now (so the client can log in again).
router.post('/:id/extend', async (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (!c.access_sent_at) return res.status(400).json({ error: 'Envie o e-mail de acesso primeiro.' });
  if (c.confirmed_at) return res.status(400).json({ error: 'A seleção está confirmada, então o acesso não expira mais.' });
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Informe um número de dias entre 1 e 365.' });
  const from = Math.max(Date.now(), Date.parse(c.expires_at) || 0);
  db.prepare('UPDATE clients SET expires_at = ?, reminder_sent_at = NULL WHERE id = ?').run(new Date(from + days * DAY).toISOString(), c.id);
  const updated = getClient(c.id);
  let emailed = false, emailError = null;
  if (req.body?.notify) { try { emailed = (await sendExtendedEmail(updated)).sent; } catch (err) { emailError = err.message; } }
  res.json({ client: summary(updated), emailed, emailError });
});

// Lets the client change their selection again (only the photographer can do this).
// While choosing, a deadline applies again: `days` from now (or the current deadline if that is later).
router.post('/:id/reopen', (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (c.done_notified_at) return res.status(400).json({ error: 'As fotos já foram entregues.' });
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Informe um número de dias entre 1 e 365.' });
  const until = Math.max(Date.parse(c.expires_at) || 0, Date.now() + days * DAY);
  db.prepare('UPDATE clients SET confirmed_at = NULL, expires_at = ?, reminder_sent_at = NULL WHERE id = ?').run(new Date(until).toISOString(), c.id);
  res.json(summary(getClient(c.id)));
});

// Upload proofs (?kind=proof) or edited photos (?kind=done), up to 30 files per request.
router.post('/:id/photos', (req, res, next) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  const kind = req.query.kind === 'done' ? 'done' : 'proof';
  if (kind === 'proof' && c.confirmed_at) return res.status(400).json({ error: 'O cliente já confirmou a seleção.' });
  req.client = c; req.kind = kind;
  next();
}, clientUpload.array('photos', 30), async (req, res) => {
  const { client: c, kind } = req;
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Nenhuma foto recebida.' });
  const label = `${getSettings().name || 'PROVA'} · PROVA`;
  let pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM client_photos WHERE client_id = ? AND kind = ?').get(c.id, kind).n;
  const insert = db.prepare('INSERT INTO client_photos (client_id, kind, file, original_name, bytes, position) VALUES (?, ?, ?, ?, ?, ?)');
  const created = [], failed = [];
  for (const f of files) {
    try {
      const file = await storePhoto(f.path, c.id, kind, label);
      const { lastInsertRowid } = insert.run(c.id, kind, file, f.originalname, f.size, pos++);
      created.push(photoOut(db.prepare('SELECT * FROM client_photos WHERE id = ?').get(lastInsertRowid)));
    } catch (err) {
      console.error(`Could not process ${f.originalname}:`, err.message);
      failed.push(f.originalname);
    }
  }
  res.status(created.length ? 201 : 400).json({ created, failed, error: created.length ? undefined : 'None of the files could be read as images.' });
});

router.delete('/:id/photos/:pid', (req, res) => {
  const c = getClient(req.params.id);
  const p = db.prepare('SELECT * FROM client_photos WHERE id = ? AND client_id = ?').get(req.params.pid, req.params.id);
  if (!c || !p) return res.status(404).json({ error: 'Foto não encontrada' });
  if (p.kind === 'proof' && c.confirmed_at && p.selected) return res.status(400).json({ error: 'Esta foto faz parte da seleção confirmada.' });
  db.prepare('DELETE FROM client_photos WHERE id = ?').run(p.id);
  removePhotoFiles(c.id, p.kind, p.file);
  res.json({ ok: true });
});

// Emails the client that the edited photos are ready. Delivering ends the selection phase,
// so from now on the access has no deadline (until the retention period after the first download).
router.post('/:id/notify-done', async (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (!c.access_sent_at) return res.status(400).json({ error: 'Envie o e-mail de acesso primeiro.' });
  const count = countPhotos(c.id).done || 0;
  if (!count) return res.status(400).json({ error: 'Envie as fotos editadas primeiro.' });
  db.prepare('UPDATE clients SET done_notified_at = ?, confirmed_at = COALESCE(confirmed_at, ?) WHERE id = ?').run(nowIso(), nowIso(), c.id);
  const updated = getClient(c.id);
  let emailed = false, emailError = null;
  try { emailed = (await sendDoneEmail(updated, count)).sent; } catch (err) { emailError = err.message; }
  res.json({ client: summary(updated), emailed, emailError });
});

router.get('/:id/selection.txt', (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).end();
  const names = db.prepare("SELECT original_name FROM client_photos WHERE client_id = ? AND kind = 'proof' AND selected = 1 ORDER BY position, id").all(c.id).map((r) => r.original_name);
  res.type('text/plain').set('Content-Disposition', `attachment; filename="selection-${c.username}.txt"`).send(names.join('\r\n') + '\r\n');
});

// ---- Contrato (PDF) ----
router.post('/:id/contract', (req, res, next) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  contractUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'O PDF pode ter no máximo 25 MB.' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Envie o contrato em PDF.' });
    try {
      await saveContract(req.file.path, c.id);
      db.prepare('UPDATE clients SET contract_name = ?, contract_uploaded_at = ? WHERE id = ?')
        .run(req.file.originalname.slice(0, 200), nowIso(), c.id);
      res.json(summary(getClient(c.id)));
    } catch (e) { next(e); }
  });
});

router.get('/:id/contract', (req, res) => {
  const c = getClient(req.params.id);
  if (!c?.contract_name) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.download(contractPath(c.id), c.contract_name);
});

router.delete('/:id/contract', (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  removeContract(c.id);
  db.prepare('UPDATE clients SET contract_name = NULL, contract_uploaded_at = NULL WHERE id = ?').run(c.id);
  res.json(summary(getClient(c.id)));
});

router.delete('/:id', (req, res) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  db.prepare('DELETE FROM client_photos WHERE client_id = ?').run(c.id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(c.id);
  removeClientFiles(c.id);
  res.json({ ok: true });
});

export default router;
