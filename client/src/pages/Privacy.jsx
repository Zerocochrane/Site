import { useSettings } from '../settings.jsx';
import { contactLinks } from '../contact.js';
import usePageTitle from '../pageTitle.js';

const CONSENT_KEY = 'site_location';

/** Página curta de privacidade (LGPD): o que o site guarda e como mudar a resposta sobre localização. */
export default function Privacy() {
  const { settings } = useSettings();
  const contact = contactLinks(settings);
  usePageTitle('Privacidade');
  let answer = null;
  try { answer = localStorage.getItem(CONSENT_KEY); } catch { /* modo privado */ }
  const reset = () => { try { localStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ } window.location.reload(); };

  return (
    <section className="privacy">
      <div className="section-label">Privacidade</div>
      <h1 className="page-title">O que este site guarda</h1>
      <ul>
        <li><b>Visitas:</b> quantas pessoas visitam o site, quais páginas e de onde vieram (por exemplo, Instagram ou Google), para estatísticas. Não usamos cookies de publicidade.</li>
        <li><b>Cidade (opcional):</b> só se você responder “Sim” ao pedido de localização. Guardamos apenas a cidade aproximada — nunca o endereço ou as coordenadas.</li>
        <li><b>Pedidos de agendamento:</b> nome, e-mail, telefone e o que você escrever, usados só para responder ao seu pedido.</li>
      </ul>
      <p>
        Sua resposta sobre a localização: <b>{answer === 'granted' ? 'permitida' : answer === 'denied' ? 'não permitida' : 'ainda não respondida'}</b>.
        {answer && <> <button type="button" className="link-btn" onClick={reset}>Mudar minha resposta</button></>}
      </p>
      {contact.any && (
        <p>Dúvidas ou pedido para apagar seus dados:{' '}
          {contact.email && <a href={contact.email}>e-mail</a>}{contact.email && contact.whatsapp && ' ou '}
          {contact.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>}.
        </p>
      )}
    </section>
  );
}
