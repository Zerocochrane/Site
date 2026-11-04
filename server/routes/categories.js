import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import { listCategories, getCategory, validateCategoryInput } from '../bookingDb.js';

const router = Router();

router.get('/', (_req, res) => res.json(listCategories()));

router.post('/', requireAdmin, (req, res) => {
  const { out, errors } = validateCategoryInput(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Confira a categoria.', errors });
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').get().p;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO categories (name, kind, has_duration, fields, position) VALUES (@name, @kind, @has_duration, @fields, @position)')
    .run({ ...out, position: pos });
  res.status(201).json(getCategory(lastInsertRowid));
});

router.put('/order', requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  const upd = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
  res.json(listCategories());
});

router.patch('/:id', requireAdmin, (req, res) => {
  const cur = getCategory(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Categoria não encontrada' });
  const body = { name: cur.name, kind: cur.kind, hasDuration: cur.hasDuration, fields: cur.fields, ...(req.body || {}) };
  const { out, errors } = validateCategoryInput(body);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Confira a categoria.', errors });
  db.prepare('UPDATE categories SET name = @name, kind = @kind, has_duration = @has_duration, fields = @fields WHERE id = @id')
    .run({ ...out, id: cur.id });
  res.json(getCategory(cur.id));
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id); // pedidos antigos guardam nome e respostas
  res.json({ ok: true });
});

export default router;
