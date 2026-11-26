'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const h = require('../helpers');
const config = require('../config');
const storage = require('../storage');
const auth = require('../auth');

const router = express.Router();
const MAX_IMAGES = 12;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: MAX_IMAGES + 2 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
function handleUpload(fields) {
  const mw = upload.fields(fields);
  return (req, res, next) => mw(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Une photo dépasse 20 Mo.' :
        err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Maximum ${MAX_IMAGES} photos à la fois.` : 'Envoi des photos impossible.';
      req.flash('error', msg);
      return res.redirect(req.get('Referrer') || '/admin');
    }
    next();
  });
}

router.use((req, res, next) => { res.locals.isAdminPage = true; res.set('Cache-Control', 'no-store'); next(); });

// ---------- Connexion ----------
router.get('/connexion', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Connexion', error: null, username: '', noAdmin: db.countAdmins() === 0 });
});

router.post('/connexion', auth.verifyCsrf, async (req, res, next) => {
  try {
    const key = req.ip;
    const wait = auth.tooManyAttempts(key);
    const username = String(req.body.username || '').trim();
    if (wait) {
      return res.status(429).render('admin/login', { title: 'Connexion', username, noAdmin: false,
        error: `Trop de tentatives. Réessayez dans ${wait} minute(s).` });
    }
    const admin = await auth.verifyLogin(username, req.body.password);
    if (!admin) {
      auth.recordFailure(key);
      return res.status(401).render('admin/login', { title: 'Connexion', username, noAdmin: db.countAdmins() === 0,
        error: 'Identifiant ou mot de passe incorrect.' });
    }
    auth.clearFailures(key);
    const returnTo = req.session.returnTo;
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      res.redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
    });
  } catch (e) { next(e); }
});

router.post('/deconnexion', auth.verifyCsrf, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/connexion'));
});

// Toutes les routes suivantes exigent une connexion
router.use(auth.requireAdmin);

// ---------- Tableau de bord ----------
router.get('/', (req, res) => {
  const stats = db.stats();
  const recent = db.searchProducts({ sort: 'recent', limit: 6 }).items;
  const top = db.searchProducts({ sort: 'populaire', limit: 5 }).items;
  res.render('admin/dashboard', { title: 'Tableau de bord', stats, recent, top, categories: db.listCategories(), storageDriver: storage.driver });
});

// ---------- Liste des produits ----------
router.get('/produits', (req, res) => {
  const q = String(req.query.q || '').trim();
  const categoryId = parseInt(req.query.categorie, 10) || null;
  const statut = req.query.statut || '';
  let { items, total } = db.searchProducts({ q, categoryId, sort: req.query.tri || 'recent', limit: 200 });
  if (statut === 'visibles') items = items.filter((p) => p.is_visible);
  if (statut === 'masques') items = items.filter((p) => !p.is_visible);
  if (statut === 'vedette') items = items.filter((p) => p.is_featured);
  res.render('admin/products', { title: 'Produits', items, total, q, categoryId, statut, categories: db.listCategories() });
});

// ---------- Formulaire produit ----------
function parseSpecs(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40).map((l) => {
    const i = l.search(/[:：]/);
    return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: '', value: l };
  });
}
function specsToText(specs) {
  return (specs || []).map((s) => (s.label ? `${s.label} : ${s.value}` : s.value)).join('\n');
}
function readProductForm(body) {
  const errors = [];
  const name = String(body.name || '').trim().slice(0, 150);
  const price = h.parsePrice(body.price);
  const oldPrice = h.parsePrice(body.old_price);
  if (!name) errors.push('Le nom du produit est obligatoire.');
  if (price === null) errors.push('Le prix est obligatoire (en FCFA).');
  const reference = String(body.reference || '').trim().slice(0, 40);
  const data = {
    name, price: price || 0,
    old_price: oldPrice && price && oldPrice > price ? oldPrice : null,
    reference,
    short_description: String(body.short_description || '').trim().slice(0, 300),
    description: String(body.description || '').trim().slice(0, 10000),
    specs: parseSpecs(body.specs),
    category_id: parseInt(body.category_id, 10) || null,
    is_visible: body.is_visible === '1',
    is_featured: body.is_featured === '1',
    is_popular: body.is_popular === '1',
    in_stock: body.in_stock === '1',
  };
  return { data, errors };
}

function formView(res, { product, values, errors, isNew }) {
  res.render('admin/product-form', {
    title: isNew ? 'Ajouter un produit' : `Modifier : ${product.name}`,
    product, values, errors, isNew, categories: db.listCategories(), maxImages: MAX_IMAGES,
  });
}

router.get('/produits/nouveau', (req, res) => {
  formView(res, {
    isNew: true, product: { images: [] }, errors: [],
    values: { name: '', price: '', old_price: '', reference: db.nextReference(), short_description: '', description: '', specs: '',
      category_id: req.query.categorie || '', is_visible: true, is_featured: false, is_popular: false, in_stock: true },
  });
});

async function storeUploadedImages(productId, files) {
  const existing = db.getImages(productId).length;
  const list = (files || []).slice(0, Math.max(MAX_IMAGES - existing, 0));
  let failed = 0;
  for (const f of list) {
    try { db.addImage(productId, await storage.saveImage(f.buffer)); } catch (e) { failed++; console.error('Image refusée :', e.message); }
  }
  return { saved: list.length - failed, failed, skipped: (files || []).length - list.length };
}

function valuesFromBody(body, data) {
  return { ...body, ...data, price: body.price, old_price: body.old_price, specs: body.specs };
}

router.post('/produits', handleUpload([{ name: 'images', maxCount: MAX_IMAGES }]), auth.verifyCsrf, async (req, res, next) => {
  try {
    const { data, errors } = readProductForm(req.body);
    if (data.reference && db.db.prepare('SELECT 1 FROM products WHERE reference = ?').get(data.reference)) errors.push('Cette référence existe déjà.');
    if (errors.length) return formView(res.status(400), { isNew: true, product: { images: [] }, errors, values: valuesFromBody(req.body, data) });
    const id = db.createProduct(data);
    const r = await storeUploadedImages(id, req.files && req.files.images);
    req.flash(r.failed ? 'error' : 'success', r.failed
      ? `Produit créé, mais ${r.failed} photo(s) n'ont pas pu être lues (format non pris en charge).`
      : `Produit « ${data.name} » ajouté avec ${r.saved} photo(s).`);
    res.redirect(`/admin/produits/${id}`);
  } catch (e) { next(e); }
});

