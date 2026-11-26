# Guide pas à pas

## 1. Mettre le site en ligne (Render — recommandé)

Le site a besoin d'un **disque permanent** pour la base de données et les photos. Render le propose avec l'offre « Starter » (environ 7 $/mois + 0,25 $/Go de disque).

1. Créez un compte sur **https://render.com** (connexion avec GitHub).
2. Ouvrez le dépôt GitHub **SDG-TRADUCT** et cliquez sur le bouton **Deploy to Render** en haut du README (ou, dans Render : **New +** → **Blueprint** → dépôt **SDG-TRADUCT**).
3. Render lit le fichier `render.yaml` et vous demande 3 valeurs :
   - `ADMIN_USERNAME` : votre identifiant (ex. `gerant`)
   - `ADMIN_PASSWORD` : un mot de passe solide (12 caractères ou plus)
   - `SITE_URL` : l'adresse définitive du site (ex. `https://www.maboutique.com`). Au début, mettez l'adresse fournie par Render (`https://boutique-whatsapp.onrender.com`) et changez-la après avoir branché votre domaine.
4. Cliquez sur **Apply**. Après 2 à 4 minutes, le site est en ligne.

> Alternative : **Railway** (https://railway.app) — « Deploy from GitHub repo », ajoutez un **Volume** monté sur `/data`, puis les variables `DATA_DIR=/data`, `NODE_ENV=production`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` (longue chaîne aléatoire) et `SITE_URL`.
> Sur un serveur privé (VPS) : `docker build -t boutique .` puis `docker run -d -p 80:3000 -v boutique-data:/data --env-file .env boutique`.

### Option : photos sur Cloudinary
Pour stocker les photos dans le cloud (gratuit jusqu'à environ 25 Go), créez un compte sur https://cloudinary.com, copiez la valeur **API environment variable** (`cloudinary://...`) et ajoutez-la dans la variable `CLOUDINARY_URL` de votre hébergeur. Les nouvelles photos iront alors sur Cloudinary.

## 2. Brancher votre nom de domaine

1. Achetez un domaine (ex. `maboutique.com` chez Namecheap, OVH, GoDaddy… ou un `.bf` auprès d'un bureau d'enregistrement agréé).
2. Dans Render : votre service → **Settings** → **Custom Domains** → **Add** → saisissez `www.maboutique.com`.
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

Tableau de bord → **Télécharger une sauvegarde** : télécharge la base (produits, catégories, paramètres). Faites-le régulièrement. Les photos sont sur le disque persistant (ou sur Cloudinary).
