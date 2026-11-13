import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import MonthBarChart from '../components/MonthBarChart.jsx';
import Help from './Help.jsx';

const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const monthLabel = (ym, opts = { month: 'long', year: 'numeric' }) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export default function TrafficAdmin() {
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
    api(`/traffic${month ? `?month=${month}` : ''}`)
      .then((d) => { setData(d); if (!month) setMonth(d.month); })
      .catch((e) => setError(e.message));
  }, [month]);

  const options = useMemo(() => {
    if (!data) return [];
    const list = [];
    const start = data.firstMonth < shiftMonth(data.currentMonth, -11) ? data.firstMonth : shiftMonth(data.currentMonth, -11);
    for (let m = start; m <= data.currentMonth; m = shiftMonth(m, 1)) list.push(m);
    return list.reverse();
  }, [data]);

  if (error) return <section className="admin-section"><p className="err">{error}</p></section>;
  if (!data) return <section className="admin-section"><p className="muted">Carregando…</p></section>;
  const { totals, locations, recent } = data;
  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  const shown = showAll ? recent : recent.slice(0, 20);

  return (
    <section className="admin-section traffic">
      <div className="admin-title-row"><h1>Tráfego</h1></div>
      <Help>
        Visitas ao site público (portfólio e agenda). Uma <b>visita</b> é cada vez que alguém abre o site; ela termina após 30 minutos sem atividade.
        Você não é contada enquanto estiver logada no painel. A cidade só aparece quando o visitante permite o uso da localização.
      </Help>
      {insecure && (
        <p className="notice warn">
          O site está sendo aberto sem HTTPS, e os navegadores só pedem a localização em sites seguros (https://).
          Até o site ter HTTPS, as visitas aparecem sem cidade.
        </p>
      )}

      <MonthBarChart
        title="Visitas por mês"
        data={data.chart.map((c) => ({ month: c.month, value: c.visits, detail: `${num(c.visitors)} visitante${c.visitors === 1 ? '' : 's'} · ${num(c.pages)} página${c.pages === 1 ? '' : 's'}` }))}
        selected={data.month}
        onSelect={setMonth}
        minStep={1}
        formatValue={(v) => `${num(v)} visita${v === 1 ? '' : 's'}`}
        formatTick={(t) => num(t)}
        totalLabel={(t) => `${num(t)} visitas`}
      />

      <div className="month-picker">
        <button className="icon-btn" title="Mês anterior" onClick={() => setMonth(shiftMonth(data.month, -1))}>←</button>
        <select value={data.month} onChange={(e) => setMonth(e.target.value)} aria-label="Escolher mês">
          {options.map((m) => <option key={m} value={m}>{cap(monthLabel(m))}</option>)}
        </select>
        <button className="icon-btn" title="Próximo mês" disabled={data.month >= data.currentMonth} onClick={() => setMonth(shiftMonth(data.month, 1))}>→</button>
        {data.month !== data.currentMonth && <button className="link-btn" onClick={() => setMonth(data.currentMonth)}>Mês atual</button>}
      </div>

      <div className="stat-row">
        <div className="stat"><span>Visitas em {monthLabel(data.month, { month: 'long' })}</span><b>{num(totals.visits)}</b></div>
        <div className="stat"><span>Visitantes únicos</span><b>{num(totals.visitors)}</b></div>
        <div className="stat"><span>Páginas vistas</span><b>{num(totals.pages)}</b></div>
        <div className="stat"><span>Pelo celular</span><b>{pct(totals.mobile, totals.visits)}</b></div>
      </div>

      <div className="admin-sub-head"><h2>De onde vêm as visitas</h2></div>
      <p className="muted small">{num(totals.tracked)} de {num(totals.visits)} visitas permitiram a localização ({pct(totals.tracked, totals.visits)}).</p>
      {locations.length === 0 ? (
        <p className="muted">Nenhuma visita em {monthLabel(data.month)}.</p>
      ) : (
        <div className="table-wrap">
          <table className="fin-table loc-table">
            <thead><tr><th>Local</th><th className="num">Visitas</th><th className="num">Visitantes</th><th>Última visita</th></tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.place} className={l.tracked ? '' : 'untracked'}>
                  <td className="fin-name"><span className="loc-place">{l.place}</span>
                    <span className="loc-bar" aria-hidden="true"><i style={{ width: pct(l.visits, totals.visits) }} /></span>
                  </td>
                  <td data-label="Visitas" className="num strong">{num(l.visits)}</td>
                  <td data-label="Visitantes" className="num">{num(l.visitors)}</td>
                  <td data-label="Última visita">{when(l.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="admin-sub-head"><h2>Últimas visitas</h2></div>
          <ul className="visit-list">
            {shown.map((v) => (
              <li key={v.id} className={v.tracked ? '' : 'untracked'}>
                <span className="v-when">{when(v.at)}</span>
                <span className="v-place">{v.place}</span>
                <span className="v-meta muted small">
                  {v.device} · {v.pages} página{v.pages === 1 ? '' : 's'} · entrou por {v.landing === '/' ? 'Início' : v.landing}
                  {v.referrer && <> · veio de {v.referrer}</>}
                </span>
              </li>
            ))}
          </ul>
          {recent.length > shown.length && <button className="btn btn-line small" onClick={() => setShowAll(true)}>Mostrar todas ({recent.length})</button>}
        </>
      )}
      <p className="muted small retention-note">As visitas ficam guardadas por {data.retentionMonths} meses e depois são apagadas automaticamente. Não guardamos IP nem endereço exato.</p>
    </section>
  );
}
