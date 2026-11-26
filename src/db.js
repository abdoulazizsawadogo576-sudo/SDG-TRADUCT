'use strict';
/**
 * Base de données (SQLite / libSQL).
 * - Par défaut : fichier local DATA_DIR/boutique.db (nécessite un disque persistant).
 * - Si DATABASE_URL est défini (ex. libsql://ma-base.turso.io) : base en ligne Turso,
 *   ce qui permet un hébergement gratuit sans disque.
 */
const fs = require('fs');
const { createClient } = require('@libsql/client');
const config = require('./config');
const { slugify, normalizeSearch } = require('./helpers');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

const client = createClient(config.databaseUrl
  ? { url: config.databaseUrl, authToken: config.databaseToken || undefined }
  : { url: 'file:' + config.dbFile });

// ---------- Petits utilitaires ----------
function toObj(rs) {
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
}
async function all(sql, args = []) { return toObj(await client.execute({ sql, args })); }
async function one(sql, args = []) { return (await all(sql, args))[0]; }
async function run(sql, args = []) {
  const r = await client.execute({ sql, args });
  return { lastInsertRowid: r.lastInsertRowid !== undefined ? Number(r.lastInsertRowid) : null, changes: r.rowsAffected };
}
async function batch(stmts) { if (stmts.length) await client.batch(stmts.map(([sql, args]) => ({ sql, args: args || [] })), 'write'); }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL DEFAULT 0,
  old_price INTEGER,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  specs TEXT NOT NULL DEFAULT '[]',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_visible INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_popular INTEGER NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 1,
  views INTEGER NOT NULL DEFAULT 0,
  order_clicks INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_visible ON products(is_visible);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  thumb_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires INTEGER NOT NULL
);`;

const DEFAULT_SETTINGS = {
  shop_name: 'SDG Store',
  tagline: 'Votre boutique high-tech et lifestyle au Burkina Faso',
  whatsapp_number: config.defaultWhatsapp,
  banner_title: 'Les meilleurs produits, livrés partout au Burkina Faso',
  banner_subtitle: 'Téléphones, montres connectées, électronique, maison et mode. Choisissez votre article et commandez en un clic sur WhatsApp.',
  banner_image: '',
  logo_url: '',
  city: 'Ouagadougou, Burkina Faso',
  delivery_text: 'Livraison rapide à Ouagadougou, Bobo-Dioulasso et dans tout le Burkina Faso',
  facebook_url: '',
  instagram_url: '',
  tiktok_url: '',
  youtube_url: '',
};

const DEFAULT_CATEGORIES = [
  ['Téléphones et accessoires', '📱'], ['Montres connectées', '⌚'], ['Lunettes intelligentes', '🕶️'],
  ['Équipements électroniques', '🎧'], ['Articles de maison', '🏠'], ['Vêtements et chaussures', '👟'],
  ['Matériel professionnel', '💼'], ['Autres produits', '🛍️'],
];

let ready = null;
/** Crée les tables et les données par défaut (une seule fois). */
function init() {
  if (!ready) {
    ready = (async () => {
      await client.executeMultiple(SCHEMA);
      if (config.databaseUrl) await client.execute('PRAGMA foreign_keys = ON').catch(() => {});
      else { await client.execute('PRAGMA journal_mode = WAL'); await client.execute('PRAGMA foreign_keys = ON'); }
      await batch(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ['INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]]));
      if ((await one('SELECT COUNT(*) AS n FROM categories')).n === 0) {
        await batch(DEFAULT_CATEGORIES.map(([name, icon], i) => ['INSERT INTO categories (name, slug, icon, position) VALUES (?, ?, ?, ?)', [name, slugify(name), icon, i]]));
      }
    })();
  }
  return ready;
}

// ---------- Paramètres (en cache mémoire) ----------
let settingsCache = null;
async function getSettings() {
  if (!settingsCache) {
    const s = { ...DEFAULT_SETTINGS };
    for (const r of await all('SELECT key, value FROM settings')) s[r.key] = r.value;
    settingsCache = s;
  }
  return { ...settingsCache };
}
async function saveSettings(obj) {
  await batch(Object.entries(obj).map(([k, v]) => ['INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, String(v ?? '')]]));
  settingsCache = null;
}

// ---------- Catégories ----------
let categoriesCache = null;
function invalidateCategories() { categoriesCache = null; }
async function listCategories() {
  if (!categoriesCache) {
    categoriesCache = await all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_visible = 1) AS visible_count,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS total_count
      FROM categories c ORDER BY c.position, c.name`);
  }
  return categoriesCache.map((c) => ({ ...c }));
}
function getCategory(id) { return one('SELECT * FROM categories WHERE id = ?', [id]); }
function getCategoryBySlug(slug) { return one('SELECT * FROM categories WHERE slug = ?', [slug]); }

