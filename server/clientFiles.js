// Stores and processes client-area photos. Nothing here is publicly reachable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import './fonts.js'; // fonts for the watermark text (minimal servers have none)
import sharp from 'sharp';
import multer from 'multer';
import { PRIVATE_DIR } from './paths.js';

sharp.cache(false);

export const clientDir = (clientId) => path.join(PRIVATE_DIR, 'clients', String(clientId));
// proof: thumb + preview (watermarked, reduced). done: thumb + view (reduced) + orig (full quality, for the zip).
export const VARIANTS = { proof: ['thumb', 'preview'], done: ['thumb', 'view', 'orig'] };
export const variantPath = (clientId, kind, variant, file) => path.join(clientDir(clientId), kind, variant, file);

export const clientUpload = multer({
  dest: path.join(PRIVATE_DIR, 'tmp'),
  limits: { fileSize: 80 * 1024 * 1024, files: 30 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|tiff)$/.test(file.mimetype);
    cb(ok ? null : new Error(`"${file.originalname}" não é uma imagem compatível. Exporte arquivos JPG, PNG, WEBP ou TIFF.`), ok);
  },
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Diagonal repeating watermark covering the whole picture. */
/** Diagonal repeating text. `strength` 1 = proofs (strong), lower = subtler (portfolio). */
export function watermarkSvg(width, height, label, strength = 1) {
  const size = Math.max(14, Math.round(Math.min(width, height) / 14));
  const gapX = size * (label.length * 0.62 + 3);
  const gapY = size * 4;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><pattern id="w" width="${gapX}" height="${gapY}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${size}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="700"
        fill="#ffffff" fill-opacity="${(0.32 * strength).toFixed(3)}" stroke="#000000" stroke-opacity="${(0.22 * strength).toFixed(3)}" stroke-width="${Math.max(1, size / 22)}">${esc(label)}</text>
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#w)"/>
  </svg>`);
}

async function resized(input, max, quality, watermark) {
  const base = await sharp(input).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  let img = sharp(base.data);
  if (watermark) img = img.composite([{ input: watermarkSvg(base.info.width, base.info.height, watermark) }]);
  return img.jpeg({ quality, mozjpeg: true }).toBuffer(); // metadata (EXIF, GPS) is stripped
}

/**
 * Turns an uploaded file into the stored variants. Returns the stored file name.
 * Proofs keep only watermarked, reduced copies; finished photos also keep the original.
 */
export async function storePhoto(tmpPath, clientId, kind, watermarkLabel) {
  const file = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.jpg`;
  for (const v of VARIANTS[kind]) fs.mkdirSync(path.join(clientDir(clientId), kind, v), { recursive: true });
  try {
    if (kind === 'proof') {
      fs.writeFileSync(variantPath(clientId, kind, 'thumb', file), await resized(tmpPath, 600, 72, watermarkLabel));
      fs.writeFileSync(variantPath(clientId, kind, 'preview', file), await resized(tmpPath, 1800, 80, watermarkLabel));
    } else {
      fs.writeFileSync(variantPath(clientId, kind, 'thumb', file), await resized(tmpPath, 600, 78));
      fs.writeFileSync(variantPath(clientId, kind, 'view', file), await resized(tmpPath, 2200, 86));
      fs.copyFileSync(tmpPath, variantPath(clientId, kind, 'orig', file)); // untouched original for download
    }
    return file;
  } finally {
    fs.rm(tmpPath, { force: true }, () => {});
  }
}

export function removePhotoFiles(clientId, kind, file) {
  for (const v of VARIANTS[kind]) fs.rm(variantPath(clientId, kind, v, file), { force: true }, () => {});
}

/** Apaga só as fotos do cliente (tudo na pasta dele, menos o contrato). */
export function removeClientPhotoFiles(clientId) {
  const dir = clientDir(clientId);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'contract.pdf') continue;
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}
export const removeClientFiles = (clientId) => fs.rm(clientDir(clientId), { recursive: true, force: true }, () => {});
