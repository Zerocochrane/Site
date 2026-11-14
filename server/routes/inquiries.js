import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import { sendInquiryEmails } from '../mail.js';
import { getCategory, parseFieldValue, earliestBookableDate, REFERRAL_SOURCES, DURATIONS } from '../bookingDb.js';
import { googleCalendarUrl } from '../calendarLink.js';
import { clientFromInquiry } from '../inquiryClient.js';
import { getClient } from '../clientsDb.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limite simples em memória, por IP, a cada 10 minutos:
// - 5 pedidos ENVIADOS (salvos). Tentativas com erro no formulário não contam — quem erra um campo não fica bloqueado;
// - 40 tentativas no total (proteção contra robôs).
const WINDOW = 10 * 60 * 1000;
const sent = new Map();
const tries = new Map();
const recent = (map, ip, now) => (map.get(ip) || []).filter((t) => now - t < WINDOW);
function rateLimit(req, res, next) {
  const now = Date.now();
  const t = recent(tries, req.ip, now);
  if (t.length >= 40 || recent(sent, req.ip, now).length >= 5) {
    return res.status(429).json({ error: 'Muitos pedidos. Tente novamente em alguns minutos.' });
  }
  t.push(now);
  tries.set(req.ip, t);
  if (tries.size > 5000) { tries.clear(); sent.clear(); }
  next();
}
const countSent = (ip) => { const now = Date.now(); const l = recent(sent, ip, now); l.push(now); sent.set(ip, l); };

export function shapeInquiry(r) {
  const inq = { ...r, extra: JSON.parse(r.extra || '[]') };
  inq.calendarUrl = googleCalendarUrl(inq);
  const client = r.client_id ? getClient(r.client_id) : null;
  inq.client = client ? { id: client.id, name: client.name, username: client.username } : null;
  return inq;
}

router.post('/', rateLimit, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true }); // armadilha para robôs

  const errors = {};
  const category = getCategory(Number(b.categoryId));
  if (!category) errors.categoryId = 'Escolha uma categoria.';

  const inq = {
    name: String(b.name || '').trim().slice(0, 120),
    email: String(b.email || '').trim().slice(0, 200),
    phone: String(b.phone || '').trim().slice(0, 40),
    event_date: b.noDate ? '' : String(b.eventDate || ''),
    message: String(b.message || '').trim().slice(0, 3000),
    referral_source: String(b.referralSource || '').trim(),
    referral_name: '',
    referral_instagram: '',
    category_id: category?.id ?? null,
    event_type: category?.name ?? '',
    category_kind: category?.kind ?? 'event',
    duration_hours: 0,
    extra: '[]',
    estimated_month: '',
  };

  if (!inq.name) errors.name = 'Informe o seu nome.';
  if (!EMAIL_RE.test(inq.email)) errors.email = 'Informe um e-mail válido.';
  if (inq.phone.replace(/\D/g, '').length < 8) errors.phone = 'Informe um telefone com DDD.';

  if (inq.referral_source && !REFERRAL_SOURCES.includes(inq.referral_source)) inq.referral_source = 'Outro';
  if (inq.referral_source === 'Indicação') {
    inq.referral_name = String(b.referralName || '').trim().slice(0, 120);
    inq.referral_instagram = String(b.referralInstagram || '').trim().replace(/^@+/, '').slice(0, 60);
    if (!inq.referral_name) errors.referralName = 'Quem indicou?';
  }

  if (category?.hasDuration) {
    const d = Number(b.durationHours);
    if (!DURATIONS.includes(d)) errors.durationHours = 'Escolha a duração.';
    else inq.duration_hours = d;
  }

  if (category) {
    const answers = b.extra && typeof b.extra === 'object' ? b.extra : {};
    const extra = [];
    for (const f of category.fields) {
      const [value, err] = parseFieldValue(f, answers[f.id]);
      if (err) errors[`extra.${f.id}`] = err;
      else if (value !== null) extra.push({ id: f.id, label: f.label, type: f.type, value });
    }
    inq.extra = JSON.stringify(extra);
  }

  // Pedido sem data: previsão opcional de mês/ano ('AAAA-MM'), a partir do mês atual
  if (b.noDate && b.estimatedMonth) {
    const ym = String(b.estimatedMonth);
    const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
    const [y, m] = now.split('-').map(Number);
    const max = `${y + 5}-${String(m).padStart(2, '0')}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || ym < now || ym > max) errors.estimatedMonth = 'Escolha um mês a partir deste.';
    else inq.estimated_month = ym;
  }

  if (!b.noDate) { // sem data = "ainda não tenho data / só quero um orçamento"
    const earliest = earliestBookableDate();
    const day = db.prepare('SELECT status FROM availability WHERE date = ?').get(inq.event_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inq.event_date) || inq.event_date < earliest || day?.status !== 'available') {
      errors.eventDate = 'Essa data não está disponível. Escolha outra.';
    }
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Confira o formulário.', errors });

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO inquiries (name, email, phone, event_type, event_date, duration_hours, message,
         category_id, category_kind, referral_source, referral_name, referral_instagram, extra, estimated_month)
       VALUES (@name, @email, @phone, @event_type, @event_date, @duration_hours, @message,
         @category_id, @category_kind, @referral_source, @referral_name, @referral_instagram, @extra, @estimated_month)`
    )
    .run(inq);

  countSent(req.ip);
  const saved = shapeInquiry(db.prepare('SELECT * FROM inquiries WHERE id = ?').get(lastInsertRowid));
  try {
    await sendInquiryEmails(saved);
  } catch (err) {
    console.error('Não foi possível enviar o e-mail:', err.message); // o pedido continua salvo no painel
  }
  res.status(201).json({ ok: true, id: lastInsertRowid });
});

router.get('/', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC, id DESC').all().map(shapeInquiry));
});

router.get('/:id', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(shapeInquiry(r));
});

// Muda o status. Aceitar (confirmed) também marca o dia como reservado e cria o cliente.
router.patch('/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'replied', 'confirmed', 'declined'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const inq = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inq) return res.status(404).json({ error: 'Pedido não encontrado' });
  db.transaction(() => {
    db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, inq.id);
    if (status === 'confirmed' && inq.event_date) {
      db.prepare(
        "INSERT INTO availability (date, status) VALUES (?, 'booked') ON CONFLICT(date) DO UPDATE SET status = 'booked'"
      ).run(inq.event_date);
    }
    if (status === 'confirmed') clientFromInquiry(inq); // uma vez só: se o cliente já existe, nada muda
  })();
  res.json(shapeInquiry(db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inq.id)));
});

// Cria o cliente de um pedido já aceito (pedidos aceitos antes desta função, ou cliente excluído).
router.post('/:id/client', requireAdmin, (req, res) => {
  const inq = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inq) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (inq.status !== 'confirmed') return res.status(409).json({ error: 'Aceite o pedido antes de criar o cliente.' });
  clientFromInquiry(inq);
  res.json(shapeInquiry(db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inq.id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
