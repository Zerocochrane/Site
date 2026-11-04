// Visitas do site público (página Tráfego do painel).
// Privacidade (LGPD): não guardamos IP nem coordenadas exatas — só um id aleatório do navegador,
// a cidade aproximada (quando o visitante permite) e dados gerais da visita. Visitas com mais de
// RETENTION_MONTHS meses são apagadas automaticamente.
import { createRequire } from 'node:module';
import db from './db.js';

export const RETENTION_MONTHS = 24;

db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor         TEXT NOT NULL,                 -- id aleatório guardado no navegador
    month           TEXT NOT NULL,                 -- AAAA-MM (horário de Brasília)
    started_at      TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL,
    landing_path    TEXT NOT NULL DEFAULT '/',
    pages           INTEGER NOT NULL DEFAULT 1,
    device          TEXT NOT NULL DEFAULT '',      -- Celular | Tablet | Computador
    referrer        TEXT NOT NULL DEFAULT '',      -- só o domínio de origem
    location_status TEXT NOT NULL DEFAULT 'pending' CHECK (location_status IN ('pending','allowed','denied','unavailable')),
    city            TEXT NOT NULL DEFAULT '',
    region          TEXT NOT NULL DEFAULT '',
    country         TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_visits_month ON visits(month);
`);

export const tzMonth = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d).slice(0, 7);
export const nowIso = () => new Date().toISOString();

// GeoNames admin1 → sigla do estado (Brasil)
const UF = { '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF', '08': 'ES', '11': 'MS', '13': 'MA',
  '14': 'MT', '15': 'MG', '16': 'PA', '17': 'PB', '18': 'PR', '20': 'PI', '21': 'RJ', '22': 'RN', '23': 'RS', '24': 'RO', '25': 'RR',
  '26': 'SC', '27': 'SP', '28': 'SE', '29': 'GO', '30': 'PE', '31': 'TO' };
const countryName = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

// Base offline de cidades (GeoNames, cidades com 1.000+ habitantes) — carregada só no primeiro uso.
let cities = null;
const loadCities = () => (cities ??= createRequire(import.meta.url)('all-the-cities'));

/** Cidade mais próxima de uma coordenada, sem chamar serviços externos. */
export function nearestCity(lat, lon) {
  const list = loadCities();
  const k = Math.cos((lat * Math.PI) / 180);
  let best = null, bestD = Infinity;
  for (const c of list) {
    const [clon, clat] = c.loc.coordinates;
    const d = (clat - lat) ** 2 + ((clon - lon) * k) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best || bestD > 4) return null; // > ~200 km de qualquer cidade (mar aberto etc.)
  let country = best.country;
  try { country = countryName.of(best.country) || best.country; } catch { /* código desconhecido */ }
  return {
    city: best.name,
    region: best.country === 'BR' ? UF[best.adminCode] || '' : '',
    country,
    countryCode: best.country,
  };
}

export function purgeOldVisits() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return db.prepare('DELETE FROM visits WHERE started_at < ?').run(d.toISOString()).changes;
}

export default db;
