import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import { photoUrl } from '../upload.js';
import { removePortfolioFiles } from '../portfolioFiles.js';

// Single-photo actions. Uploading and ordering happen per subgroup (routes/subgroups.js).
const router = Router();

router.patch('/:id', requireAdmin, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada' });
  const b = req.body || {};
  if (typeof b.title === 'string') db.prepare('UPDATE photos SET title = ? WHERE id = ?').run(b.title.slice(0, 200), photo.id);

  // Move to another subgroup (possibly in another group); it goes to the end there.
  if (b.subgroupId !== undefined && Number(b.subgroupId) !== photo.subgroup_id) {
    const target = db.prepare('SELECT id, group_id FROM subgroups WHERE id = ?').get(Number(b.subgroupId));
    if (!target) return res.status(400).json({ error: 'Subgrupo não encontrado' });
    db.transaction(() => {
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM photos WHERE subgroup_id = ?').get(target.id).n;
      db.prepare('UPDATE photos SET subgroup_id = ?, group_id = ?, position = ? WHERE id = ?').run(target.id, target.group_id, pos, photo.id);
      db.prepare('UPDATE subgroups SET cover_photo_id = NULL WHERE cover_photo_id = ?').run(photo.id);
      if (target.group_id !== photo.group_id) db.prepare('UPDATE groups SET cover_photo_id = NULL WHERE cover_photo_id = ?').run(photo.id);
    })();
  }
  res.json(photoUrl(db.prepare('SELECT * FROM photos WHERE id = ?').get(photo.id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada' });
  db.transaction(() => {
    db.prepare('UPDATE groups SET cover_photo_id = NULL WHERE cover_photo_id = ?').run(photo.id);
    db.prepare('UPDATE subgroups SET cover_photo_id = NULL WHERE cover_photo_id = ?').run(photo.id);
    db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  })();
  removePortfolioFiles(photo);
  res.json({ ok: true });
});

export default router;
