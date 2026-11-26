'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const h = require('./helpers');
const db = require('./db');
const { sessionMiddleware, ensureAdmin, csrfToken } = require('./auth');

async function createApp() {
  await db.init();
  await ensureAdmin();
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.siteUrl.startsWith('https') ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, { maxAge: config.isProd ? '7d' : 0 }));
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '365d', immutable: true }));

  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware());

  // Variables disponibles dans toutes les vues
  app.use(async (req, res, next) => {
    const [settings, categories] = await Promise.all([db.getSettings(), db.listCategories()]);
    const baseUrl = config.siteUrl || `${req.protocol}://${req.get('host')}`;
    res.locals.settings = settings;
    res.locals.h = h;
    res.locals.baseUrl = baseUrl;
    res.locals.currentPath = req.path;
    res.locals.query = req.query;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.csrf = () => csrfToken(req);
    res.locals.waGeneral = h.whatsappLink(settings.whatsapp_number, h.generalMessage(settings.shop_name));
    res.locals.navCategories = () => categories;
    req.flash = (type, msg) => { req.session.flash = { type, msg }; };
    next();
  });

  app.use('/admin', require('./routes/admin'));
  app.use('/', require('./routes/public'));

  app.use((req, res) => res.status(404).render('404', { title: 'Page introuvable' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500);
    if (req.path.startsWith('/api/')) return res.json({ error: 'Erreur serveur' });
    res.render('404', { title: 'Une erreur est survenue', errorMessage: err.expose ? err.message : 'Une erreur est survenue. Veuillez réessayer.' });
  });
  return app;
}

module.exports = { createApp };
