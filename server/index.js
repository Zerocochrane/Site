import 'dotenv/config';
import './fonts.js';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, CLIENT_DIST } from './paths.js';
import { checkPassword, createToken, requireAdmin } from './auth.js';
import photos from './routes/photos.js';
import groups from './routes/groups.js';
import subgroups from './routes/subgroups.js';
import availability from './routes/availability.js';
import inquiries from './routes/inquiries.js';
import settings from './routes/settings.js';
import categories from './routes/categories.js';
import finance from './routes/finance.js';
import track from './routes/track.js';
import traffic from './routes/traffic.js';
import tools from './routes/tools.js';
import adminClients from './routes/adminClients.js';
import clientArea from './routes/clientArea.js';
import { serveMedia } from './media.js';
import { startScheduler } from './scheduler.js';
import { watermarkExistingPhotos } from './portfolioFiles.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

app.post('/api/login', (req, res) => {
  if (!checkPassword(req.body?.password)) return res.status(401).json({ error: 'Senha incorreta.' });
  res.json({ token: createToken() });
});
app.get('/api/me', requireAdmin, (_req, res) => res.json({ ok: true }));

app.use('/api/groups', groups);
app.use('/api/subgroups', subgroups);
app.use('/api/photos', photos);
app.use('/api/availability', availability);
app.use('/api/inquiries', inquiries);
app.use('/api/settings', settings);
app.use('/api/categories', categories);
app.use('/api/finance', finance);
app.use('/api/track', track);
app.use('/api/traffic', traffic);
app.use('/api/admin/tools', tools);
app.use('/api/admin/clients', adminClients);
app.use('/api/client', clientArea);
app.get('/api/media/:id/:variant', serveMedia);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Não encontrado' }));

// Serve the built React app in production
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  // Dev mode: the React site is served by Vite on port 5173, not here.
  app.get('/', (_req, res) =>
    res.send('<h2>A API está funcionando.</h2><p>Em desenvolvimento, abra o site em <a href="http://localhost:5173">http://localhost:5173</a>.</p><p>Para servir o site por esta porta, rode <code>npm run build</code> e depois <code>npm start</code>.</p>')
  );
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Uma foto é grande demais (máx. 40 MB no portfólio, 80 MB na área do cliente).' : err.code === 'LIMIT_FILE_COUNT' ? 'Fotos demais em um só envio.' : err.message });
});

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'change-me') {
  console.warn('⚠  Set ADMIN_PASSWORD in server/.env before going live.');
}

const port = Number(process.env.PORT || 4000);
startScheduler();
watermarkExistingPhotos().catch((e) => console.error('Watermark migration failed:', e.message));

const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
  if (!fs.existsSync(CLIENT_DIST)) console.log('Open the website at http://localhost:5173 (dev mode)');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Close the other program or change PORT in server/.env.`);
  else console.error(err);
  process.exit(1);
});
