import { useSettings } from '../settings.jsx';
import { whatsappUrl } from './clientUtils.js';

/** Abre o WhatsApp (app ou WhatsApp Web) numa conversa com o cliente, com uma saudação pronta. */
export default function WhatsAppButton({ client, compact = false }) {
  const { settings } = useSettings();
  const first = client.name.split(/\s+/)[0];
  const url = whatsappUrl(client.phone, `Olá, ${first}! Aqui é ${settings?.name || 'a sua fotógrafa'}. `);

  const open = (e) => {
    e.preventDefault();
    e.stopPropagation(); // não abre a ficha do cliente
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <button
      type="button"
      className={`wa-btn ${compact ? 'compact' : ''}`}
      onClick={open}
      disabled={!url}
      title={url ? `Conversar com ${first} no WhatsApp` : 'Cadastre o telefone do cliente para usar o WhatsApp'}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
      </svg>
      WhatsApp
    </button>
  );
}