router.get('/produits/:id', (req, res, next) => {
  const p = db.getProduct(req.params.id);
  if (!p) return next();
  formView(res, { isNew: false, product: p, errors: [], values: { ...p, specs: specsToText(p.specs), price: p.price, old_price: p.old_price || '' } });
});

router.post('/produits/:id', handleUpload([{ name: 'images', maxCount: MAX_IMAGES }]), auth.verifyCsrf, async (req, res, next) => {
  try {
    const p = db.getProduct(req.params.id);
    if (!p) return next();
    const { data, errors } = readProductForm(req.body);
    if (data.reference && db.db.prepare('SELECT 1 FROM products WHERE reference = ? AND id != ?').get(data.reference, p.id)) errors.push('Cette référence existe déjà.');
    if (errors.length) return formView(res.status(400), { isNew: false, product: p, errors, values: valuesFromBody(req.body, data) });
    db.updateProduct(p.id, data);

    // Suppression des photos cochées
    const toDelete = [].concat(req.body.delete_images || []).map(Number);
    for (const img of p.images) {
      if (toDelete.includes(img.id)) { db.deleteImage(img.id); await storage.removeImage(img.storage_key); }
    }
    // Nouvel ordre des photos (la première = photo principale)
    const order = String(req.body.image_order || '').split(',').map(Number).filter((n) => n && !toDelete.includes(n));
    if (order.length) db.reorderImages(p.id, order);
    const r = await storeUploadedImages(p.id, req.files && req.files.images);
    let msg = 'Modifications enregistrées.';
    if (r.saved) msg += ` ${r.saved} photo(s) ajoutée(s).`;
    if (r.skipped) msg += ` ${r.skipped} photo(s) ignorée(s) (maximum ${MAX_IMAGES}).`;
    if (r.failed) msg += ` ${r.failed} photo(s) illisible(s).`;
    req.flash(r.failed ? 'error' : 'success', msg);
    res.redirect(`/admin/produits/${p.id}`);
  } catch (e) { next(e); }
});

