// Portfólio de demonstração: 8–10 grupos, cada um com 3–5 subgrupos de 8–10 fotos.
//
//   npm run demo:portfolio            → cria (baixa fotos de banco de imagens gratuito — picsum.photos / Unsplash)
//   npm run demo:portfolio -- --offline   → cria sem internet (imagens geradas, em tons suaves)
//   npm run demo:portfolio:remove     → apaga só os grupos de demonstração e as fotos deles
//
// As fotos passam pelo mesmo processo do painel: cópia pública reduzida com marca d'água
// + original guardado em server/private/portfolio. Rode com o site parado ou rodando, tanto faz.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import '../fonts.js';
import sharp from 'sharp';
import db, { slugify, toSlug } from '../db.js';
import { PRIVATE_DIR } from '../paths.js';
import { makePublicCopy, removePortfolioFiles } from '../portfolioFiles.js';

const args = process.argv.slice(2);
const KEY = 'demoGroupIds';
const SOURCE = process.env.DEMO_PHOTO_URL || 'https://picsum.photos/seed/{seed}/{w}/{h}.jpg';
const TMP = path.join(PRIVATE_DIR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

// Data aleatória entre jan/2024 e hoje, no formato AAAA-MM-DD
const demoDate = () => {
  const start = Date.UTC(2024, 0, 1);
  return new Date(start + Math.floor(Math.random() * (Date.now() - start))).toISOString().slice(0, 10);
};
const readIds = () => { try { return JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)?.value || '[]'); } catch { return []; } };
const saveIds = (ids) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(ids));

