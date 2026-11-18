// Status do cliente (a linha do tempo do trabalho), mostrado com cores na lista de clientes.
//
// O status é a etapa MAIS AVANÇADA já alcançada. Etapas automáticas vêm dos dados do cliente;
// as manuais (manual: true) são marcadas pela fotógrafa e ficam guardadas com a data em
// `clients.manual_marks` (JSON { chave: data }). Assim, quando uma etapa automática posterior
// acontece, ela passa na frente sozinha; e desmarcar uma etapa manual volta para a anterior.
import db from './clientsDb.js';
import './signatures.js'; // colunas do contrato

const cols = db.prepare('PRAGMA table_info(clients)').all().map((c) => c.name);
if (!cols.includes('manual_marks')) db.exec("ALTER TABLE clients ADD COLUMN manual_marks TEXT NOT NULL DEFAULT '{}'");

/** Data de hoje em São Paulo, AAAA-MM-DD */
const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// ordem = ordem do trabalho. `at(c)` devolve a data em que a etapa automática aconteceu (ou null).
export const STATUSES = [
  { key: 'approved', at: (c) => c.created_at },
  { key: 'discussing', manual: true },
  { key: 'awaiting-signature', at: (c) => c.contract_sent_at },
  { key: 'awaiting-event', at: (c) => c.photographer_signed_at },
  { key: 'event-done', at: (c) => (c.event_date && c.event_date <= todaySP() ? c.event_date : null) },
  { key: 'backup', manual: true },
  { key: 'preselected', manual: true },
  { key: 'raw-uploaded', at: (c) => c.access_sent_at },
  { key: 'raw-selected', at: (c) => c.confirmed_at },
  { key: 'editing', manual: true },
  { key: 'edited-uploaded', at: (c) => c.done_notified_at },
  { key: 'downloaded', at: (c) => c.downloaded_at },
];
export const MANUAL_KEYS = STATUSES.filter((s) => s.manual).map((s) => s.key);

export const manualMarks = (c) => { try { return JSON.parse(c.manual_marks || '{}') || {}; } catch { return {}; } };

/** { status, index, autoIndex, steps: [{ key, manual, at, reached }] } */
export function clientStatus(c) {
  const marks = manualMarks(c);
  const steps = STATUSES.map((s) => ({ key: s.key, manual: !!s.manual, at: s.manual ? marks[s.key] || null : s.at(c) || null }));
  let autoIndex = 0, index = 0;
  steps.forEach((s, i) => {
    if (!s.at) return;
    if (!s.manual) autoIndex = i;
    index = i;
  });
  steps.forEach((s, i) => { s.reached = i <= index; });
  return { status: steps[index].key, index, autoIndex, steps };
}

/** Marca (on = true) ou desmarca uma etapa manual. */
export function setManualMark(c, key, on) {
  const marks = manualMarks(c);
  if (on) marks[key] = marks[key] || new Date().toISOString();
  else delete marks[key];
  db.prepare('UPDATE clients SET manual_marks = ? WHERE id = ?').run(JSON.stringify(marks), c.id);
}
