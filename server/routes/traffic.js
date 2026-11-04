// Página Tráfego do painel: visitas por mês + de onde vêm os visitantes.
import { Router } from 'express';
import db, { tzMonth, RETENTION_MONTHS } from '../trafficDb.js';
import { requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAdmin);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const monthName = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const NOT_ALLOWED = 'Não permitiu rastreamento';

function placeLabel(v) {
  if (v.location_status === 'allowed') {
    if (v.country === 'Brasil') return [v.city, v.region].filter(Boolean).join(', ');
    return [v.city, v.country].filter(Boolean).join(', ');
  }
  if (v.location_status === 'unavailable') return 'Localização indisponível';
  return NOT_ALLOWED; // recusou ou não respondeu ao pedido
}

router.get('/', (req, res) => {
  const current = tzMonth();
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : current;
  const to = month > current ? month : current;
  const from = shiftMonth(to, -11);

  const per = db.prepare(`SELECT month, COUNT(*) AS visits, COUNT(DISTINCT visitor) AS visitors, SUM(pages) AS pages
    FROM visits WHERE month BETWEEN ? AND ? GROUP BY month`).all(from, to);
  const by = Object.fromEntries(per.map((r) => [r.month, r]));
  const chart = Array.from({ length: 12 }, (_, i) => {
    const m = shiftMonth(from, i);
    return { month: m, visits: by[m]?.visits || 0, visitors: by[m]?.visitors || 0, pages: by[m]?.pages || 0 };
  });

  const rows = db.prepare('SELECT * FROM visits WHERE month = ? ORDER BY started_at DESC').all(month);
  const places = new Map();
  for (const v of rows) {
    const label = placeLabel(v);
    const p = places.get(label) || { place: label, tracked: v.location_status === 'allowed', visits: 0, visitors: new Set(), last: v.started_at };
    p.visits++;
    p.visitors.add(v.visitor);
    if (v.started_at > p.last) p.last = v.started_at;
    places.set(label, p);
  }
  const locations = [...places.values()]
    .map((p) => ({ place: p.place, tracked: p.tracked, visits: p.visits, visitors: p.visitors.size, last: p.last }))
    .sort((a, b) => (a.tracked === b.tracked ? b.visits - a.visits : a.tracked ? -1 : 1));

  const tracked = rows.filter((v) => v.location_status === 'allowed').length;
  const first = db.prepare('SELECT MIN(month) AS m FROM visits').get().m;
  res.json({
    month,
    monthLabel: monthName(month),
    currentMonth: current,
    firstMonth: first || current,
    retentionMonths: RETENTION_MONTHS,
    chart,
    totals: {
      visits: rows.length,
      visitors: new Set(rows.map((v) => v.visitor)).size,
      pages: rows.reduce((n, v) => n + v.pages, 0),
      tracked,
      mobile: rows.filter((v) => v.device !== 'Computador').length,
    },
    locations,
    recent: rows.slice(0, 200).map((v) => ({
      id: v.id,
      at: v.started_at,
      place: placeLabel(v),
      tracked: v.location_status === 'allowed',
      device: v.device,
      landing: v.landing_path,
      pages: v.pages,
      referrer: v.referrer,
    })),
  });
});

export default router;
