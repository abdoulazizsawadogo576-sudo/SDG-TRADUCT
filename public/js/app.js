/* Boutique — scripts côté client (sans dépendance) */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function toast(msg) {
    var t = $('[data-toast]');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ---------- Apparition douce des éléments ----------
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // ---------- Compteurs animés ----------
  $$('[data-count]').forEach(function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (target < 2) return;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / 900, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = '0';
    requestAnimationFrame(step);
  });

  // ---------- Recherche rapide ----------
  $$('[data-search]').forEach(function (form) {
    var input = $('[data-search-input]', form);
    var box = $('[data-search-results]', form);
    var timer, controller, active = -1;
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function close() { box.hidden = true; active = -1; }
    function render(data, q) {
      if (!data.items.length) {
        box.innerHTML = '<div class="sr-empty">Aucun produit pour « ' + esc(q) + ' »</div>';
      } else {
        box.innerHTML = data.items.map(function (it) {
          return '<a class="sr-item" href="' + esc(it.url) + '"><img src="' + esc(it.image) + '" alt="" loading="lazy">' +
            '<span><span class="sr-name">' + esc(it.name) + '</span><span class="sr-meta"><span class="sr-price">' + esc(it.price) + '</span>' +
            (it.category ? ' · ' + esc(it.category) : '') + '</span></span></a>';
        }).join('') + '<a class="sr-all" href="/catalogue?q=' + encodeURIComponent(q) + '">Voir les ' + data.total + ' résultat' + (data.total > 1 ? 's' : '') + ' →</a>';
      }
      box.hidden = false;
    }
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { close(); return; }
      timer = setTimeout(function () {
        if (controller) controller.abort();
        controller = window.AbortController ? new AbortController() : null;
        fetch('/api/recherche?q=' + encodeURIComponent(q), controller ? { signal: controller.signal } : {})
          .then(function (r) { return r.json(); })
          .then(function (d) { if (input.value.trim() === q) render(d, q); })
          .catch(function () {});
      }, 180);
    });
    input.addEventListener('keydown', function (e) {
      var items = $$('.sr-item', box);
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.classList.toggle('active', i === active); });
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); window.location.href = items[active].href;
      } else if (e.key === 'Escape') { close(); }
    });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
    input.addEventListener('focus', function () { if (box.innerHTML && input.value.trim().length >= 2) box.hidden = false; });
  });

  // ---------- Filtres : envoi automatique ----------
  $$('form[data-autosubmit] select').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  // ---------- Statistique des clics « Commander » ----------
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-order-id]');
    if (!a) return;
    var url = '/api/commande/' + a.getAttribute('data-order-id');
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: 'POST', keepalive: true }).catch(function () {});
  });

  // ---------- Galerie produit ----------
  $$('[data-gallery]').forEach(function (g) {
    var track = $('[data-gallery-track]', g);
    var slides = $$('.gallery-slide', g);
    var thumbs = $$('[data-gallery-thumb]', g);
    var count = $('[data-gallery-count]', g);
    var current = 0;
    function go(i) {
      i = (i + slides.length) % slides.length;
      track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
    }
    function update() {
      var i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      if (i === current && count && count.dataset.init) return;
      current = i;
      if (count) { count.textContent = (i + 1) + ' / ' + slides.length; count.dataset.init = '1'; }
      thumbs.forEach(function (t, k) { t.classList.toggle('active', k === i); });
      if (thumbs[i]) thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    thumbs.forEach(function (t) { t.addEventListener('click', function () { go(parseInt(t.getAttribute('data-gallery-thumb'), 10)); }); });
    var prev = $('[data-gallery-prev]', g), next = $('[data-gallery-next]', g);
    if (prev) prev.addEventListener('click', function () { go(current - 1); });
    if (next) next.addEventListener('click', function () { go(current + 1); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(current - 1);
      if (e.key === 'ArrowRight') go(current + 1);
    });
  });

  // ---------- En-tête compact au défilement ----------
  var header = $('.site-header');
  if (header) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { header.classList.toggle('compact', window.scrollY > 140); ticking = false; });
    }, { passive: true });
  }

  // ---------- Barre de commande mobile (apparaît après le bouton principal) ----------
  var bar = $('.order-bar'), mainBtn = $('.order-btn');
  if (bar && mainBtn && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var show = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 200;
      bar.classList.toggle('visible', show);
      document.body.classList.toggle('order-bar-on', show);
    }, { rootMargin: '-140px 0px 0px 0px' }).observe(mainBtn);
  }

  // ---------- Partage ----------
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy');
      function done() { toast('Lien copié ✔'); }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Copiez le lien :', url); }
        document.body.removeChild(ta);
      }
    });
  });
  $$('[data-native-share]').forEach(function (b) {
    if (!navigator.share) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      navigator.share({ title: b.getAttribute('data-title'), url: b.getAttribute('data-url') }).catch(function () {});
    });
  });
})();
