import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// GET /api/availability?from=2026-10-01&to=2026-12-31
router.get('/', (req, res) => {
  const { from = '0000-01-01', to = '9999-12-31' } = req.query;
  const rows = db.prepare('SELECT date, status FROM availability WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to);
  res.json(rows);
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
