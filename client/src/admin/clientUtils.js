// Small helpers shared by the client-area screens.
export const STAGES = {
  draft: { label: 'Acesso não enviado', cls: 'draft' },
  selecting: { label: 'Escolhendo fotos', cls: 'selecting' },
  expired: { label: 'Acesso expirado', cls: 'expired' },
  confirmed: { label: 'Seleção confirmada', cls: 'confirmed' },
  delivered: { label: 'Fotos entregues', cls: 'delivered' },
  archived: { label: 'Arquivado', cls: 'archived' },
};

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** "Faltam 5 dias", "Faltam 18 horas", "Expirou há 2 dias" (2+ dias arredondados; menos que isso, em horas) */
export function timeLeft(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600000), mins = Math.max(1, Math.floor(abs / 60000));
  const span = abs >= 47 * 3600000 ? `${Math.round(abs / 86400000)} dias` : hours >= 1 ? `${hours} hora${hours === 1 ? '' : 's'}` : `${mins} minuto${mins === 1 ? '' : 's'}`;
  const one = abs < 47 * 3600000 && (hours === 1 || (hours < 1 && mins === 1));
  return ms > 0 ? `${one ? 'Falta' : 'Faltam'} ${span}` : `Expirou há ${span}`;
}

export const suggestLogin = (name) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40);

export const fmtBytes = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

/** Link do WhatsApp (wa.me) para o telefone do cliente; números sem DDI recebem +55. */
export function whatsappUrl(phone, text = '') {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 10) return null;
  if (digits.length <= 11) digits = `55${digits}`; // DDD + número, sem código do país
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
