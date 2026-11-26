'use strict';

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slugify(s) {
  return stripAccents(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'produit';
}

// Texte normalisé pour la recherche : minuscules, sans accents, espaces simples
function normalizeSearch(s) {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// 125000 -> "125 000 FCFA"
function formatPrice(n) {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}

// "125 000", "125.000", "125000 fcfa" -> 125000
function parsePrice(s) {
  if (s === undefined || s === null || s === '') return null;
  const digits = String(s).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function cleanPhone(n) {
  let d = String(n || '').replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '226' + d; // numéro burkinabè saisi sans indicatif
  return d;
}

function displayPhone(n) {
  const d = cleanPhone(n);
  if (d.startsWith('226') && d.length === 11) return `+226 ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return '+' + d;
}

function whatsappLink(number, message) {
  return `https://wa.me/${cleanPhone(number)}?text=${encodeURIComponent(message).replace(/'/g, '%27')}`;
}

function productOrderMessage(product, productUrl) {
  return [
    'Bonjour, je suis intéressé par votre produit.',
    '',
    `Produit : ${product.name}`,
    `Prix : ${formatPrice(product.price)}`,
    `Référence : ${product.reference}`,
    `Lien : ${productUrl}`,
    '',
    'Je souhaiterais avoir plus d\'informations pour passer commande.',
  ].join('\n');
}

function generalMessage(shopName) {
  return `Bonjour ${shopName}, je visite votre boutique en ligne et je souhaiterais avoir des informations.`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Description en texte simple -> paragraphes HTML sûrs (sauts de ligne conservés)
function textToHtml(s) {
  return String(s || '').trim().split(/\n{2,}/).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function truncate(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function isSafeUrl(u) {
  return /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());
}

module.exports = {
  stripAccents, slugify, normalizeSearch, formatPrice, parsePrice, cleanPhone, displayPhone,
  whatsappLink, productOrderMessage, generalMessage, escapeHtml, textToHtml, truncate, isSafeUrl,
};
