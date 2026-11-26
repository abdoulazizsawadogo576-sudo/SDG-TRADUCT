'use strict';
/**
 * Produits de démonstration (pour tester le site avant d'ajouter vos vrais produits).
 *   npm run seed:demo               → ajoute 10 produits « DEMO-xx »
 *   npm run seed:demo -- --supprimer → supprime tous les produits de démonstration
 */
const sharp = require('sharp');
const db = require('../src/db');
const storage = require('../src/storage');

const remove = process.argv.includes('--supprimer');

async function picture(c1, c2, emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="1200" height="1200" fill="url(#g)"/><circle cx="600" cy="600" r="380" fill="#fff" opacity=".18"/>
    <text x="600" y="700" font-size="320" text-anchor="middle">${emoji}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

const DEMO = [
  ['Smartphone Galaxy A-Series 128 Go', 145000, 165000, 'telephones-et-accessoires', '📱', ['#1d2b64', '#f8cdda'], 1, 1],
  ['Écouteurs sans fil Bluetooth Pro', 18500, null, 'equipements-electroniques', '🎧', ['#232526', '#9ca3af'], 0, 1],
  ['Montre connectée Ultra Série 9', 25000, 30000, 'montres-connectees', '⌚', ['#0f2027', '#2c5364'], 1, 0],
  ['Lunettes intelligentes audio', 39000, null, 'lunettes-intelligentes', '🕶️', ['#3a1c71', '#ffaf7b'], 1, 0],
  ['Chargeur rapide 65 W USB-C', 9500, 12000, 'telephones-et-accessoires', '🔌', ['#134e5e', '#71b280'], 0, 0],
  ['Ventilateur rechargeable silencieux', 22000, null, 'articles-de-maison', '🌀', ['#2193b0', '#6dd5ed'], 0, 1],
  ['Baskets urbaines confort', 27500, 32000, 'vetements-et-chaussures', '👟', ['#cc2b5e', '#753a88'], 1, 0],
  ['Imprimante thermique de caisse', 68000, null, 'materiel-professionnel', '🧾', ['#373b44', '#4286f4'], 0, 0],
  ['Enceinte Bluetooth étanche', 15000, null, 'equipements-electroniques', '🔊', ['#ff512f', '#dd2476'], 0, 1],
  ['Power bank 20 000 mAh', 12500, 15000, 'telephones-et-accessoires', '🔋', ['#11998e', '#38ef7d'], 0, 0],
];

(async () => {
  const demo = db.db.prepare("SELECT id FROM products WHERE reference LIKE 'DEMO-%'").all();
  if (remove) {
    for (const { id } of demo) {
      const p = db.getProduct(id);
      db.deleteProduct(id);
      for (const im of p.images) await storage.removeImage(im.storage_key);
    }
    console.log(`✔ ${demo.length} produit(s) de démonstration supprimé(s).`);
    return;
  }
  if (demo.length) { console.log('Les produits de démonstration existent déjà.'); return; }
  let i = 1;
  for (const [name, price, old, catSlug, emoji, [c1, c2], featured, popular] of DEMO) {
    const cat = db.getCategoryBySlug(catSlug);
    const id = db.createProduct({
      name, price, old_price: old, reference: `DEMO-${String(i++).padStart(2, '0')}`,
      short_description: 'Produit de démonstration — remplacez-le par vos vrais articles.',
      description: `${name} : un article de qualité sélectionné pour nos clients au Burkina Faso.\n\nCe texte est un exemple. Depuis l'espace administrateur, vous pouvez modifier la description, les photos et le prix.`,
      specs: [{ label: 'Garantie', value: '3 mois' }, { label: 'État', value: 'Neuf' }, { label: 'Livraison', value: 'Ouagadougou et Bobo-Dioulasso' }],
      category_id: cat && cat.id, is_visible: true, is_featured: !!featured, is_popular: !!popular, in_stock: true,
    });
    db.addImage(id, await storage.saveImage(await picture(c1, c2, emoji)));
    db.addImage(id, await storage.saveImage(await picture(c2, c1, emoji)));
  }
  console.log(`✔ ${DEMO.length} produits de démonstration ajoutés.`);
})();
