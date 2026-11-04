// Link "Adicionar ao Google Agenda" (abre o Google Agenda já preenchido; um clique em Salvar).
import { siteUrl } from './mail.js';

const pad = (n) => String(n).padStart(2, '0');
const compact = (iso) => iso.replace(/-/g, '');

export function formatExtraValue(f) {
  if (f.value === null || f.value === undefined || f.value === '') return '';
  if (f.type === 'money') return Number(f.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (f.type === 'number') return String(f.value).replace('.', ',');
  if (f.type === 'date') return f.value.split('-').reverse().join('/');
  return String(f.value);
}

export function googleCalendarUrl(inq) {
  const extra = Array.isArray(inq.extra) ? inq.extra : [];
  const timeField = extra.find((f) => f.type === 'time' && f.value);
  let dates;
  if (timeField) {
    const [h, m] = timeField.value.split(':').map(Number);
    const start = new Date(Date.UTC(...inq.event_date.split('-').map((v, i) => (i === 1 ? v - 1 : +v)), h, m));
    const end = new Date(start.getTime() + (inq.duration_hours || 1) * 3600 * 1000);
    const f = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
    dates = `${f(start)}/${f(end)}`; // horário local, interpretado com ctz=America/Sao_Paulo
  } else {
    const next = new Date(`${inq.event_date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    dates = `${compact(inq.event_date)}/${compact(next.toISOString().slice(0, 10))}`; // dia inteiro
  }

  const lines = [
    `Cliente: ${inq.name}`,
    `E-mail: ${inq.email}`,
    `Telefone: ${inq.phone || '-'}`,
    inq.duration_hours ? `Duração: ${String(inq.duration_hours).replace('.', ',')} h` : '',
    ...extra.map((f) => `${f.label}: ${formatExtraValue(f)}`),
    inq.message ? `\nObservações: ${inq.message}` : '',
    `\nPedido: ${siteUrl()}/admin/requests/${inq.id}`,
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${inq.event_type} – ${inq.name}`,
    dates,
    details: lines.join('\n'),
    ctz: 'America/Sao_Paulo',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
