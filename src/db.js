'use strict';
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');
const { slugify, normalizeSearch } = require('./helpers');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
);
`);

// ---------- Paramètres par défaut ----------
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
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

// ---------- Catégories par défaut (créées uniquement si la table est vide) ----------
const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
if (catCount === 0) {
  const defaults = [
    ['Téléphones et accessoires', '📱'],
    ['Montres connectées', '⌚'],
    ['Lunettes intelligentes', '🕶️'],
    ['Équipements électroniques', '🎧'],
    ['Articles de maison', '🏠'],
    ['Vêtements et chaussures', '👟'],
    ['Matériel professionnel', '💼'],
    ['Autres produits', '🛍️'],
  ];
  const ins = db.prepare('INSERT INTO categories (name, slug, icon, position) VALUES (?, ?, ?, ?)');
  defaults.forEach(([name, icon], i) => ins.run(name, slugify(name), icon, i));
}

// ---------- Settings ----------
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
function saveSettings(obj) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction((o) => { for (const [k, v] of Object.entries(o)) up.run(k, String(v ?? '')); });
  tx(obj);
}

// ---------- Catégories ----------
function listCategories() {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_visible = 1) AS visible_count,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS total_count
    FROM categories c ORDER BY c.position, c.name`).all();
}
function getCategory(id) { return db.prepare('SELECT * FROM categories WHERE id = ?').get(id); }
function getCategoryBySlug(slug) { return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug); }

function uniqueSlug(table, base, excludeId) {
  let slug = base || 'element';
  let i = 2;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`);
  while (stmt.get(slug, excludeId || 0)) slug = `${base}-${i++}`;
  return slug;
}

function createCategory({ name, icon, position }) {
  const slug = uniqueSlug('categories', slugify(name));
  const info = db.prepare('INSERT INTO categories (name, slug, icon, position) VALUES (?, ?, ?, ?)')
    .run(name, slug, icon || '', Number(position) || 0);
  return info.lastInsertRowid;
}
function updateCategory(id, { name, icon, position }) {
  const slug = uniqueSlug('categories', slugify(name), id);
  db.prepare('UPDATE categories SET name = ?, slug = ?, icon = ?, position = ? WHERE id = ?')
    .run(name, slug, icon || '', Number(position) || 0, id);
}
function deleteCategory(id) { db.prepare('DELETE FROM categories WHERE id = ?').run(id); }

// ---------- Produits ----------
function hydrate(p) {
  if (!p) return p;
  try { p.specs = JSON.parse(p.specs || '[]'); } catch { p.specs = []; }
  p.images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY position, id').all(p.id);
  p.main_image = p.images[0] || null;
  return p;
}
function attachMainImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const imgs = db.prepare(`SELECT * FROM product_images WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, id`).all(...ids);
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

/**
 * Recherche de produits.
 * @param {object} o { q, categoryId, visibleOnly, featured, sort, limit, offset, excludeId }
 */
function searchProducts(o = {}) {
  const where = [];
  const params = [];
  if (o.visibleOnly) where.push('p.is_visible = 1');
  if (o.categoryId) { where.push('p.category_id = ?'); params.push(o.categoryId); }
  if (o.featured) where.push('p.is_featured = 1');
  if (o.excludeId) { where.push('p.id != ?'); params.push(o.excludeId); }
  if (o.q) {
    const words = normalizeSearch(o.q).split(' ').filter(Boolean).slice(0, 8);
    for (const w of words) { where.push("p.search_text LIKE ? ESCAPE '\\'"); params.push(`%${w.replace(/[\\%_]/g, (m) => '\\' + m)}%`); }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = SORTS[o.sort] || SORTS.recent;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p ${whereSql}`).get(...params).n;
  const limit = Math.min(Number(o.limit) || 24, 200);
  const offset = Math.max(Number(o.offset) || 0, 0);
  const rows = db.prepare(`${BASE_SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, items: attachMainImages(rows) };
}

function getProduct(id) { return hydrate(db.prepare(`${BASE_SELECT} WHERE p.id = ?`).get(id)); }
function getProductBySlug(slug) { return hydrate(db.prepare(`${BASE_SELECT} WHERE p.slug = ?`).get(slug)); }

function nextReference() {
  const row = db.prepare("SELECT reference FROM products WHERE reference LIKE 'REF-%' ORDER BY id DESC LIMIT 1").get();
  let n = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM products').get().m + 1;
  if (row) { const m = row.reference.match(/REF-(\d+)/); if (m) n = Math.max(n, Number(m[1]) + 1); }
  let ref = `REF-${String(n).padStart(4, '0')}`;
  while (db.prepare('SELECT 1 FROM products WHERE reference = ?').get(ref)) ref = `REF-${String(++n).padStart(4, '0')}`;
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

function createProduct(data) {
  const f = productFields(data);
  const reference = (data.reference || '').trim() || nextReference();
  const slug = uniqueSlug('products', slugify(f.name));
  const cat = f.category_id ? getCategory(f.category_id) : null;
  const search_text = buildSearchText({ ...f, reference }, cat && cat.name);
  const info = db.prepare(`INSERT INTO products
    (reference, name, slug, price, old_price, short_description, description, specs, category_id,
     is_visible, is_featured, is_popular, in_stock, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    reference, f.name, slug, f.price, f.old_price, f.short_description, f.description, JSON.stringify(f.specs),
    f.category_id, f.is_visible, f.is_featured, f.is_popular, f.in_stock, search_text);
  return info.lastInsertRowid;
}

