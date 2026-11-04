import crypto from 'node:crypto';

const SECRET = process.env.TOKEN_SECRET || 'dev-secret';
const ADMIN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const CLIENT_TTL_MS = 1000 * 60 * 60 * 12;    // 12 hours

export const sign = (value) => crypto.createHmac('sha256', SECRET).update(String(value)).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createSignedToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Returns the token's payload, or null if it is invalid or expired. */
export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sig, sign(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export const createToken = () => createSignedToken({ role: 'admin', exp: Date.now() + ADMIN_TTL_MS });
export const createClientToken = (clientId) => createSignedToken({ role: 'client', cid: clientId, exp: Date.now() + CLIENT_TTL_MS });

const bearer = (req) => {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

export function checkPassword(password) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || typeof password !== 'string') return false;
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export function requireAdmin(req, res, next) {
  const payload = verifyToken(bearer(req));
  if (!payload || payload.role !== 'admin') return res.status(401).json({ error: 'Faça login novamente.' });
  next();
}

/** Sets req.clientId for a logged-in client (the access period itself is checked by the client routes). */
export function requireClientToken(req, res, next) {
  const payload = verifyToken(bearer(req));
  if (!payload || payload.role !== 'client') return res.status(401).json({ error: 'Faça login novamente.', code: 'login' });
  req.clientId = payload.cid;
  next();
}
