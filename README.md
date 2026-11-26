# Boutique en ligne — commande directe sur WhatsApp

Catalogue en ligne professionnel pour le Burkina Faso : les clients parcourent les produits, consultent photos et prix en FCFA, puis commandent en un clic sur **WhatsApp** (message prérempli : produit, prix, référence et lien). Pas de paiement en ligne.

## Fonctionnalités

**Côté client** (mobile d'abord)
- Accueil : logo, bannière, recherche, catégories, compteur de produits, sections « En vedette », « Nouveautés », « Produits populaires »
- Catalogue : recherche (insensible aux accents), filtre par catégorie, tri (récents, populaires, prix, nom), pagination
- Recherche rapide avec suggestions instantanées
- Fiche produit : galerie (glisser sur mobile, miniatures), prix FCFA, prix barré et remise, référence, description, caractéristiques, disponibilité, produits similaires
- Bouton **COMMANDER SUR WHATSAPP** + barre de commande collante sur mobile
- Bouton WhatsApp flottant sur toutes les pages
- Partage : WhatsApp, Facebook, Telegram, X, copie du lien, partage natif du téléphone (aperçu avec photo grâce aux balises Open Graph)
- Liens réseaux sociaux (seuls ceux renseignés s'affichent), sitemap.xml et robots.txt

**Espace administrateur** (`/admin`, identifiant + mot de passe)
- Ajouter / modifier / supprimer un produit, nom, prix, ancien prix, description, caractéristiques, référence
- Photos depuis le téléphone (jusqu'à 12 par produit), compressées avant l'envoi puis optimisées (WebP) ; choisir la photo principale, réordonner, supprimer
- Masquer temporairement, mettre en avant sur l'accueil, marquer « populaire » ou « rupture de stock »
- Catégories : créer, renommer, réordonner, supprimer (icône émoji)
- Paramètres : nom, slogan, logo, image de bannière, textes, numéro WhatsApp, réseaux sociaux
- Statistiques : vues par fiche, clics sur « Commander »
- Changement d'identifiant / mot de passe, téléchargement d'une sauvegarde

## Architecture

```
server.js              Démarrage du serveur
src/config.js          Configuration (variables d'environnement / fichier .env)
src/db.js              Base SQLite : schéma, catégories, produits, photos, paramètres
src/storage.js         Stockage des photos : disque persistant ou Cloudinary
src/auth.js            Sessions (stockées en base), connexion, protection CSRF et anti-force brute
src/helpers.js         Prix FCFA, liens et messages WhatsApp, recherche
src/routes/public.js   Pages clients + API (recherche rapide, statistiques)
src/routes/admin.js    Espace administrateur
views/                 Gabarits EJS (pages rendues côté serveur = chargement rapide)
public/                CSS, JavaScript, images
tests/                 Tests automatiques (npm test)
```

Technologies : Node.js 20+, Express 5, SQLite (better-sqlite3), Sharp (optimisation d'images), EJS. Aucun framework front-end lourd : pages légères, rapides en 3G/4G.

## Lancer en local

```bash
npm install
cp .env.example .env        # puis modifiez ADMIN_USERNAME / ADMIN_PASSWORD
npm start                   # http://localhost:3000  — admin : http://localhost:3000/admin
npm run seed:demo           # (facultatif) 10 produits d'exemple
npm run seed:demo -- --supprimer   # retire les produits d'exemple
npm test                    # tests automatiques
```

Mot de passe oublié : `npm run create-admin -- admin NouveauMotDePasse` sur le serveur.

## Mise en ligne

Voir le guide pas à pas : **[GUIDE.md](GUIDE.md)**.