function updateProduct(id, data) {
  const f = productFields(data);
  const current = getProduct(id);
  const reference = (data.reference || '').trim() || current.reference;
  const slug = current.name === f.name ? current.slug : uniqueSlug('products', slugify(f.name), id);
  const cat = f.category_id ? getCategory(f.category_id) : null;
  const search_text = buildSearchText({ ...f, reference }, cat && cat.name);
  db.prepare(`UPDATE products SET reference = ?, name = ?, slug = ?, price = ?, old_price = ?, short_description = ?,
    description = ?, specs = ?, category_id = ?, is_visible = ?, is_featured = ?, is_popular = ?, in_stock = ?,
    search_text = ?, updated_at = datetime('now') WHERE id = ?`).run(
    reference, f.name, slug, f.price, f.old_price, f.short_description, f.description, JSON.stringify(f.specs),
    f.category_id, f.is_visible, f.is_featured, f.is_popular, f.in_stock, search_text, id);
}

function refreshSearchTextForCategory(categoryId) {
  const cat = getCategory(categoryId);
  const rows = db.prepare('SELECT * FROM products WHERE category_id = ?').all(categoryId);
  const up = db.prepare('UPDATE products SET search_text = ? WHERE id = ?');
  for (const r of rows) {
    let specs = []; try { specs = JSON.parse(r.specs); } catch {}
    up.run(buildSearchText({ ...r, specs }, cat && cat.name), r.id);
  }
}

function setProductFlag(id, flag, value) {
  if (!['is_visible', 'is_featured', 'is_popular', 'in_stock'].includes(flag)) throw new Error('Champ invalide');
  db.prepare(`UPDATE products SET ${flag} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ? 1 : 0, id);
}

function deleteProduct(id) { db.prepare('DELETE FROM products WHERE id = ?').run(id); }

function addImage(productId, img) {
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM product_images WHERE product_id = ?').get(productId).p;
  db.prepare('INSERT INTO product_images (product_id, url, thumb_url, storage_key, position) VALUES (?, ?, ?, ?, ?)')
    .run(productId, img.url, img.thumb_url, img.storage_key, pos);
}
function getImages(productId) { return db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY position, id').all(productId); }
function deleteImage(id) { db.prepare('DELETE FROM product_images WHERE id = ?').run(id); }
function reorderImages(productId, orderedIds) {
  const up = db.prepare('UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?');
  db.transaction(() => orderedIds.forEach((imgId, i) => up.run(i, imgId, productId)))();
}

function incrementViews(id) { db.prepare('UPDATE products SET views = views + 1 WHERE id = ?').run(id); }
function incrementOrderClicks(id) { db.prepare('UPDATE products SET order_clicks = order_clicks + 1 WHERE id = ? AND is_visible = 1').run(id); }

function stats() {
  return db.prepare(`SELECT
    COUNT(*) AS total,
    SUM(is_visible) AS visible,
    SUM(CASE WHEN is_visible = 0 THEN 1 ELSE 0 END) AS hidden,
    SUM(is_featured) AS featured,
    COALESCE(SUM(views), 0) AS views,
    COALESCE(SUM(order_clicks), 0) AS order_clicks
    FROM products`).get();
}

// ---------- Admins ----------
function getAdminByUsername(u) { return db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').get(u); }
function getAdmin(id) { return db.prepare('SELECT id, username FROM admins WHERE id = ?').get(id); }
function countAdmins() { return db.prepare('SELECT COUNT(*) AS n FROM admins').get().n; }
function createAdmin(username, hash) { return db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash).lastInsertRowid; }
function updateAdminPassword(id, hash) { db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id); }
function updateAdminUsername(id, username) { db.prepare('UPDATE admins SET username = ? WHERE id = ?').run(username, id); }

module.exports = {
  db, getSettings, saveSettings, DEFAULT_SETTINGS,
  listCategories, getCategory, getCategoryBySlug, createCategory, updateCategory, deleteCategory, refreshSearchTextForCategory,
  searchProducts, getProduct, getProductBySlug, createProduct, updateProduct, deleteProduct, setProductFlag, nextReference,
  addImage, getImages, deleteImage, reorderImages, incrementViews, incrementOrderClicks, stats,
  getAdminByUsername, getAdmin, countAdmins, createAdmin, updateAdminPassword, updateAdminUsername,
};
