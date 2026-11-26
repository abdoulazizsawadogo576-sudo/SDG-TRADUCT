'use strict';
/**
 * Tests de bout en bout : démarre la boutique sur une base vide temporaire et vérifie
 * l'espace admin, l'ajout de produits avec photos, la recherche, les prix et le lien WhatsApp.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boutique-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_USERNAME = 'gerant';
process.env.ADMIN_PASSWORD = 'MotDePasse-Test-123';
process.env.SITE_URL = 'https://www.ma-boutique.bf';
delete process.env.CLOUDINARY_URL;

const sharp = require('sharp');
const { createApp } = require('../src/app');

let server, base;
let cookie = '';

async function req(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + url, { redirect: 'manual', ...opts, headers });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) { const kv = c.split(';')[0]; if (kv.startsWith('boutique.sid=')) cookie = kv; }
  return res;
}
async function html(url) { const r = await req(url); return { status: r.status, body: await r.text() }; }
function csrfFrom(body) { const m = body.match(/name="_csrf" value="([a-f0-9]+)"/); assert.ok(m, 'jeton CSRF présent'); return m[1]; }
async function makeImage(color, w = 2400, h = 1800) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg({ quality: 90 }).toBuffer();
}

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

let productId, productSlug, csrf;

test('les pages publiques s\'affichent (catalogue vide)', async () => {
  const home = await html('/');
  assert.strictEqual(home.status, 200);
  assert.match(home.body, /Notre catalogue arrive très bientôt/);
  assert.match(home.body, /Téléphones et accessoires/, 'catégories par défaut créées');
  assert.match(home.body, /https:\/\/wa\.me\/22654231847\?text=/, 'bouton WhatsApp flottant');
});

test('l\'espace admin est protégé', async () => {
  const r = await req('/admin');
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /\/admin\/connexion/);
  const r2 = await req('/admin/produits/nouveau');
  assert.strictEqual(r2.status, 302);
});

test('mauvais mot de passe refusé, bon mot de passe accepté', async () => {
  let page = await html('/admin/connexion');
  csrf = csrfFrom(page.body);
  let r = await req('/admin/connexion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, username: 'gerant', password: 'faux' }) });
  assert.strictEqual(r.status, 401);
  // Sans jeton CSRF : refusé
  r = await req('/admin/connexion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'gerant', password: 'MotDePasse-Test-123' }) });
  assert.strictEqual(r.status, 403);
  r = await req('/admin/connexion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, username: 'gerant', password: 'MotDePasse-Test-123' }) });
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /^\/admin/);
  page = await html('/admin');
  assert.strictEqual(page.status, 200);
  assert.match(page.body, /Bonjour gerant/);
  csrf = csrfFrom(page.body);
});

test('création d\'une catégorie', async () => {
  const r = await req('/admin/categories', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, name: 'Accessoires auto', icon: '🚗' }) });
  assert.strictEqual(r.status, 302);
  const page = await html('/admin/categories');
  assert.match(page.body, /Accessoires auto/);
});

test('ajout d\'un produit avec 3 photos', async () => {
  const fd = new FormData();
  fd.append('_csrf', csrf);
  fd.append('name', 'Montre connectée Ultra Série 9');
  fd.append('price', '25 000');
  fd.append('old_price', '30000');
  fd.append('category_id', '2'); // Montres connectées
  fd.append('short_description', 'Écran AMOLED, autonomie 7 jours');
  fd.append('description', 'Une montre élégante.\n\nCompatible Android et iPhone.');
  fd.append('specs', 'Écran : AMOLED 1,96"\nAutonomie : 7 jours\nÉtanchéité : IP68');
  fd.append('is_visible', '1');
  fd.append('is_featured', '1');
  fd.append('in_stock', '1');
  for (const c of ['#d33', '#3a3', '#33d']) fd.append('images', new Blob([await makeImage(c)], { type: 'image/jpeg' }), 'photo.jpg');
  const r = await req('/admin/produits', { method: 'POST', body: fd });
  assert.strictEqual(r.status, 302);
  productId = Number(r.headers.get('location').split('/').pop());
  assert.ok(productId > 0);

  const edit = await html(`/admin/produits/${productId}`);
  assert.match(edit.body, /Produit « Montre connectée Ultra Série 9 » ajouté avec 3 photo\(s\)/);
  const imgs = [...edit.body.matchAll(/src="(\/uploads\/[^"]+-thumb\.webp)"/g)].map((m) => m[1]);
  assert.strictEqual(imgs.length, 3, '3 miniatures');
  // Les fichiers existent sur le disque, sont servis et ont été redimensionnés
  for (const u of imgs) {
    const res = await req(u);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/webp');
    const large = await req(u.replace('-thumb', ''));
    const meta = await sharp(Buffer.from(await large.arrayBuffer())).metadata();
    assert.ok(meta.width <= 1600 && meta.format === 'webp', 'grande image optimisée');
  }
  const uploaded = fs.readdirSync(path.join(dataDir, 'uploads'), { recursive: true }).filter((f) => f.endsWith('.webp'));
  assert.strictEqual(uploaded.length, 6, '3 grandes + 3 miniatures sur le disque');
});

test('fiche produit : prix FCFA, photos et message WhatsApp prérempli', async () => {
  const home = await html('/');
  const m = home.body.match(/href="\/produit\/([a-z0-9-]+)"/);
  assert.ok(m);
  productSlug = m[1];
  assert.strictEqual(productSlug, 'montre-connectee-ultra-serie-9');
  assert.match(home.body, /En vedette/);
  assert.match(home.body, /Nouveautés/);
  assert.match(home.body, /Produits populaires/);
  assert.match(home.body, /25 000 FCFA/);

  const page = await html(`/produit/${productSlug}`);
  assert.strictEqual(page.status, 200);
  assert.match(page.body, /25 000 FCFA/);
  assert.match(page.body, /30 000 FCFA/);
  assert.match(page.body, /-17%/);
  assert.match(page.body, /REF-0001/);
  assert.match(page.body, /COMMANDER SUR WHATSAPP/);
  assert.match(page.body, /<dt>Autonomie<\/dt><dd>7 jours<\/dd>/);
  assert.strictEqual([...page.body.matchAll(/class="gallery-slide"/g)].length, 3);

  const link = page.body.match(/href="(https:\/\/wa\.me\/22654231847\?text=[^"]+)"[^>]*class="btn btn-wa btn-xl/);
  assert.ok(link, 'bouton de commande présent');
  const url = new URL(link[1].replace(/&amp;/g, '&'));
  const msg = url.searchParams.get('text');
  assert.strictEqual(msg, [
    'Bonjour, je suis intéressé par votre produit.',
    '',
    'Produit : Montre connectée Ultra Série 9',
    'Prix : 25 000 FCFA',
    'Référence : REF-0001',
    'Lien : https://www.ma-boutique.bf/produit/montre-connectee-ultra-serie-9',
    '',
    "Je souhaiterais avoir plus d'informations pour passer commande.",
  ].join('\n'));
  // Partage
  assert.match(page.body, /facebook\.com\/sharer/);
  assert.match(page.body, /og:image" content="https:\/\/www\.ma-boutique\.bf\/uploads\//);
});

test('recherche rapide, recherche sans accents et filtre par catégorie', async () => {
  let r = await (await req('/api/recherche?q=montre')).json();
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.items[0].price, '25 000 FCFA');
  r = await (await req('/api/recherche?q=connectee%20ultra')).json();
  assert.strictEqual(r.total, 1, 'recherche insensible aux accents');
  r = await (await req('/api/recherche?q=amoled')).json();
  assert.strictEqual(r.total, 1, 'recherche dans la description');
  r = await (await req('/api/recherche?q=frigo')).json();
  assert.strictEqual(r.total, 0);

  let page = await html('/catalogue?q=montre');
  assert.match(page.body, /<strong>1<\/strong> produit trouvé/);
  page = await html('/catalogue?categorie=montres-connectees');
  assert.match(page.body, /Montre connectée Ultra Série 9/);
  page = await html('/catalogue?categorie=articles-de-maison');
  assert.match(page.body, /Aucun produit trouvé/);
});

test('compteur de clics « Commander »', async () => {
  const r = await req(`/api/commande/${productId}`, { method: 'POST' });
  assert.strictEqual(r.status, 204);
  const dash = await html('/admin');
  assert.match(dash.body, /Clics « Commander »<\/span><strong>1<\/strong>/);
});

test('modification : nom, prix, ordre des photos, suppression d\'une photo', async () => {
  const edit = await html(`/admin/produits/${productId}`);
  const ids = edit.body.match(/name="image_order" value="([\d,]+)"/)[1].split(',');
  const fd = new FormData();
  fd.append('_csrf', csrf);
  fd.append('name', 'Montre Ultra Série 9 Pro');
  fd.append('price', '27500');
  fd.append('category_id', '2');
  fd.append('reference', 'REF-0001');
  fd.append('is_visible', '1');
  fd.append('in_stock', '1');
  fd.append('image_order', [ids[2], ids[1], ids[0]].join(','));
  fd.append('delete_images', ids[1]);
  fd.append('images', new Blob([await makeImage('#ff0', 800, 800)], { type: 'image/jpeg' }), 'nouvelle.jpg');
  const r = await req(`/admin/produits/${productId}`, { method: 'POST', body: fd });
  assert.strictEqual(r.status, 302);
  const after = await html(`/admin/produits/${productId}`);
  const newOrder = after.body.match(/name="image_order" value="([\d,]+)"/)[1].split(',');
  assert.strictEqual(newOrder.length, 3);
  assert.strictEqual(newOrder[0], ids[2], 'la 3e photo est devenue principale');
  assert.strictEqual(newOrder[1], ids[0]);
  const page = await html('/produit/montre-ultra-serie-9-pro');
  assert.strictEqual(page.status, 200);
  assert.match(page.body, /27 500 FCFA/);
  assert.match(page.body, /Prix%20%3A%2027%20500%20FCFA/);
  const files = fs.readdirSync(path.join(dataDir, 'uploads'), { recursive: true }).filter((f) => f.endsWith('.webp'));
  assert.strictEqual(files.length, 6, 'photo supprimée du disque, nouvelle ajoutée');
});

test('masquer un produit le retire du site, mettre en avant / retirer', async () => {
  let r = await req(`/admin/produits/${productId}/basculer`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, champ: 'visible' }) });
  assert.strictEqual(r.status, 302);
  const savedCookie = cookie; cookie = '';
  assert.strictEqual((await html('/produit/montre-ultra-serie-9-pro')).status, 404, 'invisible pour les clients');
  assert.strictEqual((await (await req('/api/recherche?q=montre')).json()).total, 0);
  assert.match((await html('/')).body, /Notre catalogue arrive très bientôt/);
  cookie = savedCookie;
  const preview = await html('/produit/montre-ultra-serie-9-pro');
  assert.strictEqual(preview.status, 200, 'aperçu possible pour l\'admin');
  assert.match(preview.body, /Aperçu administrateur/);
  r = await req(`/admin/produits/${productId}/basculer`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, champ: 'visible' }) });
  cookie = '';
  assert.strictEqual((await html('/produit/montre-ultra-serie-9-pro')).status, 200);
  cookie = savedCookie;
});

test('paramètres : nom de boutique, numéro WhatsApp et réseaux sociaux', async () => {
  const fd = new FormData();
  fd.append('_csrf', csrf);
  fd.append('shop_name', 'Ma Super Boutique');
  fd.append('whatsapp_number', '+226 54 23 18 47');
  fd.append('facebook_url', 'facebook.com/maboutique');
  fd.append('banner_title', 'Bienvenue');
  fd.append('logo', new Blob([await makeImage('#123', 400, 400)], { type: 'image/jpeg' }), 'logo.jpg');
  const r = await req('/admin/parametres', { method: 'POST', body: fd });
  assert.strictEqual(r.status, 302);
  const home = await html('/');
  assert.match(home.body, /Ma Super Boutique/);
  assert.match(home.body, /href="https:\/\/facebook\.com\/maboutique"/);
  assert.match(home.body, /class="brand-logo"/);
  assert.doesNotMatch(home.body, /aria-label="Instagram"/, 'réseau non renseigné non affiché');
});

test('suppression d\'un produit et de ses photos', async () => {
  const r = await req(`/admin/produits/${productId}/supprimer`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf }) });
  assert.strictEqual(r.status, 302);
  assert.strictEqual((await html('/produit/montre-ultra-serie-9-pro')).status, 404);
  const files = fs.readdirSync(path.join(dataDir, 'uploads'), { recursive: true }).filter((f) => f.endsWith('.webp'));
  assert.strictEqual(files.length, 2, 'seul le logo reste');
});

test('déconnexion', async () => {
  const r = await req('/admin/deconnexion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf }) });
  assert.strictEqual(r.status, 302);
  assert.strictEqual((await req('/admin')).status, 302);
});