router.post('/produits/:id/basculer', auth.verifyCsrf, (req, res, next) => {
  const p = db.getProduct(req.params.id);
  if (!p) return next();
  const flag = { visible: 'is_visible', vedette: 'is_featured', populaire: 'is_popular', stock: 'in_stock' }[req.body.champ];
  if (!flag) return res.status(400).send('Champ invalide');
  db.setProductFlag(p.id, flag, !p[flag]);
  const labels = {
    is_visible: p.is_visible ? 'masqué' : 'de nouveau visible',
    is_featured: p.is_featured ? 'retiré de la une' : 'mis en avant sur l\'accueil',
    is_popular: p.is_popular ? 'retiré des populaires' : 'ajouté aux produits populaires',
    in_stock: p.in_stock ? 'marqué en rupture de stock' : 'marqué disponible',
  };
  if (req.get('accept') && req.get('accept').includes('application/json')) return res.json({ ok: true, value: !p[flag] });
  req.flash('success', `« ${p.name} » ${labels[flag]}.`);
  const back = String(req.body.retour || '');
  res.redirect(back.startsWith('/admin') ? back : '/admin/produits');
});

router.post('/produits/:id/supprimer', auth.verifyCsrf, async (req, res, next) => {
  try {
    const p = db.getProduct(req.params.id);
    if (!p) return next();
    db.deleteProduct(p.id);
    for (const img of p.images) await storage.removeImage(img.storage_key);
    req.flash('success', `Produit « ${p.name} » supprimé définitivement.`);
    res.redirect('/admin/produits');
  } catch (e) { next(e); }
});

// ---------- Catégories ----------
router.get('/categories', (req, res) => {
  res.render('admin/categories', { title: 'Catégories', categories: db.listCategories(), editId: parseInt(req.query.modifier, 10) || null });
});
function readCategory(body) {
  return { name: String(body.name || '').trim().slice(0, 80), icon: String(body.icon || '').trim().slice(0, 8), position: parseInt(body.position, 10) || 0 };
}
router.post('/categories', auth.verifyCsrf, (req, res) => {
  const c = readCategory(req.body);
  if (!c.name) { req.flash('error', 'Le nom de la catégorie est obligatoire.'); return res.redirect('/admin/categories'); }
  if (!req.body.position) c.position = db.listCategories().length;
  db.createCategory(c);
  req.flash('success', `Catégorie « ${c.name} » créée.`);
  res.redirect('/admin/categories');
});
router.post('/categories/:id', auth.verifyCsrf, (req, res, next) => {
  const cat = db.getCategory(req.params.id);
  if (!cat) return next();
  const c = readCategory(req.body);
  if (!c.name) { req.flash('error', 'Le nom de la catégorie est obligatoire.'); return res.redirect('/admin/categories'); }
  db.updateCategory(cat.id, c);
  db.refreshSearchTextForCategory(cat.id);
  req.flash('success', `Catégorie « ${c.name} » modifiée.`);
  res.redirect('/admin/categories');
});
router.post('/categories/:id/supprimer', auth.verifyCsrf, (req, res, next) => {
  const cat = db.getCategory(req.params.id);
  if (!cat) return next();
  db.deleteCategory(cat.id);
  req.flash('success', `Catégorie « ${cat.name} » supprimée. Ses produits sont conservés (sans catégorie).`);
  res.redirect('/admin/categories');
});

