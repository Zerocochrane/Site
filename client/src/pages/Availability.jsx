import { useEffect, useMemo, useRef, useState } from 'react';
import { api, todayISO, prettyDate, toISO } from '../api.js';
import { useSettings } from '../settings.jsx';
import Calendar from '../components/Calendar.jsx';
import { contactLinks } from '../contact.js';
import usePageTitle from '../pageTitle.js';

const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const REFERRALS = ['Instagram', 'Google', 'Indicação', 'Facebook', 'Outro'];
const KIND_LABEL = { event: 'Evento', photoshoot: 'Ensaio' };
const NO_DATE = 'sem-data'; // pedido sem data definida ("só quero um orçamento")
const monthOf = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(y, m - 1, 1); };
const monthName = (d) => d.toLocaleDateString('pt-BR', { month: 'long' });
// Nomes dos campos, para a mensagem "Confira: …"
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** '2027-05' → 'maio de 2027' */
const monthText = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1].toLowerCase()} de ${y}`; };
const FIELD_NAMES = { estimatedMonth: 'previsão da data', categoryId: 'o que agendar', durationHours: 'duração', name: 'nome', email: 'e-mail', phone: 'telefone', referralName: 'quem indicou' };

export default function Availability() {
  const { settings } = useSettings();
  usePageTitle('Agendar');
  const [month, setMonth] = useState(() => new Date());
  const [days, setDays] = useState({});
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [nextFree, setNextFree] = useState(undefined); // próximo dia livre depois do mês exibido (undefined = carregando)
  const touched = useRef(false); // a pessoa já mudou de mês?
  const panelRef = useRef(null);
  const today = todayISO();
  const contact = contactLinks(settings, 'Olá! Vi o seu site e gostaria de saber mais.');

  // Abre no primeiro mês que tem dia livre (não necessariamente o mês atual)
  useEffect(() => {
    api('/availability/next').then(({ date }) => {
      if (date && !touched.current) setMonth(monthOf(date));
    }).catch(() => {});
  }, []);
  const earliest = settings?.earliestBookableDate && settings.earliestBookableDate > today ? settings.earliestBookableDate : today;

  const load = () => {
    const from = toISO(new Date(month.getFullYear(), month.getMonth(), 1));
    const to = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    api(`/availability?from=${from}&to=${to}`)
      .then((rows) => setDays(Object.fromEntries(rows.map((r) => [r.date, r.status]))))
      .catch(() => setDays({}));
  };
  useEffect(load, [month]);
  // Mês sem dias livres: descobre o próximo dia livre depois dele
  useEffect(() => {
    setNextFree(undefined);
    const end = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    api(`/availability/next?after=${end}`).then(({ date }) => setNextFree(date)).catch(() => setNextFree(null));
  }, [month]);

  // Ao escolher um dia (ou "sem data"), leva até o formulário se ele estiver fora da tela (celular)
  const choose = (value) => {
    setSelected(value);
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.6 || r.top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const changeMonth = (m) => { touched.current = true; setMonth(m); setSelected((s) => (s === NO_DATE ? s : null)); };
  useEffect(() => { api('/categories').then(setCategories).catch(() => setCategories([])); }, []);

  const openCount = useMemo(
    () => Object.entries(days).filter(([d, s]) => s === 'available' && d >= earliest).length,
    [days, earliest]
  );

  return (
    <section className="availability">
      <div className="section-label">Disponibilidade</div>
      <h2 className="page-title">Escolha uma data.<br /><em>Me conte tudo.</em></h2>

      <div className="avail-layout">
        <div>
          <Calendar
            month={month}
            minMonth={new Date()}
            onMonthChange={changeMonth}
            onDayClick={(iso) => choose(iso)}
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
          {earliest > today && earliest.slice(0, 7) === toISO(month).slice(0, 7) && (
            <p className="muted small">Agendamentos a partir de {prettyDate(earliest, { day: 'numeric', month: 'long' })}.</p>
          )}
          {openCount === 0 && nextFree !== undefined && (
            <div className="empty-month">
              {nextFree ? (
                <>
                  <p>Nenhuma data livre em {monthName(month)}. Próxima data livre: <b>{prettyDate(nextFree, { day: 'numeric', month: 'long' })}</b>.</p>
                  <button type="button" className="btn btn-line small" onClick={() => changeMonth(monthOf(nextFree))}>Ver {monthName(monthOf(nextFree))} →</button>
                </>
              ) : (
                <p>Ainda não abri datas depois de {monthName(month)}. Envie um pedido sem data e eu te aviso quando abrir a agenda.</p>
              )}
            </div>
          )}
        </div>

        <div className="booking-panel" ref={panelRef}>
          {selected ? (
            <BookingForm
              key={selected}
              date={selected === NO_DATE ? null : selected}
              categories={categories}
              onBooked={load}
              onPickDate={selected === NO_DATE ? () => setSelected(null) : null}
            />
          ) : (
            <div className="booking-empty">
              <p className="big-arrow">←</p>
              <p>Escolha um dos dias destacados para enviar um pedido de agendamento.</p>
              <div className="booking-alt">
                <button type="button" className="btn btn-line small" onClick={() => choose(NO_DATE)}>Ainda não tenho data / só quero um orçamento</button>
                {contact.any && (
                  <p className="muted small">
                    Prefere conversar?{' '}
                    {contact.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>}
                    {contact.whatsapp && contact.email && ' · '}
                    {contact.email && <a href={contact.email}>E-mail</a>}
                  </p>
                )}
              </div>
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

function BookingForm({ date, categories, onBooked, onPickDate }) {
  const formRef = useRef(null);
  const [form, setForm] = useState({
    categoryId: null, durationHours: null, name: '', email: '', phone: '',
    referralSource: '', referralName: '', referralInstagram: '', message: '', website: '',
  });
  const [extra, setExtra] = useState({});
  const [est, setEst] = useState({ m: '', y: '' }); // sem data: previsão (mês/ano), opcional
  const now = new Date();
  const thisYear = now.getFullYear();
  const years = [0, 1, 2, 3].map((k) => thisYear + k);
  const estimatedMonth = est.m && est.y ? `${est.y}-${est.m}` : '';
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
      if (!date && Boolean(est.m) !== Boolean(est.y)) {
        const e = new Error('Confira: previsão da data.');
        e.details = { estimatedMonth: 'Escolha o mês e o ano (ou deixe os dois em branco).' };
        throw e;
      }
      await api('/inquiries', { method: 'POST', body: { ...form, extra, ...(date ? { eventDate: date } : { noDate: true, estimatedMonth }) } });
      setState('done');
    } catch (err) {
      const errs = err.details || {};
      setErrors(errs);
      const names = Object.keys(errs).map((k) => FIELD_NAMES[k] || (k.startsWith('extra.') ? category?.fields.find((f) => `extra.${f.id}` === k)?.label?.toLowerCase() : null)).filter(Boolean);
      setErrorMsg(names.length ? `Confira: ${names.join(', ')}.` : err.message);
      setState('error');
      if (errs.eventDate) onBooked();
      // leva até o primeiro campo com erro e coloca o cursor nele
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector('.err');
        const box = first?.closest('label, fieldset');
        if (!box) return;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        box.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
      });
    }
  };

  if (state === 'done') {
    return (
      <div className="booking-done">
        <h3>Pedido enviado.</h3>
        <p>
          Obrigada, {form.name.split(' ')[0]}! Enviei uma cópia do seu pedido ({category?.name.toLowerCase()}, {date ? prettyDate(date) : estimatedMonth ? `sem data definida — previsão: ${monthText(estimatedMonth)}` : 'sem data definida'}) para{' '}
          <strong>{form.email}</strong>. Entrarei em contato em até 2 dias úteis.
        </p>
      </div>
    );
  }

  return (
    <form className="booking-form" onSubmit={submit} noValidate ref={formRef}>
      {date ? (
        <p className="booking-date">{prettyDate(date)}</p>
      ) : (
        <div className="booking-date nodate">
          <p>Sem data definida</p>
          <span className="muted small">Me conte o que você imagina — respondo com valores e datas possíveis.{' '}
            {onPickDate && <button type="button" className="link-btn" onClick={onPickDate}>Escolher uma data</button>}
          </span>
        </div>
      )}
      {!date && (
        <fieldset className="estimate">
          <legend>Previsão da data <span className="muted">(opcional)</span></legend>
          <div className="estimate-row">
            <label>Mês
              <select value={est.m} onChange={(e) => { setEst((x) => ({ ...x, m: e.target.value })); setErrors((er) => ({ ...er, estimatedMonth: undefined })); }} aria-invalid={errors.estimatedMonth ? true : undefined}>
                <option value="">Mês…</option>
                {MONTHS.map((name, k) => {
                  const mm = String(k + 1).padStart(2, '0');
                  const past = Number(est.y) === thisYear && k < now.getMonth();
                  return <option key={mm} value={mm} disabled={past}>{name}</option>;
                })}
              </select>
            </label>
            <label>Ano
              <select value={est.y} onChange={(e) => {
                const y = e.target.value;
                // um mês que já passou neste ano deixa de valer
                setEst((x) => ({ y, m: Number(y) === thisYear && x.m && Number(x.m) - 1 < now.getMonth() ? '' : x.m }));
                setErrors((er) => ({ ...er, estimatedMonth: undefined }));
              }} aria-invalid={errors.estimatedMonth ? true : undefined}>
                <option value="">Ano…</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          {errors.estimatedMonth && <p className="err">{errors.estimatedMonth}</p>}
        </fieldset>
      )}

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

      {state === 'error' && <p className="err" role="alert">{errors.eventDate || errorMsg}</p>}
      <p className="muted small">* campos obrigatórios</p>
      <button className="btn btn-accent wide" disabled={state === 'sending'}>
        {state === 'sending' ? 'Enviando…' : 'Enviar pedido →'}
      </button>
    </form>
  );
}
