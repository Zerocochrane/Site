// Short-lived signed links for private client photos (images can't send login headers).
import fs from 'node:fs';
import { sign, safeEqual } from './auth.js';
import db, { isExpired, getClient } from './clientsDb.js';
import { variantPath, VARIANTS } from './clientFiles.js';

const HOUR = 3600 * 1000;
// Rounded expiry so the same link is reused for a while (lets the browser cache it)
const expiry = () => Math.ceil(Date.now() / HOUR) * HOUR + 3 * HOUR;

/** scope = 'a' (photographer) or the client's id */
export function mediaUrl(scope, photo, variant) {
  const e = expiry();
  return `/api/media/${photo.id}/${variant}?s=${scope}&e=${e}&k=${sign(`m:${scope}:${photo.id}:${variant}:${e}`)}`;
}

export function zipUrl(clientId) {
  const e = expiry();
  return `/api/client/download?c=${clientId}&e=${e}&k=${sign(`z:${clientId}:${e}`)}`;
}

export const checkZipSig = (q) => Number(q.e) > Date.now() && safeEqual(q.k || '', sign(`z:${q.c}:${q.e}`));

// What each side may see. Clients never get proof originals (none are stored) or finished originals one by one.
const ALLOWED = { a: { proof: ['thumb', 'preview'], done: ['thumb', 'view'] }, c: { proof: ['thumb', 'preview'], done: ['thumb', 'view'] } };

export function serveMedia(req, res) {
  const { id, variant } = req.params;
  const { s, e, k } = req.query;
  if (!(Number(e) > Date.now()) || !safeEqual(k || '', sign(`m:${s}:${id}:${variant}:${e}`))) return res.status(403).end();
  const photo = db.prepare('SELECT * FROM client_photos WHERE id = ?').get(id);
  if (!photo || !VARIANTS[photo.kind].includes(variant)) return res.status(404).end();
  const side = s === 'a' ? 'a' : 'c';
  if (!ALLOWED[side][photo.kind].includes(variant)) return res.status(403).end();
  if (side === 'c') {
    const client = getClient(photo.client_id);
    if (!client || String(client.id) !== String(s) || isExpired(client)) return res.status(403).end();
    if (photo.kind === 'done' && !client.done_notified_at) return res.status(403).end();
  }
  const file = variantPath(photo.client_id, photo.kind, variant, photo.file);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set({
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  });
  res.type('jpg').sendFile(file);
}
