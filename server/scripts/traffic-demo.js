// Visitas de demonstração para testar a página Tráfego.
//   npm run demo:traffic          → cria visitas fictícias dos últimos 6 meses
//   npm run demo:traffic:remove   → apaga só as visitas de demonstração
import db, { tzMonth } from '../trafficDb.js';

const removed = db.prepare("DELETE FROM visits WHERE visitor LIKE 'demo%'").run().changes;
if (process.argv.includes('--remove')) {
  console.log(`${removed} visita(s) de demonstração removida(s).`);
  process.exit(0);
}

let seed = 20261103;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const PLACES = [
  ['Juiz de Fora', 'MG', 'Brasil', 30], ['Belo Horizonte', 'MG', 'Brasil', 8], ['Rio de Janeiro', 'RJ', 'Brasil', 8],
  ['São Paulo', 'SP', 'Brasil', 6], ['Petrópolis', 'RJ', 'Brasil', 3], ['Barbacena', 'MG', 'Brasil', 3], ['Muriaé', 'MG', 'Brasil', 2],
  ['Brasília', 'DF', 'Brasil', 2], ['Lisboa', '', 'Portugal', 1],
];
const weighted = PLACES.flatMap((p) => Array(p[3]).fill(p));
const PATHS = ['/', '/', '/', '/availability', '/work/1-casamentos', '/work/2-ensaios'];
const REFS = ['', '', '', 'instagram.com', 'google.com', 'l.facebook.com'];
const insert = db.prepare(`INSERT INTO visits (visitor, month, started_at, last_seen_at, landing_path, pages, device, referrer, location_status, city, region, country)
  VALUES (@visitor, @month, @at, @at, @landing, @pages, @device, @ref, @status, @city, @region, @country)`);

const now = Date.now();
let n = 0;
const visitors = Array.from({ length: 160 }, (_, i) => `demo${String(i).padStart(6, '0')}`);
db.transaction(() => {
  for (let back = 182; back >= 0; back--) {
    const perDay = Math.round(2 + rand() * 6 + (182 - back) / 30); // cresce um pouco com o tempo
    for (let k = 0; k < perDay; k++) {
      const at = new Date(now - back * 86400000 - Math.floor(rand() * 86400000));
      if (at > new Date(now)) continue;
      const r = rand();
      const status = r < 0.55 ? 'allowed' : r < 0.97 ? 'denied' : 'unavailable';
      const place = status === 'allowed' ? pick(weighted) : ['', '', ''];
      insert.run({
        visitor: pick(visitors), month: tzMonth(at), at: at.toISOString(), landing: pick(PATHS),
        pages: 1 + Math.floor(rand() * rand() * 7), device: rand() < 0.72 ? 'Celular' : rand() < 0.9 ? 'Computador' : 'Tablet',
        ref: pick(REFS), status, city: place[0], region: place[1], country: place[2],
      });
      n++;
    }
  }
})();
console.log(`${n} visitas de demonstração criadas (últimos 6 meses). Para remover: npm run demo:traffic:remove`);
