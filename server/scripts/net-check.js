// Testa se o servidor consegue baixar dos bancos de imagens usados pela demonstração.
// Mostra, para cada endereço: DNS, cada redirecionamento, código HTTP, tempo e o erro exato.
//
//   node scripts/net-check.js
import dns from 'node:dns/promises';

const TARGETS = [
  { label: 'picsum.photos (banco 1)', url: 'https://picsum.photos/seed/teste/400/300.jpg' },
  { label: 'loremflickr.com (banco 2)', url: 'https://loremflickr.com/400/300/wedding?lock=1' },
  { label: 'registry.npmjs.org (controle)', url: 'https://registry.npmjs.org/' },
  { label: 'google.com (controle)', url: 'https://www.google.com/generate_204' },
];

const proxies = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY'].filter((k) => process.env[k]);
console.log(`Node ${process.version} · proxy configurado: ${proxies.length ? proxies.join(', ') : 'nenhum'}`);

const why = (e) => {
  const c = e.cause || {};
  return [e.name === 'AbortError' ? 'tempo esgotado (15 s)' : e.message, c.code, c.message].filter(Boolean).join(' · ');
};

async function check({ label, url }) {
  console.log(`\n— ${label}`);
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const host = new URL(current).hostname;
    try {
      const addrs = await dns.lookup(host, { all: true });
      console.log(`  DNS ${host}: ${addrs.map((a) => a.address).join(', ')}`);
    } catch (e) {
      console.log(`  DNS ${host}: FALHOU (${e.code || e.message})${proxies.length ? ' — tentando pelo proxy' : ''}`);
      if (!proxies.length) return false;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const start = Date.now();
    try {
      const r = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (portfolio net-check)' } });
      const ms = Date.now() - start;
      const extra = [r.headers.get('content-type'), r.headers.get('server'), r.headers.get('cf-ray') && `cf-ray ${r.headers.get('cf-ray')}`].filter(Boolean).join(' · ');
      console.log(`  ${current}\n    → HTTP ${r.status} em ${ms} ms${extra ? ` (${extra})` : ''}`);
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        current = new URL(r.headers.get('location'), current).href;
        await r.body?.cancel();
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const ok = r.ok;
      if (!ok && buf.length) console.log(`    resposta: ${buf.toString('utf8', 0, 160).replace(/\s+/g, ' ')}`);
      console.log(`  ${ok ? 'OK' : 'FALHOU'} (${buf.length.toLocaleString('pt-BR')} bytes)`);
      return ok;
    } catch (e) {
      console.log(`  ${current}\n    → ERRO: ${why(e)}`);
      return false;
    } finally { clearTimeout(t); }
  }
  console.log('  FALHOU: redirecionamentos demais');
  return false;
}

const results = [];
for (const t of TARGETS) results.push(await check(t));
const [p, l, npm, g] = results;
console.log('\nResumo:');
if (!npm && !g) console.log('  O servidor não consegue acessar a internet por HTTPS. Verifique as regras de saída (egress) da rede na Oracle Cloud.');
else if (!p && !l) console.log('  A internet funciona, mas os dois bancos de imagens falharam a partir deste servidor. Use "Criar com minhas fotos".');
else console.log(`  Bancos de imagens funcionando: ${[p && 'picsum.photos', l && 'loremflickr.com'].filter(Boolean).join(', ')}.`);
