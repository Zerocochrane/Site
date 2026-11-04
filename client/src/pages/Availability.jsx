import { useEffect, useMemo, useState } from 'react';
import { api, todayISO, prettyDate, toISO } from '../api.js';
import { useSettings } from '../settings.jsx';
import Calendar from '../components/Calendar.jsx';

const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const REFERRALS = ['Instagram', 'Google', 'Indicação', 'Facebook', 'Outro'];
const KIND_LABEL = { event: 'Evento', photoshoot: 'Ensaio' };

export default function Availability() {
  const { settings } = useSettings();
  const [month, setMonth] = useState(() => new Date());
  const [days, setDays] = useState({});
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const today = todayISO();
  const earliest = settings?.earliestBookableDate && settings.earliestBookableDate > today ? settings.earliestBookableDate : today;

  const load = () => {
    const from = toISO(new Date(month.getFullYear(), month.getMonth(), 1));
    const to = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    api(`/availability?from=${from}&to=${to}`)
      .then((rows) => setDays(Object.fromEntries(rows.map((r) => [r.date, r.status]))))
      .catch(() => setDays({}));
  };
  useEffect(load, [month]);
  useEffect(() => { api('/categories').then(setCategories).catch(() => setCategories([])); }, []);

  const openCount = useMemo(
    () => Object.entries(days).filter(([d, s]) => s === 'available' && d >= earliest).length,
    [days, earliest]
  );

  return (
    <section className="availability">
      <div className="section-label"><span>03</span> Disponibilidade</div>
      <h2 className="page-title">Escolha uma data.<br /><em>Me conte tudo.</em></h2>

      <div className="avail-layout">
        <div>
          <Calendar
            month={month}
            minMonth={new Date()}
            onMonthChange={(m) => { setMonth(m); setSelected(null); }}
            onDayClick={(iso) => setSelected(iso)}
            dayProps={(iso) => {
              const status = iso < earliest ? 'past' : days[iso] || 'closed';
              return {
                className: `${status}${selected === iso ? ' selected' : ''}`,
                disabled: status !== 'available',
                label: status === 'available' ? 'Disponível' : status === 'booked' ? 'Reservado' : undefined,
              };
            }}
          />
          <div className="legend">
            <span><i className="dot available" /> Disponível</span>
            <span><i className="dot booked" /> Reservado</span>
            <span><i className="dot closed" /> Indisponível</span>
          </div>
          {earliest > today && (
            <p className="muted small">Agendamentos a partir de {prettyDate(earliest, { day: 'numeric', month: 'long' })}.</p>
          )}
          {openCount === 0 && <p className="muted small">Nenhuma data disponível neste mês — veja o próximo.</p>}
        </div>

        <div className="booking-panel">
          {selected ? (
            <BookingForm key={selected} date={selected} categories={categories} onBooked={load} />
          ) : (
            <div className="booking-empty">
              <p className="big-arrow">←</p>
              <p>Escolha um dos dias destacados para enviar um pedido de agendamento.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ExtraField({ field, value, onChange, error }) {
  const common = { value: value ?? '', onChange: (e) => onChange(e.target.value), required: field.required };
  let input;
  if (field.type === 'number') input = <input type="number" inputMode="decimal" step="any" {...common} />;
  else if (field.type === 'date') input = <input type="date" {...common} />;
  else if (field.type === 'time') input = <input type="time" {...common} />;
  else if (field.type === 'money') {
    input = (
      <span className="money-input"><span>R$</span><input inputMode="decimal" placeholder="0,00" {...common} /></span>
    );
  } else input = <input {...common} />;
  return (
    <label>
      {field.label}{field.required ? ' *' : ''}
      {input}
      {error && <span className="err">{error}</span>}
    </label>
  );
}

function BookingForm({ date, categories, onBooked }) {
  const [form, setForm] = useState({
    categoryId: null, durationHours: null, name: '', email: '', phone: '',
    referralSource: '', referralName: '', referralInstagram: '', message: '', website: '',
  });
  const [extra, setExtra] = useState({});
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const category = categories.find((c) => c.id === form.categoryId);

  const pickCategory = (c) => {
    setForm((f) => ({ ...f, categoryId: c.id, durationHours: c.hasDuration ? f.durationHours : null }));
    setErrors((e) => ({ ...e, categoryId: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setErrors({});
    try {
      await api('/inquiries', { method: 'POST', body: { ...form, extra, eventDate: date } });
      setState('done');
    } catch (err) {
      setErrors(err.details || {});
      setErrorMsg(err.message);
      setState('error');
      if (err.details?.eventDate) onBooked();
    }
  };

  if (state === 'done') {
    return (
      <div className="booking-done">
        <h3>Pedido enviado.</h3>
        <p>
          Obrigada, {form.name.split(' ')[0]}! Enviei uma cópia do seu pedido ({category?.name.toLowerCase()}, {prettyDate(date)}) para{' '}
          <strong>{form.email}</strong>. Entrarei em contato em até 2 dias úteis.
        </p>
      </div>
    );
  }

  return (
    <form className="booking-form" onSubmit={submit} noValidate>
      <p className="booking-date">{prettyDate(date)}</p>

      <fieldset>
        <legend>O que você quer agendar? *</legend>
        <div className="chips">
          {categories.map((c) => (
            <button type="button" key={c.id} className={`chip ${form.categoryId === c.id ? 'on' : ''}`} onClick={() => pickCategory(c)}>
              {c.name}
            </button>
          ))}
        </div>
        {category && <p className="muted small">{KIND_LABEL[category.kind]}</p>}
        {errors.categoryId && <p className="err">{errors.categoryId}</p>}
      </fieldset>

      {category?.hasDuration && (
        <fieldset>
          <legend>Duração * <span className="muted">(horas)</span></legend>
          <div className="chips">
            {DURATIONS.map((h) => (
              <button type="button" key={h} className={`chip num ${form.durationHours === h ? 'on' : ''}`} onClick={() => set('durationHours')(h)}>
                {h}h
              </button>
            ))}
          </div>
          {errors.durationHours && <p className="err">{errors.durationHours}</p>}
        </fieldset>
      )}

      <div className="row2">
        <label>Nome *<input value={form.name} onChange={set('name')} autoComplete="name" required />{errors.name && <span className="err">{errors.name}</span>}</label>
        <label>E-mail *<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />{errors.email && <span className="err">{errors.email}</span>}</label>
      </div>
      <label>Telefone *<input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="(00) 00000-0000" required />{errors.phone && <span className="err">{errors.phone}</span>}</label>

      {category?.fields.length > 0 && (
        <div className="extra-fields">
          {category.fields.map((f) => (
            <ExtraField
              key={f.id}
              field={f}
              value={extra[f.id]}
              onChange={(v) => setExtra((x) => ({ ...x, [f.id]: v }))}
              error={errors[`extra.${f.id}`]}
            />
          ))}
        </div>
      )}

      <label>
        Como você me conheceu?
        <select value={form.referralSource} onChange={set('referralSource')}>
          <option value="">Selecione…</option>
          {REFERRALS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {form.referralSource === 'Indicação' && (
        <div className="row2">
          <label>Quem indicou? *<input value={form.referralName} onChange={set('referralName')} />{errors.referralName && <span className="err">{errors.referralName}</span>}</label>
          <label>Instagram de quem indicou<input value={form.referralInstagram} onChange={set('referralInstagram')} placeholder="@usuario" /></label>
        </div>
      )}

      <label>Observações<textarea rows={3} value={form.message} onChange={set('message')} placeholder="Local, número de convidados, ideias…" /></label>
      <input className="hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" />

      {state === 'error' && <p className="err">{errors.eventDate || errorMsg}</p>}
      <p className="muted small">* campos obrigatórios</p>
      <button className="btn btn-accent wide" disabled={state === 'sending'}>
        {state === 'sending' ? 'Enviando…' : 'Enviar pedido →'}
      </button>
    </form>
  );
}
