// Portfolio photos: the public site only ever gets a watermarked, reduced copy.
// The original file is moved to server/private/portfolio/ (never served).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import './fonts.js';
import sharp from 'sharp';
import db, { getSettings } from './db.js';
import { UPLOAD_DIR, PRIVATE_DIR } from './paths.js';
import { watermarkSvg } from './clientFiles.js';

export const ORIGINALS_DIR = path.join(PRIVATE_DIR, 'portfolio');
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });

const MAX_SIZE = 2200;      // longest side of the public copy
const STRENGTH = 0.55;      // subtler than the client proofs
const label = () => `© ${getSettings().name || 'Photography'}`;

function moveFile(from, to) {
  try { fs.renameSync(from, to); } catch { fs.copyFileSync(from, to); fs.rmSync(from, { force: true }); }
}

/**
 * Creates the public watermarked copy from `source` and keeps the original privately.
 * Returns { filename, origFile, width, height }.
 */
export async function makePublicCopy(source, originalName) {
  const base = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const resized = await sharp(source).rotate()
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const out = await sharp(resized.data)
    .composite([{ input: watermarkSvg(width, height, label(), STRENGTH) }])
    .jpeg({ quality: 84, mozjpeg: true })   // EXIF/GPS metadata is not copied
    .toBuffer();
  const filename = `${base}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), out);
  const origFile = `${base}${(path.extname(originalName || '') || '.jpg').toLowerCase()}`;
  moveFile(source, path.join(ORIGINALS_DIR, origFile));
  return { filename, origFile, width, height };
}

export function removePortfolioFiles(photo) {
  if (photo.filename) fs.rm(path.join(UPLOAD_DIR, photo.filename), { force: true }, () => {});
  if (photo.orig_file) fs.rm(path.join(ORIGINALS_DIR, photo.orig_file), { force: true }, () => {});
}

/**
 * Re-creates every public portfolio copy from its private original (new file name, so
 * browsers don't keep the old cached copy). Used after fixing the watermark fonts.
 * `onProgress(done, total)` is called after each photo.
 */
export async function rewatermarkPortfolio(onProgress = () => {}) {
  const rows = db.prepare('SELECT id, filename, orig_file FROM photos WHERE orig_file IS NOT NULL AND orig_file != \'\'').all();
  const update = db.prepare('UPDATE photos SET filename = ?, orig_file = ?, width = ?, height = ? WHERE id = ?');
  let done = 0, skipped = 0;
  for (const r of rows) {
    const orig = path.join(ORIGINALS_DIR, r.orig_file);
    if (!fs.existsSync(orig)) { skipped++; onProgress(done + skipped, rows.length); continue; }
    // makePublicCopy moves its source, so work on a copy and keep the original where it is
    const tmp = path.join(PRIVATE_DIR, 'tmp', `rewm-${crypto.randomBytes(6).toString('hex')}${path.extname(r.orig_file)}`);
    try {
      fs.copyFileSync(orig, tmp);
      const out = await makePublicCopy(tmp, r.orig_file);
      fs.rmSync(path.join(ORIGINALS_DIR, out.origFile), { force: true }); // duplicate of the original
      update.run(out.filename, r.orig_file, out.width, out.height, r.id);
      if (r.filename && r.filename !== out.filename) fs.rmSync(path.join(UPLOAD_DIR, r.filename), { force: true });
      done++;
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      skipped++;
      console.log(`! ${r.filename}: ${err.message}`);
    }
    onProgress(done + skipped, rows.length);
  }
  return { done, skipped, total: rows.length };
}

/** One-time conversion of photos uploaded before watermarking existed. Runs in the background. */
export async function watermarkExistingPhotos() {
  const rows = db.prepare('SELECT id, filename FROM photos WHERE wm = 0').all();
  if (!rows.length) return 0;
  console.log(`Adding the watermark to ${rows.length} existing portfolio photo(s)…`);
  const update = db.prepare('UPDATE photos SET filename = ?, orig_file = ?, width = ?, height = ?, wm = 1 WHERE id = ?');
  let done = 0;
  for (const r of rows) {
    const current = path.join(UPLOAD_DIR, r.filename);
    if (!fs.existsSync(current)) { db.prepare('UPDATE photos SET wm = 1 WHERE id = ?').run(r.id); continue; }
    try {
      const out = await makePublicCopy(current, r.filename);
      update.run(out.filename, out.origFile, out.width, out.height, r.id);
      done++;
    } catch (err) {
      console.error(`Could not watermark ${r.filename}:`, err.message);
    }
  }
  console.log(`Watermark added to ${done} photo(s). Originals moved to server/private/portfolio/.`);
  return done;
}
