// Background jobs:
//  - "2 days left" reminders for clients who haven't confirmed their selection
//  - deleting clients (and all their files) whose retention period has ended
import db, { nowIso } from './clientsDb.js';
import { removeClientPhotoFiles } from './clientFiles.js';
import { purgeOldVisits } from './trafficDb.js';
import { sendReminderEmail, sendSignReminderEmail } from './clientEmails.js';
import './signatures.js'; // colunas do contrato

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

export async function sendDueReminders() {
  const now = Date.now();
  const due = db.prepare(`
    SELECT * FROM clients
    WHERE access_sent_at IS NOT NULL AND confirmed_at IS NULL AND reminder_sent_at IS NULL AND expires_at IS NOT NULL
  `).all().filter((c) => {
    const left = Date.parse(c.expires_at) - now;
    return left > 0 && left <= TWO_DAYS;
  });
  for (const c of due) {
    try {
      await sendReminderEmail(c);
      db.prepare('UPDATE clients SET reminder_sent_at = ? WHERE id = ?').run(nowIso(), c.id);
      console.log(`Reminder sent to ${c.email}`);
    } catch (err) {
      console.error(`Could not send reminder to ${c.email}:`, err.message);
    }
  }
  // contrato esperando a assinatura do cliente
  const toSign = db.prepare(`
    SELECT * FROM clients
    WHERE contract_sent_at IS NOT NULL AND client_signed_at IS NULL AND sign_reminder_sent_at IS NULL AND sign_deadline IS NOT NULL AND archived_at IS NULL
  `).all().filter((c) => {
    const left = Date.parse(c.sign_deadline) - now;
    return left > 0 && left <= TWO_DAYS;
  });
  for (const c of toSign) {
    try {
      await sendSignReminderEmail(c);
      db.prepare('UPDATE clients SET sign_reminder_sent_at = ? WHERE id = ?').run(nowIso(), c.id);
      console.log(`Contract reminder sent to ${c.email}`);
    } catch (err) {
      console.error(`Could not send contract reminder to ${c.email}:`, err.message);
    }
  }
  return due.length + toSign.length;
}

/**
 * When a client's retention period (6 months after the first download) ends:
 * deletes all their photos and blocks the login, but KEEPS the client record
 * (name, contact, event, payment) and the contract PDF for the finance history.
 */
export function purgeExpiredClients() {
  const due = db.prepare('SELECT id, name, username FROM clients WHERE delete_after IS NOT NULL AND delete_after <= ? AND archived_at IS NULL').all(nowIso());
  for (const c of due) {
    db.transaction(() => {
      db.prepare('DELETE FROM client_photos WHERE client_id = ?').run(c.id);
      db.prepare('UPDATE clients SET archived_at = ?, password_hash = NULL WHERE id = ?').run(nowIso(), c.id);
    })();
    removeClientPhotoFiles(c.id);
    console.log(`Retention period ended: deleted the photos of ${c.name} (${c.username}); payment data and contract kept.`);
  }
  return due.length;
}

export function startScheduler() {
  const run = () => {
    sendDueReminders().catch((e) => console.error('Reminder job failed:', e.message));
    try { purgeExpiredClients(); } catch (e) { console.error('Clean-up job failed:', e.message); }
    try { purgeOldVisits(); } catch (e) { console.error('Visit clean-up failed:', e.message); }
  };
  setTimeout(run, 10_000);              // shortly after start
  setInterval(run, 30 * 60 * 1000);     // then every 30 minutes
}
