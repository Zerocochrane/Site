import { useEffect, useRef, useState } from 'react';
import { api, toISO, todayISO, prettyDate } from '../api.js';
import { useSettings } from '../settings.jsx';
import Calendar from '../components/Calendar.jsx';
import SaveBar from './SaveBar.jsx';
import { useDraft } from './unsaved.jsx';
import AgendaTabs from './AgendaTabs.jsx';
import Help from './Help.jsx';

const BRUSHES = [
  { key: 'available', label: 'Disponível' },
  { key: 'booked', label: 'Reservado' },
  { key: 'closed', label: 'Indisponível' },
];

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;

export default function CalendarAdmin() {
  const [month, setMonth] = useState(() => new Date());
  const [brush, setBrush] = useState('available');
  // date -> 'available' | 'booked' for every month loaded so far; changes stay in the draft until saved
  const { saved, draft: days, setDraft, dirty, both, commit, discard } = useDraft({});
  const loaded = useRef(new Set());
  const today = todayISO();
  const { settings, setSettings } = useSettings();
  const buffer = useDraft(null);
  useEffect(() => { if (settings && buffer.saved === null) buffer.load(String(settings.bookingBufferDays ?? 0)); }, [settings, buffer]);
  const bufferDays = Math.max(0, Math.floor(Number(buffer.draft) || 0));
  const firstDate = (() => { const d = new Date(`${today}T12:00`); d.setDate(d.getDate() + bufferDays); return toISO(d); })();

  useEffect(() => {
    const key = monthKey(month);
    if (loaded.current.has(key)) return;
    loaded.current.add(key);
    const from = toISO(new Date(month.getFullYear(), month.getMonth(), 1));
    const to = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    api(`/availability?from=${from}&to=${to}`).then((rows) => {
      const fetched = Object.fromEntries(rows.map((r) => [r.date, r.status]));
      both((d) => ({ ...d, ...fetched }));
    });
  }, [month, both]);

  const apply = (dates, status) =>
    setDraft((d) => {
      const next = { ...d };
      dates.forEach((iso) => (status === 'closed' ? delete next[iso] : (next[iso] = status)));
      return next;
    });

  const onDay = (iso) => {
    if (iso < today) return;
    const current = days[iso] || 'closed';
    apply([iso], current === brush ? 'closed' : brush);
  };

  const bulk = (filter, status) => {
    const y = month.getFullYear(), m = month.getMonth();
    const n = new Date(y, m + 1, 0).getDate();
    const dates = [];
    for (let d = 1; d <= n; d++) {
      const date = new Date(y, m, d);
      const iso = toISO(date);
      if (iso >= today && filter(date) && days[iso] !== 'booked') dates.push(iso);
    }
    if (dates.length) apply(dates, status);
  };
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  // Which days differ from what is saved
  const changes = {};
  for (const iso of new Set([...Object.keys(saved), ...Object.keys(days)])) {
    const a = saved[iso] || 'closed', b = days[iso] || 'closed';
    if (a !== b) changes[iso] = b;
  }
  const changedCount = Object.keys(changes).length;
  const anyDirty = dirty || buffer.dirty;

  const save = async () => {
    const byStatus = {};
    for (const [iso, status] of Object.entries(changes)) (byStatus[status] ||= []).push(iso);
    for (const [status, dates] of Object.entries(byStatus)) {
      await api('/availability', { method: 'PUT', body: { dates, status } });
    }
    if (buffer.dirty) {
      const updated = await api('/settings', { method: 'PUT', body: { bookingBufferDays: bufferDays } });
      setSettings(updated);
      buffer.commit(String(updated.bookingBufferDays));
    }
    commit(days);
  };
  const discardAll = () => { discard(); buffer.discard(); };
  const label = [changedCount ? `${changedCount} dia${changedCount === 1 ? '' : 's'}` : '', buffer.dirty ? 'antecedência' : ''].filter(Boolean).join(' + ');

  return (
    <section className="admin-section has-save-bar">
      <div className="admin-title-row"><h1>Agenda</h1></div>
      <AgendaTabs />
      <Help>Escolha o que marcar e clique nos dias. Clique de novo num dia para limpá-lo. Quando terminar, clique em <b>Salvar alterações</b>. Os clientes só veem os dias marcados como <b>Disponível</b>.</Help>

      <div className="buffer-box panel">
        <label>
          Antecedência mínima para agendar
          <span className="buffer-input">
            <input type="number" min="0" max="365" value={buffer.draft ?? ''} onChange={(e) => buffer.setDraft(e.target.value)} />
            <span>dia{bufferDays === 1 ? '' : 's'}</span>
          </span>
        </label>
        <p className="muted small">
          {bufferDays === 0 ? 'Os clientes podem pedir qualquer dia disponível a partir de hoje.' : <>Hoje é {prettyDate(today, { day: 'numeric', month: 'long' })}: os clientes só podem agendar a partir de <b>{prettyDate(firstDate, { day: 'numeric', month: 'long' })}</b>.</>}
        </p>
      </div>

      <div className="brushes">
        {BRUSHES.map((b) => (
          <button key={b.key} className={`brush ${b.key} ${brush === b.key ? 'on' : ''}`} onClick={() => setBrush(b.key)}>
            <i className={`dot ${b.key}`} /> {b.label}
          </button>
        ))}
      </div>

      <div className="admin-cal">
        <Calendar
          month={month}
          onMonthChange={setMonth}
          onDayClick={onDay}
          dayProps={(iso) => {
            const status = days[iso] || 'closed';
            return {
              className: `${iso < today ? 'past' : status} editable ${changes[iso] ? 'changed' : ''}`,
              disabled: iso < today,
              tag: status === 'booked' ? 'Reservado' : status === 'available' ? 'Livre' : '',
            };
          }}
        />
        <div className="bulk">
          <h4>Neste mês, rapidamente</h4>
          <button className="btn btn-line" onClick={() => bulk(isWeekend, 'available')}>Liberar todos os fins de semana</button>
          <button className="btn btn-line" onClick={() => bulk((d) => !isWeekend(d), 'available')}>Liberar todos os dias úteis</button>
          <button className="btn btn-line" onClick={() => bulk(() => true, 'available')}>Liberar todos os dias</button>
          <button className="btn btn-line" onClick={() => bulk(() => true, 'closed')}>Limpar dias liberados</button>
          <p className="muted small">As ações em massa nunca alteram dias reservados. Dias com um ponto têm alterações não salvas.</p>
        </div>
      </div>

      <SaveBar dirty={anyDirty} onSave={save} onDiscard={discardAll} label={`Alterações não salvas (${label})`} />
    </section>
  );
}
