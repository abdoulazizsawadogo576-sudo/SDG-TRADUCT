'use strict';
const config = require('./src/config');
const { createApp } = require('./src/app');
const storage = require('./src/storage');

createApp().then((app) => app.listen(config.port, () => {
  console.log(`🛍  Boutique démarrée sur http://localhost:${config.port}`);
  console.log(`   Espace administrateur : http://localhost:${config.port}/admin`);
  console.log(`   Base : ${config.databaseUrl ? 'Turso (en ligne)' : config.dbFile} — images : ${storage.driver === 'cloudinary' ? 'Cloudinary' : 'disque local'}`);
})).catch((e) => { console.error('Démarrage impossible :', e); process.exit(1); });
