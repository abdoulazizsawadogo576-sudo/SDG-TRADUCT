'use strict';
const express = require('express');
const db = require('../db');
const h = require('../helpers');

const router = express.Router();
const PAGE_SIZE = 24;

function productUrl(baseUrl, p) { return `${baseUrl}/produit/${p.slug}`; }

// Ajoute le lien WhatsApp de commande à chaque produit
function withOrderLink(res, p) {
  const url = productUrl(res.locals.baseUrl, p);
  p.url = `/produit/${p.slug}`;
  p.absolute_url = url;
  p.whatsapp_url = h.whatsappLink(res.locals.settings.whatsapp_number, h.productOrderMessage(p, url));
  return p;
}

// ---------- Accueil ----------
router.get('/', async (req, res) => {
  const categories = res.locals.navCategories();
  const [f, l, pop] = await Promise.all([
    db.searchProducts({ visibleOnly: true, featured: true, sort: 'recent', limit: 8 }),
    db.searchProducts({ visibleOnly: true, sort: 'recent', limit: 8 }),
    db.searchProducts({ visibleOnly: true, sort: 'populaire', limit: 8 }),
  ]);
  const featured = f.items; const latest = l.items; const popular = pop.items; const total = l.total;
  [...featured, ...latest, ...popular].forEach((p) => withOrderLink(res, p));
  res.render('home', { title: null, categories, featured, latest, popular, total });
});

// ---------- Catalogue (recherche, filtre, tri, pagination) ----------
router.get('/catalogue', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100).trim();
  const sort = ['recent', 'prix_asc', 'prix_desc', 'populaire', 'nom'].includes(req.query.tri) ? req.query.tri : 'recent';
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const categories = res.locals.navCategories();
  let category = null;
  if (req.query.categorie) {
    category = await db.getCategoryBySlug(String(req.query.categorie));
    if (!category) return res.redirect('/catalogue' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  }
  const { total, items } = await db.searchProducts({
    visibleOnly: true, q, categoryId: category && category.id, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  items.forEach((p) => withOrderLink(res, p));
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const buildUrl = (over) => {
    const params = new URLSearchParams();
    const v = { q, categorie: category ? category.slug : '', tri: sort === 'recent' ? '' : sort, page: '', ...over };
    for (const [k, val] of Object.entries(v)) if (val && !(k === 'page' && val === 1)) params.set(k, val);
    const s = params.toString();
    return '/catalogue' + (s ? '?' + s : '');
  };
  const title = q ? `Recherche « ${q} »` : category ? category.name : 'Tous nos produits';
  res.render('catalogue', { title, q, sort, page, pages, total, items, categories, category, buildUrl });
});

router.get('/categorie/:slug', (req, res) => res.redirect(301, `/catalogue?categorie=${encodeURIComponent(req.params.slug)}`));

// ---------- Fiche produit ----------
router.get('/produit/:slug', async (req, res, next) => {
  const p = await db.getProductBySlug(req.params.slug);
  const isAdmin = !!(req.session && req.session.adminId);
  if (!p || (!p.is_visible && !isAdmin)) return next();
  if (p.is_visible) db.incrementViews(p.id).catch(() => {});
  withOrderLink(res, p);
  const similar = p.category_id
    ? (await db.searchProducts({ visibleOnly: true, categoryId: p.category_id, excludeId: p.id, sort: 'populaire', limit: 4 })).items
    : [];
  if (similar.length < 4) {
    const more = (await db.searchProducts({ visibleOnly: true, excludeId: p.id, sort: 'recent', limit: 8 })).items
      .filter((x) => !similar.some((s) => s.id === x.id));
    similar.push(...more.slice(0, 4 - similar.length));
  }
  similar.forEach((s) => withOrderLink(res, s));
  const shareText = `${p.name} — ${h.formatPrice(p.price)}`;
  const share = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${p.absolute_url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(p.absolute_url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(p.absolute_url)}&text=${encodeURIComponent(shareText)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(p.absolute_url)}&text=${encodeURIComponent(shareText)}`,
  };
  res.render('product', {
    title: p.name,
    description: h.truncate(p.short_description || p.description, 160),
    ogImage: p.main_image ? p.main_image.url : null,
    product: p, similar, share, previewHidden: !p.is_visible,
  });
});

// ---------- API : recherche rapide ----------
router.get('/api/recherche', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100).trim();
  if (q.length < 2) return res.json({ total: 0, items: [] });
  const { total, items } = await db.searchProducts({ visibleOnly: true, q, sort: 'populaire', limit: 6 });
  res.json({
    total,
    items: items.map((p) => ({
      name: p.name, price: h.formatPrice(p.price), url: `/produit/${p.slug}`,
      image: p.main_image ? p.main_image.thumb_url : '/img/placeholder.svg', category: p.category_name || '',
    })),
  });
});

// ---------- API : comptage des clics « Commander » (statistiques) ----------
router.post('/api/commande/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id) await db.incrementOrderClicks(id);
  res.status(204).end();
});

// ---------- Page « Comment commander » ----------
router.get('/comment-commander', (req, res) => {
  res.render('how-to-order', { title: 'Comment commander', description: 'Commandez en quelques secondes sur WhatsApp : choisissez, envoyez le message, nous vous répondons.' });
});

// ---------- Application installable (Ajouter à l'écran d'accueil) ----------
router.get('/manifest.webmanifest', (req, res) => {
  const s = res.locals.settings;
  res.type('application/manifest+json').json({
    name: s.shop_name,
    short_name: s.shop_name.slice(0, 12),
    description: s.tagline,
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f5f1',
    theme_color: '#12141a',
    icons: [
      { src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/img/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

// ---------- Vérification de santé (hébergeur) ----------
router.get('/sante', (req, res) => res.json({ ok: true }));

// ---------- SEO ----------
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${res.locals.baseUrl}/sitemap.xml\n`);
});
router.get('/sitemap.xml', async (req, res) => {
  const base = res.locals.baseUrl;
  const { items } = await db.searchProducts({ visibleOnly: true, limit: 200 });
  const urls = [`${base}/`, `${base}/catalogue`, `${base}/comment-commander`,
    ...res.locals.navCategories().map((c) => `${base}/catalogue?categorie=${c.slug}`),
    ...items.map((p) => productUrl(base, p))];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map((u) => `  <url><loc>${h.escapeHtml(u)}</loc></url>`).join('\n')}\n</urlset>`);
});

module.exports = router;
