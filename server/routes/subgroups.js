import { Router } from 'express';
import path from 'node:path';
import db, { toSlug, cleanDate } from '../db.js';
import { requireAdmin } from '../auth.js';
import { upload, photoUrl } from '../upload.js';
import { makePublicCopy, removePortfolioFiles } from '../portfolioFiles.js';
import fs from 'node:fs';
import { shapeGroup, shapeSubgroup, publicGroup, idFromKey, getGroupRow, getSubgroupRow, subgroupRows, subgroupPhotos } from '../catalog.js';

const router = Router();

// ---- Public -----------------------------------------------------------------

// One subgroup with its photos, its group, and its sibling subgroups (for the switcher).
router.get('/:key', (req, res) => {
  const s = getSubgroupRow(idFromKey(req.params.key) || 0);
  // Empty subgroups don't exist for visitors (admin screens pass ?all=1)
  if (!s || (!req.query.all && !s.photo_count)) return res.status(404).json({ error: 'Subgrupo não encontrado' });
  const g = getGroupRow(s.group_id);
  const siblings = subgroupRows(g.id)
    .filter((x) => req.query.all || x.photo_count > 0)
    .map((x) => shapeSubgroup(x, g));
  const group = shapeGroup(g);
  res.json({ ...shapeSubgroup(s, g), group: req.query.all ? group : publicGroup(group), siblings, photos: subgroupPhotos(s.id) });
});

// ---- Admin ------------------------------------------------------------------

router.patch('/:id', requireAdmin, (req, res) => {
  const s = getSubgroupRow(req.params.id);
  if (!s) return res.status(404).json({ error: 'Subgrupo não encontrado' });
  const b = req.body || {};
  const date = b.date === undefined ? undefined : cleanDate(b.date);
  if (date === null) return res.status(400).json({ error: 'Data inválida.' });
  if (typeof b.name === 'string') {
    const name = b.name.trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
    db.prepare('UPDATE subgroups SET name = ?, slug = ? WHERE id = ?').run(name, toSlug(name), s.id);
  }
  if (typeof b.description === 'string') {
    db.prepare('UPDATE subgroups SET description = ? WHERE id = ?').run(b.description.trim().slice(0, 2000), s.id);
  }
  if (date !== undefined) {
    db.prepare('UPDATE subgroups SET event_date = ? WHERE id = ?').run(date, s.id);
  }
  if (b.coverPhotoId !== undefined) {
    const pid = b.coverPhotoId === null ? null : Number(b.coverPhotoId);
    if (pid !== null && !db.prepare('SELECT 1 FROM photos WHERE id = ? AND subgroup_id = ?').get(pid, s.id)) {
      return res.status(400).json({ error: 'Essa foto não está neste subgrupo.' });
    }
    db.prepare('UPDATE subgroups SET cover_photo_id = ? WHERE id = ?').run(pid, s.id);
  }
  res.json(shapeSubgroup(getSubgroupRow(s.id), getGroupRow(s.group_id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const s = getSubgroupRow(req.params.id);
  if (!s) return res.status(404).json({ error: 'Subgrupo não encontrado' });
  const photos = db.prepare('SELECT id, filename, orig_file FROM photos WHERE subgroup_id = ?').all(s.id);
  db.transaction(() => {
    const ids = photos.map((p) => p.id);
    if (ids.length) {
      db.prepare(`UPDATE groups SET cover_photo_id = NULL WHERE cover_photo_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
    db.prepare('DELETE FROM photos WHERE subgroup_id = ?').run(s.id);
    db.prepare('DELETE FROM subgroups WHERE id = ?').run(s.id);
  })();
  photos.forEach(removePortfolioFiles);
  res.json({ ok: true });
});

// Upload one or many photos into a subgroup (added at the end).
router.post('/:id/photos', requireAdmin, (req, res, next) => {
  if (!getSubgroupRow(req.params.id)) return res.status(404).json({ error: 'Subgrupo não encontrado' });
  next();
}, upload.array('photos', 100), async (req, res) => {
  const s = getSubgroupRow(req.params.id);
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Nenhuma foto recebida.' });

  let pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM photos WHERE subgroup_id = ?').get(s.id).n;
  const insert = db.prepare(
    'INSERT INTO photos (group_id, subgroup_id, filename, orig_file, wm, title, width, height, position) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)'
  );
  const ids = [], failed = [];
  for (const f of files) {
    try {
      const out = await makePublicCopy(f.path, f.originalname); // watermarked public copy + private original
      const title = ''; // captions only when the photographer writes one (file names like "IMG_4532" are not captions)
      ids.push(insert.run(s.group_id, s.id, out.filename, out.origFile, title, out.width, out.height, pos++).lastInsertRowid);
    } catch (err) {
      console.error(`Could not process ${f.originalname}:`, err.message);
      fs.rm(f.path, { force: true }, () => {});
      failed.push(f.originalname);
    }
  }
  if (!ids.length) return res.status(400).json({ error: `Estes arquivos não puderam ser lidos como imagens: ${failed.join(', ')}` });
  const rows = db.prepare(`SELECT * FROM photos WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY position`).all(...ids);
  res.status(201).json(rows.map(photoUrl));
});

router.put('/:id/photos/order', requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
  if (!ids) return res.status(400).json({ error: 'ids deve ser uma lista' });
  const update = db.prepare('UPDATE photos SET position = ? WHERE id = ? AND subgroup_id = ?');
  db.transaction(() => ids.forEach((id, i) => update.run(i, id, req.params.id)))();
  res.json({ ok: true });
});

export default router;
