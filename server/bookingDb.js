// Agendamento: categorias personalizáveis, campos extras e regras de antecedência.
import crypto from 'node:crypto';
import db, { getSettings } from './db.js';

export const FIELD_TYPES = ['text', 'number', 'date', 'time', 'money'];
export const KINDS = ['event', 'photoshoot']; // evento | ensaio
export const REFERRAL_SOURCES = ['Instagram', 'Google', 'Indicação', 'Facebook', 'Outro'];
export const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('event', 'photoshoot')),
    has_duration INTEGER NOT NULL DEFAULT 1,   -- eventos: sempre 1
    fields       TEXT NOT NULL DEFAULT '[]',   -- [{ id, label, type, required }]
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Novas colunas dos pedidos (v1.7)
{
  const cols = db.prepare('PRAGMA table_info(inquiries)').all().map((c) => c.name);
  const add = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE inquiries ADD COLUMN ${name} ${def}`); };
  add('category_id', 'INTEGER');
  add('category_kind', "TEXT NOT NULL DEFAULT 'event'");
  add('referral_source', "TEXT NOT NULL DEFAULT ''");
  add('referral_name', "TEXT NOT NULL DEFAULT ''");
  add('referral_instagram', "TEXT NOT NULL DEFAULT ''");
  add('client_id', 'INTEGER');                    // cliente criado ao aceitar
  add('extra', "TEXT NOT NULL DEFAULT '[]'");       // respostas dos campos extras (com rótulo e tipo)
  add('estimated_month', "TEXT NOT NULL DEFAULT ''"); // pedido sem data: previsão 'AAAA-MM' (opcional)
}

// Antecedência mínima padrão
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('bookingBufferDays', '0')").run();

// Primeira vez: os antigos "tipos de evento" viram categorias.
if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  let types = [];
  try { types = getSettings().eventTypes || []; } catch { /* ignore */ }
  if (!types.length) types = ['Casamento', 'Ensaio fotográfico', 'Aniversário', 'Evento corporativo', 'Família'];
  const insert = db.prepare('INSERT INTO categories (name, kind, has_duration, position) VALUES (?, ?, ?, ?)');
  types.filter((t) => !/^outro$/i.test(t)).forEach((t, i) => {
    const shoot = /ensaio|retrato|book|fam[ií]lia/i.test(t);
    insert.run(t, shoot ? 'photoshoot' : 'event', shoot ? 0 : 1, i);
  });
}

export const newFieldId = () => `f${crypto.randomBytes(4).toString('hex')}`;

export function shapeCategory(c) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    hasDuration: c.kind === 'event' ? true : !!c.has_duration,
    fields: JSON.parse(c.fields || '[]'),
    position: c.position,
  };
}

export const listCategories = () => db.prepare('SELECT * FROM categories ORDER BY position, id').all().map(shapeCategory);
export const getCategory = (id) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  return c ? shapeCategory(c) : null;
};

/** Primeira data que o cliente pode escolher (hoje + antecedência), no fuso de Brasília. */
export function earliestBookableDate() {
  const days = Number(getSettings().bookingBufferDays || 0);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); // AAAA-MM-DD
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Valida a resposta de um campo extra conforme o tipo. Retorna [valor, erro]. */
export function parseFieldValue(field, raw) {
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!v) return [null, field.required ? 'Campo obrigatório.' : null];
  switch (field.type) {
    case 'number': {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? [n, null] : [null, 'Informe um número.'];
    }
    case 'money': {
      const clean = v.replace(/[R$\s]/g, '');
      const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
      const n = Number(normalized);
      return Number.isFinite(n) && n >= 0 ? [Math.round(n * 100) / 100, null] : [null, 'Informe um valor em reais.'];
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? [v, null] : [null, 'Informe uma data válida.'];
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? [v, null] : [null, 'Informe um horário válido.'];
    default:
      return [v.slice(0, 1000), null];
  }
}

export function validateCategoryInput(b, { partial = false } = {}) {
  const out = {}, errors = {};
  if (!partial || b.name !== undefined) {
    out.name = String(b.name || '').trim().slice(0, 80);
    if (!out.name) errors.name = 'Dê um nome à categoria.';
  }
  if (!partial || b.kind !== undefined) {
    out.kind = KINDS.includes(b.kind) ? b.kind : null;
    if (!out.kind) errors.kind = 'Escolha se é evento ou ensaio.';
  }
  if (!partial || b.hasDuration !== undefined) out.has_duration = b.hasDuration ? 1 : 0;
  if (out.kind === 'event') out.has_duration = 1; // eventos sempre pedem duração
  if (!partial || b.fields !== undefined) {
    const list = Array.isArray(b.fields) ? b.fields.slice(0, 30) : [];
    const fields = [];
    list.forEach((f, i) => {
      const label = String(f?.label || '').trim().slice(0, 80);
      const type = FIELD_TYPES.includes(f?.type) ? f.type : null;
      if (!label) errors[`field${i}`] = 'Dê um nome ao campo.';
      else if (!type) errors[`field${i}`] = 'Escolha o tipo de resposta.';
      else fields.push({ id: /^f[0-9a-f]{8}$/.test(f.id || '') ? f.id : newFieldId(), label, type, required: !!f.required });
    });
    out.fields = JSON.stringify(fields);
  }
  return { out, errors };
}
