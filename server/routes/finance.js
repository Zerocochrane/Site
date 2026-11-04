import { Router } from 'express';
import db from '../clientsDb.js';
import { requireAdmin } from '../auth.js';
import { writeXlsx, excelDate, S } from '../xlsx.js';

const router = Router();
router.use(requireAdmin);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthName = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const round2 = (n) => Math.round(n * 100) / 100;

function rowOut(c) {
  const amount = c.amount_paid ?? null;
  const hours = c.duration_hours ?? null;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    eventType: c.event_type || '',
    eventDate: c.event_date,
    durationHours: hours,
    paymentMethod: c.payment_method || '',
    amountPaid: amount,
    installments: c.installments ?? null,
    perHour: amount !== null && hours ? round2(amount / hours) : null,
    contract: c.contract_name ? { name: c.contract_name } : null,
  };
}

/** Receita por mês (pelo mês da data do evento). ?to=AAAA-MM&months=12 */
function monthly(to, months) {
  const from = shiftMonth(to, -(months - 1));
  const rows = db.prepare(`
    SELECT substr(event_date, 1, 7) AS month, COALESCE(SUM(amount_paid), 0) AS revenue, COUNT(*) AS clients
    FROM clients WHERE event_date IS NOT NULL AND substr(event_date, 1, 7) BETWEEN ? AND ?
    GROUP BY month`).all(from, to);
  const by = Object.fromEntries(rows.map((r) => [r.month, r]));
  return Array.from({ length: months }, (_, i) => {
    const m = shiftMonth(from, i);
    return { month: m, revenue: round2(by[m]?.revenue || 0), clients: by[m]?.clients || 0 };
  });
}

function monthRows(month) {
  return db.prepare("SELECT * FROM clients WHERE substr(event_date, 1, 7) = ? ORDER BY event_date, name").all(month).map(rowOut);
}

function totals(rows) {
  const paid = rows.filter((r) => r.amountPaid !== null);
  const revenue = round2(paid.reduce((n, r) => n + r.amountPaid, 0));
  const hours = rows.reduce((n, r) => n + (r.durationHours || 0), 0);
  // média por hora: só clientes com valor E duração lançados
  const both = rows.filter((r) => r.amountPaid !== null && r.durationHours);
  const paidHours = both.reduce((n, r) => n + r.durationHours, 0);
  const perHour = paidHours ? round2(both.reduce((n, r) => n + r.amountPaid, 0) / paidHours) : null;
  return { revenue, clients: rows.length, hours, perHour, missingPayment: rows.length - paid.length };
}

router.get('/', (req, res) => {
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : thisMonth();
  const months = Math.min(36, Math.max(3, Number(req.query.months) || 12));
  const chartTo = month > thisMonth() ? month : thisMonth();
  const rows = monthRows(month);
  const first = db.prepare('SELECT MIN(substr(event_date, 1, 7)) AS m FROM clients WHERE event_date IS NOT NULL').get().m;
  res.json({
    month,
    monthLabel: monthName(month),
    currentMonth: thisMonth(),
    firstMonth: first || thisMonth(),
    chart: monthly(chartTo, months),
    rows,
    totals: totals(rows),
    undated: db.prepare('SELECT COUNT(*) AS n FROM clients WHERE event_date IS NULL').get().n,
  });
});

router.get('/export', (req, res) => {
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : thisMonth();
  const rows = monthRows(month);
  const header = ['Cliente', 'E-mail', 'Evento', 'Data do evento', 'Duração (h)', 'Forma de pagamento', 'Valor pago', 'Parcelas', 'Valor por hora', 'Contrato'];
  const first = 4, last = first + rows.length - 1;
  const t = totals(rows);
  const detail = [
    [{ v: `Financeiro — ${monthName(month)}`, style: S.title }],
    [],
    header.map((h) => ({ v: h, style: S.header })),
    ...rows.map((r, i) => {
      const n = first + i;
      return [
        r.name, r.email, r.eventType,
        r.eventDate ? { v: excelDate(r.eventDate), style: S.date } : '',
        r.durationHours !== null ? { v: r.durationHours, style: S.hours } : '',
        r.paymentMethod,
        r.amountPaid !== null ? { v: r.amountPaid, style: S.money } : '',
        r.installments !== null ? { v: r.installments, style: S.int } : '',
        r.amountPaid !== null && r.durationHours ? { f: `G${n}/E${n}`, v: r.perHour, style: S.money } : '',
        r.contract ? 'Sim' : 'Não',
      ];
    }),
    rows.length
      ? [{ v: 'Total', style: S.totalLabel }, { v: '', style: S.totalLabel }, { v: '', style: S.totalLabel }, { v: '', style: S.totalLabel },
        { f: `SUM(E${first}:E${last})`, v: t.hours, style: S.totalLabel }, { v: '', style: S.totalLabel },
        { f: `SUM(G${first}:G${last})`, v: t.revenue, style: S.totalMoney }, { v: '', style: S.totalLabel },
        { f: `IFERROR(SUMIFS(G${first}:G${last},E${first}:E${last},">0")/SUMIFS(E${first}:E${last},G${first}:G${last},"<>"),"")`, v: t.perHour ?? '', style: S.totalMoney },
        { v: '', style: S.totalLabel }]
      : ['Nenhum cliente com evento neste mês.'],
  ];
  const chart = monthly(month, 12);
  const summary = [
    [{ v: 'Receita por mês (últimos 12 meses)', style: S.title }],
    [],
    ['Mês', 'Clientes', 'Receita'].map((h) => ({ v: h, style: S.header })),
    ...chart.map((c) => [monthName(c.month), { v: c.clients, style: S.int }, { v: c.revenue, style: S.money }]),
    [{ v: 'Total', style: S.totalLabel }, { f: `SUM(B4:B15)`, v: chart.reduce((n, c) => n + c.clients, 0), style: S.totalLabel }, { f: 'SUM(C4:C15)', v: round2(chart.reduce((n, c) => n + c.revenue, 0)), style: S.totalMoney }],
  ];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="financeiro-${month}.xlsx"`);
  writeXlsx(res, [
    { name: `Clientes ${month}`, rows: detail, widths: [26, 30, 22, 14, 12, 20, 14, 10, 15, 10] },
    { name: 'Receita por mês', rows: summary, widths: [24, 12, 16] },
  ]).catch((e) => { console.error('xlsx:', e.message); res.end(); });
});

export default router;
