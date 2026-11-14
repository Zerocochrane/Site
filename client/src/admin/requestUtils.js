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
  const when = i.event_date ? ` em ${prettyDate(i.event_date)}` : estimateText(i) ? ` (previsão: ${estimateText(i)})` : '';
  const subject = encodeURIComponent(`${i.event_type}${when}`);
  const body = encodeURIComponent(`Olá, ${i.name.split(' ')[0]}!\n\nObrigada pelo contato sobre ${i.event_type.toLowerCase()}${when}.\n\n`);
  return `mailto:${i.email}?subject=${subject}&body=${body}`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Pedido sem data: '2027-05' → 'maio de 2027' ('' se não informou). */
export const estimateText = (i) => {
  const m = /^(\d{4})-(\d{2})$/.exec(i.estimated_month || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} de ${m[1]}` : '';
};
