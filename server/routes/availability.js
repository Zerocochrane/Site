import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import { earliestBookableDate } from '../bookingDb.js';

const router = Router();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// GET /api/availability?from=2026-10-01&to=2026-12-31
router.get('/', (req, res) => {
  const { from = '0000-01-01', to = '9999-12-31' } = req.query;
  const rows = db.prepare('SELECT date, status FROM availability WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to);
  res.json(rows);
});

// GET /api/availability/next?after=2026-11-30 → { date: '2027-01-21' | null }
// Primeiro dia livre (a partir do prazo mínimo de antecedência e depois de "after", se informado).
router.get('/next', (req, res) => {
  const earliest = earliestBookableDate();
  const after = isDate(String(req.query.after || '')) ? String(req.query.after) : '';
  const from = after && after >= earliest ? after : earliest;
  const op = after && after >= earliest ? '>' : '>=';
  const row = db.prepare(`SELECT date FROM availability WHERE status = 'available' AND date ${op} ? ORDER BY date LIMIT 1`).get(from);
  res.json({ date: row?.date || null });
});

// Set many days at once: { dates: ['2026-11-02', ...], status: 'available' | 'booked' | 'closed' }
router.put('/', requireAdmin, (req, res) => {
  const { dates, status } = req.body || {};
  if (!Array.isArray(dates) || !dates.every(isDate)) return res.status(400).json({ error: 'Datas inválidas' });
  if (!['available', 'booked', 'closed'].includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const upsert = db.prepare(
    'INSERT INTO availability (date, status) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET status = excluded.status'
  );
  const remove = db.prepare('DELETE FROM availability WHERE date = ?');
  db.transaction(() => dates.forEach((d) => (status === 'closed' ? remove.run(d) : upsert.run(d, status))))();
  res.json({ ok: true });
});

export default router;
