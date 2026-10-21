/* Shared audit code. These three functions also get stringified into the
   bookmarklet, so they must stay self-contained: no outer variables,
   no line comments, semicolons everywhere. */

function altAudit(doc, opts) {
  opts = opts || {};
  var live = !!opts.live;
  var base = opts.base || (live ? doc.baseURI : '');
  var items = [];
  var GENERIC = /^(an? )?(image|img|photo|photograph|picture|pic|graphic|graphics|icon|logo|banner|spacer|placeholder|untitled|default|thumbnail|thumb|null|undefined|alt|alt text|blank|none|empty|image\d*|photo\d*|img\d*|picture\d*|[\s\-_.*|#~]{1,3})\.?$/i;
  var PREFIX = /^(an? |the )?(image|photo|photograph|picture|pic|graphic|screenshot|icon|img) (of|showing|shows|that shows|with|depicting)\b/i;
  var FILE = /\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?|heic|ico)(\?.*)?$/i;
  var CAMERA = /^(img|dsc|dscn|dcim|pxl|mvimg|screenshot|screen shot|photo|image|untitled)[\s_-]?\d{2,}/i;
  var HASHY = /^[a-f0-9_-]{16,}$/i;

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function absUrl(u) {
    if (!u) { return ''; }
    u = clean(u);
    if (/^data:image\//i.test(u)) { return u; }
    try { return base ? new URL(u, base).href : new URL(u).href; } catch (e) { return ''; }
  }
  function openTag(el) {
    var h = el.outerHTML || '';
    var i = h.indexOf('>');
    h = i > -1 ? h.slice(0, i + 1) : h;
    return h.length > 220 ? h.slice(0, 217) + '...' : h;
  }
  function hidden(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('hidden')) { return true; }
    }
    if (live && el.getClientRects && el.getClientRects().length === 0 && el.tagName.toLowerCase() !== 'area') { return 'offscreen'; }
    return false;
  }
  function byIds(ids) {
    var out = [];
    (ids || '').split(/\s+/).forEach(function (id) {
      var t = id && doc.getElementById(id);
      if (t) { out.push(clean(t.textContent)); }
    });
    return clean(out.join(' '));
  }
  function textOf(node) {
    var out = [];
    function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) { return; }
      var tag = n.tagName.toLowerCase();
      if (n.getAttribute('aria-hidden') === 'true' || tag === 'script' || tag === 'style' || tag === 'template') { return; }
      if (n.getAttribute('aria-label')) { out.push(n.getAttribute('aria-label')); return; }
      if (n.getAttribute('aria-labelledby')) { out.push(byIds(n.getAttribute('aria-labelledby'))); return; }
      if (tag === 'img') { out.push(n.getAttribute('alt') || ''); return; }
      if (tag === 'svg') {
        var t = n.querySelector('title');
        out.push(t ? t.textContent : '');
        return;
      }
      for (var c = n.firstChild; c; c = c.nextSibling) { walk(c); }
    }
    walk(node);
    return clean(out.join(' '));
  }
  function nameOf(el) {
    return clean(el.getAttribute('aria-label')) || byIds(el.getAttribute('aria-labelledby')) || textOf(el) || clean(el.getAttribute('title'));
  }
  function linkOf(el) {
    var n = el.parentNode;
    while (n && n.nodeType === 1) {
      var t = n.tagName.toLowerCase();
      if ((t === 'a' && n.hasAttribute('href')) || t === 'button' || n.getAttribute('role') === 'link' || n.getAttribute('role') === 'button') { return n; }
      n = n.parentNode;
    }
    return null;
  }
  function add(item, sev, code, msg) { item.issues.push({ sev: sev, code: code, msg: msg }); }
  function checkText(item, alt) {
    var a = clean(alt);
    var file = a.split(/[\/\\]/).pop();
    if (FILE.test(a) || CAMERA.test(a) || HASHY.test(a.replace(/\.\w+$/, ''))) {
      add(item, 'warn', 'filename', 'Alt looks like a file name. Describe what the image shows or does instead.');
    } else if (GENERIC.test(a)) {
      add(item, 'warn', 'generic', 'Alt is too generic ("' + a + '"). Say what this particular image shows or does.');
    }
    if (PREFIX.test(a)) {
      add(item, 'warn', 'prefix', 'Starts with "' + a.match(PREFIX)[0] + '". Screen readers already say "image", so drop it (unless the medium matters, like "Oil painting of...").');
    }
    if (a.length > 125) {
      add(item, 'warn', 'long', 'Long alt (' + a.length + ' characters). Keep it to the point; move extra detail to a caption or nearby text.');
    }
    if (item.src && file && item.src.split('?')[0].split('/').pop() === file && !item.issues.some(function (i) { return i.code === 'filename'; })) {
      add(item, 'warn', 'filename', 'Alt is the same as the file name.');
    }
  }

  var linkNames = new Map();
  function linkName(l) {
    if (!linkNames.has(l)) { linkNames.set(l, nameOf(l)); }
    return linkNames.get(l);
  }

  var imgs = doc.querySelectorAll('img, input[type="image" i], area, svg, [role="img"]');
  for (var i = 0; i < imgs.length; i++) {
    var el = imgs[i];
    var tag = el.tagName.toLowerCase();
    if (tag === 'svg' && el.parentNode && el.parentNode.closest && el.parentNode.closest('svg')) { continue; }
    if (tag !== 'svg' && tag !== 'img' && tag !== 'input' && tag !== 'area' && el.closest && el.closest('svg') && el.closest('svg') !== el) { continue; }
    var role = (el.getAttribute('role') || '').toLowerCase();
    var hasAlt = el.hasAttribute('alt');
    var alt = hasAlt ? el.getAttribute('alt') : null;
    var aria = clean(el.getAttribute('aria-label')) || byIds(el.getAttribute('aria-labelledby'));
    var link = (tag === 'area' || tag === 'input') ? null : linkOf(el);
    var item = {
      type: tag === 'input' ? 'image button' : tag === 'area' ? 'image map area' : tag === 'svg' ? 'svg' : tag === 'img' ? 'img' : 'role="img"',
      src: '', alt: alt, name: '', inLink: !!link, linkText: link ? linkName(link) : '',
      snippet: openTag(el), issues: [], el: el, w: 0, h: 0
    };
    if (tag === 'img' || tag === 'input') {
      var raw = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || (el.getAttribute('srcset') || '').split(',')[0].trim().split(/\s+/)[0];
      item.src = (live && el.currentSrc) ? el.currentSrc : absUrl(raw);
      item.rawSrc = raw || '';
      if (live) { item.w = el.naturalWidth || el.width || 0; item.h = el.naturalHeight || el.height || 0; }
    }
    var hid = hidden(el);
    if (hid === true) {
      add(item, 'ok', 'hidden', 'Hidden from screen readers (aria-hidden or hidden), so alt is not needed here.');
      items.push(item);
      continue;
    }
    if (hid === 'offscreen') { item.offscreen = true; }

    if (tag === 'img') {
      if (role === 'presentation' || role === 'none') {
        if (alt) { add(item, 'warn', 'role-conflict', 'Has role="' + role + '" but also a non-empty alt. Pick one: alt="" for decoration, or drop the role.'); }
        else { add(item, 'ok', 'decorative', 'Marked decorative with role="' + role + '".'); }
        if (!hasAlt) { add(item, 'note', 'no-alt-role', 'Add alt="" as well; it is the most reliable way to mark decoration.'); }
      } else if (!hasAlt) {
        if (aria) {
          add(item, 'note', 'aria-only', 'No alt, but it has an aria-label. That works for screen readers; a real alt attribute is still more reliable.');
        } else if (link && !linkName(link)) {
          add(item, 'error', 'missing-link', 'Missing alt, and it is the only content of a link or button. Screen readers may read out the file name or URL.');
        } else {
          add(item, 'error', 'missing', 'Missing alt attribute. Screen readers may read the file name. Add a description, or alt="" if it is decorative.');
        }
        if (el.getAttribute('title')) { add(item, 'note', 'title', 'It has a title, but title is not a reliable replacement for alt.'); }
      } else if (clean(alt) === '') {
        if (link && !linkName(link)) {
          add(item, 'error', 'empty-link', 'Empty alt, and the image is the only content of a link or button, so the link has no name. Describe where it goes or what it does.');
        } else if (link) {
          add(item, 'ok', 'decorative-link', 'Empty alt inside a link that already has its own text. Good.');
        } else {
          add(item, 'note', 'decorative', 'Empty alt, so it is treated as decorative. Fine if it really adds nothing; otherwise describe it.');
        }
      } else {
        checkText(item, alt);
        if (link && link.textContent && clean(link.textContent).toLowerCase() === clean(alt).toLowerCase()) {
          add(item, 'note', 'repeat-link', 'Alt repeats the link text next to it, so it gets read twice. Use alt="" here.');
        }
        var fig = el.closest && el.closest('figure');
        var cap = fig && fig.querySelector('figcaption');
        if (cap && clean(cap.textContent).toLowerCase() === clean(alt).toLowerCase()) {
          add(item, 'note', 'repeat-caption', 'Alt is identical to the caption, so it gets read twice. Make the alt describe the image and let the caption add context.');
        }
      }
      if (live && item.w && item.h && item.w <= 2 && item.h <= 2 && hasAlt && clean(alt) === '') { item.issues = [{ sev: 'ok', code: 'pixel', msg: 'Tiny 1-2px image (likely a tracking pixel) with alt="". Good.' }]; }
      else if (live && item.w && item.h && item.w <= 2 && item.h <= 2 && !hasAlt) { add(item, 'note', 'pixel', 'Tiny ' + item.w + 'x' + item.h + ' image, probably a tracking pixel. Give it alt="".'); }
    } else if (tag === 'input') {
      var n = clean(alt) || aria || clean(el.getAttribute('value'));
      if (!n) { add(item, 'error', 'button', 'Image button with no text. Add alt that says what the button does, like "Search" or "Submit".'); }
      else { item.name = n; checkText(item, n); }
    } else if (tag === 'area') {
      if (!el.hasAttribute('href')) { continue; }
      if (!clean(alt) && !aria) { add(item, 'error', 'area', 'Image map area with no alt. Each clickable area needs alt text saying where it goes.'); }
      else { checkText(item, alt || aria); }
      item.src = absUrl(el.getAttribute('href'));
    } else if (tag === 'svg') {
      if (role === 'presentation' || role === 'none') { add(item, 'ok', 'decorative', 'Marked decorative with role="' + role + '".'); items.push(item); continue; }
      var t = el.querySelector(':scope > title');
      var nm = aria || (t ? clean(t.textContent) : '');
      item.alt = nm || null;
      if (nm) {
        checkText(item, nm);
        if (role !== 'img') { add(item, 'note', 'svg-role', 'Has a name but no role="img". Adding it makes screen readers treat the SVG as one image.'); }
      } else if (role === 'img') {
        add(item, 'error', 'svg-noname', 'SVG has role="img" but no name. Add aria-label or a <title>.');
      } else if (link && !linkName(link)) {
        add(item, 'error', 'svg-link', 'SVG is the only content of a link or button and has no name. Add aria-label to the link or button.');
      } else if (link) {
        add(item, 'note', 'svg-hide', 'Unnamed SVG inside a link or button that has text. Add aria-hidden="true" to the SVG so it is skipped.');
      } else {
        add(item, 'warn', 'svg', 'Inline SVG with no accessible name. If it means something, add role="img" and aria-label; if it is decoration, add aria-hidden="true".');
      }
    } else {
      if (!aria) { add(item, 'error', 'role-img', 'Element with role="img" has no aria-label or aria-labelledby, so it has no text alternative.'); }
      else { item.alt = aria; checkText(item, aria); }
    }
    if (!item.issues.length) { add(item, 'ok', 'ok', 'Looks fine. Read it in context: does it say what matters?'); }
    if (aria && !item.name) { item.name = aria; }
    items.push(item);
  }

  var seen = {};
  items.forEach(function (it) {
    var k = clean(it.alt).toLowerCase();
    if (!k || it.type === 'svg') { return; }
    (seen[k] = seen[k] || []).push(it);
  });
  Object.keys(seen).forEach(function (k) {
    var group = seen[k];
    var srcs = {};
    group.forEach(function (it) { srcs[it.src || it.snippet] = 1; });
    var n = Object.keys(srcs).length;
    if (n > 1) {
      group.forEach(function (it) {
        it.issues.push({ sev: 'note', code: 'duplicate', msg: 'Same alt on ' + n + ' different images. Fine for repeated icons; photos usually need their own descriptions.' });
        it.issues = it.issues.filter(function (x) { return x.code !== 'ok'; });
      });
    }
  });

  var bgCount = 0;
  var bgEls = live ? doc.body ? doc.body.getElementsByTagName('*') : [] : doc.querySelectorAll('[style*="url(" i]');
  var limit = Math.min(bgEls.length, 6000);
  for (var j = 0; j < limit && bgCount < 150; j++) {
    var b = bgEls[j];
    var bg = '';
    if (live) {
      if (b.id === 'alt-text-checker-host') { continue; }
      try { bg = getComputedStyle(b).backgroundImage; } catch (e) { bg = ''; }
    } else {
      var st = b.getAttribute('style') || '';
      var mm = st.match(/background(-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)/i);
      bg = mm ? 'url("' + mm[2] + '")' : '';
    }
    var m = bg && bg.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    if (!m) { continue; }
    if (live) {
      var r = b.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) { continue; }
    }
    if (hidden(b) === true) { continue; }
    bgCount++;
    items.push({
      type: 'background', src: absUrl(m[1]), alt: null, name: '', inLink: !!linkOf(b), linkText: '',
      snippet: openTag(b), el: b, w: 0, h: 0,
      issues: [{ sev: 'note', code: 'background', msg: 'CSS background image. Backgrounds cannot have alt, so screen readers skip them. If it carries meaning (text, a product, a chart), put that in real text or use an <img>.' }]
    });
  }

  var rank = { error: 3, warn: 2, note: 1, ok: 0 };
  items.forEach(function (it, idx) {
    it.n = idx + 1;
    it.sev = it.issues.reduce(function (s, x) { return rank[x.sev] > rank[s] ? x.sev : s; }, 'ok');
  });
  return items;
}

