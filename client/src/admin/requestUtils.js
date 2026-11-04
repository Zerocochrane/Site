import { prettyDate } from '../api.js';

export const STATUS_LABEL = { new: 'novo', replied: 'respondido', confirmed: 'aceito', declined: 'recusado' };
export const KIND_LABEL = { event: 'Evento', photoshoot: 'Ensaio' };

export function formatExtra(f) {
  if (f.value === null || f.value === undefined || f.value === '') return '—';
  if (f.type === 'money') return Number(f.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (f.type === 'number') return String(f.value).replace('.', ',');
  if (f.type === 'date') return f.value.split('-').reverse().join('/');
  return String(f.value);
}

export function referralText(i) {
  if (!i.referral_source) return '';
  if (i.referral_source !== 'Indicação') return i.referral_source;
  return `Indicação de ${i.referral_name}${i.referral_instagram ? ` (@${i.referral_instagram})` : ''}`;
}

export const durationText = (i) => (i.duration_hours ? `${String(i.duration_hours).replace('.', ',')}h` : '');

export function replyLink(i) {
  const subject = encodeURIComponent(`${i.event_type} em ${prettyDate(i.event_date)}`);
  const body = encodeURIComponent(`Olá, ${i.name.split(' ')[0]}!\n\nObrigada pelo contato sobre ${i.event_type.toLowerCase()} em ${prettyDate(i.event_date)}.\n\n`);
  return `mailto:${i.email}?subject=${subject}&body=${body}`;
}
