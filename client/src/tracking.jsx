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
    if (canLocate()) watchEngagement(); // só pergunta depois que a pessoa já está vendo o trabalho
    else post('/location', { ...visit, unavailable: true }); // site sem HTTPS: o navegador não deixa pedir
  }
  return visit;
}

// O pedido de localização NÃO aparece na chegada: só quando a pessoa já se envolveu com o site
// (abriu uma segunda página, rolou bastante ou ficou 40 s) — e nunca no Agendar nem na área do cliente.
const QUIET_PATHS = /^\/(availability|agendar|client|cliente)/;
let engaged = false;
let eligible = false;
function maybeAsk() {
  if (!eligible || askForLocation || !engaged) return;
  if (QUIET_PATHS.test(window.location.pathname)) return; // tenta de novo na próxima página
  setAsk(true);
}
function markEngaged() { engaged = true; maybeAsk(); }
function watchEngagement() {
  eligible = true;
  const onScroll = () => {
    if (window.scrollY > window.innerHeight * 1.5) { window.removeEventListener('scroll', onScroll); markEngaged(); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  setTimeout(markEngaged, 40000);
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
      if (saved.lastPath !== pathname) {
        post('/page', currentVisit);
        if (get(localStorage, CONSENT_KEY) === null && canLocate()) { eligible = true; markEngaged(); } // 2ª página
      }
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
    <div className={`consent-bar ${closing ? 'closing' : ''}`} role="region" aria-live="polite" aria-label="Permissão de localização">
      <p>Posso saber sua <b>cidade</b> (aproximada) para as estatísticas do site?</p>
      <div className="consent-actions">
        <button className="consent-btn" onClick={() => answer(false)}>Não</button>
        <button className="consent-btn yes" onClick={() => answer(true)}>Sim</button>
      </div>
    </div>
  );
}
