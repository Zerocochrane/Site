import db from './db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,
    email              TEXT NOT NULL,
    username           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash      TEXT,                 -- NULL until access is sent
    selection_limit    INTEGER NOT NULL,
    days               INTEGER NOT NULL,     -- length of the selection period
    access_sent_at     TEXT,                 -- when the login email was sent (period starts)
    expires_at         TEXT,                 -- login is blocked after this moment
    confirmed_at       TEXT,                 -- selection confirmed (locked)
    reminder_sent_at   TEXT,                 -- "2 days left" email
    done_notified_at   TEXT,                 -- "your photos are ready" email
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS client_photos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('proof', 'done')),
    file          TEXT NOT NULL,             -- stored file name (same name in each variant folder)
    original_name TEXT NOT NULL,
    bytes         INTEGER NOT NULL DEFAULT 0,
    selected      INTEGER NOT NULL DEFAULT 0,
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_client_photos ON client_photos(client_id, kind, position);
`);

// v1.4: retention after the first download
const cols = db.prepare('PRAGMA table_info(clients)').all().map((c) => c.name);
if (!cols.includes('downloaded_at')) db.exec('ALTER TABLE clients ADD COLUMN downloaded_at TEXT');   // first .zip download
if (!cols.includes('phone')) db.exec("ALTER TABLE clients ADD COLUMN phone TEXT NOT NULL DEFAULT ''"); // WhatsApp
// v1.9: evento, pagamento e contrato (página Financeiro)
for (const [name, def] of [
  ['event_type', "TEXT NOT NULL DEFAULT ''"],   // categoria/evento contratado
  ['event_date', 'TEXT'],                       // AAAA-MM-DD — define o mês da receita
  ['duration_hours', 'REAL'],
  ['payment_method', "TEXT NOT NULL DEFAULT ''"],
  ['amount_paid', 'REAL'],                      // em reais
  ['installments', 'INTEGER'],
  ['contract_name', 'TEXT'],                    // nome original do PDF (arquivo em private/clients/<id>/contract.pdf)
  ['contract_uploaded_at', 'TEXT'],
  ['notes', "TEXT NOT NULL DEFAULT ''"],          // anotações (ex.: respostas do pedido de agendamento)
  ['inquiry_id', 'INTEGER'],                    // pedido que originou o cliente
]) if (!cols.includes(name)) db.exec(`ALTER TABLE clients ADD COLUMN ${name} ${def}`);
export const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Transferência', 'Boleto'];
if (!cols.includes('archived_at')) db.exec('ALTER TABLE clients ADD COLUMN archived_at TEXT'); // fotos excluídas, dados mantidos
if (!cols.includes('delete_after')) db.exec('ALTER TABLE clients ADD COLUMN delete_after TEXT');     // everything is deleted after this

export const RETENTION_MONTHS = 6;
export const nowIso = () => new Date().toISOString();
export const addMonths = (date, n) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; };

/**
 * Can the client still log in?
 * - Before confirming: only until the selection deadline (expires_at).
 * - After confirming (or once photos are delivered): no deadline at all...
 * - ...until the retention period after their first download ends (then the data is deleted).
 */
export function isExpired(c) {
  if (c.archived_at) return true; // fotos já excluídas: login bloqueado para sempre
  if (c.delete_after) return Date.parse(c.delete_after) <= Date.now();
  if (c.confirmed_at) return false;
  if (c.access_sent_at) return !c.expires_at || Date.parse(c.expires_at) <= Date.now(); // escolhendo as fotos
  // Contrato: até o cliente assinar vale o prazo para assinar; depois o prazo para (espera as fotos).
  if (c.client_signed_at) return false;
  if (c.contract_sent_at) return !c.sign_deadline || Date.parse(c.sign_deadline) <= Date.now();
  return true;
}

export const getClient = (id) => db.prepare('SELECT * FROM clients WHERE id = ?').get(id);

export const countPhotos = (clientId) =>
  db.prepare(`SELECT
      SUM(kind = 'proof') AS proofs,
      SUM(kind = 'done') AS done,
      SUM(kind = 'proof' AND selected = 1) AS selected
    FROM client_photos WHERE client_id = ?`).get(clientId);

export const clientPhotos = (clientId, kind) =>
  db.prepare('SELECT * FROM client_photos WHERE client_id = ? AND kind = ? ORDER BY position, id').all(clientId, kind);

/** Overall stage shown in the admin. */
export function stage(c) {
  if (c.archived_at) return 'archived';
  if (c.done_notified_at) return 'delivered';
  if (c.confirmed_at) return 'confirmed';
  if (c.access_sent_at) return isExpired(c) ? 'expired' : 'selecting';
  if (c.photographer_signed_at) return 'signed';          // contrato completo, aguardando as fotos
  if (c.client_signed_at) return 'to-sign';                // falta a assinatura da fotógrafa
  if (c.contract_sent_at) return isExpired(c) ? 'sign-expired' : 'signing';
  return 'draft';
}

export default db;
