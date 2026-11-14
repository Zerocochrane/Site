import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { initials } from '../initials.js';
import { useSettings } from '../settings.jsx';
import { contactLinks } from '../contact.js';
import ThemeToggle from './ThemeToggle.jsx';
import useImageProtection from './useImageProtection.js';
import { useVisitTracking, LocationConsent } from '../tracking.jsx';

export default function PublicLayout() {
  const { settings } = useSettings();
  const contact = contactLinks(settings);
  const location = useLocation();
  useVisitTracking(location.pathname);
  // Cabeçalho: as iniciais só aparecem no topo depois que a capa da página inicial sai da tela
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 260);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const isHome = location.pathname === '/';
  // No right-click / drag / long-press saving of portfolio photos (text stays usable)
  useImageProtection(true, 'img, .work-cover, .sub-cover, .ss-stage, .car-stage, .car-thumbs, .lightbox, .next-work', { keys: false });

  // Scroll to #work (etc.) when a link points at a section
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 80);
    return () => clearTimeout(t);
  }, [location]);
  return (
    <>
      <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
        <nav className="nav-left">
          <NavLink to="/#work" className={() => (location.pathname.startsWith('/trabalhos') ? 'active' : '')}>Trabalhos</NavLink>
        </nav>
        <Link to="/" className={`logo-mark ${isHome && !scrolled ? 'hide' : ''}`} aria-label={settings?.name || 'Início'}>
          {initials(settings?.name)}
        </Link>
        <nav className="nav-right">
          <ThemeToggle />
          <NavLink to="/agendar" className="nav-cta">Agendar</NavLink>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        {/* Discreet way into the admin: the copyright line is the login link (looks like plain text) */}
        <Link to="/admin" className="footer-copy" title="Área da fotógrafa">© {new Date().getFullYear()} {settings?.name}</Link>
        {settings?.instagram && (
          <a href={`https://instagram.com/${settings.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
            Instagram ↗
          </a>
        )}
        {contact.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noreferrer">WhatsApp ↗</a>}
        {contact.email && <a href={contact.email}>E-mail</a>}
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/cliente" className="footer-client">Área do cliente</Link>
      </footer>
      <LocationConsent />
    </>
  );
}