function altCsv(items) {
  function q(v) {
    v = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(v)) { v = "'" + v; }
    return '"' + v.replace(/"/g, '""') + '"';
  }
  var rows = [['#', 'type', 'severity', 'image', 'alt', 'alt_length', 'in_link', 'link_text', 'issues', 'html']];
  items.forEach(function (it) {
    rows.push([it.n, it.type, it.sev, it.src || it.rawSrc || '', it.type === 'background' ? '(n/a)' : it.alt == null ? '(missing)' : it.alt, it.alt == null ? '' : it.alt.length,
      it.inLink ? 'yes' : 'no', it.linkText || '', it.issues.map(function (x) { return x.sev.toUpperCase() + ': ' + x.msg; }).join(' | '), it.snippet]);
  });
  return '﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n');
}

function altOverlay(items, csv, audit) {
  var HOST = 'alt-text-checker-host';
  var old = document.getElementById(HOST);
  if (old && old.__close) { old.__close(); }
  var host = document.createElement('div');
  host.id = HOST;
  host.style.cssText = 'all:initial;position:fixed;top:0;right:0;bottom:0;z-index:2147483647;width:min(440px,100vw);';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var css = ':host{all:initial}*{box-sizing:border-box}' +
    '.p{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#16181d;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;border-left:1px solid #d7dbe2;box-shadow:-6px 0 24px rgba(0,0,0,.18)}' +
    '.h{padding:12px 14px;border-bottom:1px solid #d7dbe2;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.t{font-weight:700;font-size:15px;flex:1 1 auto;margin:0}' +
    'button,select{font:inherit;font-size:13px;border:1px solid #b9bfca;background:#f3f4f7;color:#16181d;border-radius:6px;padding:5px 9px;cursor:pointer}' +
    'button:hover{background:#e6e9ef}button:focus-visible,select:focus-visible{outline:3px solid #1f5fd6;outline-offset:1px}' +
    '.c{display:flex;gap:6px;flex-wrap:wrap;width:100%}' +
    '.k{border-radius:99px;padding:2px 9px;font-size:12px;font-weight:600}' +
    '.error{background:#fde7e5;color:#8a1c12}.warn{background:#fff1d6;color:#7a4b00}.note{background:#e4ecfb;color:#1d468f}.ok{background:#e3f4e8;color:#1c5c33}' +
    '.l{overflow:auto;flex:1;margin:0;padding:8px 10px 20px;list-style:none}' +
    '.i{display:grid;grid-template-columns:56px 1fr;gap:10px;padding:10px 4px;border-bottom:1px solid #eceef2}' +
    '.th{width:56px;height:56px;border-radius:6px;background:#eef0f4;object-fit:contain;display:flex;align-items:center;justify-content:center;font-size:10px;color:#545b68;text-align:center;overflow:hidden}' +
    '.a{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-word;margin:3px 0}' +
    '.m{margin:3px 0 0;padding-left:16px}.m li{margin:2px 0}' +
    '.s{display:inline-block;margin-right:6px}.f{font-size:12px;color:#545b68;padding:8px 14px;border-top:1px solid #d7dbe2}' +
    '.f a{color:#1f5fd6}' +
    '@media (prefers-color-scheme:dark){.p{background:#1a1d23;color:#eceef2;border-color:#343a45}.h,.f{border-color:#343a45}.i{border-color:#2a2f37}button,select{background:#23272f;color:#eceef2;border-color:#4a5160}button:hover{background:#2c313a}.th{background:#23272f;color:#a6adba}.f{color:#a6adba}.f a{color:#7aa7ff}.error{background:#4a1d1a;color:#ffb4ab}.warn{background:#43320f;color:#ffd58a}.note{background:#1d2a44;color:#b9cfff}.ok{background:#173523;color:#9fdcb3}}';
  try {
    var sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch (e) {
    var st = document.createElement('style');
    st.textContent = css;
    root.appendChild(st);
  }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  var COLORS = { error: '#d92d20', warn: '#f79009', note: '#2e6ce6', ok: '#12b76a' };
  var LABEL = { error: 'Error', warn: 'Warning', note: 'Note', ok: 'OK' };
  var saved = [];
  var outlined = false;
  function outline(on) {
    saved.forEach(function (s) { s.el.style.outline = s.o; s.el.style.outlineOffset = s.f; });
    saved = [];
    outlined = on;
    if (!on) { return; }
    items.forEach(function (it) {
      if (!it.el || !it.el.style) { return; }
      saved.push({ el: it.el, o: it.el.style.outline, f: it.el.style.outlineOffset });
      it.el.style.outline = '4px solid ' + COLORS[it.sev];
      it.el.style.outlineOffset = '2px';
    });
  }
  var panel = mk('section', 'p');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Alt text check results');
  var head = mk('div', 'h');
  var title = mk('h2', 't', 'Alt text check: ' + items.length + ' image' + (items.length === 1 ? '' : 's'));
  var closeBtn = mk('button', '', 'Close');
  closeBtn.setAttribute('aria-label', 'Close alt text check');
  head.appendChild(title);
  head.appendChild(closeBtn);
  var counts = { error: 0, warn: 0, note: 0, ok: 0 };
  items.forEach(function (it) { counts[it.sev]++; });
  var chips = mk('div', 'c');
  ['error', 'warn', 'note', 'ok'].forEach(function (k) { chips.appendChild(mk('span', 'k ' + k, counts[k] + ' ' + LABEL[k].toLowerCase() + (counts[k] === 1 || k === 'ok' ? '' : 's'))); });
  head.appendChild(chips);
  var tools = mk('div', 'c');
  var filter = mk('select');
  filter.setAttribute('aria-label', 'Show');
  [['all', 'Show all'], ['problems', 'Errors + warnings'], ['error', 'Errors only'], ['warn', 'Warnings only'], ['note', 'Notes only'], ['ok', 'OK only']].forEach(function (o) {
    var op = mk('option', '', o[1]);
    op.value = o[0];
    filter.appendChild(op);
  });
  var outBtn = mk('button', '', 'Outline on page');
  outBtn.setAttribute('aria-pressed', 'false');
  var csvBtn = mk('button', '', 'Download CSV');
  var rerun = mk('button', '', 'Re-run');
  tools.appendChild(filter);
  tools.appendChild(outBtn);
  tools.appendChild(csvBtn);
  tools.appendChild(rerun);
  head.appendChild(tools);
  var list = mk('ul', 'l');
  var foot = mk('div', 'f');
  foot.appendChild(document.createTextNode('Runs only in this tab. Nothing is sent anywhere. '));
  var fl = mk('a', '', 'Alt text guide');
  fl.href = 'https://lab.zalastack.com/alt-text-checker/#guide';
  fl.target = '_blank';
  fl.rel = 'noopener';
  foot.appendChild(fl);
  panel.appendChild(head);
  panel.appendChild(list);
  panel.appendChild(foot);
  root.appendChild(panel);

  function render() {
    list.textContent = '';
    var f = filter.value;
    var shown = items.filter(function (it) { return f === 'all' || (f === 'problems' ? (it.sev === 'error' || it.sev === 'warn') : it.sev === f); });
    if (!shown.length) { list.appendChild(mk('li', 'i', items.length ? 'Nothing in this filter.' : 'No images found on this page.')); }
    shown.forEach(function (it) {
      var li = mk('li', 'i');
      var th;
      if (it.src && /^(https?:|data:image\/)/i.test(it.src)) {
        th = mk('img', 'th');
        th.src = it.src;
        th.alt = '';
        th.loading = 'lazy';
        th.referrerPolicy = 'no-referrer';
        th.addEventListener('error', function () { this.replaceWith(mk('div', 'th', 'no preview')); });
      } else {
        th = mk('div', 'th', it.type);
      }
      var body = mk('div');
      var top = mk('div');
      top.appendChild(mk('span', 'k s ' + it.sev, LABEL[it.sev]));
      top.appendChild(mk('span', '', '#' + it.n + ' ' + it.type + (it.inLink ? ', in a link' : '') + (it.offscreen ? ', not visible' : '')));
      body.appendChild(top);
      body.appendChild(mk('div', 'a', it.type === 'background' ? 'no alt possible (CSS)' : it.type === 'svg' ? (it.alt ? 'name: "' + it.alt + '"' : 'name: (none)') : it.alt == null ? 'alt: (missing)' : it.alt === '' ? 'alt="" (empty)' : 'alt="' + it.alt + '"'));
      var ul = mk('ul', 'm');
      it.issues.forEach(function (x) { ul.appendChild(mk('li', '', x.msg)); });
      body.appendChild(ul);
      if (it.el && it.el.scrollIntoView && !it.offscreen) {
        var go = mk('button', '', 'Show on page');
        go.style.marginTop = '6px';
        go.addEventListener('click', function () {
          it.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var o = it.el.style.outline;
          var of = it.el.style.outlineOffset;
          it.el.style.outline = '5px dashed ' + COLORS[it.sev];
          it.el.style.outlineOffset = '3px';
          setTimeout(function () { if (!outlined) { it.el.style.outline = o; it.el.style.outlineOffset = of; } }, 2200);
        });
        body.appendChild(go);
      }
      li.appendChild(th);
      li.appendChild(body);
      list.appendChild(li);
    });
  }
  function close() {
    outline(false);
    document.removeEventListener('keydown', onKey, true);
    host.remove();
  }
  function onKey(e) { if (e.key === 'Escape') { close(); } }
  host.__close = close;
  filter.addEventListener('change', render);
  closeBtn.addEventListener('click', close);
  outBtn.addEventListener('click', function () {
    outline(!outlined);
    outBtn.setAttribute('aria-pressed', String(outlined));
    outBtn.textContent = outlined ? 'Remove outlines' : 'Outline on page';
  });
  csvBtn.addEventListener('click', function () {
    var blob = new Blob([csv(items)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alt-text-' + (location.hostname || 'page').replace(/[^a-z0-9.-]/gi, '') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  rerun.addEventListener('click', function () { close(); altOverlay(audit(document, { live: true }), csv, audit); });
  document.addEventListener('keydown', onKey, true);
  document.documentElement.appendChild(host);
  render();
  closeBtn.focus();
}
