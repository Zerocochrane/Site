// Registro de visitas do site público (chamado pelo navegador do visitante).
import { Router } from 'express';
import db, { tzMonth, nowIso, nearestCity } from '../trafficDb.js';
import { sign, safeEqual } from '../auth.js';

const router = Router();
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch/i;

// Limite simples: 60 chamadas por IP por minuto
const hits = new Map();
router.use((req, res, next) => {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 60) return res.status(429).json({ error: 'Muitas requisições.' });
  list.push(now);
  hits.set(req.ip, list);
  if (hits.size > 5000) hits.clear();
  next();
});

const cleanPath = (p) => String(p || '/').split(/[?#]/)[0].slice(0, 200) || '/';
const visitToken = (id) => sign(`visit:${id}`);
function ownVisit(b) {
  const id = Number(b?.id);
  if (!Number.isInteger(id) || !safeEqual(String(b?.token || ''), visitToken(id))) return null;
  return db.prepare('SELECT * FROM visits WHERE id = ?').get(id) || null;
}
function device(ua) {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'Celular';
  return 'Computador';
}
function refHost(ref, host) {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    return h && h !== String(host || '').split(':')[0].replace(/^www\./, '') ? h.slice(0, 100) : '';
  } catch { return ''; }
}

// Nova visita
router.post('/visit', (req, res) => {
  const ua = req.get('user-agent') || '';
  if (BOT_RE.test(ua)) return res.json({ ignored: true });
  const b = req.body || {};
  const visitor = /^[a-z0-9]{8,32}$/i.test(b.visitor || '') ? b.visitor : 'anon';
  const now = nowIso();
  const status = b.consent === 'denied' ? 'denied' : 'pending';
  const { lastInsertRowid: id } = db.prepare(
    `INSERT INTO visits (visitor, month, started_at, last_seen_at, landing_path, device, referrer, location_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(visitor, tzMonth(), now, now, cleanPath(b.path), device(ua), refHost(b.referrer, req.get('host')), status);
  res.json({ id: Number(id), token: visitToken(id) });
});

// Mais uma página na mesma visita
router.post('/page', (req, res) => {
  const v = ownVisit(req.body);
  if (!v) return res.status(404).json({ error: 'Visita não encontrada' });
  db.prepare('UPDATE visits SET pages = pages + 1, last_seen_at = ? WHERE id = ?').run(nowIso(), v.id);
  res.json({ ok: true });
});

// Localização: { lat, lon } quando o visitante permite; { denied: true } ou { unavailable: true } caso contrário
router.post('/location', (req, res) => {
  const v = ownVisit(req.body);
  if (!v) return res.status(404).json({ error: 'Visita não encontrada' });
  const b = req.body;
  if (b.denied || b.unavailable) {
    db.prepare("UPDATE visits SET location_status = ?, city = '', region = '', country = '' WHERE id = ?")
      .run(b.denied ? 'denied' : 'unavailable', v.id);
    return res.json({ ok: true });
  }
  const lat = Number(b.lat), lon = Number(b.lon);
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return res.status(400).json({ error: 'Coordenadas inválidas' });
  // arredonda (~10 km) antes de procurar a cidade; a coordenada não é guardada
  const place = nearestCity(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
  if (!place) {
    db.prepare("UPDATE visits SET location_status = 'unavailable' WHERE id = ?").run(v.id);
    return res.json({ ok: true });
  }
  db.prepare("UPDATE visits SET location_status = 'allowed', city = ?, region = ?, country = ? WHERE id = ?")
    .run(place.city, place.region, place.country, v.id);
  res.json({ ok: true, city: place.city });
});

export default router;
