'use strict';
// Crée ou réinitialise un compte administrateur.
// Usage : npm run create-admin -- <identifiant> <mot_de_passe>
const bcrypt = require('bcryptjs');
const { getAdminByUsername, createAdmin, updateAdminPassword } = require('../src/db');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.log('Usage : npm run create-admin -- <identifiant> <mot_de_passe>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Le mot de passe doit contenir au moins 8 caractères.');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
const existing = getAdminByUsername(username);
if (existing) {
  updateAdminPassword(existing.id, hash);
  console.log(`✔ Mot de passe de « ${username} » réinitialisé.`);
} else {
  createAdmin(username, hash);
  console.log(`✔ Administrateur « ${username} » créé.`);
}
