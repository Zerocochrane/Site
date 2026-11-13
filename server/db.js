import Database from './sqlite.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'portfolio.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    slug           TEXT NOT NULL UNIQUE,
    description    TEXT NOT NULL DEFAULT '',
    cover_photo_id INTEGER,
    position       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A group (e.g. "Weddings") holds subgroups (e.g. "Júlia & Rafa"); photos live in subgroups.
  CREATE TABLE IF NOT EXISTS subgroups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id       INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    slug           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    cover_photo_id INTEGER,
    position       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    width      INTEGER,
    height     INTEGER,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per day the photographer has opened (available) or that is taken (booked).
  -- Days with no row are simply not available.
  CREATE TABLE IF NOT EXISTS availability (
    date   TEXT PRIMARY KEY,               -- YYYY-MM-DD
    status TEXT NOT NULL CHECK (status IN ('available', 'booked'))
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL,
    phone          TEXT NOT NULL DEFAULT '',
    event_type     TEXT NOT NULL,
    event_date     TEXT NOT NULL,
    duration_hours REAL NOT NULL,
    message        TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'confirmed', 'declined')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// --- Migration: photos belong to groups (added in v1.1) ---------------------
const photoCols = db.prepare('PRAGMA table_info(photos)').all().map((c) => c.name);
if (!photoCols.includes('group_id')) {
  db.exec('ALTER TABLE photos ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_photos_group ON photos(group_id, position)');
// Photos uploaded before groups existed go into a first group so nothing is lost.
const orphans = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE group_id IS NULL').get().n;
if (orphans) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO groups (name, slug, position) VALUES ('Portfolio', ?, 0)")
    .run(`portfolio-${Date.now().toString(36)}`);
  db.prepare('UPDATE photos SET group_id = ? WHERE group_id IS NULL').run(lastInsertRowid);
}

// --- Migration: photos belong to subgroups (added in v1.2) -------------------
if (!db.prepare('PRAGMA table_info(photos)').all().some((c) => c.name === 'subgroup_id')) {
  db.exec('ALTER TABLE photos ADD COLUMN subgroup_id INTEGER REFERENCES subgroups(id) ON DELETE CASCADE');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_photos_subgroup ON photos(subgroup_id, position)');
db.exec('CREATE INDEX IF NOT EXISTS idx_subgroups_group ON subgroups(group_id, position)');
// Photos that sit directly in a group get a first subgroup with the group's name.
db.transaction(() => {
  const groupsWithLoosePhotos = db
    .prepare('SELECT DISTINCT g.id, g.name FROM groups g JOIN photos p ON p.group_id = g.id WHERE p.subgroup_id IS NULL')
    .all();
  for (const g of groupsWithLoosePhotos) {
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM subgroups WHERE group_id = ?').get(g.id).n;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO subgroups (group_id, name, slug, position) VALUES (?, ?, ?, ?)')
      .run(g.id, g.name, toSlug(g.name), pos);
    db.prepare('UPDATE photos SET subgroup_id = ? WHERE group_id = ? AND subgroup_id IS NULL').run(lastInsertRowid, g.id);
  }
})();

// --- Migration: watermarked portfolio photos (v1.5) --------------------------
// filename = public watermarked copy in uploads/; orig_file = original, kept privately.
{
  const pc = db.prepare('PRAGMA table_info(photos)').all().map((c) => c.name);
  if (!pc.includes('orig_file')) db.exec('ALTER TABLE photos ADD COLUMN orig_file TEXT');
  if (!pc.includes('wm')) db.exec('ALTER TABLE photos ADD COLUMN wm INTEGER NOT NULL DEFAULT 0');
}

// --- Migration: subgroup date (v1.9) -----------------------------------------
// event_date = 'YYYY-MM-DD' or '' (not set yet).
{
  const sc = db.prepare('PRAGMA table_info(subgroups)').all().map((c) => c.name);
  if (!sc.includes('event_date')) db.exec("ALTER TABLE subgroups ADD COLUMN event_date TEXT NOT NULL DEFAULT ''");
}

/** Accepts 'YYYY-MM-DD' (a real date) or '' — anything else returns null. */
export function cleanDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;
}

export function toSlug(name) {
  return (
    String(name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

// Group slugs are kept unique; links also carry the id, so renames never break them.
export function slugify(name, excludeId = 0) {
  const base = toSlug(name);
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM groups WHERE slug = ? AND id != ?').get(slug, excludeId); i++) slug = `${base}-${i}`;
  return slug;
}

const defaults = {
  name: 'Ana Lima',
  tagline: 'Fotografias que eternizam o momento.',
  about:
    'Fotografo casamentos, ensaios e eventos com um olhar sincero e espontâneo. Escolha uma data disponível na agenda e me conte sobre o seu dia.',
  instagram: '',
  whatsapp: '',      // número público para contato (com DDD)
  contactEmail: '',  // e-mail público para contato
  eventTypes: JSON.stringify(['Casamento', 'Ensaio fotográfico', 'Aniversário', 'Evento corporativo', 'Família', 'Outro']),
};
const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) insertDefault.run(k, v);

// v1.6: the site is in Portuguese. Replace the original English example texts — only if they were never edited.
const OLD_ENGLISH_DEFAULTS = {
  tagline: 'Photographs that hold the moment still.',
  about: 'I photograph weddings, portraits and events with an honest, unposed eye. Pick an open date on the calendar and tell me about your day.',
  eventTypes: JSON.stringify(['Wedding', 'Portrait session', 'Birthday', 'Corporate event', 'Family', 'Other']),
};
for (const [k, oldValue] of Object.entries(OLD_ENGLISH_DEFAULTS)) {
  db.prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?').run(defaults[k], k, oldValue);
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const { key, value } of rows) {
    out[key] = key === 'eventTypes' ? JSON.parse(value) : key === 'bookingBufferDays' ? Number(value) || 0 : value;
  }
  return out;
}

export default db;
