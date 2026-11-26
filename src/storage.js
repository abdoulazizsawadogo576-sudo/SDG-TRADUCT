'use strict';
/**
 * Stockage des images.
 * - Par défaut : sur le disque, dans DATA_DIR/uploads (à placer sur un volume persistant).
 * - Si CLOUDINARY_URL est défini : sur Cloudinary (stockage en ligne permanent, CDN mondial).
 * Chaque image est optimisée (WebP, redimensionnée) : une version grande et une miniature.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('./config');

let cloudinary = null;
if (config.cloudinaryUrl) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({ secure: true }); // lit CLOUDINARY_URL automatiquement
}

async function optimize(buffer) {
  const base = sharp(buffer, { failOn: 'none' }).rotate(); // rotate() applique l'orientation EXIF des photos de téléphone
  const [large, thumb] = await Promise.all([
    base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    base.clone().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
  ]);
  return { large, thumb };
}

function uploadToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'boutique', resource_type: 'image', format: 'webp', overwrite: true },
      (err, res) => (err ? reject(err) : resolve(res))
    ).end(buffer);
  });
}

/** Enregistre une image et renvoie { url, thumb_url, storage_key } */
async function saveImage(buffer) {
  const { large, thumb } = await optimize(buffer);
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(6).toString('hex');

  if (cloudinary) {
    const [a, b] = await Promise.all([uploadToCloudinary(large, id), uploadToCloudinary(thumb, id + '-thumb')]);
    return { url: a.secure_url, thumb_url: b.secure_url, storage_key: `cloudinary:${a.public_id}|${b.public_id}` };
  }

  const sub = new Date().toISOString().slice(0, 7); // un dossier par mois : 2026-11
  const dir = path.join(config.uploadsDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.webp`), large);
  fs.writeFileSync(path.join(dir, `${id}-thumb.webp`), thumb);
  return { url: `/uploads/${sub}/${id}.webp`, thumb_url: `/uploads/${sub}/${id}-thumb.webp`, storage_key: `local:${sub}/${id}` };
}

/** Supprime définitivement les fichiers d'une image */
async function removeImage(storageKey) {
  if (!storageKey) return;
  try {
    if (storageKey.startsWith('cloudinary:') && cloudinary) {
      const ids = storageKey.slice('cloudinary:'.length).split('|');
      await Promise.all(ids.map((pid) => cloudinary.uploader.destroy(pid)));
    } else if (storageKey.startsWith('local:')) {
      const rel = storageKey.slice('local:'.length);
      if (rel.includes('..')) return;
      for (const f of [`${rel}.webp`, `${rel}-thumb.webp`]) {
        const p = path.join(config.uploadsDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  } catch (e) {
    console.error('Suppression image impossible :', e.message);
  }
}

module.exports = { saveImage, removeImage, driver: cloudinary ? 'cloudinary' : 'local' };
