import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, 'uploads');
// Client-area files are private: never served statically, only through signed links.
export const PRIVATE_DIR = path.join(__dirname, 'private');
export const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(PRIVATE_DIR, 'tmp'), { recursive: true });
