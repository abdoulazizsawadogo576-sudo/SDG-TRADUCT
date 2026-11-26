'use strict';
const config = require('./src/config');
const { createApp } = require('./src/app');
const storage = require('./src/storage');

const app = createApp();
app.listen(config.port, () => {
  console.log(`🛍  Boutique démarrée sur http://localhost:${config.port}`);
  console.log(`   Espace administrateur : http://localhost:${config.port}/admin`);
  console.log(`   Données : ${config.dataDir} — images : ${storage.driver === 'cloudinary' ? 'Cloudinary' : 'disque local'}`);
});