async function uniqueSlug(table, base, excludeId) {
  let slug = base || 'element';
  let i = 2;
  while (await one(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`, [slug, excludeId || 0])) slug = `${base}-${i++}`;
  return slug;
}

async function createCategory({ name, icon, position }) {
  const slug = await uniqueSlug('categories', slugify(name));
  const r = await run('INSERT INTO categories (name, slug, icon, position) VALUES (?, ?, ?, ?)', [name, slug, icon || '', Number(position) || 0]);
  invalidateCategories();
  return r.lastInsertRowid;
}
async function updateCategory(id, { name, icon, position }) {
  const slug = await uniqueSlug('categories', slugify(name), id);
  await run('UPDATE categories SET name = ?, slug = ?, icon = ?, position = ? WHERE id = ?', [name, slug, icon || '', Number(position) || 0, id]);
  invalidateCategories();
}
async function deleteCategory(id) {
  await batch([['UPDATE products SET category_id = NULL WHERE category_id = ?', [id]], ['DELETE FROM categories WHERE id = ?', [id]]]);
  invalidateCategories();
}

// ---------- Produits ----------
async function hydrate(p) {
  if (!p) return p;
  try { p.specs = JSON.parse(p.specs || '[]'); } catch { p.specs = []; }
  p.images = await all('SELECT * FROM product_images WHERE product_id = ? ORDER BY position, id', [p.id]);
  p.main_image = p.images[0] || null;
  return p;
}
async function attachMainImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const imgs = await all(`SELECT * FROM product_images WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, id`, ids);
  const byProduct = {};
  for (const im of imgs) (byProduct[im.product_id] ||= []).push(im);
  for (const r of rows) {
    r.images = byProduct[r.id] || [];
    r.main_image = r.images[0] || null;
    r.second_image = r.images[1] || null;
  }
  return rows;
}

const BASE_SELECT = `SELECT p.*, c.name AS category_name, c.slug AS category_slug
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const SORTS = {
  recent: 'p.created_at DESC, p.id DESC',
  prix_asc: 'p.price ASC, p.id DESC',
  prix_desc: 'p.price DESC, p.id DESC',
  populaire: '(p.is_popular * 100000 + p.order_clicks * 5 + p.views) DESC, p.id DESC',
  nom: 'p.name COLLATE NOCASE ASC',
};

/** Recherche de produits : { q, categoryId, visibleOnly, featured, hidden, sort, limit, offset, excludeId } */
async function searchProducts(o = {}) {
  const where = [];
  const args = [];
  if (o.visibleOnly) where.push('p.is_visible = 1');
  if (o.hidden) where.push('p.is_visible = 0');
  if (o.categoryId) { where.push('p.category_id = ?'); args.push(o.categoryId); }
  if (o.featured) where.push('p.is_featured = 1');
  if (o.excludeId) { where.push('p.id != ?'); args.push(o.excludeId); }
  if (o.q) {
    const words = normalizeSearch(o.q).split(' ').filter(Boolean).slice(0, 8);
    for (const w of words) { where.push("p.search_text LIKE ? ESCAPE '\\'"); args.push(`%${w.replace(/[\\%_]/g, (m) => '\\' + m)}%`); }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = SORTS[o.sort] || SORTS.recent;
  const limit = Math.min(Number(o.limit) || 24, 200);
  const offset = Math.max(Number(o.offset) || 0, 0);
  const [{ n: total }, rows] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM products p ${whereSql}`, args),
    all(`${BASE_SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, limit, offset]),
  ]);
  return { total, items: await attachMainImages(rows) };
}

async function getProduct(id) { return hydrate(await one(`${BASE_SELECT} WHERE p.id = ?`, [id])); }
async function getProductBySlug(slug) { return hydrate(await one(`${BASE_SELECT} WHERE p.slug = ?`, [slug])); }
async function referenceExists(reference, excludeId) { return !!(await one('SELECT 1 AS x FROM products WHERE reference = ? AND id != ?', [reference, excludeId || 0])); }

async function nextReference() {
  let n = (await one('SELECT COALESCE(MAX(id), 0) AS m FROM products')).m + 1;
  const row = await one("SELECT reference FROM products WHERE reference LIKE 'REF-%' ORDER BY id DESC LIMIT 1");
  if (row) { const m = row.reference.match(/REF-(\d+)/); if (m) n = Math.max(n, Number(m[1]) + 1); }
  let ref = `REF-${String(n).padStart(4, '0')}`;
  while (await referenceExists(ref)) ref = `REF-${String(++n).padStart(4, '0')}`;
  return ref;
}

function buildSearchText(p, categoryName) {
  const specs = (p.specs || []).map((s) => `${s.label} ${s.value}`).join(' ');
  return normalizeSearch([p.name, p.reference, p.short_description, p.description, categoryName, specs].join(' '));
}

function productFields(data) {
  return {
    name: data.name,
    price: data.price,
    old_price: data.old_price || null,
    short_description: data.short_description || '',
    description: data.description || '',
    specs: data.specs || [],
    category_id: data.category_id || null,
    is_visible: data.is_visible ? 1 : 0,
    is_featured: data.is_featured ? 1 : 0,
    is_popular: data.is_popular ? 1 : 0,
    in_stock: data.in_stock ? 1 : 0,
  };
}

async function createProduct(data) {
  const f = productFields(data);
  const reference = (data.reference || '').trim() || await nextReference();
  const slug = await uniqueSlug('products', slugify(f.name));
  const cat = f.category_id ? await getCategory(f.category_id) : null;
  const search_text = buildSearchText({ ...f, reference }, cat && cat.name);
  const r = await run(`INSERT INTO products
    (reference, name, slug, price, old_price, short_description, description, specs, category_id,
     is_visible, is_featured, is_popular, in_stock, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    reference, f.name, slug, f.price, f.old_price, f.short_description, f.description, JSON.stringify(f.specs),
    f.category_id, f.is_visible, f.is_featured, f.is_popular, f.in_stock, search_text]);
  invalidateCategories();
  return r.lastInsertRowid;
}

async function updateProduct(id, data) {
  const f = productFields(data);
  const current = await getProduct(id);
  const reference = (data.reference || '').trim() || current.reference;
  const slug = current.name === f.name ? current.slug : await uniqueSlug('products', slugify(f.name), id);
  const cat = f.category_id ? await getCategory(f.category_id) : null;
  const search_text = buildSearchText({ ...f, reference }, cat && cat.name);
  await run(`UPDATE products SET reference = ?, name = ?, slug = ?, price = ?, old_price = ?, short_description = ?,
    description = ?, specs = ?, category_id = ?, is_visible = ?, is_featured = ?, is_popular = ?, in_stock = ?,
    search_text = ?, updated_at = datetime('now') WHERE id = ?`, [
    reference, f.name, slug, f.price, f.old_price, f.short_description, f.description, JSON.stringify(f.specs),
    f.category_id, f.is_visible, f.is_featured, f.is_popular, f.in_stock, search_text, id]);
  invalidateCategories();
}

async function refreshSearchTextForCategory(categoryId) {
  const cat = await getCategory(categoryId);
  const rows = await all('SELECT * FROM products WHERE category_id = ?', [categoryId]);
  await batch(rows.map((r) => {
    let specs = []; try { specs = JSON.parse(r.specs); } catch { /* ignore */ }
    return ['UPDATE products SET search_text = ? WHERE id = ?', [buildSearchText({ ...r, specs }, cat && cat.name), r.id]];
  }));
}

async function setProductFlag(id, flag, value) {
  if (!['is_visible', 'is_featured', 'is_popular', 'in_stock'].includes(flag)) throw new Error('Champ invalide');
  await run(`UPDATE products SET ${flag} = ?, updated_at = datetime('now') WHERE id = ?`, [value ? 1 : 0, id]);
  invalidateCategories();
}

async function deleteProduct(id) {
  await batch([['DELETE FROM product_images WHERE product_id = ?', [id]], ['DELETE FROM products WHERE id = ?', [id]]]);
  invalidateCategories();
}

async function addImage(productId, img) {
  const { p } = await one('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM product_images WHERE product_id = ?', [productId]);
  await run('INSERT INTO product_images (product_id, url, thumb_url, storage_key, position) VALUES (?, ?, ?, ?, ?)',
    [productId, img.url, img.thumb_url, img.storage_key, p]);
}
function getImages(productId) { return all('SELECT * FROM product_images WHERE product_id = ? ORDER BY position, id', [productId]); }
function deleteImage(id) { return run('DELETE FROM product_images WHERE id = ?', [id]); }
function reorderImages(productId, orderedIds) {
  return batch(orderedIds.map((imgId, i) => ['UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?', [i, imgId, productId]]));
}

function incrementViews(id) { return run('UPDATE products SET views = views + 1 WHERE id = ?', [id]); }
function incrementOrderClicks(id) { return run('UPDATE products SET order_clicks = order_clicks + 1 WHERE id = ? AND is_visible = 1', [id]); }

async function stats() {
  const s = await one(`SELECT
    COUNT(*) AS total,
    COALESCE(SUM(is_visible), 0) AS visible,
    COALESCE(SUM(CASE WHEN is_visible = 0 THEN 1 ELSE 0 END), 0) AS hidden,
    COALESCE(SUM(is_featured), 0) AS featured,
    COALESCE(SUM(views), 0) AS views,
    COALESCE(SUM(order_clicks), 0) AS order_clicks
    FROM products`);
  return s;
}

// ---------- Sauvegarde complète (JSON) ----------
async function exportAll() {
  const out = { format: 'boutique-whatsapp', version: 1, date: new Date().toISOString() };
  for (const t of ['settings', 'categories', 'products', 'product_images']) out[t] = await all(`SELECT * FROM ${t}`);
  return out;
}

// ---------- Sessions ----------
async function getSession(sid) { return one('SELECT data, expires FROM sessions WHERE sid = ?', [sid]); }
function setSession(sid, data, expires) {
  return run('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires', [sid, data, expires]);
}
function deleteSession(sid) { return run('DELETE FROM sessions WHERE sid = ?', [sid]); }
function purgeSessions() { return run('DELETE FROM sessions WHERE expires < ?', [Date.now()]); }

// ---------- Admins ----------
function getAdminByUsername(u) { return one('SELECT * FROM admins WHERE username = ? COLLATE NOCASE', [u]); }
function getAdmin(id) { return one('SELECT id, username FROM admins WHERE id = ?', [id]); }
async function countAdmins() { return (await one('SELECT COUNT(*) AS n FROM admins')).n; }
async function createAdmin(username, hash) { return (await run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, hash])).lastInsertRowid; }
function updateAdminPassword(id, hash) { return run('UPDATE admins SET password_hash = ? WHERE id = ?', [hash, id]); }
function updateAdminUsername(id, username) { return run('UPDATE admins SET username = ? WHERE id = ?', [username, id]); }

module.exports = {
  client, init, all, one, run, getSettings, saveSettings, DEFAULT_SETTINGS,
  listCategories, getCategory, getCategoryBySlug, createCategory, updateCategory, deleteCategory, refreshSearchTextForCategory,
  searchProducts, getProduct, getProductBySlug, createProduct, updateProduct, deleteProduct, setProductFlag, nextReference, referenceExists,
  addImage, getImages, deleteImage, reorderImages, incrementViews, incrementOrderClicks, stats, exportAll,
  getSession, setSession, deleteSession, purgeSessions,
  getAdminByUsername, getAdmin, countAdmins, createAdmin, updateAdminPassword, updateAdminUsername,
};
