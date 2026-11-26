# Guide pas à pas

## 1. Mettre le site en ligne GRATUITEMENT (0 FCFA)

Trois services gratuits, sans carte bancaire. Prévoyez environ 20 minutes et gardez un bloc-notes à portée de main pour copier les codes.

| Service | Rôle | Offre gratuite |
|---|---|---|
| **Turso** | Base de données (produits, catégories, réglages) | 5 Go |
| **Cloudinary** | Photos des produits | 25 « crédits » par mois (largement suffisant pour débuter) |
| **Render** | Fait tourner le site | 750 h par mois (assez pour 1 site en continu) |

### Étape A — Base de données Turso
1. Ouvrez **https://turso.tech** → **Sign up** → connectez-vous avec **GitHub**.
2. Créez une base : **Create Database** → nom `boutique` → choisissez une région en **Europe** (Paris ou Francfort) → **Create**.
3. Sur la page de la base, copiez l'**URL** (elle commence par `libsql://…`). → c'est votre `DATABASE_URL`.
4. Cliquez sur **Create Token** (ou « Generate token ») → copiez le jeton (une longue suite de caractères). → c'est votre `DATABASE_AUTH_TOKEN`.

### Étape B — Photos sur Cloudinary
1. Ouvrez **https://cloudinary.com** → **Sign up for free**.
2. Dans le tableau de bord, ouvrez **Settings → API Keys** (ou « Go to API Keys »).
3. Copiez la ligne **API environment variable** : `cloudinary://123456789:AbCdEf…@votre-cloud`. Ne gardez que ce qui commence par `cloudinary://` (sans `CLOUDINARY_URL=`). → c'est votre `CLOUDINARY_URL`.

### Étape C — Le site sur Render
1. Ouvrez **https://render.com** → **Get Started** → connectez-vous avec **GitHub** et autorisez l'accès au dépôt **SDG-TRADUCT**.
2. **New +** → **Blueprint** → choisissez **SDG-TRADUCT** → **Connect**.
3. Remplissez les valeurs demandées :
   - `ADMIN_USERNAME` : votre identifiant (ex. `gerant`)
   - `ADMIN_PASSWORD` : un mot de passe solide (12 caractères ou plus)
   - `DATABASE_URL` et `DATABASE_AUTH_TOKEN` : copiés à l'étape A
   - `CLOUDINARY_URL` : copié à l'étape B
   - `SITE_URL` : laissez vide pour l'instant
4. **Apply**. Après 3 à 5 minutes, l'adresse de votre site apparaît en haut de la page du service : `https://boutique-whatsapp-xxxx.onrender.com`.
5. Votre espace administrateur : cette adresse suivie de **/admin**.

> ⚠️ Si le tableau de bord de l'admin affiche un **cadre rouge « Attention »**, une des valeurs Turso ou Cloudinary manque : corrigez-la dans Render (**Environment**), le site redémarre tout seul.

### Limite de l'offre gratuite et astuce
Sur l'offre gratuite, Render **met le site en veille après 15 minutes sans visite** : le visiteur suivant attend environ 30 à 60 secondes. Pour l'éviter, gratuitement :
1. Créez un compte sur **https://uptimerobot.com**.
2. **Add New Monitor** → type **HTTP(s)** → URL : `https://votre-adresse.onrender.com/sante` → intervalle **5 minutes** → **Create**.
Le site reste ainsi éveillé (et vous êtes prévenu par e-mail s'il tombe en panne).

### Plus tard : passer à l'offre payante (facultatif)
Si la boutique grandit, passez le service Render en offre **Starter** (~7 $/mois) depuis **Settings → Instance Type** : plus de mise en veille. Turso et Cloudinary restent gratuits tant que vous ne dépassez pas leurs limites.

> Autres options : serveur privé (VPS) avec Docker : `docker build -t boutique .` puis `docker run -d -p 80:3000 -v boutique-data:/data --env-file .env boutique` (sans Turso ni Cloudinary, tout est stocké dans le volume).

## 2. Brancher votre nom de domaine

1. Achetez un domaine (ex. `maboutique.com` chez Namecheap, OVH, GoDaddy… ou un `.bf` auprès d'un bureau d'enregistrement agréé).
2. Dans Render : votre service → **Settings** → **Custom Domains** (disponible aussi en offre gratuite) → **Add** → saisissez `www.maboutique.com`.
3. Render affiche un enregistrement DNS (en général un **CNAME** `www` → `boutique-whatsapp.onrender.com`). Ajoutez-le dans la zone DNS de votre bureau d'enregistrement.
4. Attendez la validation (quelques minutes à quelques heures) : le certificat HTTPS est automatique.
5. Mettez à jour la variable `SITE_URL` avec `https://www.maboutique.com` (important : c'est le lien envoyé dans les messages WhatsApp).

## 3. Accéder à votre espace administrateur

1. Ouvrez **https://votre-site/admin** (sur téléphone ou ordinateur).
2. Saisissez l'identifiant et le mot de passe choisis à l'étape 1.
3. Conseil : ajoutez la page à l'écran d'accueil de votre téléphone (menu du navigateur → « Ajouter à l'écran d'accueil »).
4. Pour changer de mot de passe : menu **Mon compte**.

## 4. Personnaliser la boutique

Menu **Paramètres** : nom de la boutique, slogan, ville, **logo**, **image de bannière**, titre et texte de la bannière, texte de livraison, **numéro WhatsApp** (déjà réglé sur +226 54 23 18 47) et liens Facebook / Instagram / TikTok / YouTube. Le bouton « tester le lien » ouvre WhatsApp pour vérifier le numéro.

## 5. Ajouter vos produits

1. Menu **+ Ajouter un produit**.
2. **Photos** : touchez la zone « Ajouter des photos » → choisissez dans la galerie ou prenez une photo. Vous pouvez en sélectionner plusieurs d'un coup (12 maximum). La première sera la photo principale.
3. Remplissez **Nom** et **Prix** (en FCFA, ex. `25000`). Facultatif : *Ancien prix* pour afficher une promotion barrée.
4. Choisissez la **catégorie**, ajoutez un **résumé**, une **description** et les **caractéristiques** (une par ligne, ex. `Autonomie : 7 jours`).
5. Réglez l'affichage : *Visible*, *Mettre en avant* (accueil), *Produit populaire*, *En stock*.
6. **Enregistrer le produit**. Le produit apparaît immédiatement sur le site.

**Modifier** : menu **Produits** → **Modifier**. Sur les photos : ★ = photo principale, ◀ ▶ = changer l'ordre, case *Supprimer* = retirer la photo.
**Masquer temporairement** : bouton **Masquer** dans la liste (le produit disparaît du site, sans être supprimé).
**Supprimer** : bouton **Supprimer** (définitif, photos comprises).
**Catégories** : menu **Catégories** pour créer, renommer, changer l'ordre ou supprimer.

## 6. Comment vos clients commandent

Sur une fiche produit, le client appuie sur **COMMANDER SUR WHATSAPP** : WhatsApp s'ouvre avec le message

```
Bonjour, je suis intéressé par votre produit.

Produit : [Nom]
Prix : [Prix] FCFA
Référence : [Référence]
Lien : [Lien de la fiche]

Je souhaiterais avoir plus d'informations pour passer commande.
```

Il n'a plus qu'à l'envoyer. Le tableau de bord compte les clics « Commander » et les vues de chaque produit.

## 7. Sauvegardes

Tableau de bord → **Télécharger une sauvegarde** : télécharge un fichier contenant vos produits, catégories et paramètres. Faites-le régulièrement. Les photos restent sur Cloudinary.
