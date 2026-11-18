// Limpa o banco de FOTOS e de CLIENTES:
//  • portfólio: todos os grupos, subgrupos e fotos (arquivos públicos e originais)
//  • clientes: todos (inclusive os de demonstração), com fotos, pagamentos e contratos
// Mantém: configurações, categorias, agenda (dias), pedidos de agendamento e tráfego.
//
//   npm run clear:data                          → só mostra o que será apagado
//   npm run clear:data -- --yes                 → apaga de verdade (não tem como desfazer)
//   npm run clear:data -- --yes --keep-demo     → mantém os clientes de demonstração (login "demo-…")
import fs from 'node:fs';
import path from 'node:path';
import db from '../clientsDb.js';
import '../bookingDb.js'; // garante a coluna inquiries.client_id
import { UPLOAD_DIR, PRIVATE_DIR } from '../paths.js';

const yes = process.argv.includes('--yes');
const keepDemo = process.argv.includes('--keep-demo');
const count = (sql) => db.prepare(sql).get().n;
const filesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : []);
const ORIGINALS = path.join(PRIVATE_DIR, 'portfolio');
const CLIENTS_DIR = path.join(PRIVATE_DIR, 'clients');
const clientWhere = keepDemo ? "WHERE username NOT LIKE 'demo-%'" : '';

const plan = {
  groups: count('SELECT COUNT(*) AS n FROM groups'),
  subgroups: count('SELECT COUNT(*) AS n FROM subgroups'),
  photos: count('SELECT COUNT(*) AS n FROM photos'),
  files: filesIn(UPLOAD_DIR).length + filesIn(ORIGINALS).length,
  clients: count(`SELECT COUNT(*) AS n FROM clients ${clientWhere}`),
  clientPhotos: count('SELECT COUNT(*) AS n FROM client_photos'),
  contracts: count(`SELECT COUNT(*) AS n FROM clients ${clientWhere ? `${clientWhere} AND` : 'WHERE'} contract_name IS NOT NULL`),
};

console.log(`
Será apagado:
  Portfólio: ${plan.groups} grupo(s), ${plan.subgroups} subgrupo(s), ${plan.photos} foto(s) (${plan.files} arquivo(s))
  Clientes:  ${plan.clients} cliente(s)${keepDemo ? ' (os de demonstração ficam)' : ', inclusive os de demonstração'}, com ${plan.contracts} contrato(s) e os dados de pagamento
  Fotos da área do cliente: ${plan.clientPhotos}
Fica guardado: configurações, categorias, dias da agenda, pedidos de agendamento e tráfego.`);

if (!yes) {
  console.log(`\nNada foi apagado. Para apagar de verdade: npm run clear:data -- --yes${keepDemo ? ' --keep-demo' : ''}\n`);
  process.exit(0);
}

const doomed = db.prepare(`SELECT id FROM clients ${clientWhere}`).all().map((c) => c.id);
db.transaction(() => {
  db.prepare('UPDATE groups SET cover_photo_id = NULL').run();
  db.prepare('UPDATE subgroups SET cover_photo_id = NULL').run();
  db.prepare('DELETE FROM photos').run();
  db.prepare('DELETE FROM subgroups').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare("DELETE FROM settings WHERE key = 'demoGroupIds'").run();
  db.prepare('DELETE FROM client_photos').run();
  const del = db.prepare('DELETE FROM clients WHERE id = ?');
  doomed.forEach((id) => del.run(id));
  // pedidos aceitos que apontavam para clientes apagados voltam a mostrar "Criar cliente"
  db.prepare('UPDATE inquiries SET client_id = NULL WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients)').run();
})();

for (const f of filesIn(UPLOAD_DIR)) fs.rmSync(path.join(UPLOAD_DIR, f), { recursive: true, force: true });
fs.rmSync(ORIGINALS, { recursive: true, force: true });
const alive = new Set(db.prepare('SELECT id FROM clients').all().map((c) => String(c.id)));
for (const d of filesIn(CLIENTS_DIR)) {
  const dir = path.join(CLIENTS_DIR, d);
  if (!alive.has(d)) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
  // clientes mantidos (demonstração): apaga só as fotos, mantém o contrato
  for (const f of filesIn(dir)) if (f !== 'contract.pdf' && f !== 'contract-signed.pdf') fs.rmSync(path.join(dir, f), { recursive: true, force: true });
}
for (const f of filesIn(path.join(PRIVATE_DIR, 'tmp'))) fs.rmSync(path.join(PRIVATE_DIR, 'tmp', f), { recursive: true, force: true });

console.log('\nPronto: fotos e clientes apagados.\n');
