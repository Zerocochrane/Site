import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
            <Route path="/work/:slug" element={<Group />} />
            <Route path="/work/:slug/:sub" element={<Group />} />
            <Route path="/availability" element={<Availability />} />
            <Route path="/privacidade" element={<Privacy />} />
          </Route>
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/client/*" element={<ClientArea />} />
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  </React.StrictMode>
);
