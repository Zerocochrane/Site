import { useEffect, useMemo, useState } from 'react';
import MonthBarChart from '../components/MonthBarChart.jsx';
import { Link } from 'react-router-dom';
import { api, brl, downloadFile } from '../api.js';
import Help from './Help.jsx';

const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthLabel = (ym, opts = { month: 'long', year: 'numeric' }) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const fmtHours = (h) => (h === null || h === undefined ? '—' : `${String(h).replace('.', ',')}h`);
const compactBRL = (n) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(n)}`);

export default function FinanceAdmin() {
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api(`/finance${month ? `?month=${month}` : ''}`)
      .then((d) => { setData(d); if (!month) setMonth(d.month); })
      .catch((e) => setError(e.message));
  }, [month]);

  const options = useMemo(() => {
    if (!data) return [];
    const list = [];
    const last = shiftMonth(data.currentMonth, 12);
    for (let m = data.firstMonth < data.currentMonth ? data.firstMonth : shiftMonth(data.currentMonth, -11); m <= last; m = shiftMonth(m, 1)) list.push(m);
    return list.reverse();
  }, [data]);

  if (error) return <section className="admin-section"><p className="err">{error}</p></section>;
  if (!data) return <section className="admin-section"><p className="muted">Carregando…</p></section>;
  const { rows, totals } = data;

  const download = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <section className="admin-section finance">
      <div className="admin-title-row">
        <h1>Financeiro</h1>
        <button className="btn btn-accent" disabled={busy === 'xlsx'} onClick={() => download('xlsx', () => downloadFile(`/finance/export?month=${data.month}`, `financeiro-${data.month}.xlsx`))}>
          {busy === 'xlsx' ? 'Gerando…' : 'Baixar planilha (.xlsx)'}
        </button>
      </div>
      <Help>A receita de cada cliente entra no mês da <b>data do evento</b>. Preencha evento, data, duração e pagamento na ficha de cada cliente.</Help>

      <MonthBarChart
        title="Receita por mês"
        data={data.chart.map((c) => ({ month: c.month, value: c.revenue, detail: `${c.clients} cliente${c.clients === 1 ? '' : 's'}` }))}
        selected={data.month}
        onSelect={setMonth}
        formatValue={brl}
        formatTick={(t, narrow) => (narrow ? compactBRL(t).replace('R$ ', '') : compactBRL(t))}
      />

      <div className="month-picker">
        <button className="icon-btn" title="Mês anterior" onClick={() => setMonth(shiftMonth(data.month, -1))}>←</button>
        <select value={data.month} onChange={(e) => setMonth(e.target.value)} aria-label="Escolher mês">
          {options.map((m) => <option key={m} value={m}>{cap(monthLabel(m))}</option>)}
        </select>
        <button className="icon-btn" title="Próximo mês" onClick={() => setMonth(shiftMonth(data.month, 1))}>→</button>
        {data.month !== data.currentMonth && <button className="link-btn" onClick={() => setMonth(data.currentMonth)}>Mês atual</button>}
      </div>

      <div className="stat-row">
        <Stat label={`Receita em ${monthLabel(data.month, { month: 'long' })}`} value={brl(totals.revenue)} />
        <Stat label="Clientes" value={totals.clients} />
        <Stat label="Horas fotografadas" value={fmtHours(totals.hours)} />
        <Stat label="Média por hora" value={totals.perHour === null ? '—' : brl(totals.perHour)} />
      </div>

      {totals.missingPayment > 0 && <p className="muted small">{totals.missingPayment} cliente(s) deste mês ainda sem valor pago lançado.</p>}

      <div className="table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Cliente</th><th>Evento</th><th>Data</th><th className="num">Duração</th><th>Pagamento</th>
              <th className="num">Valor pago</th><th className="num">Parcelas</th><th className="num">Por hora</th><th>Contrato</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="muted empty">Nenhum cliente com evento em {monthLabel(data.month)}.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="fin-name"><Link to={`/admin/clients/${r.id}`} className="fin-client">{r.name}</Link><span className="muted small">{r.email}</span></td>
                <td data-label="Evento">{r.eventType || '—'}</td>
                <td data-label="Data">{fmtDate(r.eventDate)}</td>
                <td data-label="Duração" className="num">{fmtHours(r.durationHours)}</td>
                <td data-label="Pagamento">{r.paymentMethod || <span className="muted">—</span>}</td>
                <td data-label="Valor pago" className="num strong">{brl(r.amountPaid)}</td>
                <td data-label="Parcelas" className="num">{r.installments ? `${r.installments}x` : '—'}</td>
                <td data-label="Por hora" className="num">{brl(r.perHour)}</td>
                <td data-label="Contrato">
                  {r.contract
                    ? <button className="link-btn" disabled={busy === `c${r.id}`} onClick={() => download(`c${r.id}`, () => downloadFile(`/admin/clients/${r.id}/contract`, r.contract.name))}>Baixar PDF</button>
                    : <span className="muted small">sem contrato</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="fin-name">Total</td><td className="fin-empty" /><td className="fin-empty" /><td data-label="Horas" className="num">{fmtHours(totals.hours)}</td><td className="fin-empty" />
                <td data-label="Receita" className="num">{brl(totals.revenue)}</td><td className="fin-empty" /><td data-label="Média por hora" className="num">{brl(totals.perHour)}</td><td className="fin-empty" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {data.undated > 0 && <p className="muted small">{data.undated} cliente(s) sem data do evento não entram no Financeiro.</p>}
    </section>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><b>{value}</b></div>;
}