// ---------- Paramètres de la boutique ----------
const SETTINGS_FIELDS = ['shop_name', 'tagline', 'whatsapp_number', 'banner_title', 'banner_subtitle', 'city', 'delivery_text',
  'facebook_url', 'instagram_url', 'tiktok_url', 'youtube_url'];
router.get('/parametres', (req, res) => res.render('admin/settings', { title: 'Paramètres de la boutique', errors: [] }));
router.post('/parametres', handleUpload([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), auth.verifyCsrf, async (req, res, next) => {
  try {
    const current = db.getSettings();
    const s = {};
    const errors = [];
    for (const f of SETTINGS_FIELDS) s[f] = String(req.body[f] || '').trim().slice(0, 500);
    if (!s.shop_name) errors.push('Le nom de la boutique est obligatoire.');
    s.whatsapp_number = h.cleanPhone(s.whatsapp_number);
    if (s.whatsapp_number.length < 8) errors.push('Numéro WhatsApp invalide.');
    for (const f of ['facebook_url', 'instagram_url', 'tiktok_url', 'youtube_url']) {
      if (s[f] && !/^https?:\/\//i.test(s[f])) s[f] = 'https://' + s[f];
      if (s[f] && !h.isSafeUrl(s[f])) errors.push(`Lien invalide : ${s[f]}`);
    }
    if (errors.length) { res.locals.settings = { ...current, ...s }; return res.status(400).render('admin/settings', { title: 'Paramètres de la boutique', errors }); }
    for (const [field, key] of [['logo', 'logo_url'], ['banner', 'banner_image']]) {
      const file = req.files && req.files[field] && req.files[field][0];
      if (req.body[`remove_${field}`] === '1' && current[key]) {
        await storage.removeImage(current[`${key}_key`]); s[key] = ''; s[`${key}_key`] = '';
      }
      if (file) {
        const img = await storage.saveImage(file.buffer);
        if (current[`${key}_key`]) await storage.removeImage(current[`${key}_key`]);
        s[key] = img.url; s[`${key}_key`] = img.storage_key;
      }
    }
    db.saveSettings(s);
    req.flash('success', 'Paramètres enregistrés.');
    res.redirect('/admin/parametres');
  } catch (e) { next(e); }
});

// ---------- Compte administrateur ----------
router.get('/compte', (req, res) => res.render('admin/account', { title: 'Mon compte', errors: [] }));
router.post('/compte', auth.verifyCsrf, async (req, res, next) => {
  try {
    const errors = [];
    const full = db.getAdminByUsername(req.admin.username);
    const ok = await auth.bcrypt.compare(String(req.body.current_password || ''), full.password_hash);
    if (!ok) errors.push('Mot de passe actuel incorrect.');
    const username = String(req.body.username || '').trim();
    const pwd = String(req.body.new_password || '');
    if (!username || username.length < 3) errors.push('L\'identifiant doit contenir au moins 3 caractères.');
    const other = username && db.getAdminByUsername(username);
    if (other && other.id !== full.id) errors.push('Cet identifiant est déjà utilisé.');
    if (pwd && pwd.length < 8) errors.push('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (pwd && pwd !== req.body.confirm_password) errors.push('La confirmation ne correspond pas au nouveau mot de passe.');
    if (errors.length) return res.status(400).render('admin/account', { title: 'Mon compte', errors });
    if (username !== full.username) db.updateAdminUsername(full.id, username);
    if (pwd) db.updateAdminPassword(full.id, auth.bcrypt.hashSync(pwd, 12));
    req.flash('success', 'Compte mis à jour.');
    res.redirect('/admin/compte');
  } catch (e) { next(e); }
});

// ---------- Sauvegarde de la base de données ----------
router.get('/sauvegarde', async (req, res, next) => {
  try {
    const file = path.join(config.dataDir, `sauvegarde-${Date.now()}.db`);
    await db.db.backup(file);
    res.download(file, `sauvegarde-boutique-${new Date().toISOString().slice(0, 10)}.db`, () => fs.unlink(file, () => {}));
  } catch (e) { next(e); }
});

module.exports = router;
