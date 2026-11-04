// Limpa o conteúdo para começar do zero:
//  • TODAS as fotos do portfólio + todos os grupos e subgrupos
//  • TODOS os clientes criados manualmente (com fotos, pagamento e contrato)
//  • as fotos de área do cliente de qualquer cliente que restar
// Mantém: clientes de demonstração (login "demo-…"), configurações, categorias, agenda e pedidos.
//
//   npm run reset:content            → só mostra o que será apagado
//   npm run reset:content -- --yes   → apaga de verdade (não tem como desfazer)
import fs from 'node:fs';
import path from 'node:path';
import db from '../clientsDb.js';
import { UPLOAD_DIR, PRIVATE_DIR } from '../paths.js';
import { removeClientFiles, removeClientPhotoFiles } from '../clientFiles.js';

const yes = process.argv.includes('--yes');
const count = (sql, ...a) => db.prepare(sql).get(...a).n;
const filesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : []);

const realClients = db.prepare("SELECT id, name FROM clients WHERE username NOT LIKE 'demo-%'").all();
const ORIGINALS = path.join(PRIVATE_DIR, 'portfolio');
const plan = {
  groups: count('SELECT COUNT(*) AS n FROM groups'),
  subgroups: count('SELECT COUNT(*) AS n FROM subgroups'),
  photos: count('SELECT COUNT(*) AS n FROM photos'),
  publicFiles: filesIn(UPLOAD_DIR).length,
  originalFiles: filesIn(ORIGINALS).length,
  clients: realClients.length,
  clientPhotos: count('SELECT COUNT(*) AS n FROM client_photos'),
  demoKept: count("SELECT COUNT(*) AS n FROM clients WHERE username LIKE 'demo-%'"),
};

console.log(`
Será apagado:
  Portfólio: ${plan.groups} grupo(s), ${plan.subgroups} subgrupo(s), ${plan.photos} foto(s)
             (${plan.publicFiles} arquivo(s) em server/uploads, ${plan.originalFiles} original(is) em server/private/portfolio)
  Clientes criados manualmente: ${plan.clients}${realClients.length ? ` — ${realClients.map((c) => c.name).join(', ')}` : ''}
  Fotos da área do cliente: ${plan.clientPhotos}
Será mantido: ${plan.demoKept} cliente(s) de demonstração, configurações, categorias, agenda e pedidos.`);

if (!yes) {
  console.log('\nNada foi apagado. Para apagar de verdade: npm run reset:content -- --yes\n');
  process.exit(0);
}

db.transaction(() => {
  db.prepare('UPDATE groups SET cover_photo_id = NULL').run();
  db.prepare('UPDATE subgroups SET cover_photo_id = NULL').run();
  db.prepare('DELETE FROM photos').run();
  db.prepare('DELETE FROM subgroups').run();
  db.prepare('DELETE FROM groups').run();
  for (const c of realClients) db.prepare('DELETE FROM client_photos WHERE client_id = ?').run(c.id);
  for (const c of realClients) db.prepare('DELETE FROM clients WHERE id = ?').run(c.id);
  db.prepare('DELETE FROM client_photos').run(); // fotos que restarem (clientes de demonstração)
})();

for (const f of filesIn(UPLOAD_DIR)) fs.rmSync(path.join(UPLOAD_DIR, f), { recursive: true, force: true });
fs.rmSync(ORIGINALS, { recursive: true, force: true });
for (const c of realClients) removeClientFiles(c.id);
for (const { id } of db.prepare('SELECT id FROM clients').all()) removeClientPhotoFiles(id); // mantém contract.pdf
// pastas de clientes que não existem mais no banco
const clientsRoot = path.join(PRIVATE_DIR, 'clients');
const alive = new Set(db.prepare('SELECT id FROM clients').all().map((c) => String(c.id)));
for (const d of filesIn(clientsRoot)) if (!alive.has(d)) fs.rmSync(path.join(clientsRoot, d), { recursive: true, force: true });
for (const f of filesIn(path.join(PRIVATE_DIR, 'tmp'))) fs.rmSync(path.join(PRIVATE_DIR, 'tmp', f), { recursive: true, force: true });

console.log('\nPronto: conteúdo apagado. Reinicie o servidor (npm run dev).\n');
setTimeout(() => process.exit(0), 300); // espera as exclusões assíncronas de pastas
