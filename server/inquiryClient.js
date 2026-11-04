// Pedido aceito → cliente. Copia nome, contato, evento, data, duração e o resto do pedido (em "Anotações").
import db, { getClient } from './clientsDb.js';
import './bookingDb.js'; // colunas de inquiries (inclui client_id)
import { formatExtraValue } from './calendarLink.js';
import { REFERRAL_TEXT } from './mail.js';

export const DEFAULT_SELECTION_LIMIT = 30;
export const DEFAULT_DAYS = 7;

const slugLogin = (name) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 34) || 'cliente';

/** Login livre a partir do nome: maria.souza, maria.souza2, maria.souza3… */
export function uniqueLogin(name) {
  let base = slugLogin(name);
  if (base.length < 3) base = `${base}.cliente`.slice(0, 34);
  const taken = db.prepare('SELECT 1 FROM clients WHERE username = ?');
  for (let i = 1; ; i++) {
    const login = i === 1 ? base : `${base}${i}`;
    if (!taken.get(login)) return login;
  }
}

/** Texto das anotações: tudo do pedido que não tem campo próprio na ficha do cliente. */
export function inquiryNotes(inq) {
  const extra = JSON.parse(inq.extra || '[]');
  const lines = [
    `Pedido de agendamento nº ${inq.id} (${new Date(`${inq.created_at}Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`,
    ...extra.map((f) => `${f.label}: ${formatExtraValue(f)}`),
    inq.referral_source ? `Como conheceu: ${REFERRAL_TEXT(inq)}` : '',
    inq.message ? `Observações: ${inq.message}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Cria (uma única vez) o cliente de um pedido. Devolve a linha do cliente. */
export function clientFromInquiry(inq) {
  if (inq.client_id) {
    const existing = getClient(inq.client_id);
    if (existing) return existing;
  }
  return db.transaction(() => {
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO clients (name, email, phone, username, selection_limit, days, event_type, event_date, duration_hours, notes, inquiry_id)
       VALUES (@name, @email, @phone, @username, @limit, @days, @event_type, @event_date, @duration, @notes, @inquiry_id)`
    ).run({
      name: inq.name,
      email: inq.email,
      phone: inq.phone || '',
      username: uniqueLogin(inq.name),
      limit: DEFAULT_SELECTION_LIMIT,
      days: DEFAULT_DAYS,
      event_type: inq.event_type || '',
      event_date: inq.event_date || null,
      duration: inq.duration_hours > 0 ? inq.duration_hours : null,
      notes: inquiryNotes(inq),
      inquiry_id: inq.id,
    });
    db.prepare('UPDATE inquiries SET client_id = ? WHERE id = ?').run(Number(lastInsertRowid), inq.id);
    return getClient(lastInsertRowid);
  })();
}