function removeDemo() {
  const ids = readIds();
  let photos = 0;
  for (const id of ids) {
    const rows = db.prepare('SELECT * FROM photos WHERE group_id = ?').all(id);
    rows.forEach(removePortfolioFiles);
    photos += rows.length;
    db.transaction(() => {
      db.prepare('DELETE FROM photos WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM subgroups WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    })();
  }
  saveIds([]);
  return { groups: ids.length, photos };
}

if (args.includes('--remove')) {
  const r = removeDemo();
  console.log(`${r.groups} grupo(s) de demonstração e ${r.photos} foto(s) removidos.`);
  setTimeout(() => process.exit(0), 300);
} else {
  await seed();
}

async function seed() {
  if (readIds().length) {
    const r = removeDemo();
    console.log(`(Removi a demonstração anterior: ${r.groups} grupos, ${r.photos} fotos.)`);
  }

  // Sorteio fixo: sempre o mesmo resultado
  let s = 20261113;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const shuffle = (list) => list.map((v) => [rand(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

  const CITIES = ['Juiz de Fora', 'Belo Horizonte', 'Rio de Janeiro', 'Tiradentes', 'Petrópolis', 'Ouro Preto', 'São João del-Rei', 'Ibitipoca', 'Barbacena', 'Paraty'];
  const COUPLES = ['Ana & João', 'Júlia & Rafa', 'Marina & Caio', 'Bia & Tomás', 'Luiza & Pedro', 'Carol & Diego', 'Helena & Bruno', 'Camila & Leo', 'Sofia & Gabriel', 'Laura & Vinícius'];
  const KIDS = ['Theo', 'Alice', 'Miguel', 'Helena', 'Arthur', 'Valentina', 'Davi', 'Cecília', 'Bento', 'Maria Clara'];
  const FAMILIES = ['Família Souza', 'Família Almeida', 'Família Ribeiro', 'Família Costa', 'Família Martins', 'Família Teixeira', 'Família Lima'];
  const PEOPLE = ['Fernanda Moura', 'Rafael Gomes', 'Patrícia Rocha', 'Lucas Barbosa', 'Renata Carvalho', 'Thiago Pereira', 'Aline Moura', 'Beatriz Lopes'];
  const COMPANIES = ['Congresso Médico Regional', 'Lançamento Café Serra Azul', 'Convenção Anual Vértice', 'Feira de Inovação JF', 'Prêmio Destaques do Ano', 'Encontro de Lideranças'];

  const THEMES = [
    { name: 'Casamentos', desc: 'Histórias de amor contadas do making of à festa.', subs: () => COUPLES, sub: (n) => n, titles: ['Making of', 'Detalhes', 'Cerimônia', 'Votos', 'Saída dos noivos', 'Retratos', 'Festa', 'Primeira dança', 'Brinde', 'Fim de noite'] },
    { name: 'Ensaios de casal', desc: 'Ensaios leves, ao ar livre, com o jeito de cada casal.', subs: () => COUPLES, sub: (n) => n, titles: ['Caminhada', 'Fim de tarde', 'Risadas', 'Abraço', 'Detalhes', 'Contraluz', 'Retrato', 'Mãos dadas', 'Olhares', 'Pôr do sol'] },
    { name: 'Gestantes', desc: 'A espera, a barriga e os primeiros sonhos de família.', subs: () => PEOPLE.slice(0, 6).map((p) => p.split(' ')[0]), sub: (n) => `Gestante — ${n}`, titles: ['Barriga', 'Mãos', 'Perfil', 'Jardim', 'Tecido ao vento', 'Com o parceiro', 'Detalhes', 'Luz natural', 'Retrato', 'Sorriso'] },
    { name: 'Família', desc: 'Encontros em casa ou ao ar livre, do jeitinho de cada família.', subs: () => FAMILIES, sub: (n) => n, titles: ['Todos juntos', 'Brincadeira', 'Colo', 'Irmãos', 'Passeio', 'Abraço coletivo', 'Retrato', 'Piquenique', 'Detalhes', 'Risadas'] },
    { name: 'Aniversários', desc: 'Festas infantis e celebrações cheias de cor.', subs: () => KIDS, sub: (n) => `${n} — ${between(1, 9)} anos`, titles: ['Decoração', 'Bolo', 'Parabéns', 'Convidados', 'Brincadeiras', 'Lembrancinhas', 'Família', 'Doces', 'Sopro das velas', 'Fim de festa'] },
    { name: 'Formaturas', desc: 'Colação, baile e a alegria de fechar um ciclo.', subs: () => ['Medicina UFJF', 'Direito', 'Engenharia Civil', 'Arquitetura', 'Odontologia', 'Psicologia'], sub: (n) => `${n} ${between(2024, 2026)}`, titles: ['Colação', 'Beca', 'Juramento', 'Família', 'Amigos', 'Baile', 'Pista', 'Retrato', 'Diploma', 'Brinde'] },
    { name: 'Eventos corporativos', desc: 'Congressos, lançamentos e confraternizações de empresas.', subs: () => COMPANIES, sub: (n) => n, titles: ['Credenciamento', 'Palestra', 'Plateia', 'Painel', 'Networking', 'Coffee break', 'Premiação', 'Equipe', 'Bastidores', 'Encerramento'] },
    { name: 'Retratos', desc: 'Retratos profissionais e pessoais, em estúdio ou na rua.', subs: () => PEOPLE, sub: (n) => n, titles: ['Retrato', 'Perfil', 'Em movimento', 'Sorriso', 'Close', 'Corpo inteiro', 'Luz de janela', 'Rua', 'Preto e branco', 'Olhar'] },
    { name: 'Batizados', desc: 'Momentos de fé e família em torno dos pequenos.', subs: () => KIDS, sub: (n) => `Batizado de ${n}`, titles: ['Igreja', 'Padrinhos', 'Pia batismal', 'Família', 'Detalhes', 'Vela', 'Bênção', 'Recepção', 'Bolo', 'Retrato'] },
    { name: 'Debutantes', desc: 'Ensaios e festas de 15 anos.', subs: () => ['Isabela', 'Manuela', 'Lívia', 'Giovana', 'Yasmin', 'Lara'], sub: (n) => `15 anos de ${n}`, titles: ['Ensaio', 'Vestido', 'Valsa', 'Entrada', 'Família', 'Amigas', 'Pista', 'Bolo', 'Retrato', 'Detalhes'] },
  ];

  const themes = shuffle(THEMES).slice(0, between(8, 10));
  const plan = themes.map((t) => {
    const names = shuffle(t.subs()).slice(0, between(3, 5));
    return { ...t, subgroups: names.map((n) => ({ name: t.sub(n), city: CITIES[between(0, CITIES.length - 1)], photos: between(8, 10) })) };
  });
  const total = plan.reduce((n, g) => n + g.subgroups.reduce((m, sg) => m + sg.photos, 0), 0);
  console.log(`Criando ${plan.length} grupos, ${plan.reduce((n, g) => n + g.subgroups.length, 0)} subgrupos e ${total} fotos…`);

  // Fotos: banco de imagens (sementes fixas → sempre as mesmas fotos) ou imagens geradas
  let online = !args.includes('--offline');
  let failures = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // picsum (Cloudflare) às vezes responde 5xx por alguns segundos: tenta de novo antes de desistir
  async function download(seed, w, h, file) {
    let err;
    for (const wait of [0, 2000, 6000]) {
      if (wait) await sleep(wait);
      try { return await downloadOnce(seed, w, h, file); } catch (e) {
        err = e;
        if (/HTTP 4\d\d/.test(e.message)) break; // erro definitivo, não adianta repetir
      }
    }
    throw err;
  }
  async function downloadOnce(seed, w, h, file) {
    const url = SOURCE.replace('{seed}', seed).replace('{w}', w).replace('{h}', h);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 2000) throw new Error('arquivo vazio');
      fs.writeFileSync(file, buf);
    } finally { clearTimeout(t); }
  }
  async function generate(seed, w, h, file) {
    const hue = [...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
    const c = (dh, l, sat = 35) => `hsl(${(hue + dh) % 360},${sat}%,${l}%)`;
    const blobs = Array.from({ length: 6 }, (_, i) => `<circle cx="${(i * 37 + hue) % 100}%" cy="${(i * 53 + hue * 3) % 100}%" r="${18 + (i * 7) % 20}%" fill="${c(i * 25, 70 + (i % 3) * 6, 45)}" opacity=".55"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(0, 82)}"/><stop offset="1" stop-color="${c(30, 38)}"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="${Math.round(w / 18)}"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#b)">${blobs}</g></svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(file);
  }

  const groupIds = [];
  let done = 0;
  const startPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM groups').get().n;
  const insertPhoto = db.prepare('INSERT INTO photos (group_id, subgroup_id, filename, orig_file, wm, title, width, height, position) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)');

  for (const [gi, g] of plan.entries()) {
    const groupId = Number(db.prepare('INSERT INTO groups (name, slug, description, position) VALUES (?, ?, ?, ?)')
      .run(g.name, slugify(g.name), g.desc, startPos + gi).lastInsertRowid);
    groupIds.push(groupId);
    saveIds(groupIds); // salva a cada grupo: se o script parar no meio, --remove ainda limpa tudo

    for (const [si, sg] of g.subgroups.entries()) {
      const subId = Number(db.prepare('INSERT INTO subgroups (group_id, name, slug, description, event_date, position) VALUES (?, ?, ?, ?, ?, ?)')
        .run(groupId, sg.name, toSlug(sg.name), sg.city, demoDate(), si).lastInsertRowid);

      const jobs = Array.from({ length: sg.photos }, (_, k) => {
        const portrait = rand() < 0.4;
        return { k, w: portrait ? 1067 : 1600, h: portrait ? 1600 : 1067, seed: `${toSlug(g.name)}-${groupId}-${si}-${k}` };
      });
      const results = new Array(jobs.length);
      // 4 de cada vez
      for (let i = 0; i < jobs.length; i += 4) {
        await Promise.all(jobs.slice(i, i + 4).map(async (j) => {
          const tmp = path.join(TMP, `demo-${crypto.randomBytes(6).toString('hex')}.jpg`);
          try {
            if (online) {
              try { await download(j.seed, j.w, j.h, tmp); failures = 0; }
              catch (e) {
                if (++failures >= 6 && online) {
                  online = false;
                  console.log(`\n! O banco de imagens (picsum.photos) não está respondendo (${e.message}). Continuando com imagens geradas. Tente "Criar" de novo mais tarde para ter fotos reais.`);
                }
                await generate(j.seed, j.w, j.h, tmp);
              }
            } else {
              await generate(j.seed, j.w, j.h, tmp);
            }
            results[j.k] = await makePublicCopy(tmp, `${j.seed}.jpg`);
          } catch (e) {
            fs.rmSync(tmp, { force: true });
            console.log(`\n! Foto ignorada (${e.message})`);
          }
          done++;
          if (process.stdout.isTTY) process.stdout.write(`\r  ${done}/${total} fotos — ${g.name} › ${sg.name}`.padEnd(90));
        }));
      }
      if (!process.stdout.isTTY) console.log(`  ${done}/${total} fotos — ${g.name} › ${sg.name}`);
      results.forEach((out, k) => {
        if (out) insertPhoto.run(groupId, subId, out.filename, out.origFile, g.titles[k % g.titles.length], out.width, out.height, k);
      });
    }
  }
  console.log(`\n\nPronto: ${plan.length} grupos de demonstração criados${online ? ' com fotos do banco de imagens' : ' com imagens geradas'}.`);
  console.log('Para apagar só eles: npm run demo:portfolio:remove');
}
