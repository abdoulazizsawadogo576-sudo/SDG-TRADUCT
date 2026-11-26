'use strict';
// Vérifie le stockage Cloudinary avec un faux service (aucun appel réseau).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'boutique-cld-'));
process.env.CLOUDINARY_URL = 'cloudinary://123456:secret@demo-cloud';

const cloudinary = require('cloudinary').v2;
const uploaded = [];
const destroyed = [];
cloudinary.uploader.upload_stream = (opts, cb) => ({
  end(buf) {
    uploaded.push({ opts, size: buf.length });
    const pid = `${opts.folder}/${opts.public_id}`;
    setImmediate(() => cb(null, { public_id: pid, secure_url: `https://res.cloudinary.com/demo-cloud/image/upload/${pid}.webp` }));
  },
});
cloudinary.uploader.destroy = async (pid) => { destroyed.push(pid); return { result: 'ok' }; };

const sharp = require('sharp');
const storage = require('../src/storage');

test('les photos partent sur Cloudinary et en sont supprimées', async () => {
  assert.strictEqual(storage.driver, 'cloudinary');
  const img = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#c33' } }).jpeg().toBuffer();
  const r = await storage.saveImage(img);
  assert.strictEqual(uploaded.length, 2, 'grande image + miniature');
  assert.match(r.url, /^https:\/\/res\.cloudinary\.com\/.+\.webp$/);
  assert.match(r.thumb_url, /-thumb\.webp$/);
  assert.ok(uploaded[1].size < uploaded[0].size, 'miniature plus légère');
  const up = path.join(process.env.DATA_DIR, 'uploads');
  assert.ok(!fs.existsSync(up) || fs.readdirSync(up).length === 0, 'rien sur le disque');
  await storage.removeImage(r.storage_key);
  assert.deepStrictEqual(destroyed.sort(), r.storage_key.slice('cloudinary:'.length).split('|').sort());
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});
