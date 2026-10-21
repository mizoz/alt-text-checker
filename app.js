(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'alt-text-checker:v1';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { state = {}; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode, quota, whatever */ }
  }
  function msg(el, text, kind) { el.textContent = text || ''; el.className = 'msg ' + (kind || 'info'); }
  function copy(text, el, done) {
    var ok = function () { msg(el, done, 'good'); };
    var fail = function () { msg(el, 'Copy failed. Select the text and copy it by hand.', 'err'); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(ok, fail); return; }
    var t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(); }
    t.remove();
  }

  // tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var HASH = { bookmarklet: 'tab-bm', paste: 'tab-paste', url: 'tab-url' };
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) { tab.focus(); }
    state.tab = tab.id; save();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      selectTab(t);
      var h = Object.keys(HASH).filter(function (k) { return HASH[k] === t.id; })[0];
      history.replaceState(null, '', '#' + h);
    });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Home') { selectTab(tabs[0], true); e.preventDefault(); }
      if (e.key === 'End') { selectTab(tabs[tabs.length - 1], true); e.preventDefault(); }
      if (n) { selectTab(tabs[(i + n + tabs.length) % tabs.length], true); e.preventDefault(); }
    });
  });
  var fromHash = HASH[location.hash.slice(1)];
  if (fromHash) { selectTab($(fromHash)); } else if (state.tab && $(state.tab)) { selectTab($(state.tab)); }
  window.addEventListener('hashchange', function () { var t = HASH[location.hash.slice(1)]; if (t) { selectTab($(t)); } });

  // bookmarklet
  var code = '(function(){' + [altAudit, altCsv, altOverlay].map(String).join('') +
    'altOverlay(altAudit(document,{live:true}),altCsv,altAudit);})()';
  code = code.replace(/\n\s*/g, ' ');
  var href = 'javascript:' + encodeURIComponent(code);
  var bm = $('bookmarklet');
  bm.setAttribute('href', href);
  bm.addEventListener('click', function (e) {
    e.preventDefault();
    altOverlay(altAudit(document, { live: true }), altCsv, altAudit);
  });
  $('copy-bm').addEventListener('click', function () { copy(href, $('bm-msg'), 'Copied. Create a bookmark and paste this as its URL.'); });

  // report
  var current = [];
  var LABEL = { error: 'Error', warn: 'Warning', note: 'Note', ok: 'OK' };
  var filterEl = $('filter');
  var thumbsEl = $('thumbs');
  if (state.filter) { filterEl.value = state.filter; }
  if (state.thumbs === false) { thumbsEl.checked = false; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function showReport(items, source) {
    current = items;
    $('report').hidden = false;
    $('report-src').textContent = source;
    var c = { error: 0, warn: 0, note: 0, ok: 0 };
    items.forEach(function (it) { c[it.sev]++; });
    var sum = $('summary');
    sum.textContent = '';
    var tot = el('div', 'stat');
    tot.style.background = 'var(--surface-2)';
    tot.appendChild(el('b', '', String(items.length)));
    tot.appendChild(document.createTextNode('images checked'));
    sum.appendChild(tot);
    [['error', 'errors'], ['warn', 'warnings'], ['note', 'notes'], ['ok', 'look fine']].forEach(function (k) {
      var s = el('div', 'stat ' + k[0]);
      s.appendChild(el('b', '', String(c[k[0]])));
      s.appendChild(document.createTextNode(k[1]));
      sum.appendChild(s);
    });
    msg($('csv-msg'), '');
    renderItems();
    $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderItems() {
    var list = $('items');
    list.textContent = '';
    var f = filterEl.value;
    var shown = current.filter(function (it) {
      return f === 'all' || (f === 'problems' ? (it.sev === 'error' || it.sev === 'warn') : it.sev === f);
    });
    if (!shown.length) {
      list.appendChild(el('li', 'item', current.length ? 'Nothing matches this filter.' : 'No images found in that HTML.'));
      return;
    }
    shown.forEach(function (it) {
      var li = el('li', 'item');
      var th;
      if (thumbsEl.checked && it.type !== 'svg' && it.type !== 'image map area' && /^(https?:|data:image\/)/i.test(it.src)) {
        th = el('img', 'thumb');
        th.alt = '';
        th.loading = 'lazy';
        th.decoding = 'async';
        th.referrerPolicy = 'no-referrer';
        th.src = it.src;
        th.addEventListener('error', function () { var d = el('div', 'thumb', 'no preview'); th.replaceWith(d); });
      } else {
        th = el('div', 'thumb', it.type);
      }
      var body = el('div');
      var top = el('div');
      top.appendChild(el('span', 'badge ' + it.sev, LABEL[it.sev]));
      top.appendChild(el('span', 'meta', '#' + it.n + ' ' + it.type + (it.inLink ? ', inside a link' : '')));
      body.appendChild(top);
      body.appendChild(el('div', 'alt', it.type === 'background' ? 'no alt possible (CSS)' : it.type === 'svg' ? (it.alt ? 'name: "' + it.alt + '"' : 'name: (none)') : it.alt == null ? 'alt: (missing)' : it.alt === '' ? 'alt="" (empty)' : 'alt="' + it.alt + '"'));
      var ul = el('ul');
      it.issues.forEach(function (x) { ul.appendChild(el('li', '', x.msg)); });
      body.appendChild(ul);
      var d = el('details');
      d.appendChild(el('summary', '', 'HTML'));
      d.appendChild(el('code', '', it.snippet));
      if (it.src) { d.appendChild(el('code', '', it.src.length > 300 ? it.src.slice(0, 300) + '...' : it.src)); }
      body.appendChild(d);
      li.appendChild(th);
      li.appendChild(body);
      list.appendChild(li);
    });
  }
  filterEl.addEventListener('change', function () { state.filter = filterEl.value; save(); renderItems(); });
  thumbsEl.addEventListener('change', function () { state.thumbs = thumbsEl.checked; save(); renderItems(); });
  var csvName = 'alt-text-report.csv';
  $('dl-csv').addEventListener('click', function () {
    var blob = new Blob([altCsv(current)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = csvName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('copy-csv').addEventListener('click', function () { copy(altCsv(current).replace(/^﻿/, ''), $('csv-msg'), 'CSV copied. Paste it into a spreadsheet.'); });

  // paste mode
  function guessBase(doc) {
    var b = doc.querySelector('base[href]');
    var c = doc.querySelector('link[rel="canonical" i][href]');
    var o = doc.querySelector('meta[property="og:url" i][content]');
    var u = (b && b.getAttribute('href')) || (c && c.getAttribute('href')) || (o && o.getAttribute('content')) || '';
    try { return /^https?:/i.test(u) ? new URL(u).href : ''; } catch (e) { return ''; }
  }
  function host(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
  function runHtml(html, base, label) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var guessed = '';
    if (!base) { base = guessed = guessBase(doc); }
    var items = altAudit(doc, { base: base });
    csvName = 'alt-text-' + (host(base) || 'report') + '.csv';
    var note = label;
    if (guessed) { note += ' Relative image paths resolved against ' + guessed + ' (found in the HTML).'; }
    note += ' Background images: only inline style attributes are checked in pasted HTML; the bookmarklet checks the real styles.';
    showReport(items, note);
    return items;
  }
  var htmlIn = $('html-in'), baseIn = $('base-in'), urlIn = $('url-in');
  if (state.html) { htmlIn.value = state.html; }
  if (state.base) { baseIn.value = state.base; }
  if (state.url) { urlIn.value = state.url; }
  htmlIn.addEventListener('input', function () { state.html = htmlIn.value.length < 400000 ? htmlIn.value : ''; save(); });
  baseIn.addEventListener('input', function () { state.base = baseIn.value; save(); });
  urlIn.addEventListener('input', function () { state.url = urlIn.value; save(); });

  function validBase(v) {
    if (!v) { return ''; }
    if (!/^https?:\/\//i.test(v)) { v = 'https://' + v; }
    try { return new URL(v).href; } catch (e) { return null; }
  }
  $('run-paste').addEventListener('click', function () {
    var html = htmlIn.value.trim();
    var pm = $('paste-msg');
    if (!html) { msg(pm, 'Paste some HTML first, or load the example.', 'err'); htmlIn.focus(); return; }
    var base = validBase(baseIn.value.trim());
    if (base === null) { msg(pm, 'That page URL doesn\'t look right. Leave it empty or use a full https:// address.', 'err'); return; }
    var items = runHtml(html, base, 'Checked pasted HTML.');
    msg(pm, items.length ? 'Found ' + items.length + ' image' + (items.length === 1 ? '' : 's') + '. Report below.' : 'No images found. Is this the full page source?', items.length ? 'good' : 'info');
  });
  $('clear-paste').addEventListener('click', function () { htmlIn.value = ''; state.html = ''; save(); msg($('paste-msg'), ''); htmlIn.focus(); });
  $('load-example').addEventListener('click', function () {
    htmlIn.value = [
      '<header>',
      '  <a href="/"><img src="https://mizoz.github.io/alt-text-checker/favicon.svg" alt="logo"></a>',
      '  <button><svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 105 14l5 5 1-1-5-5A8 8 0 0010 2z"/></svg></button>',
      '</header>',
      '<img src="/uploads/IMG_4032.jpg">',
      '<img src="/uploads/stage.jpg" alt="IMG_4032.jpg">',
      '<img src="/uploads/crowd.jpg" alt="Photo of people at the event">',
      '<img src="/img/divider.png" alt="">',
      '<a href="/tickets"><img src="/img/tickets.png" alt=""></a>',
      '<a href="/program.pdf"><img src="/img/pdf.svg" alt=""> Download the program</a>',
      '<figure><img src="/img/chart.png" alt="Ticket sales by month"><figcaption>Ticket sales by month</figcaption></figure>',
      '<img src="/img/speaker1.jpg" alt="Speaker">',
      '<img src="/img/speaker2.jpg" alt="Speaker">',
      '<img src="/img/hero.jpg" alt="A full theatre giving the closing speaker a standing ovation at the end of the night, with confetti falling from the ceiling and the house lights coming up over the crowd.">',
      '<input type="image" src="/img/go.png">',
      '<div class="hero" style="background-image:url(/img/banner.jpg)"><h2>Spring season</h2></div>',
      '<img src="/img/volunteers.jpg" alt="Volunteers handing out programs at the theatre entrance.">'
    ].join('\n');
    baseIn.value = 'https://example.com/events/spring';
    state.html = htmlIn.value; state.base = baseIn.value; save();
    msg($('paste-msg'), 'Example loaded. Press Check HTML.', 'info');
  });

  // url mode
  $('run-url').addEventListener('click', function () {
    var um = $('url-msg');
    var u = validBase(urlIn.value.trim());
    if (!u) { msg(um, 'Enter a full page address, like https://example.com/about', 'err'); urlIn.focus(); return; }
    msg(um, 'Fetching ' + u + ' ...', 'info');
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, 15000);
    fetch(u, { mode: 'cors', credentials: 'omit', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { throw { status: r.status }; }
        var type = r.headers.get('content-type') || '';
        if (type && !/html|xml|text\/plain/i.test(type)) { throw { type: type }; }
        return r.text().then(function (t) { return { text: t, url: r.url || u }; });
      })
      .then(function (res) {
        var items = runHtml(res.text, res.url, 'Fetched ' + res.url + '. This is the HTML the server sends; images added later by scripts won\'t show up here (the bookmarklet catches those).');
        msg(um, 'That site allows it. Found ' + items.length + ' image' + (items.length === 1 ? '' : 's') + '. Report below.', 'good');
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err && err.status) {
          msg(um, 'The site answered with HTTP ' + err.status + '. Check the address, or use the bookmarklet while you are on the page.', 'err');
        } else if (err && err.type) {
          msg(um, 'That address returned ' + err.type + ', not a web page.', 'err');
        } else if (err && err.name === 'AbortError') {
          msg(um, 'No answer after 15 seconds. Try the bookmarklet or Paste HTML instead.', 'err');
        } else {
          msg(um, 'Blocked. ' + host(u) + ' doesn\'t allow other sites to read its pages (CORS), which is normal for most sites. Use the bookmarklet while you\'re on that page, or open it, press Ctrl+U to view the source, and paste it into the Paste HTML tab.', 'err');
        }
      });
  });
  urlIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { $('run-url').click(); } });

  // helper
  var form = $('helper-form');
  var out = $('h-out');
  var fields = ['h-what', 'h-detail', 'h-why', 'h-action', 'h-linktext', 'h-text', 'h-textdup', 'h-ctype', 'h-takeaway', 'h-data', 'h-org', 'h-logolink', 'h-logodup'];
  var hs = state.helper || {};
  if (hs.kind) { var r = form.querySelector('input[name="kind"][value="' + hs.kind + '"]'); if (r) { r.checked = true; } }
  fields.forEach(function (id) {
    if (hs[id] == null) { return; }
    if ($(id).type === 'checkbox') { $(id).checked = !!hs[id]; } else { $(id).value = hs[id]; }
  });
  function v(id) { return $(id).value.replace(/\s+/g, ' ').trim(); }
  function sentence(s) {
    s = s.replace(/^(an? |the )?(image|photo|photograph|picture|pic|graphic) (of|showing|shows) /i, '');
    if (!s) { return ''; }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return /[.!?]$/.test(s) ? s : s + '.';
  }
  function kind() { return form.querySelector('input[name="kind"]:checked').value; }
  function compose() {
    var k = kind();
    if (k === 'decorative') { return ''; }
    if (k === 'informative') { return sentence([v('h-what'), v('h-detail')].filter(Boolean).join(' ')); }
    if (k === 'functional') { return $('h-linktext').checked ? '' : v('h-action'); }
    if (k === 'text') { return $('h-textdup').checked ? '' : v('h-text'); }
    if (k === 'chart') {
      var t = v('h-takeaway');
      if (!t) { return ''; }
      var s = (v('h-ctype') || 'Chart') + ': ' + t.replace(/[.]$/, '') + '.';
      if (v('h-data')) { s += ' Full numbers in ' + v('h-data').replace(/[.]$/, '') + '.'; }
      return s;
    }
    if (k === 'logo') {
      if ($('h-logodup').checked) { return ''; }
      var o = v('h-org');
      return o ? ($('h-logolink').checked ? o + ' home' : o) : '';
    }
    return '';
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function lint() {
    var k = kind();
    var a = out.value.replace(/\s+/g, ' ').trim();
    $('h-count').textContent = a.length;
    var img = '<img src="image.jpg" alt="' + esc(a) + '">';
    var html = k === 'functional' ? '<a href="...">' + img + ($('h-linktext').checked ? ' Link text' : '') + '</a>' : img;
    $('h-html').value = html;
    var notes = [];
    var allowEmpty = k === 'decorative' || (k === 'functional' && $('h-linktext').checked) || (k === 'text' && $('h-textdup').checked) || (k === 'logo' && $('h-logodup').checked);
    if (!a && !allowEmpty) {
      notes.push('Fill in the details above to get a draft.');
    } else if (!a) {
      notes.push('alt="" is right here: the image adds nothing a screen reader user would miss. Keep the attribute, just empty.');
    } else {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      altAudit(doc, {}).forEach(function (it) {
        it.issues.forEach(function (x) { if (x.sev !== 'ok') { notes.push(x.msg); } });
      });
      if (!notes.length) { notes.push('No obvious problems. Read it out loud with the page around it: does it say what matters?'); }
      if (k === 'informative' && v('h-why')) { notes.push('You said it\'s here "' + v('h-why') + '". Does the alt support that?'); }
    }
    var ul = $('h-lint');
    ul.textContent = '';
    notes.forEach(function (n) { var li = document.createElement('li'); li.textContent = n; ul.appendChild(li); });
  }
  function update() {
    var k = kind();
    Array.prototype.forEach.call(form.querySelectorAll('[data-for]'), function (d) { d.hidden = d.getAttribute('data-for') !== k; });
    out.value = compose();
    lint();
    hs = { kind: k };
    fields.forEach(function (id) { hs[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value; });
    state.helper = hs; save();
  }
  form.addEventListener('input', function (e) { if (e.target !== out) { update(); } });
  form.addEventListener('change', function (e) { if (e.target !== out) { update(); } });
  out.addEventListener('input', lint);
  $('copy-alt').addEventListener('click', function () { copy(out.value.trim(), $('h-msg'), out.value.trim() ? 'Alt text copied.' : 'Copied an empty alt.'); });
  $('copy-html').addEventListener('click', function () { copy($('h-html').value, $('h-msg'), 'HTML copied.'); });
  $('reset-helper').addEventListener('click', function () {
    form.reset();
    update();
  });
  update();
})();
