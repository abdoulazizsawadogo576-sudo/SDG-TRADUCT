'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { db, getAdmin, countAdmins, createAdmin, getAdminByUsername } = require('./db');
const config = require('./config');

// ---------- Stockage des sessions dans SQLite (survit aux redémarrages) ----------
class SqliteStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires');
    this.delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 3600e3).unref();
  }
  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const exp = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400e3;
      this.setStmt.run(sid, JSON.stringify(sess), exp);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
  destroy(sid, cb) { try { this.delStmt.run(sid); cb && cb(null); } catch (e) { cb && cb(e); } }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

function sessionMiddleware() {
  return session({
    name: 'boutique.sid',
    secret: config.sessionSecret,
    store: new SqliteStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 7 * 24 * 3600e3 },
  });
}

// ---------- Création du compte administrateur au démarrage ----------
function ensureAdmin() {
  if (countAdmins() > 0) return;
  if (config.adminUsername && config.adminPassword) {
    createAdmin(config.adminUsername, bcrypt.hashSync(config.adminPassword, 12));
    console.log(`✔ Compte administrateur « ${config.adminUsername} » créé.`);
  } else {
    console.warn('⚠ Aucun administrateur. Définissez ADMIN_USERNAME et ADMIN_PASSWORD puis redémarrez, ou lancez : npm run create-admin');
  }
}

// ---------- Protection contre les tentatives répétées ----------
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (a.until > now) return Math.ceil((a.until - now) / 60000);
  return 0;
}
function recordFailure(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (now - a.first > 15 * 60e3) { a.n = 0; a.first = now; }
  a.n += 1;
  if (a.n >= 5) { a.until = now + 15 * 60e3; a.n = 0; a.first = now; }
  attempts.set(key, a);
}
function clearFailures(key) { attempts.delete(key); }

async function verifyLogin(username, password) {
  const admin = getAdminByUsername(String(username || '').trim());
  // Comparaison toujours effectuée pour éviter de révéler l'existence du compte
  const hash = admin ? admin.password_hash : (verifyLogin.dummy ||= bcrypt.hashSync('dummy-password', 12));
  const ok = await bcrypt.compare(String(password || ''), hash);
  return ok && admin ? admin : null;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    const admin = getAdmin(req.session.adminId);
    if (admin) { req.admin = admin; res.locals.admin = admin; return next(); }
  }
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/connexion');
}

// ---------- CSRF ----------
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}
function verifyCsrf(req, res, next) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  const expected = req.session && req.session.csrf;
  if (!expected || !sent || sent.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return res.status(403).send('Session expirée. Rechargez la page et réessayez.');
  }
  next();
}

module.exports = {
  sessionMiddleware, ensureAdmin, verifyLogin, requireAdmin, csrfToken, verifyCsrf,
  tooManyAttempts, recordFailure, clearFailures, bcrypt,
};
