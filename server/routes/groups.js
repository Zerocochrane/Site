import { Router } from 'express';
import db, { slugify, toSlug, cleanDate } from '../db.js';
import { requireAdmin } from '../auth.js';
import { removePortfolioFiles } from '../portfolioFiles.js';
import {
  GROUP_SQL, shapeGroup, shapeSubgroup, publicGroup, idFromKey, getGroupRow, getSubgroupRow, subgroupRows, subgroupPhotos,
} from '../catalog.js';

const router = Router();

// ---- Public -----------------------------------------------------------------

// ?all=1 (admin) also returns empty groups; the public site only shows groups with photos.
router.get('/', (req, res) => {
  const rows = db.prepare(`${GROUP_SQL} ORDER BY g.position, g.id`).all().map(shapeGroup);
  res.json(req.query.all ? rows : rows.filter((g) => g.photoCount > 0).map(publicGroup));
});

// One group with its subgroups. ?all=1 includes empty subgroups, ?photos=1 includes each subgroup's photos.
router.get('/:key', (req, res) => {
  const id = idFromKey(req.params.key);
  const g = id ? getGroupRow(id) : db.prepare(`${GROUP_SQL} WHERE g.slug = ?`).get(req.params.key);
  // Empty groups don't exist for visitors (admin screens pass ?all=1)
  if (!g || (!req.query.all && !g.photo_count)) return res.status(404).json({ error: 'Grupo não encontrado' });
  let subgroups = subgroupRows(g.id).map((s) => ({
    ...shapeSubgroup(s, g),
    ...(req.query.photos ? { photos: subgroupPhotos(s.id) } : {}),
  }));
  if (!req.query.all) subgroups = subgroups.filter((s) => s.photoCount > 0);
  const shaped = shapeGroup(g);
  res.json({ ...(req.query.all ? shaped : publicGroup(shaped)), subgroups });
});

// ---- Admin ------------------------------------------------------------------

router.post('/', requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Dê um nome ao grupo.' });
  const description = String(req.body?.description || '').trim().slice(0, 2000);
  const { lastInsertRowid } = db.transaction(() => {
    db.prepare('UPDATE groups SET position = position + 1').run(); // new groups go to the top
    return db.prepare('INSERT INTO groups (name, slug, description, position) VALUES (?, ?, ?, 0)').run(name, slugify(name), description);
  })();
  res.status(201).json(shapeGroup(getGroupRow(lastInsertRowid)));
});

router.put('/order', requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
  if (!ids) return res.status(400).json({ error: 'ids deve ser uma lista' });
  const update = db.prepare('UPDATE groups SET position = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => update.run(i, id)))();
  res.json({ ok: true });
});

router.patch('/:id', requireAdmin, (req, res) => {
  const g = getGroupRow(req.params.id);
  if (!g) return res.status(404).json({ error: 'Grupo não encontrado' });
  const b = req.body || {};
  if (typeof b.name === 'string') {
    const name = b.name.trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
    db.prepare('UPDATE groups SET name = ?, slug = ? WHERE id = ?').run(name, slugify(name, g.id), g.id);
  }
  if (typeof b.description === 'string') {
    db.prepare('UPDATE groups SET description = ? WHERE id = ?').run(b.description.trim().slice(0, 2000), g.id);
  }
  // The group's cover can be any photo from any of its subgroups.
  if (b.coverPhotoId !== undefined) {
    const pid = b.coverPhotoId === null ? null : Number(b.coverPhotoId);
    if (pid !== null && !db.prepare('SELECT 1 FROM photos WHERE id = ? AND group_id = ?').get(pid, g.id)) {
      return res.status(400).json({ error: 'Essa foto não está em nenhum subgrupo deste grupo.' });
    }
    db.prepare('UPDATE groups SET cover_photo_id = ? WHERE id = ?').run(pid, g.id);
  }
  res.json(shapeGroup(getGroupRow(g.id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const g = getGroupRow(req.params.id);
  if (!g) return res.status(404).json({ error: 'Grupo não encontrado' });
  const files = db.prepare('SELECT filename, orig_file FROM photos WHERE group_id = ?').all(g.id);
  db.transaction(() => {
    db.prepare('DELETE FROM photos WHERE group_id = ?').run(g.id);
    db.prepare('DELETE FROM subgroups WHERE group_id = ?').run(g.id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  })();
  files.forEach(removePortfolioFiles);
  res.json({ ok: true });
});

// Create a subgroup inside a group (added at the end).
router.post('/:id/subgroups', requireAdmin, (req, res) => {
  const g = getGroupRow(req.params.id);
  if (!g) return res.status(404).json({ error: 'Grupo não encontrado' });
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Dê um nome ao subgrupo.' });
  const description = String(req.body?.description || '').trim().slice(0, 2000);
  const date = cleanDate(req.body?.date);
  if (date === null) return res.status(400).json({ error: 'Data inválida.' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM subgroups WHERE group_id = ?').get(g.id).n;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO subgroups (group_id, name, slug, description, event_date, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(g.id, name, toSlug(name), description, date, pos);
  res.status(201).json(shapeSubgroup(getSubgroupRow(lastInsertRowid), g));
});

router.put('/:id/subgroups/order', requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
  if (!ids) return res.status(400).json({ error: 'ids deve ser uma lista' });
  const update = db.prepare('UPDATE subgroups SET position = ? WHERE id = ? AND group_id = ?');
  db.transaction(() => ids.forEach((id, i) => update.run(i, id, req.params.id)))();
  res.json({ ok: true });
});

export default router;
