// Refaz a marca d'água de todas as fotos do portfólio a partir dos originais guardados
// em server/private/portfolio (as cópias públicas são recriadas com nome novo).
//
//   node scripts/rewatermark.js
import { rewatermarkPortfolio } from '../portfolioFiles.js';

let last = 0;
const r = await rewatermarkPortfolio((done, total) => {
  if (done === total || done - last >= 10) { console.log(`  ${done}/${total} fotos`); last = done; }
});
if (!r.total) console.log('Nenhuma foto do portfólio com original guardado.');
console.log(`Pronto: marca d'água refeita em ${r.done} foto(s)${r.skipped ? ` (${r.skipped} sem original, ignoradas)` : ''}.`);
