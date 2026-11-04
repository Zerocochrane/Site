import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettings } from '../settings.jsx';
import useImageProtection from './useImageProtection.js';
import { useVisitTracking, LocationConsent } from '../tracking.jsx';

export default function PublicLayout() {
  const { settings } = useSettings();
  const location = useLocation();
  useVisitTracking(location.pathname);
  // No right-click / drag / long-press saving of portfolio photos (text stays usable)
  useImageProtection(true, 'img, .work-cover, .sub-cover, .ss-stage, .car-stage, .car-thumbs, .lightbox, .next-work');

  // Scroll to #work (etc.) when a link points at a section
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 80);
    return () => clearTimeout(t);
  }, [location]);
  return (
    <>
      <header className="site-header">
        <Link to="/" className="logo">{settings?.name || ' '}</Link>
        <nav>
          <NavLink to="/#work" className={() => (location.pathname === '/' || location.pathname.startsWith('/work') ? 'active' : '')}>Trabalhos</NavLink>
          <NavLink to="/availability" className="nav-cta">Agendar</NavLink>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} {settings?.name}</span>
        {settings?.instagram && (
          <a href={`https://instagram.com/${settings.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
            Instagram ↗
          </a>
        )}
        <Link to="/client" className="footer-client">Área do cliente</Link>
        <Link to="/admin" className="footer-admin">Admin</Link>
      </footer>
      <LocationConsent />
    </>
  );
}
