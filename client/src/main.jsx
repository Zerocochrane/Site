import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Endereços antigos (em inglês) continuam funcionando: /work/... → /trabalhos/..., etc.
function Moved({ from, to }) {
  const { pathname, search, hash } = useLocation();
  return <Navigate replace to={`${to}${pathname.slice(from.length)}${search}${hash}`} />;
}
// Fontes servidas pelo próprio site (sem Google Fonts: mais rápido e sem enviar o IP dos visitantes a terceiros)
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './styles.css';
import { SettingsProvider } from './settings.jsx';
import PublicLayout from './components/PublicLayout.jsx';
import Home from './pages/Home.jsx';
import Availability from './pages/Availability.jsx';
import Privacy from './pages/Privacy.jsx';
import NotFound from './pages/NotFound.jsx';
import Group from './pages/Group.jsx';
import Admin from './admin/Admin.jsx';
import ClientArea from './pages/ClientArea.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/trabalhos/:slug" element={<Group />} />
            <Route path="/trabalhos/:slug/:sub" element={<Group />} />
            <Route path="/agendar" element={<Availability />} />
            <Route path="/work/*" element={<Moved from="/work" to="/trabalhos" />} />
            <Route path="/availability" element={<Moved from="/availability" to="/agendar" />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/cliente/*" element={<ClientArea />} />
          <Route path="/client/*" element={<Moved from="/client" to="/cliente" />} />
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  </React.StrictMode>
);
