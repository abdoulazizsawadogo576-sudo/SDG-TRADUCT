/* Espace administrateur — interactions */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Confirmation avant suppression
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
  });

  // Afficher / masquer le mot de passe
  $$('[data-pwd-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = b.parentNode.querySelector('[data-pwd]');
      var show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.textContent = show ? 'Masquer' : 'Afficher';
    });
  });

  // Aperçu du prix formaté
  var preview = $('[data-price-preview]');
  function fmt(v) { var d = String(v || '').replace(/\D/g, ''); return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA' : ''; }
  function updatePrice() {
    if (!preview) return;
    var ins = $$('[data-price]');
    var p = fmt(ins[0] && ins[0].value), o = fmt(ins[1] && ins[1].value);
    preview.textContent = p ? 'Affiché sur le site : ' + p + (o ? ' (au lieu de ' + o + ')' : '') : '';
  }
  $$('[data-price]').forEach(function (i) { i.addEventListener('input', updatePrice); });
  updatePrice();

  // ---------- Photos existantes : ordre, principale, suppression ----------
  var grid = $('[data-image-grid]');
  var orderInput = $('[data-image-order]');
  function syncOrder() {
    if (!grid || !orderInput) return;
    orderInput.value = $$('.img-item', grid).map(function (el) { return el.getAttribute('data-image-id'); }).join(',');
  }
  if (grid) {
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var item = btn.closest('.img-item');
      if (btn.hasAttribute('data-make-main')) grid.insertBefore(item, grid.firstChild);
      var mv = parseInt(btn.getAttribute('data-move'), 10);
      if (mv === -1 && item.previousElementSibling) grid.insertBefore(item, item.previousElementSibling);
      if (mv === 1 && item.nextElementSibling) grid.insertBefore(item.nextElementSibling, item);
      syncOrder();
    });
    $$('[data-delete-image]', grid).forEach(function (c) {
      c.addEventListener('change', function () { c.closest('.img-item').classList.toggle('to-delete', c.checked); });
    });
  }

  // ---------- Nouvelles photos : aperçu + glisser-déposer ----------
  var input = $('[data-image-input]');
  var previewBox = $('[data-image-preview]');
  var dz = $('[data-dropzone]');
  function renderPreviews() {
    if (!previewBox) return;
    previewBox.innerHTML = '';
    Array.prototype.forEach.call(input.files || [], function (f) {
      if (!/^image\//.test(f.type)) return;
      var d = document.createElement('div');
      d.className = 'img-item';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.alt = '';
      d.appendChild(img);
      var l = document.createElement('span'); l.className = 'img-new-label'; l.textContent = 'Nouvelle';
      d.appendChild(l);
      previewBox.appendChild(d);
    });
  }
  if (input) {
    input.addEventListener('change', renderPreviews);
    if (dz) {
      ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function () { dz.classList.remove('drag'); }); });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length) { input.files = e.dataTransfer.files; renderPreviews(); }
      });
    }
  }

  // ---------- Compression des photos avant l'envoi (gain de temps sur connexion mobile) ----------
  function compress(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900 * 1024) return resolve(file);
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2000, w = img.naturalWidth, hgt = img.naturalHeight;
        var r = Math.min(1, max / Math.max(w, hgt));
        var c = document.createElement('canvas');
        c.width = Math.round(w * r); c.height = Math.round(hgt * r);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  $$('form[data-product-form]').forEach(function (form) {
    var busy = false;
    form.addEventListener('submit', function (e) {
      if (busy) { e.preventDefault(); return; }
      var overlay = $('[data-uploading]');
      var fileInputs = $$('input[type=file]', form).filter(function (i) { return i.files && i.files.length; });
      if (overlay) overlay.hidden = false;
      busy = true;
      if (!fileInputs.length || typeof DataTransfer === 'undefined') return; // envoi classique
      e.preventDefault();
      Promise.all(fileInputs.map(function (inp) {
        return Promise.all(Array.prototype.map.call(inp.files, compress)).then(function (files) {
          try {
            var dt = new DataTransfer();
            files.forEach(function (f) { dt.items.add(f); });
            inp.files = dt.files;
          } catch (err) { /* navigateur ancien : fichiers d'origine conservés */ }
        });
      })).then(function () { HTMLFormElement.prototype.submit.call(form); }, function () { HTMLFormElement.prototype.submit.call(form); });
    });
  });

  // Filtres de la liste : envoi automatique sur changement
})();
