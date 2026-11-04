// Contagem de visitas do site público + localização aproximada (só com permissão do visitante).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { auth } from './api.js';

const VISIT_KEY = 'site_visit';          // sessionStorage: { id, token, at }
const VISITOR_KEY = 'site_visitor';      // localStorage: id aleatório deste navegador
const CONSENT_KEY = 'site_location';     // localStorage: 'granted' | 'denied'
const VISIT_GAP_MS = 30 * 60 * 1000;     // 30 min sem atividade = nova visita

const get = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const put = (s, k, v) => { try { s.setItem(k, v); } catch { /* modo privado */ } };
const post = (path, body) =>
  fetch(`/api/track${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);

function visitorId() {
  let id = get(localStorage, VISITOR_KEY);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    put(localStorage, VISITOR_KEY, id);
  }
  return id;
}

// Estado do aviso de localização, compartilhado com o componente <LocationConsent/>
let askForLocation = false;
let currentVisit = null;
const listeners = new Set();
const setAsk = (v) => { askForLocation = v; listeners.forEach((l) => l()); };
const useAsk = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => askForLocation);

const canLocate = () => typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;

function sendLocation(visit) {
  if (!canLocate()) return post('/location', { ...visit, unavailable: true });
  navigator.geolocation.getCurrentPosition(
    (pos) => post('/location', { ...visit, lat: pos.coords.latitude, lon: pos.coords.longitude }),
    (err) => {
      if (err.code === 1) { put(localStorage, CONSENT_KEY, 'denied'); post('/location', { ...visit, denied: true }); }
      else post('/location', { ...visit, unavailable: true });
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 24 * 60 * 60 * 1000 }
  );
}

let starting = null; // evita visitas duplicadas (React StrictMode / navegação rápida)
async function startVisit(path) {
  const consent = get(localStorage, CONSENT_KEY);
  const res = await post('/visit', { visitor: visitorId(), path, referrer: document.referrer, consent });
  if (!res?.id) return null;
  const visit = { id: res.id, token: res.token };
  put(sessionStorage, VISIT_KEY, JSON.stringify({ ...visit, at: Date.now(), lastPath: path }));
  currentVisit = visit;
  if (consent === 'granted') sendLocation(visit);
  else if (consent !== 'denied') {
    if (canLocate()) setAsk(true);
    else post('/location', { ...visit, unavailable: true }); // site sem HTTPS: o navegador não deixa pedir
  }
  return visit;
}

/** Registra a visita e as páginas vistas. Não conta a fotógrafa (logada no painel) nem robôs. */
export function useVisitTracking(pathname) {
  useEffect(() => {
    if (auth.get() || navigator.webdriver) return;
    let saved = null;
    try { saved = JSON.parse(get(sessionStorage, VISIT_KEY) || 'null'); } catch { /* ignore */ }
    if (saved && Date.now() - saved.at < VISIT_GAP_MS) {
      currentVisit = { id: saved.id, token: saved.token };
      put(sessionStorage, VISIT_KEY, JSON.stringify({ ...saved, at: Date.now(), lastPath: pathname }));
      if (saved.lastPath !== pathname) post('/page', currentVisit);
      return;
    }
    if (!starting) starting = startVisit(pathname).finally(() => { starting = null; });
  }, [pathname]);
}

/** Aviso (LGPD) pedindo a localização aproximada. Aparece uma vez por navegador. */
export function LocationConsent() {
  const ask = useAsk();
  const [closing, setClosing] = useState(false);
  if (!ask) return null;
  const answer = (granted) => {
    put(localStorage, CONSENT_KEY, granted ? 'granted' : 'denied');
    setClosing(true);
    setAsk(false);
    if (!currentVisit) return;
    if (granted) sendLocation(currentVisit);
    else post('/location', { ...currentVisit, denied: true });
  };
  return (
    <div className={`consent-bar ${closing ? 'closing' : ''}`} role="dialog" aria-live="polite" aria-label="Permissão de localização">
      <p>
        Posso usar a sua <b>localização aproximada</b> (só a cidade) para saber de onde vêm as visitas do site?
        O endereço exato não é guardado.
      </p>
      <div className="consent-actions">
        <button className="btn btn-line small" onClick={() => answer(false)}>Não permitir</button>
        <button className="btn btn-accent small" onClick={() => answer(true)}>Permitir</button>
      </div>
    </div>
  );
}
