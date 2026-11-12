/* LPG SCADA Field Guide - interaction panels. Exposes window.LpgPanels; init() is called by app.js only. */
(function (root) {
  'use strict';
  var C = {}; var E = null;
  var $ = function (s, r) { return (r || document)?.querySelector?.(s) ?? null; };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document)?.querySelectorAll?.(s) ?? []); };
  var f = function (v, d) { return Number(v).toFixed(d); };
  var clamp = function (v, a, b, d) { return E.clamp(v, a, b, d); };
  var setText = function (id, t) { var el = $('#' + id); if (el) el.textContent = t; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmtTs = function (ts) { var d = new Date(ts); return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  function jget(k, d) { try { var v = JSON.parse(C.store.get(k, '')); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { C.store.set(k, JSON.stringify(v)); }

  /* ---- slide-to-confirm (1.5 s at the end of the track, pointer or keyboard) ---- */
  function slide(el, cb) {
    if (!el) return;
    var thumb = $('.slide-thumb', el), fill = $('.slide-fill', el), timer = null, drag = false;
    if (!thumb || !fill) return;
    var maxX = function () { return Math.max(1, el.clientWidth - thumb.offsetWidth - 6); };
    var setX = function (x) { x = Math.max(0, Math.min(maxX(), x)); thumb.style.transform = 'translateX(' + x + 'px)'; fill.style.width = (x + thumb.offsetWidth) + 'px'; return x; };
    var disarm = function () { clearTimeout(timer); timer = null; el.classList.remove('arming'); };
    var reset = function () { disarm(); drag = false; setX(0); };
    var arm = function () { if (timer) return; el.classList.add('arming'); timer = setTimeout(function () { timer = null; reset(); cb(); }, 1500); };
    thumb.addEventListener('pointerdown', function (e) { drag = true; try { thumb.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); });
    thumb.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = setX(e.clientX - el.getBoundingClientRect().left - thumb.offsetWidth / 2);
      if (x >= maxX() * .97) arm(); else disarm();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { thumb.addEventListener(t, reset); });
    el.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setX(maxX()); arm(); } });
    el.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') reset(); });
    el.addEventListener('blur', reset);
  }

  /* ---- numeric keypad ---- */
  function keypad() {
    var kp = $('#keypad'); if (!kp) return; var tgt = null;
    kp.innerHTML = '<div class="kp-head"><span id="kp-label"></span><b id="kp-val"></b></div><div class="kp-grid">' +
      ['7', '8', '9', '4', '5', '6', '1', '2', '3', '\u00b1', '0', '.'].map(function (k) { return '<button type="button" data-k="' + k + '">' + k + '</button>'; }).join('') +
      '</div><div class="kp-row"><button type="button" data-k="bs">Back</button><button type="button" data-k="clr">Clear</button><button type="button" data-k="ok" class="primary">Done</button></div>';
    var hide = function () { kp.hidden = true; document.body.classList.remove('kp-open'); tgt = null; };
    document.addEventListener('focusin', function (e) {
      var t = e.target; if (!t?.matches?.('[data-keypad]')) return;
      tgt = t; kp.hidden = false; document.body.classList.add('kp-open');
      setText('kp-label', (t.closest('label')?.firstChild?.textContent || 'Value').trim()); setText('kp-val', t.value);
      setTimeout(function () { t.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }, 50);
    });
    document.addEventListener('pointerdown', function (e) { if (!kp.hidden && !kp.contains(e.target) && !e.target?.matches?.('[data-keypad]')) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !kp.hidden) hide(); });
    kp.addEventListener('click', function (e) {
      var k = e.target?.dataset?.k; if (!k || !tgt) return;
      var v = String(tgt.value || '');
      if (k === 'ok') { hide(); return; }
      if (k === 'bs') v = v.slice(0, -1); else if (k === 'clr') v = '';
      else if (k === '\u00b1') v = v.charAt(0) === '-' ? v.slice(1) : '-' + v;
      else if (k === '.') { if (v.indexOf('.') < 0) v += (v === '' || v === '-') ? '0.' : '.'; } else v += k;
      tgt.value = v; setText('kp-val', v); tgt.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /* ---- DCD checklist: collapsible groups + timestamps ---- */
  function dcd() {
    var saved = jget('lpg-dcd2', {}), boxes = $$('#dcd input[data-k]');
    var paint = function () {
      var n = 0;
      boxes.forEach(function (b) {
        var li = b.closest('li'), badge = $('.ts', li);
        if (b.checked) { n++; if (!badge && li) { badge = document.createElement('small'); badge.className = 'ts'; li.appendChild(badge); } if (badge) badge.textContent = 'Verified ' + fmtTs(saved[b.dataset.k] || Date.now()); } else if (badge) badge.remove();
      });
      $$('#dcd details.grp').forEach(function (g) { var bs = $$('input[data-k]', g); var gp = $('.gp', g); if (gp) gp.textContent = bs.filter(function (b) { return b.checked; }).length + '/' + bs.length; });
      var bar = $('#dcd-bar'); if (bar) bar.style.width = (boxes.length ? n / boxes.length * 100 : 0) + '%';
      setText('dcd-count', n + ' of ' + boxes.length + ' complete');
    };
    boxes.forEach(function (b) {
      b.checked = !!saved[b.dataset.k];
      b.addEventListener('change', function () { if (b.checked) saved[b.dataset.k] = Date.now(); else delete saved[b.dataset.k]; jset('lpg-dcd2', saved); paint(); });
    });
    paint();
  }

  /* ---- C&E matrix: field test column ---- */
  function ce() {
    var tbl = $('.ce table'); if (!tbl) return; var saved = jget('lpg-ce', {});
    var hr = $('thead tr', tbl); if (hr) hr.insertAdjacentHTML('beforeend', '<th>Tested</th>');
    $$('tbody tr', tbl).forEach(function (tr, i) {
      tr.insertAdjacentHTML('beforeend', '<td><input type="checkbox" aria-label="Mark tested" data-ce="' + i + '"><small class="ts"></small></td>');
      var cb = $('input', tr), ts = $('.ts', tr);
      var paint = function () { tr.classList.toggle('tested', cb.checked); if (ts) ts.textContent = cb.checked && saved[i] ? fmtTs(saved[i]) : ''; };
      cb.checked = !!saved[i]; paint();
      cb.addEventListener('change', function () { if (cb.checked) saved[i] = Date.now(); else delete saved[i]; jset('lpg-ce', saved); paint(); });
      $('th', tr)?.addEventListener('click', function () { $$('tbody tr', tbl).forEach(function (r) { r.classList.remove('sel'); }); tr.classList.add('sel'); });
    });
  }

  /* ---- transmitter diagnostics HUD ---- */
  var drift = .08, hudBuilt = false;
  function hudBuild() {
    var el = $('#hud-body'); if (!el) return;
    el.innerHTML = '<div class="hud-cols"><div><h4>Analog 4-20 mA</h4><div class="hud-big" id="hd-ma">-</div><dl><dt>Raw counts</dt><dd id="hd-cnt">-</dd><dt>Span</dt><dd id="hd-pct">-</dd><dt>Loop state</dt><dd id="hd-lp">-</dd></dl></div>' +
      '<div><h4>HART digital</h4><div class="hud-big" id="hd-pv">-</div><dl><dt>PV range</dt><dd>0 to 40 bar</dd><dt>SV sensor temp</dt><dd id="hd-sv">-</dd><dt>Damping</dt><dd>1.0 s</dd><dt>Device status</dt><dd id="hd-st">-</dd></dl></div></div>' +
      '<p class="note" id="hd-delta"></p><div class="row"><button type="button" id="hd-trim" class="primary">Trim zero</button><button type="button" id="hd-drift">Add 0.08 mA drift</button></div>';
    $('#hd-trim')?.addEventListener('click', function () { drift = 0; });
    $('#hd-drift')?.addEventListener('click', function () { drift = .08; });
    hudBuilt = true;
  }
  function hud(S) {
    if (!hudBuilt || !S?.m || $('#scada')?.hidden !== false) return;
    var pd = S.m.pd, ideal = 4 + 16 * clamp(pd, 0, 40, 0) / 40, mA = clamp(ideal + drift, 0, 25, 4), h = E.loopHealth(mA);
    var analogPv = 40 * (mA - 4) / 16;
    setText('hd-ma', f(mA, 2) + ' mA'); setText('hd-cnt', String(E.mAtoCounts(mA))); setText('hd-pct', f((mA - 4) / 16 * 100, 1) + ' %');
    setText('hd-lp', h.level === 'ok' ? 'Healthy' : (h.level === 'warn' ? 'Check' : 'Fault')); setText('hd-pv', f(pd, 2) + ' bar');
    setText('hd-sv', f(S.amb + 3, 1) + ' \u00b0C'); setText('hd-st', (mA < 3.6 || mA > 21) ? 'Malfunction' : (pd > 40 ? 'PV out of limits' : 'OK'));
    setText('hd-delta', 'Analog reads ' + f(analogPv, 2) + ' bar against HART ' + f(pd, 2) + ' bar: ' + (Math.abs(analogPv - pd) < .02 ? 'in agreement.' : 'error ' + f(analogPv - pd, 2) + ' bar. Trim zero to correct.'));
  }

  /* ---- side drawer: standards + quick actions ---- */
  var STD = [
    ['ATEX Zone 0', 'Explosive gas atmosphere present continuously or for long periods (roughly more than 1000 h per year).'],
    ['ATEX Zone 1', 'Explosive atmosphere likely in normal operation, occasionally (roughly 10 to 1000 h per year). Typical: pump seals, vents, flanges.'],
    ['ATEX Zone 2', 'Not likely in normal operation, and brief if it occurs (under about 10 h per year). Typical: wider envelope around Zone 1.'],
    ['Class I Div 1 / Div 2', 'North American equivalent: Div 1 hazard normally present or likely, Div 2 only on abnormal conditions.'],
    ['Gas group and T-class', 'Propane and butane are gas group IIA. T2 or better equipment is typical; confirm against the certificate and ambient range.'],
    ['IEC 60079-10-1', 'Method for classifying hazardous areas from gas releases. Basis for the zone drawings DCD expects.'],
    ['IEC 60079-14', 'Electrical installation in explosive atmospheres: cable entries, earthing, Ex d / Ex e / Ex i rules.'],
    ['NFPA 58', 'LP-Gas Code: container siting and spacing, transfer operations, pumps, piping, valves and fire protection.'],
    ['NFPA 54', 'National Fuel Gas Code: fuel gas piping and appliances downstream, including inside buildings.'],
    ['IEC 61511 / SIL', 'Functional safety for process industries. SIL 2 or SIL 3 instruments for ESD functions need certified hardware and proof-test intervals.'],
    ['ISA-18.2', 'Alarm management lifecycle: rationalisation, priorities, deadbands, shelving, performance metrics.'],
    ['ISA-101', 'HMI design: grayscale display, colour reserved for abnormal states, navigation hierarchy.'],
    ['ISA-5.1', 'Instrument identification: first letter measured variable, following letters function (PT, PDT, LT, GD).'],
    ['AGAC (agac.ae)', 'Project technical requirements for LPG systems. Obtain the current documents from AGAC and confirm which revision applies.'],
    ['Dubai Civil Defence', 'Approves design and inspects the completed installation. UAE Fire and Life Safety Code of Practice applies.']
  ];
  var UNITS = {
    Pressure: { base: 'bar', u: { bar: 1, psi: 0.0689476, kPa: .01, mbar: .001 } },
    Volume: { base: 'm3', u: { 'm\u00b3': 1, L: .001, 'US gal': .00378541 } },
    Temperature: { base: 'C', u: { '\u00b0C': 1, '\u00b0F': 1 } }
  };
  function convert(cat, from, v) {
    var out = {}; var g = UNITS[cat]; if (!g) return out;
    if (cat === 'Temperature') { var c = from === '\u00b0F' ? (v - 32) * 5 / 9 : v; return { '\u00b0C': c, '\u00b0F': c * 9 / 5 + 32 }; }
    var base = v * g.u[from]; Object.keys(g.u).forEach(function (k) { out[k] = base / g.u[k]; }); return out;
  }
  function drawerStd() {
    var box = $('#dr-std'); if (!box) return;
    box.innerHTML = '<label class="vs">Search standards<input type="search" id="std-q" placeholder="ATEX, NFPA, ISA..."></label><div id="std-list"></div>';
    var list = function () {
      var q = ($('#std-q')?.value || '').toLowerCase();
      put('std-list', STD.filter(function (r) { return (r[0] + ' ' + r[1]).toLowerCase().indexOf(q) >= 0; }).map(function (r) { return '<div class="std"><b>' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p></div>'; }).join('') || '<p class="note">No match.</p>');
    };
    $('#std-q')?.addEventListener('input', list); list();
  }
  function put(id, h) { var el = $('#' + id); if (el) el.innerHTML = h; }
  function drawerQuick() {
    var box = $('#dr-quick'); if (!box) return;
    var show = jget('lpg-qa-show', { cal: true, vp: true, uc: true, ct: true }), contacts = jget('lpg-contacts', []);
    box.innerHTML =
      '<div id="qa-cal" class="qa"><h3>Loop calibrator</h3><button type="button" id="qa-go-cal" class="primary">Open 4-20 mA tool</button></div>' +
      '<div id="qa-vp" class="qa"><h3>Vapor pressure lookup</h3><label class="vs">Propane (% volume)<input type="text" inputmode="none" data-keypad id="qa-c3" value="50"></label><div class="scroll"><table id="qa-vt"></table></div></div>' +
      '<div id="qa-uc" class="qa"><h3>Unit converter</h3><div class="fields"><label>Type<select id="uc-cat">' + Object.keys(UNITS).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label><label>From<select id="uc-from"></select></label><label>Value<input type="text" inputmode="none" data-keypad id="uc-val" value="1"></label></div><div class="result" id="uc-out"></div></div>' +
      '<div id="qa-ct" class="qa"><h3>Emergency contacts</h3><div id="ct-list"></div><div class="fields"><label>Name<input type="text" id="ct-n" maxlength="40"></label><label>Number<input type="tel" id="ct-p" maxlength="24"></label></div><button type="button" id="ct-add">Add contact</button></div>' +
      '<div class="qa"><h3>Customise</h3>' + [['cal', 'Loop calibrator'], ['vp', 'Vapor pressure lookup'], ['uc', 'Unit converter'], ['ct', 'Emergency contacts']].map(function (r) { return '<label class="chk"><input type="checkbox" data-show="' + r[0] + '"' + (show[r[0]] ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') + '</div>';
    var vis = function () { ['cal', 'vp', 'uc', 'ct'].forEach(function (k) { var e = $('#qa-' + k); if (e) e.hidden = !show[k]; }); };
    $$('[data-show]', box).forEach(function (c) { c.addEventListener('change', function () { show[c.dataset.show] = c.checked; jset('lpg-qa-show', show); vis(); }); }); vis();
    $('#qa-go-cal')?.addEventListener('click', function () { closeDrawer(); location.hash = 'tools'; setTimeout(function () { $('#calc-ma')?.scrollIntoView?.(); }, 80); });
    var vt = function () {
      var c3 = clamp($('#qa-c3')?.value, 0, 100, 50), rows = '<tr><th>&deg;C</th><th>bar g</th><th>psig</th></tr>';
      for (var t = 15; t <= 55; t += 5) { var r = E.vaporPressure(c3, t); rows += '<tr><td>' + t + '</td><td>' + f(r.barg, 2) + '</td><td>' + f(r.psig, 1) + '</td></tr>'; }
      put('qa-vt', rows);
    };
    $('#qa-c3')?.addEventListener('input', vt); vt();
    var fillFrom = function () { var cat = $('#uc-cat')?.value; put('uc-from', Object.keys(UNITS[cat].u).map(function (k) { return '<option>' + k + '</option>'; }).join('')); uc(); };
    var uc = function () {
      var cat = $('#uc-cat')?.value, from = $('#uc-from')?.value, v = Number($('#uc-val')?.value);
      if (!UNITS[cat] || !Number.isFinite(v)) { put('uc-out', '<p class="note">Enter a number.</p>'); return; }
      var o = convert(cat, from, v); put('uc-out', '<dl>' + Object.keys(o).map(function (k) { return '<dt>' + k + '</dt><dd>' + (Math.abs(o[k]) >= 1000 || (Math.abs(o[k]) < .01 && o[k] !== 0) ? o[k].toExponential(3) : f(o[k], 3)) + '</dd>'; }).join('') + '</dl>');
    };
    $('#uc-cat')?.addEventListener('change', fillFrom); $('#uc-from')?.addEventListener('change', uc); $('#uc-val')?.addEventListener('input', uc); fillFrom();
    var drawContacts = function () {
      var base = [['Civil Defence (fire)', '997'], ['Police', '999'], ['Ambulance', '998']];
      put('ct-list', base.map(function (c) { return '<div class="ct"><span>' + c[0] + '</span><a href="tel:' + c[1] + '">' + c[1] + '</a></div>'; }).join('') +
        contacts.map(function (c, i) { return '<div class="ct"><span>' + esc(c.n) + '</span><a href="tel:' + esc(c.p.replace(/[^0-9+]/g, '')) + '">' + esc(c.p) + '</a><button type="button" data-del="' + i + '" aria-label="Remove ' + esc(c.n) + '">Remove</button></div>'; }).join(''));
      $$('[data-del]', box).forEach(function (b) { b.addEventListener('click', function () { contacts.splice(Number(b.dataset.del), 1); jset('lpg-contacts', contacts); drawContacts(); }); });
    };
    $('#ct-add')?.addEventListener('click', function () {
      var n = ($('#ct-n')?.value || '').trim(), p = ($('#ct-p')?.value || '').trim(); if (!n || !/[0-9]/.test(p)) return;
      contacts.push({ n: n, p: p }); jset('lpg-contacts', contacts); $('#ct-n').value = ''; $('#ct-p').value = ''; drawContacts();
    }); drawContacts();
  }
  var lastFocus = null;
  function openDrawer() { var d = $('#drawer'); if (!d) return; lastFocus = document.activeElement; d.hidden = false; $('#scrim').hidden = false; $('#drawer-close')?.focus(); }
  function closeDrawer() { var d = $('#drawer'); if (!d || d.hidden) return; d.hidden = true; $('#scrim').hidden = true; lastFocus?.focus?.(); }
  function drawer() {
    drawerStd(); drawerQuick();
    $('#btn-menu')?.addEventListener('click', openDrawer); $('#drawer-close')?.addEventListener('click', closeDrawer); $('#scrim')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    $$('[data-dt]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-dt]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        var std = $('#dr-std'), q = $('#dr-quick'); if (std) std.hidden = b.dataset.dt !== 'std'; if (q) q.hidden = b.dataset.dt !== 'quick';
      });
    });
  }

  function init(c) {
    C = c || {}; E = C.E; if (!E) return;
    [keypad, dcd, ce, hudBuild, drawer].forEach(function (fn) { try { fn(); } catch (e) { /* keep other panels alive */ } });
  }
  root.LpgPanels = { init: init, slide: slide, hud: hud };
})(window);
