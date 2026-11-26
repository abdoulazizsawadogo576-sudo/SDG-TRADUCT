'use strict';
const path = require('path');
const fs = require('fs');

// Chargement très simple d'un fichier .env (sans dépendance externe)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const isProd = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  // URL publique du site (ex : https://www.maboutique.bf). Utilisée dans les messages WhatsApp.
  siteUrl: (process.env.SITE_URL || '').replace(/\/+$/, ''),
  dataDir,
  dbFile: path.join(dataDir, 'boutique.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-a-changer',
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Si CLOUDINARY_URL est défini, les images sont stockées sur Cloudinary au lieu du disque.
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  // Base en ligne Turso (gratuite) : libsql://nom-de-la-base.turso.io + jeton d'accès
  databaseUrl: process.env.DATABASE_URL || '',
  databaseToken: process.env.DATABASE_AUTH_TOKEN || '',
  // Mettre EPHEMERAL_DISK=1 sur un hébergement gratuit sans disque permanent (affiche des alertes dans l'admin)
  ephemeralDisk: process.env.EPHEMERAL_DISK === '1',
  defaultWhatsapp: process.env.WHATSAPP_NUMBER || '22654231847',
};

if (module.exports.isProd && module.exports.sessionSecret === 'dev-secret-a-changer') {
  console.warn('⚠ SESSION_SECRET non défini : définissez une longue chaîne aléatoire en production.');
}
