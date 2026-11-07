/* LPG SCADA Field Guide - app.js. The ONLY file that runs init(). */
(function () {
  'use strict';

  var E = window.ScadaEngine;
  var CANON = 'https://githubbest729.github.io/scada-LPG-Pumping-guide/';
  var $ = function (s, r) { return (r || document)?.querySelector?.(s) ?? null; };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document)?.querySelectorAll?.(s) ?? []); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };
  var num = function (id) { return $('#' + id)?.value; };
  var setText = function (id, t) { var el = $('#' + id); if (el) el.textContent = t; };
  var f = function (v, d) { return Number(v).toFixed(d); };

  /* ---------- themes ---------- */
  var root = document.documentElement;
  function applyMode(mode) {
    root.dataset.sun = mode === 'sun' ? '1' : '0';
    root.dataset.battery = mode === 'battery' ? '1' : '0';
    $('#btn-sun')?.setAttribute('aria-pressed', String(mode === 'sun'));
    $('#btn-battery')?.setAttribute('aria-pressed', String(mode === 'battery'));
    var meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', mode === 'sun' ? '#ffffff' : (mode === 'battery' ? '#000000' : '#2b3036'));
    store.set('lpg-mode', mode);
    scheduleTick(true);
  }
  function currentMode() { return root.dataset.sun === '1' ? 'sun' : (root.dataset.battery === '1' ? 'battery' : 'std'); }
  function wireModes() {
    $('#btn-sun')?.addEventListener('click', function () { applyMode(currentMode() === 'sun' ? 'std' : 'sun'); });
    $('#btn-battery')?.addEventListener('click', function () { applyMode(currentMode() === 'battery' ? 'std' : 'battery'); });
    applyMode(store.get('lpg-mode', 'std'));
  }

  /* ---------- tabs ---------- */
  var TABS = ['design', 'plc', 'scada', 'tools'];
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'design';
    TABS.forEach(function (t) {
      var on = t === name;
      var p = $('#' + t); if (p) p.hidden = !on;
      $('#t-' + t)?.setAttribute('aria-selected', String(on));
    });
    if (name === 'scada') drawStrip();
  }
  function wireTabs() {
    $$('.tabs [data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.tab;
        if (location.hash !== '#' + t) location.hash = t;
        showTab(t);
        window.scrollTo(0, 0);
      });
    });
    window.addEventListener('hashchange', function () { showTab(location.hash.replace('#', '')); });
    showTab(location.hash.replace('#', ''));
  }

  /* ---------- share / install / sync ---------- */
  function wireShare() {
    $('#btn-share')?.addEventListener('click', async function () {
      var data = { title: 'LPG Pumping SCADA Field Guide', text: 'Field engineering guide for LPG pumping SCADA in Dubai, UAE.', url: CANON };
      try {
        if (navigator.share) { await navigator.share(data); return; }
        await navigator.clipboard.writeText(data.title + '\n' + data.text + '\n' + data.url);
        flash('Link copied');
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        try { await navigator.clipboard.writeText(data.url); flash('Link copied'); } catch (e2) { flash('Copy failed: ' + CANON); }
      }
    });
  }
  function flash(msg) {
    var b = $('#sync-badge'); if (!b) return;
    var old = b.textContent; b.textContent = msg;
    setTimeout(function () { updateSync(); if (b.textContent === msg) b.textContent = old; }, 1800);
  }

  var deferredPrompt = null;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  function showInstall(force) {
    var banner = $('#install-banner'); var text = $('#install-text'); var go = $('#install-go');
    if (!banner || !text || isStandalone) return;
    if (!force && store.get('lpg-install-dismissed', '0') === '1') return;
    if (isIOS) {
      text.innerHTML = '<b>Install on iPhone or iPad</b><ol><li>Open this page in Safari.</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. The guide then opens full-screen and works offline.</li></ol>';
      if (go) go.hidden = true;
    } else if (deferredPrompt) {
      text.innerHTML = '<b>Install LPG SCADA</b><p>Add it to your home screen. It opens full-screen and works offline.</p>';
      if (go) go.hidden = false;
    } else {
      text.innerHTML = '<b>Install LPG SCADA</b><p>Use the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>';
      if (go) go.hidden = true;
    }
    banner.hidden = false;
  }
  function wireInstall() {
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; showInstall(false); });
    window.addEventListener('appinstalled', function () { deferredPrompt = null; var b = $('#install-banner'); if (b) b.hidden = true; });
    $('#btn-install')?.addEventListener('click', function () { if (isStandalone) { flash('Already installed'); return; } showInstall(true); });
    $('#install-go')?.addEventListener('click', async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
      deferredPrompt = null; var b = $('#install-banner'); if (b) b.hidden = true;
    });
    $('#install-close')?.addEventListener('click', function () { var b = $('#install-banner'); if (b) b.hidden = true; store.set('lpg-install-dismissed', '1'); });
    if (isIOS && !isStandalone && store.get('lpg-install-dismissed', '0') !== '1') showInstall(false);
  }

  function updateSync() {
    var b = $('#sync-badge'); if (!b) return;
    var online = navigator.onLine !== false;
    var ts = Number(store.get('lpg-cache-ts', '0'));
    var ready = !!(navigator.serviceWorker?.controller) || ts > 0;
    var age = ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    b.classList.toggle('off', !online);
    b.textContent = (online ? 'Online' : 'Offline') + (ready ? ' \u00b7 cached' + (age ? ' ' + age : '') : '');
  }
  function wireServiceWorker() {
    window.addEventListener('online', updateSync);
    window.addEventListener('offline', updateSync);
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { updateSync(); return; }
    navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; })
      .then(function () { if (!Number(store.get('lpg-cache-ts', '0'))) store.set('lpg-cache-ts', String(Date.now())); updateSync(); })
      .catch(function () { updateSync(); });
    updateSync();
  }

  /* ---------- DCD checklist ---------- */
  function wireChecklist() {
    var saved = {};
    try { saved = JSON.parse(store.get('lpg-dcd', '{}')) || {}; } catch (e) { saved = {}; }
    var boxes = $$('#dcd-list input[type=checkbox]');
    function paint() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      var bar = $('#dcd-bar'); if (bar) bar.style.width = (boxes.length ? n / boxes.length * 100 : 0) + '%';
      setText('dcd-count', n + ' of ' + boxes.length + ' complete');
    }
    boxes.forEach(function (b) {
      b.checked = !!saved[b.dataset.k];
      b.addEventListener('change', function () { saved[b.dataset.k] = b.checked; store.set('lpg-dcd', JSON.stringify(saved)); paint(); });
    });
    paint();
  }

  /* ---------- code blocks ---------- */
  function wireCode() {
    var a = $('#st-pump'); if (a) a.textContent = E.ST_PUMP;
    var b = $('#st-leadlag'); if (b) b.textContent = E.ST_LEADLAG;
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var txt = $('#' + btn.dataset.copy)?.textContent ?? '';
        try { await navigator.clipboard.writeText(txt); btn.textContent = 'Copied'; } catch (e) { btn.textContent = 'Copy failed'; }
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      });
    });
  }

  /* ---------- calculators ---------- */
  function calcVP() {
    var c3 = E.clamp(num('vp-c3'), 0, 100, 50);
    var t = E.clamp(num('vp-t'), 10, 60, 40);
    var r = E.vaporPressure(c3, t);
    var sg = E.liquidSG(c3, t, 0.002).sg;
    var out = $('#vp-out'); if (!out) return;
    out.innerHTML = '<div class="big">' + f(r.barg, 2) + ' bar g</div>' +
      '<p class="sub">Blend ' + f(c3, 0) + '/' + f(100 - c3, 0) + ' propane/butane at ' + f(t, 1) + ' &deg;C. This is the pressure inside a tank holding this liquid.</p>' +
      '<dl><dt>Absolute</dt><dd>' + f(r.bara, 2) + ' bar a</dd><dt>Gauge</dt><dd>' + f(r.psig, 1) + ' psig</dd>' +
      '<dt>Pure propane</dt><dd>' + f((r.p3 - 101.325) / 100, 2) + ' bar g</dd><dt>Pure butane</dt><dd>' + f((r.p4 - 101.325) / 100, 2) + ' bar g</dd>' +
      '<dt>Liquid SG (approx.)</dt><dd>' + f(sg, 3) + '</dd></dl>';
  }
  function calcNPSH() {
    var r = E.npsh({ c3: E.clamp(num('np-c3'), 0, 100, 50), tankT: num('np-t'), lineT: num('np-tl'), head: num('np-h'), hf: num('np-hf'), req: num('np-r'), sg: num('np-sg'), beta: num('np-b') });
    var out = $('#np-out'); if (!out) return;
    var cls = r.status === 'ok' ? 'ok' : (r.status === 'marginal' ? 'warn' : 'fault');
    var txt = r.status === 'ok' ? 'Adequate margin' : (r.status === 'marginal' ? 'Marginal: add head or cut friction' : 'Cavitation risk: pump will starve');
    var plain = r.status === 'cavitation'
      ? 'Available suction head is below what the pump needs. Raise the tank, shorten or enlarge the suction line, or shade and insulate the line.'
      : (r.status === 'marginal'
        ? 'The pump has enough suction head, but less than the 1.0 m margin recommended for LPG. Heat picked up in the suction line cuts this quickly.'
        : 'Available suction head is above what the pump needs, with at least 1.0 m of margin.');
    out.innerHTML = '<div class="big">NPSHa ' + f(r.npsha, 2) + ' m</div><span class="status ' + cls + '">' + txt + '</span>' +
      '<p class="sub">' + plain + '</p>' +
      '<dl><dt>NPSHr (input)</dt><dd>' + f(r.req, 2) + ' m</dd><dt>Margin</dt><dd>' + f(r.margin, 2) + ' m</dd>' +
      '<dt>Pressure above vapor</dt><dd>' + f(r.pressureTerm, 2) + ' m (' + f(r.dpKpa, 1) + ' kPa)</dd>' +
      '<dt>Liquid head</dt><dd>+' + f(r.head, 2) + ' m</dd><dt>Friction loss</dt><dd>-' + f(r.hf, 2) + ' m</dd>' +
      '<dt>SG used</dt><dd>' + f(r.sg, 3) + '</dd></dl>';
  }
  var maBusy = false;
  function maRender(mA) {
    var h = E.loopHealth(mA);
    var cls = h.level === 'ok' ? 'ok' : (h.level === 'warn' ? 'warn' : 'fault');
    var out = $('#ma-out'); if (!out) return;
    var unit = $('#ma-unit')?.value ?? '';
    out.innerHTML = '<div class="big">' + f(mA, 2) + ' mA</div><span class="status ' + cls + '">' + (h.level === 'ok' ? 'Loop healthy' : (h.level === 'warn' ? 'Check loop' : 'Loop fault')) + '</span>' +
      '<p class="sub">' + h.text + '</p><dl><dt>Process value</dt><dd>' + f(num('ma-eng'), 2) + ' ' + unit + '</dd><dt>PLC counts</dt><dd>' + E.mAtoCounts(mA) + '</dd>' +
      '<dt>Percent of span</dt><dd>' + f((mA - 4) / 16 * 100, 1) + ' %</dd></dl>';
  }
  function maFrom(src) {
    if (maBusy) return; maBusy = true;
    try {
      var lrv = Number(num('ma-lrv')); var urv = Number(num('ma-urv'));
      if (!Number.isFinite(lrv)) lrv = 0; if (!Number.isFinite(urv) || urv <= lrv) urv = lrv + 1;
      var mA;
      if (src === 'eng') mA = E.engToMA(num('ma-eng'), lrv, urv);
      else if (src === 'cnt') mA = E.countsToMA(num('ma-cnt'));
      else mA = E.clamp(num('ma-ma'), 0, 25, 4);
      var set = function (id, v) { var el = $('#' + id); if (el) el.value = v; };
      if (src !== 'ma') set('ma-ma', f(mA, 2));
      if (src !== 'eng') set('ma-eng', f(E.mAtoEng(mA, lrv, urv), 3));
      if (src !== 'cnt') set('ma-cnt', String(E.mAtoCounts(mA)));
      maRender(mA);
    } finally { maBusy = false; }
  }
  function wireCalcs() {
    ['vp-c3', 'vp-t'].forEach(function (id) { $('#' + id)?.addEventListener('input', calcVP); });
    ['np-c3', 'np-t', 'np-tl', 'np-h', 'np-hf', 'np-r', 'np-sg', 'np-b'].forEach(function (id) { $('#' + id)?.addEventListener('input', calcNPSH); });
    $('#ma-eng')?.addEventListener('input', function () { maFrom('eng'); });
    $('#ma-ma')?.addEventListener('input', function () { maFrom('ma'); });
    $('#ma-cnt')?.addEventListener('input', function () { maFrom('cnt'); });
    ['ma-lrv', 'ma-urv'].forEach(function (id) { $('#' + id)?.addEventListener('input', function () { maFrom('eng'); }); });
    $('#ma-unit')?.addEventListener('change', function () {
      var d = { 'bar': [0, 25], 'mbar': [0, 500], '\u00b0C': [-50, 150], '%LEL': [0, 100], '%': [0, 100] }[$('#ma-unit').value] || [0, 100];
      var lo = $('#ma-lrv'), hi = $('#ma-urv'), ev = $('#ma-eng');
      if (lo) lo.value = d[0]; if (hi) hi.value = d[1]; if (ev) ev.value = d[0] + (d[1] - d[0]) / 2; maFrom('eng');
    });
    $$('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.dataset; var set = function (id, v) { var el = $('#' + id); if (el && v !== undefined) el.value = v; };
        if (d.preset === 'vp') { set('vp-c3', d.c3); set('vp-t', d.t); calcVP(); }
        if (d.preset === 'npsh') { set('np-c3', d.c3); set('np-t', d.t); set('np-tl', d.tl); set('np-h', d.h); set('np-hf', d.hf); set('np-r', d.r); set('np-sg', ''); calcNPSH(); }
        if (d.preset === 'ma') {
          var sel = $('#ma-unit'); if (sel) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].text === d.u) sel.selectedIndex = i; } }
          set('ma-lrv', d.l); set('ma-urv', d.h); set('ma-eng', d.v); maFrom('eng');
        }
      });
    });
    calcVP(); calcNPSH(); maFrom('eng');
  }

  /* ---------- SCADA simulation ---------- */
  var SET = { lel1: 20, lel1Clr: 15, lel2: 40, pshh: 24, pshhClr: 22.5, lsll: 10, lsllClr: 12, lshPermissive: 15, dpsh: 9, dpshClr: 8.5, debounce: 3 };
  var S = { pump: 'STOP', esd: false, estop: false, lel: 0, dp: 7, level: 65, amb: 40, blend: 50, cnt: { gas2: 0, pshh: 0, lsll: 0, dpsh: 0 }, al: {}, shelved: {}, hist: [], m: { ps: 0, pd: 0, flow: 0 } };
  var ALARMS = {
    gas1: { tag: 'GD-101', text: 'Gas Level 1', pri: 2 }, gas2: { tag: 'GD-101', text: 'Gas Level 2 trip', pri: 1 },
    pshh: { tag: 'PT-102', text: 'Discharge pressure high-high', pri: 1 }, lsll: { tag: 'LT-101', text: 'Tank level low-low', pri: 2 },
    dpsh: { tag: 'PDT-101', text: 'Pump differential high', pri: 2 }, esd: { tag: 'ESD', text: 'Emergency shutdown active', pri: 1 },
    estop: { tag: 'HS-001', text: 'E-STOP pushbutton pressed', pri: 1 }
  };
  var msgTimer = null;
  function msg(t) { setText('sim-msg', t); clearTimeout(msgTimer); msgTimer = setTimeout(function () { setText('sim-msg', ''); }, 5000); }
  function permissives() {
    return [
      ['No ESD / E-STOP latched', !S.esd && !S.estop], ['No gas Level 1 alarm', !S.al.gas1 && !S.al.gas2],
      ['Tank level above ' + SET.lshPermissive + ' %', S.level > SET.lshPermissive], ['Pump not tripped', S.pump !== 'TRIP'],
      ['Suction and discharge ESDV open', !S.esd]
    ];
  }
  function setAlarm(id, on) { S.al[id] = on; }
  function evaluate() {
    var vp = E.vaporPressure(S.blend, S.amb);
    var running = S.pump === 'RUN' && !S.esd;
    var ps = Math.max(0, vp.barg - 0.2);
    var dp = running ? S.dp : 0;
    var pd = ps + dp;
    var flow = running ? Math.max(0, 18 * (1 - Math.max(0, S.dp - 7) / 8)) : 0;
    if (running) { dp += (Math.random() - .5) * .1; pd += (Math.random() - .5) * .1; flow += (Math.random() - .5) * .3; }
    S.m = { ps: ps, pd: pd, dp: dp, flow: Math.max(0, flow) };
    // deadband alarms
    if (S.lel >= SET.lel1) setAlarm('gas1', true); else if (S.lel < SET.lel1Clr) setAlarm('gas1', false);
    if (pd >= SET.pshh) setAlarm('pshh', true); else if (pd < SET.pshhClr) setAlarm('pshh', false);
    if (S.level <= SET.lsll) setAlarm('lsll', true); else if (S.level > SET.lsllClr) setAlarm('lsll', false);
    if (dp >= SET.dpsh) setAlarm('dpsh', true); else if (dp < SET.dpshClr) setAlarm('dpsh', false);
    // debounced trips
    var c = S.cnt;
    c.gas2 = S.lel >= SET.lel2 ? c.gas2 + 1 : 0;
    c.pshh = pd >= SET.pshh ? c.pshh + 1 : 0;
    c.lsll = S.level <= SET.lsll ? c.lsll + 1 : 0;
    c.dpsh = (running && dp >= SET.dpsh) ? c.dpsh + 1 : 0;
    if (S.estop) latchEsd('estop');
    if (c.gas2 >= 2) { setAlarm('gas2', true); latchEsd('gas2'); }
    if (c.pshh >= SET.debounce && S.pump === 'RUN') { S.pump = 'TRIP'; latchEsd('pshh'); }
    if (c.lsll >= SET.debounce && S.pump === 'RUN') { S.pump = 'TRIP'; msg('Pump tripped: tank level low-low'); }
    if (c.dpsh >= SET.debounce && S.pump === 'RUN') { S.pump = 'TRIP'; msg('Pump tripped: differential pressure high'); }
    setAlarm('esd', S.esd); setAlarm('estop', S.estop);
    if (S.esd && S.pump === 'RUN') S.pump = 'TRIP';
  }
  function latchEsd(why) { if (!S.esd) { S.esd = true; S.pump = 'TRIP'; msg('ESD latched: ' + ALARMS[why].text); } }

  function render() {
    var m = S.m; var running = S.pump === 'RUN' && !S.esd;
    var st = S.esd ? 'ESD' : (S.pump === 'RUN' ? 'PUMPING' : (S.pump === 'TRIP' ? 'TRIPPED' : 'IDLE'));
    setText('m-ps', f(m.ps, 1) + ' bar'); setText('m-pd', f(m.pd, 1) + ' bar');
    setText('m-gd', f(S.lel, 0) + ' %LEL'); setText('m-dp', 'DP ' + f(m.dp, 1) + ' bar'); setText('m-esd', S.esd ? 'ESD TRIPPED' : 'ESD NORMAL');
    $('#m-gd')?.setAttribute('class', 'val ' + (S.lel >= SET.lel2 ? 'alarm' : (S.lel >= SET.lel1 ? 'warn' : '')));
    $('#m-pd')?.setAttribute('class', 'val ' + (S.al.pshh ? 'alarm' : ''));
    $('#m-esd')?.setAttribute('class', 'val ' + (S.esd ? 'alarm' : ''));
    $('#pump')?.setAttribute('class', 'eq ' + (running ? 'run' : (S.pump === 'TRIP' ? 'trip' : '')));
    ['esdv-s', 'esdv-d'].forEach(function (id) { $('#' + id)?.setAttribute('class', 'valve ' + (S.esd ? 'shut' : 'open')); });
    $('#dpv')?.setAttribute('class', 'valve ' + (running && S.dp > 8 ? 'open' : ''));
    $('#f-suction')?.setAttribute('class', 'flow ' + (running ? 'on' : ''));
    $('#f-disch')?.setAttribute('class', 'flow ' + (running ? 'on' : ''));
    $('#f-bypass')?.setAttribute('class', 'flow bypass ' + (running && S.dp > 8 ? 'on' : ''));
    var la = $('#la'); if (la) la.className = 'la ' + (running ? 'run' : (S.pump === 'TRIP' || S.esd ? 'trip' : ''));
    setText('la-state', st); setText('la-dp', f(m.dp, 1) + ' bar'); setText('la-flow', f(m.flow, 1) + ' m\u00b3/h'); setText('la-esd', S.esd ? 'TRIPPED' : 'NORMAL');
    setText('la-time', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    var pl = $('#perm-list'); if (pl) pl.innerHTML = permissives().map(function (p) { return '<li class="' + (p[1] ? 'ok' : 'no') + '">' + p[0] + '</li>'; }).join('');
    renderAlarms();
    S.hist.push([m.ps, m.pd]); if (S.hist.length > 90) S.hist.shift();
    drawStrip();
  }
  function renderAlarms() {
    var box = $('#alarm-list'); if (!box) return;
    var ids = Object.keys(ALARMS).filter(function (k) { return S.al[k]; }).sort(function (a, b) { return ALARMS[a].pri - ALARMS[b].pri; });
    var shown = ids.filter(function (k) { return !S.shelved[k]; });
    box.innerHTML = shown.length ? shown.map(function (k) {
      var a = ALARMS[k]; var shape = a.pri === 1 ? 'oct' : (a.pri === 2 ? 'tri' : 'sq');
      return '<div class="alarm p' + a.pri + '"><i class="shp ' + shape + '"></i><div class="tx"><b>' + a.tag + '</b> ' + a.text + '<small>Priority ' + a.pri + '</small></div>' +
        (a.pri > 1 ? '<button type="button" data-shelve="' + k + '">Shelve</button>' : '') + '</div>';
    }).join('') : '<div class="none">No active alarms</div>';
    setText('shelf-count', Object.keys(S.shelved).filter(function (k) { return S.shelved[k]; }).length + ' shelved');
    $$('[data-shelve]', box).forEach(function (b) { b.addEventListener('click', function () { S.shelved[b.dataset.shelve] = true; renderAlarms(); }); });
  }
  function drawStrip() {
    var cv = $('#strip'); if (!cv || cv.offsetParent === null || root.dataset.battery === '1') return;
    var ctx = cv.getContext?.('2d'); if (!ctx) return;
    var cs = getComputedStyle(document.documentElement);
    var W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = cs.getPropertyValue('--line').trim() || '#888'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, W - 1, H - 1);
    var max = 30; var n = S.hist.length; if (n < 2) return;
    [[0, 1.5, cs.getPropertyValue('--muted').trim()], [1, 3, cs.getPropertyValue('--ink').trim()]].forEach(function (ch) {
      ctx.beginPath(); ctx.strokeStyle = ch[2] || '#000'; ctx.lineWidth = ch[1];
      S.hist.forEach(function (p, i) { var x = i / 89 * W; var y = H - 6 - Math.min(p[ch[0]], max) / max * (H - 12); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    });
  }

  var tickTimer = null;
  function scheduleTick(restart) {
    if (restart) clearTimeout(tickTimer);
    var ms = root.dataset.battery === '1' ? 2000 : 1000; // throttle in battery saver
    tickTimer = setTimeout(function () {
      if (!document.hidden) { evaluate(); if ($('#scada')?.hidden === false || S.pump === 'RUN') render(); }
      scheduleTick(false);
    }, ms);
  }

  function holdButton(el, cb) {
    if (!el) return;
    var fill = $('.hold-fill', el); var start = 0; var raf = 0; var done = false;
    function frame() {
      var p = Math.min(1, (performance.now() - start) / 1500);
      if (fill) fill.style.width = (p * 100) + '%';
      if (p >= 1) { done = true; cancelAnimationFrame(raf); if (fill) fill.style.width = '0'; cb(); return; }
      raf = requestAnimationFrame(frame);
    }
    function down(e) { if (e && e.type === 'keydown' && (e.repeat || (e.key !== ' ' && e.key !== 'Enter'))) return; e?.preventDefault?.(); done = false; start = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    function up() { if (!done) { cancelAnimationFrame(raf); if (fill) fill.style.width = '0'; } }
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', down); el.addEventListener('keyup', up); el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function wireSim() {
    holdButton($('#btn-start'), function () {
      var bad = permissives().filter(function (p) { return !p[1]; });
      if (bad.length) { msg('Cannot start: ' + bad[0][0]); render(); return; }
      S.pump = 'RUN'; msg('Pump started'); render();
    });
    holdButton($('#btn-reset'), function () {
      if (S.lel >= SET.lel2 || S.estop || S.cnt.pshh > 0) { msg('Cannot reset: clear the initiating condition first'); return; }
      S.esd = false; if (S.pump === 'TRIP') S.pump = 'STOP';
      Object.keys(S.cnt).forEach(function (k) { S.cnt[k] = 0; }); setAlarm('gas2', false); msg('ESD reset'); evaluate(); render();
    });
    $('#btn-stop')?.addEventListener('click', function () { if (S.pump === 'RUN') { S.pump = 'STOP'; msg('Pump stopped'); } render(); });
    var estopBtn = $('#btn-estop');
    estopBtn?.addEventListener('click', function () { S.estop = !S.estop; estopBtn.textContent = S.estop ? 'E-STOP: RELEASE' : 'E-STOP'; if (S.estop) latchEsd('estop'); evaluate(); render(); });
    $('#btn-unshelve')?.addEventListener('click', function () { S.shelved = {}; renderAlarms(); });
    var bind = function (id, key, out, fmt) {
      $('#' + id)?.addEventListener('input', function (e) {
        var v = Number(e.target?.value); S[key] = Number.isFinite(v) ? v : S[key];
        if (key === 'amb') S.amb = E.clamp(S.amb, 10, 60, 40);
        setText(out, fmt ? fmt(S[key]) : String(S[key])); evaluate(); render();
      });
    };
    bind('s-lel', 'lel', 'v-lel'); bind('s-dp', 'dp', 'v-dp', function (v) { return f(v, 1); }); bind('s-lvl', 'level', 'v-lvl'); bind('s-amb', 'amb', 'v-amb');
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { evaluate(); render(); } });
    evaluate(); render(); scheduleTick(true);
  }

  /* ---------- ZIP export (defined in zip-export.js) ---------- */
  function wireZip() {
    $('#btn-zip')?.addEventListener('click', async function () {
      var b = $('#btn-zip'); if (!b || !window.LpgZip) { flash('ZIP tool unavailable'); return; }
      b.disabled = true; var old = b.textContent; b.textContent = '...';
      try { await window.LpgZip.download(); flash('ZIP saved'); } catch (e) { flash('ZIP needs internet'); }
      b.disabled = false; b.textContent = old;
    });
  }

  /* ---------- single init ---------- */
  function init() {
    wireModes(); wireTabs(); wireShare(); wireInstall(); wireServiceWorker();
    wireChecklist(); wireCode(); wireCalcs(); wireSim(); wireZip();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
