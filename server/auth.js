// Database-backed authentication: scrypt password hashing + signed bearer tokens.
// Uses only Node's built-in crypto, so no extra npm packages are required.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYLEN = 64;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // "remember me for 30 days"

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, key] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  if (expected.length !== KEYLEN) return false;
  const candidate = crypto.scryptSync(String(password || ''), salt, KEYLEN);
  return crypto.timingSafeEqual(candidate, expected);
}

// The signing key is generated once and kept in a git-ignored local file so that
// sessions survive server restarts. Override with AUTH_SECRET when deploying.
function signingSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = path.join(__dirname, '.auth-secret');
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch {
    const secret = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(file, secret, { mode: 0o600 }); } catch { /* read-only disk: token lasts one boot */ }
    return secret;
  }
}

const b64 = s => Buffer.from(s).toString('base64url');

function signToken(payload, ttlMs = TOKEN_TTL_MS) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

const publicUser = u => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, avatar: u.avatar });

// ---------- Express middleware ----------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && readToken(token);
  if (!payload) return res.status(401).json({ error: 'Not authenticated. Please sign in.' });
  const M = require('./models');
  M.User.findById(payload.uid).then(user => {
    if (!user || !user.active) return res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
    req.user = publicUser(user);
    next();
  }).catch(next);
}

// ---------- Boot-time bootstrap ----------
const DEFAULT_TEAM = [
  { name: 'Dr. Asad Malik', email: 'pm@healthcare-alliance.org', role: 'Project Manager', avatar: '👨‍💼' },
  { name: 'Sarah Khan', email: 'qa@healthcare-alliance.org', role: 'QA Engineer', avatar: '👩‍🔬' },
  { name: 'Hamza Ali', email: 'backend@healthcare-alliance.org', role: 'Backend Developer', avatar: '👨‍💻' },
  { name: 'Dr. Tariq Mahmood', email: 'admin@sahiwal-hospitals.gov', role: 'Hospital Admin', avatar: '🩺' }
];

async function ensureDefaultUsers() {
  const M = require('./models');
  if (await M.User.countDocuments()) return [];
  const password = process.env.AUTH_DEFAULT_PASSWORD || 'password123';
  const created = await M.User.insertMany(
    DEFAULT_TEAM.map(t => ({ ...t, passwordHash: hashPassword(password), active: true })));
  console.log(`Auth: created ${created.length} default team accounts (password: ${password})`);
  return created;
}

module.exports = { hashPassword, verifyPassword, signToken, readToken, requireAuth, publicUser, ensureDefaultUsers, DEFAULT_TEAM, TOKEN_TTL_MS };
