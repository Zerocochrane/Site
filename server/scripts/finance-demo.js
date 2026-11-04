// Dados de demonstração para testar a página Financeiro.
//   npm run demo:finance          → cria ~28 clientes fictícios (maio até hoje) com pagamento e contrato
//   npm run demo:finance:remove   → apaga todos os clientes de demonstração (login começando com "demo-")
// Os clientes de demonstração nunca recebem e-mail (o acesso não é enviado).
import fs from 'node:fs';
import db from '../clientsDb.js';
import { listCategories } from '../bookingDb.js';
import { contractPath } from '../contracts.js';
import { clientDir, removeClientFiles } from '../clientFiles.js';

const remove = process.argv.includes('--remove');
const old = db.prepare("SELECT id FROM clients WHERE username LIKE 'demo-%'").all();
for (const { id } of old) {
  db.prepare('DELETE FROM client_photos WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  removeClientFiles(id);
}
if (remove) {
  console.log(`${old.length} cliente(s) de demonstração removido(s).`);
  process.exit(0);
}

// Gerador pseudoaleatório fixo: sempre os mesmos dados
let seed = 20261030;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];

const FIRST = ['Mariana', 'Juliana', 'Camila', 'Rafael', 'Bruno', 'Larissa', 'Fernanda', 'Gabriel', 'Patrícia', 'Lucas', 'Beatriz', 'Thiago', 'Aline', 'Renata', 'Felipe', 'Carolina', 'Vinícius', 'Natália', 'Diego', 'Isabela'];
const LAST = ['Souza', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Teixeira', 'Moura'];
const cats = listCategories();
const events = cats.length ? cats : [{ name: 'Casamento', kind: 'event' }, { name: 'Ensaio fotográfico', kind: 'photoshoot' }];
const PRICE = { event: [450, 750], photoshoot: [350, 600] }; // R$ por hora, aprox.

function pdf(lines) {
  const text = lines.map((l, i) => `BT /F1 ${i ? 12 : 18} Tf 72 ${760 - i * 26} Td (${l.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[()\\]/g, '')}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = Buffer.byteLength(out); out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) + 'T12:00:00Z');
const start = new Date(today); start.setUTCMonth(start.getUTCMonth() - 5, 1); // 5 meses atrás, dia 1
const span = (today - start) / 86400000;

const insert = db.prepare(`INSERT INTO clients (name, email, phone, username, selection_limit, days, event_type, event_date, duration_hours,
  payment_method, amount_paid, installments, contract_name, contract_uploaded_at)
  VALUES (@name, @email, @phone, @username, 40, 7, @event_type, @event_date, @duration_hours, @payment_method, @amount_paid, @installments, @contract_name, @contract_uploaded_at)`);

const N = 28;
for (let i = 0; i < N; i++) {
  const d = new Date(start.getTime() + Math.floor(rand() * span) * 86400000);
  const ev = pick(events);
  const hours = ev.kind === 'event' ? pick([3, 4, 5, 6, 8, 10]) : pick([1, 1.5, 2, 3]);
  const [lo, hi] = PRICE[ev.kind] || PRICE.event;
  const amount = Math.round((hours * (lo + rand() * (hi - lo))) / 50) * 50;
  const method = pick(['Pix', 'Pix', 'Cartão de crédito', 'Cartão de crédito', 'Transferência', 'Dinheiro', 'Boleto', 'Cartão de débito']);
  const installments = method === 'Cartão de crédito' ? pick([1, 2, 3, 4, 6, 10, 12]) : method === 'Boleto' ? pick([1, 2, 3]) : 1;
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.');
  const date = d.toISOString().slice(0, 10);
  const hasContract = rand() > 0.15;
  const unpaid = rand() < 0.06; // alguns sem pagamento lançado
  const { lastInsertRowid: id } = insert.run({
    name,
    email: `${slug}@exemplo.com`,
    phone: `(32) 9${String(80000000 + Math.floor(rand() * 19999999)).slice(0, 4)}-${String(1000 + Math.floor(rand() * 8999))}`,
    username: `demo-${slug}-${i + 1}`,
    event_type: ev.name,
    event_date: date,
    duration_hours: hours,
    payment_method: unpaid ? '' : method,
    amount_paid: unpaid ? null : amount,
    installments: unpaid ? null : installments,
    contract_name: hasContract ? `Contrato - ${name}.pdf` : null,
    contract_uploaded_at: hasContract ? new Date(d.getTime() - 20 * 86400000).toISOString() : null,
  });
  if (hasContract) {
    fs.mkdirSync(clientDir(id), { recursive: true });
    fs.writeFileSync(contractPath(id), pdf([
      'Contrato de prestacao de servicos fotograficos (DEMONSTRACAO)',
      `Cliente: ${name}`,
      `Servico: ${ev.name}`,
      `Data: ${date.split('-').reverse().join('/')}  -  Duracao: ${String(hours).replace('.', ',')} h`,
      `Valor: R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}  -  ${method}${installments > 1 ? ` em ${installments}x` : ''}`,
      'Documento ficticio gerado para testar a pagina Financeiro.',
    ]));
  }
}
console.log(`${N} clientes de demonstração criados (${start.toISOString().slice(0, 7)} até hoje). Para remover: npm run demo:finance:remove`);
