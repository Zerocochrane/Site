// Contato público da fotógrafa (Configurações → WhatsApp / e-mail de contato).

/** Link do WhatsApp para um número brasileiro digitado de qualquer jeito: "(32) 99999-0000" → wa.me/5532999990000 */
export function whatsappUrl(number, text = '') {
  let d = String(number || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = `55${d.replace(/^0+/, '')}`; // sem código do país → Brasil
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** { whatsapp, email } prontos para usar em links, ou null quando não preenchidos. */
export function contactLinks(settings, text = '') {
  const whatsapp = whatsappUrl(settings?.whatsapp, text);
  const email = settings?.contactEmail?.trim() ? `mailto:${settings.contactEmail.trim()}` : null;
  return { whatsapp, email, any: Boolean(whatsapp || email) };
}
