// Makes sure sharp/libvips can draw text (watermarks) even on a minimal server
// with no fontconfig setup (/etc/fonts missing → "Fontconfig error: Cannot load
// default config file" and the watermark text silently disappears).
// Writes a small fonts.conf pointing at the fonts bundled in server/fonts and
// sets FONTCONFIG_FILE before the first text is drawn. Import this first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');

function setup() {
  if (process.env.FONTCONFIG_FILE) return; // already configured by the admin
  const cacheDir = path.join(os.tmpdir(), 'portfolio-fontconfig-cache');
  const confFile = path.join(os.tmpdir(), 'portfolio-fonts.conf');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Bundled fonts first, then the usual system font folders (if any exist).
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${esc(FONT_DIR)}</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <cachedir>${esc(cacheDir)}</cachedir>
  ${['sans-serif', 'Helvetica', 'Arial'].map((f) => `<alias binding="same"><family>${f}</family><prefer><family>DejaVu Sans</family></prefer></alias>`).join('\n  ')}
</fontconfig>
`;
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(confFile) || fs.readFileSync(confFile, 'utf8') !== conf) fs.writeFileSync(confFile, conf);
    process.env.FONTCONFIG_FILE = confFile;
  } catch (e) {
    console.warn('Aviso: não consegui configurar as fontes das marcas d’água:', e.message);
  }
}

setup();
