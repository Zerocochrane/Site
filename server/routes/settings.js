import { Router } from 'express';
import db, { getSettings } from '../db.js';
import { requireAdmin } from '../auth.js';
import { earliestBookableDate } from '../bookingDb.js';

const router = Router();

const withBooking = () => ({ ...getSettings(), earliestBookableDate: earliestBookableDate() });

router.get('/', (_req, res) => res.json(withBooking()));

router.put('/', requireAdmin, (req, res) => {
  const b = req.body || {};
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const key of ['name', 'tagline', 'about', 'instagram', 'whatsapp', 'contactEmail']) {
      if (typeof b[key] === 'string') set.run(key, b[key].slice(0, 2000));
    }
    if (b.bookingBufferDays !== undefined) {
      const n = Math.max(0, Math.min(365, Math.floor(Number(b.bookingBufferDays) || 0)));
      set.run('bookingBufferDays', String(n));
    }
    if (Array.isArray(b.eventTypes)) {
      const types = b.eventTypes.map((t) => String(t).trim()).filter(Boolean).slice(0, 30);
      if (types.length) set.run('eventTypes', JSON.stringify(types));
    }
  })();
  res.json(withBooking());
});

export default router;
