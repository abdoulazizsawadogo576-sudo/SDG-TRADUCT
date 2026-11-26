'use strict';
// Crée ou réinitialise un compte administrateur.
// Usage : npm run create-admin -- <identifiant> <mot_de_passe>
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.log('Usage : npm run create-admin -- <identifiant> <mot_de_passe>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Le mot de passe doit contenir au moins 8 caractères.');
  process.exit(1);
}
(async () => {
  await db.init();
  const hash = bcrypt.hashSync(password, 12);
  const existing = await db.getAdminByUsername(username);
  if (existing) {
    await db.updateAdminPassword(existing.id, hash);
    console.log(`✔ Mot de passe de « ${username} » réinitialisé.`);
  } else {
    await db.createAdmin(username, hash);
    console.log(`✔ Administrateur « ${username} » créé.`);
  }
})();
