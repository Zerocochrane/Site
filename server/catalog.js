// Shared queries for groups → subgroups → photos.
import db from './db.js';
import { photoUrl } from './upload.js';

const url = (f) => (f ? `/uploads/${f}` : null);

// Group cover = chosen photo (from any of its subgroups), else the first photo of the first subgroup.
export const GROUP_SQL = `
  SELECT g.*,
    (SELECT COUNT(*) FROM photos p WHERE p.group_id = g.id) AS photo_count,
    (SELECT COUNT(*) FROM subgroups s WHERE s.group_id = g.id) AS subgroup_count,
    (SELECT COUNT(*) FROM subgroups s WHERE s.group_id = g.id
       AND EXISTS (SELECT 1 FROM photos p WHERE p.subgroup_id = s.id)) AS visible_subgroup_count,
    COALESCE(
      (SELECT filename FROM photos p WHERE p.id = g.cover_photo_id AND p.group_id = g.id),
      (SELECT p.filename FROM photos p JOIN subgroups s ON s.id = p.subgroup_id
        WHERE s.group_id = g.id ORDER BY s.position, s.id, p.position, p.id LIMIT 1)
    ) AS cover_filename
  FROM groups g`;

// Subgroup cover = chosen photo, else its first photo.
export const SUBGROUP_SQL = `
  SELECT s.*,
    (SELECT COUNT(*) FROM photos p WHERE p.subgroup_id = s.id) AS photo_count,
    COALESCE(
      (SELECT filename FROM photos p WHERE p.id = s.cover_photo_id AND p.subgroup_id = s.id),
      (SELECT filename FROM photos p WHERE p.subgroup_id = s.id ORDER BY position, id LIMIT 1)
    ) AS cover_filename
  FROM subgroups s`;

export const groupPath = (g) => `/work/${g.id}-${g.slug}`;

export const shapeGroup = (g) => ({
  id: g.id,
  name: g.name,
  slug: g.slug,
  path: groupPath(g),
  description: g.description,
  coverPhotoId: g.cover_photo_id,
  position: g.position,
  photoCount: g.photo_count,
  subgroupCount: g.subgroup_count,
  visibleSubgroupCount: g.visible_subgroup_count,
  coverUrl: url(g.cover_filename),
  createdAt: g.created_at,
});

export const shapeSubgroup = (s, g) => ({
  id: s.id,
  groupId: s.group_id,
  name: s.name,
  slug: s.slug,
  path: `${groupPath(g)}/${s.id}-${s.slug}`,
  description: s.description,
  date: s.event_date || '',
  coverPhotoId: s.cover_photo_id,
  position: s.position,
  photoCount: s.photo_count,
  coverUrl: url(s.cover_filename),
});

// "12", "12-any-name" or (groups only) a bare slug
export const idFromKey = (key) => key.match(/^(\d+)(?:-|$)/)?.[1];

export const getGroupRow = (id) => db.prepare(`${GROUP_SQL} WHERE g.id = ?`).get(id);
export const getSubgroupRow = (id) => db.prepare(`${SUBGROUP_SQL} WHERE s.id = ?`).get(id);
export const subgroupRows = (groupId) =>
  db.prepare(`${SUBGROUP_SQL} WHERE s.group_id = ? ORDER BY s.position, s.id`).all(groupId);
export const subgroupPhotos = (id) =>
  db.prepare('SELECT * FROM photos WHERE subgroup_id = ? ORDER BY position, id').all(id).map(photoUrl);

// What visitors may see: only groups/subgroups that contain photos, and counts that ignore empty ones.
export const publicGroup = (g) => ({ ...g, subgroupCount: g.visibleSubgroupCount });
