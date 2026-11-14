import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { api, auth } from '../api.js';
import PortfolioAdmin from './PortfolioAdmin.jsx';
import GroupAdmin from './GroupAdmin.jsx';
import SubgroupAdmin from './SubgroupAdmin.jsx';
import CalendarAdmin from './CalendarAdmin.jsx';
import RequestsAdmin from './RequestsAdmin.jsx';
import SettingsAdmin from './SettingsAdmin.jsx';
import CategoriesAdmin from './CategoriesAdmin.jsx';
import RequestDetail from './RequestDetail.jsx';
import FinanceAdmin from './FinanceAdmin.jsx';
import TrafficAdmin from './TrafficAdmin.jsx';
import ClientsAdmin from './ClientsAdmin.jsx';
import ClientAdmin from './ClientAdmin.jsx';
import { UnsavedProvider, useUnsaved } from './unsaved.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

// "Adicionar à tela inicial" abre direto no painel (só nas páginas /admin)
function useAdminManifest() {
  useEffect(() => {
    const link = Object.assign(document.createElement('link'), { rel: 'manifest', href: '/manifest.webmanifest' });
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
}

export default function Admin() {
  useAdminManifest();
  const [status, setStatus] = useState(auth.get() ? 'checking' : 'out');

  useEffect(() => {
    if (status === 'checking') api('/me').then(() => setStatus('in')).catch(() => setStatus('out'));
  }, [status]);

  if (status === 'checking') return <div className="admin-shell"><p className="muted">Carregando…</p></div>;
  if (status === 'out') return <Login onIn={() => setStatus('in')} />;

  const logout = () => { auth.clear(); setStatus('out'); };

  return (
    <UnsavedProvider>
      <AdminShell onLogout={logout} />
    </UnsavedProvider>
  );
}

function AdminShell({ onLogout }) {
  const { confirmLeave } = useUnsaved();
  const { pathname } = useLocation();
  // No celular as abas rolam na horizontal: mantém a aba atual visível
  useEffect(() => {
    document.querySelector('.admin-tabs a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  const logout = () => confirmLeave() && onLogout();
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link to="/" className="logo small">← Ver site</Link>
        <nav className="admin-tabs">
          <NavLink to="/admin/portfolio">Portfólio</NavLink>
          <NavLink to="/admin/clients">Clientes</NavLink>
          <NavLink to="/admin/calendar">Agenda</NavLink>
          <NavLink to="/admin/requests">Pedidos</NavLink>
          <NavLink to="/admin/finance">Financeiro</NavLink>
          <NavLink to="/admin/traffic">Tráfego</NavLink>
          <NavLink to="/admin/settings"><span className="tab-long">Configurações</span><span className="tab-short" aria-hidden="true">Config.</span></NavLink>
        </nav>
        <span className="admin-header-right">
          <ThemeToggle />
          <button className="link-btn" onClick={logout}>Sair</button>
        </span>
      </header>
      <Routes>
        <Route index element={<Navigate to="portfolio" replace />} />
        <Route path="photos" element={<Navigate to="/admin/portfolio" replace />} />
        <Route path="portfolio" element={<PortfolioAdmin />} />
        <Route path="portfolio/:id" element={<GroupAdmin />} />
        <Route path="portfolio/:id/sub/:subId" element={<SubgroupAdmin />} />
        <Route path="clients" element={<ClientsAdmin />} />
        <Route path="clients/:id" element={<ClientAdmin />} />
        <Route path="calendar" element={<CalendarAdmin />} />
        <Route path="calendar/categories" element={<CategoriesAdmin />} />
        <Route path="categories" element={<Navigate to="/admin/calendar/categories" replace />} />
        <Route path="requests" element={<RequestsAdmin />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="finance" element={<FinanceAdmin />} />
        <Route path="traffic" element={<TrafficAdmin />} />
        <Route path="settings" element={<SettingsAdmin />} />
      </Routes>
    </div>
  );
}

function Login({ onIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { token } = await api('/login', { method: 'POST', body: { password } });
      auth.set(token);
      onIn();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="login">
      <ThemeToggle className="login-theme" />
      <form onSubmit={submit}>
        <h1>Acesso<br />do estúdio</h1>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
        {error && <p className="err">{error}</p>}
        <button className="btn btn-accent wide">Entrar →</button>
        <Link to="/" className="muted small">← Voltar ao site</Link>
      </form>
    </div>
  );
}
