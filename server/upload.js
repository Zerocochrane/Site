import multer from 'multer';
import path from 'node:path';
import { PRIVATE_DIR } from './paths.js';

// Portfolio uploads land in a private temp folder; the route then creates the public watermarked copy.
export const upload = multer({
  dest: path.join(PRIVATE_DIR, 'tmp'),
  limits: { fileSize: 40 * 1024 * 1024, files: 100 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|tiff|avif)$/.test(file.mimetype);
    cb(ok ? null : new Error(`"${file.originalname}" não é uma imagem compatível (JPG, PNG, WEBP, TIFF, AVIF).`), ok);
  },
});

export const photoUrl = (p) => (p ? { ...p, url: `/uploads/${p.filename}` } : p);
