/* LPG SCADA Field Guide - Visuals tab. Exposes window.LpgVisuals; init() is called by app.js only. */
(function (root) {
  'use strict';
  var C = {}; var E = null;
  var $ = function (s, r) { return (r || document)?.querySelector?.(s) ?? null; };
  var f = function (v, d) { return Number(v).toFixed(d); };
  var clamp = function (v, a, b, d) { return E.clamp(v, a, b, d); };
  var margin = 1.5, cavDraw = null, qhDraw = null;

  function svg(vb, body, label) { return '<svg class="vz" viewBox="' + vb + '" role="img" aria-label="' + label + '">' + body + '</svg>'; }
  function sl(id, label, min, max, step, val, unit) {
    return '<label class="vs">' + label + ': <b id="' + id + '-v">' + val + '</b> ' + unit + '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></label>';
  }
  function rng(id, fn) {
    var el = $('#' + id); if (!el) return;
    var run = function () { var v = Number(el.value); var o = $('#' + id + '-v'); if (o) o.textContent = String(v); fn(v); };
    el.addEventListener('input', run); run();
  }
  function put(id, h) { var el = $('#' + id); if (el) el.innerHTML = h; return el; }
  function txt(id, t) { var el = $('#' + id); if (el) el.textContent = t; }
  function zig(x, y1, y2, n, amp) {
    var p = [x + ',' + y1], dy = (y2 - y1) / (n * 2 + 1);
    for (var i = 1; i <= n * 2; i++) p.push((x + (i % 2 ? amp : -amp)) + ',' + f(y1 + dy * i, 1));
    p.push(x + ',' + y2); return p.join(' ');
  }
  var batt = function () { return C.battery ? C.battery() : false; };

  /* 1. Flame and gas coverage map */
  function fgd() {
    put('v-fgd',
      svg('0 0 320 220',
        '<ellipse class="zone z2" cx="160" cy="112" rx="145" ry="92"/><ellipse class="zone z1" cx="160" cy="112" rx="98" ry="60"/><ellipse class="zone z0" cx="160" cy="112" rx="36" ry="17"/>' +
        '<circle id="fg-plume" class="plume" cx="160" cy="112" r="10"/><rect x="128" y="108" width="64" height="8" fill="var(--ink)"/>' +
        '<polygon points="30,30 120,100 120,124" class="cone"/><polygon points="290,30 200,100 200,124" class="cone"/>' +
        '<text x="30" y="24" class="tg">FD-1 UV/IR</text><text x="290" y="24" class="tg" text-anchor="end">FD-2 UV/IR</text>' +
        '<circle id="fg-g1" class="gdx" cx="98" cy="150" r="9"/><text x="98" y="153" class="tg" text-anchor="middle">G1</text>' +
        '<circle id="fg-g2" class="gdx" cx="222" cy="150" r="9"/><text x="222" y="153" class="tg" text-anchor="middle">G2</text>' +
        '<text x="160" y="104" class="tg" text-anchor="middle">Manifold</text>' +
        '<text x="160" y="205" class="tg" text-anchor="middle">Zone 0 solid / Zone 1 dashed / Zone 2 dotted</text>', 'Flame and gas detection coverage map') +
      sl('fg-lel', 'Gas at manifold', 0, 100, 1, 0, '%LEL') + '<p class="note" id="fg-txt"></p>');
    rng('fg-lel', function (v) {
      var p = $('#fg-plume'); if (p) { p.setAttribute('r', f(10 + v * 1.1, 0)); p.style.opacity = String(.15 + v / 160); }
      [['fg-g1', v * .9], ['fg-g2', v * .55]].forEach(function (g) {
        var e = $('#' + g[0]); if (e) e.setAttribute('class', 'gdx ' + (g[1] >= 40 ? 'l2' : (g[1] >= 20 ? 'l1' : '')));
      });
      txt('fg-txt', v >= 40 ? 'Level 2 (40 %LEL): trip pumps and close ESDVs. G1 ' + f(v * .9, 0) + ', G2 ' + f(v * .55, 0) + ' %LEL.' : (v >= 20 ? 'Level 1 (20 %LEL): alarm and investigate.' : 'Below alarm. Place detectors low, LPG vapor settles.'));
    });
  }

  /* 2. Tank strapping and level */
  function tank() {
    var D = 3, L = 15, R = 1.5;
    put('v-tank',
      '<div class="fields"><label>Gauge level (% of diameter)<input type="text" inputmode="none" data-keypad id="tk-lvl" value="55"></label>' +
      '<label>Bulk liquid temperature (&deg;C)<input type="text" inputmode="none" data-keypad id="tk-amb" value="40"></label></div>' +
      svg('0 0 320 150',
        '<defs><clipPath id="tkc"><rect x="30" y="30" width="250" height="80" rx="40"/></clipPath></defs>' +
        '<rect x="30" y="30" width="250" height="80" rx="40" fill="none" stroke="var(--ink)" stroke-width="2"/>' +
        '<rect id="tk-liq" x="30" y="70" width="250" height="40" clip-path="url(#tkc)" class="liq"/>' +
        [[5, 'LALL'], [10, 'LAL'], [85, 'LAH'], [90, 'LAHH']].map(function (a) {
          var y = 110 - a[0] / 100 * 80;
          return '<line x1="30" x2="284" y1="' + y + '" y2="' + y + '" class="lim"/><text x="288" y="' + (y + 3) + '" class="tg">' + a[1] + '</text>';
        }).join('') + '<text x="155" y="132" class="tg" text-anchor="middle">D 3.0 m x L 15 m bullet (illustrative)</text>', 'Tank level visualizer') +
      '<div class="result" id="tk-out"></div>');
    var upd = function () {
      var lv = clamp($('#tk-lvl')?.value, 0, 100, 55), T = clamp($('#tk-amb')?.value, 10, 60, 40);
      var h = lv / 100 * D, V = L * (R * R * Math.acos((R - h) / R) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h)));
      var Vt = Math.PI * R * R * L, sg = E.liquidSG(50, T, 0.002).sg;
      var liq = $('#tk-liq'); if (liq) { liq.setAttribute('y', f(110 - lv / 100 * 80, 1)); liq.setAttribute('height', f(lv / 100 * 80, 1)); }
      var st = lv >= 90 ? 'LAHH: stop filling now' : (lv >= 85 ? 'LAH: at the 85 % fill limit' : (lv <= 5 ? 'LALL: pump trip' : (lv <= 10 ? 'LAL: low level alarm' : 'Normal')));
      var cls = (lv >= 90 || lv <= 5) ? 'fault' : ((lv >= 85 || lv <= 10) ? 'warn' : 'ok');
      put('tk-out', '<div class="big">' + f(V, 1) + ' m&sup3; GOV</div><span class="status ' + cls + '">' + st + '</span><dl><dt>Of tank volume</dt><dd>' + f(V / Vt * 100, 1) + ' %</dd><dt>Liquid top / bottom</dt><dd>' + f(T + 1.5, 1) + ' / ' + f(T - 1, 1) + ' &deg;C</dd><dt>Mass (50/50 blend)</dt><dd>' + f(V * sg, 1) + ' t</dd></dl>');
    };
    ['tk-lvl', 'tk-amb'].forEach(function (id) { $('#' + id)?.addEventListener('input', upd); }); upd();
  }

  /* 3. DPV cycle */
  function dpv() {
    put('v-dpv',
      svg('0 0 300 200',
        '<path class="pipe" d="M10 150 H110 M190 150 H290"/><rect x="110" y="110" width="80" height="80" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>' +
        '<rect x="132" y="186" width="36" height="4" fill="var(--ink)"/><rect id="dv-plug" x="130" y="170" width="40" height="12" fill="var(--ink)"/>' +
        '<line id="dv-stem" x1="150" x2="150" y1="170" y2="60" stroke="var(--ink)" stroke-width="3"/><polyline id="dv-spring" fill="none" stroke="var(--ink)" stroke-width="2" points=""/>' +
        '<rect x="110" y="30" width="80" height="6" fill="var(--ink)"/><path id="dv-by" class="flow bypass on" d="M190 150 H250 V100 H30 V150" style="opacity:0;fill:none"/>' +
        '<text x="12" y="140" class="tg">Discharge</text><text x="288" y="140" class="tg" text-anchor="end">To tank vapor space</text>', 'Differential pressure valve opening cycle') +
      sl('dv-dp', 'Discharge minus tank pressure', 0, 12, .1, 5, 'bar') + '<div class="row"><button type="button" id="dv-play">Play cycle</button></div><p class="note" id="dv-txt"></p>');
    var set = function (v) {
      var o = clamp((v - 7) / 2, 0, 1), y = 170 - o * 36;
      $('#dv-plug')?.setAttribute('y', f(y, 1)); $('#dv-stem')?.setAttribute('y1', f(y, 1)); $('#dv-spring')?.setAttribute('points', zig(150, 36, y - 6, 6, 12 - o * 3));
      var by = $('#dv-by'); if (by) by.style.opacity = String(o);
      txt('dv-txt', 'Valve ' + f(o * 100, 0) + ' % open. ' + (o <= 0 ? 'Closed below the 7 bar set point: all flow goes to discharge.' : 'Excess flow returns to the tank to hold differential near set point.'));
    };
    rng('dv-dp', set);
    $('#dv-play')?.addEventListener('click', function () {
      var el = $('#dv-dp'); if (!el) return;
      if (batt()) { el.value = 10; el.dispatchEvent(new Event('input')); return; }
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / 6000); el.value = f(5 + 6 * (1 - Math.cos(p * Math.PI * 2)) / 2, 1); el.dispatchEvent(new Event('input'));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  /* 4. Q-H comparator */
  function qh() {
    var pumps = [{ id: 'a', n: 'Pump A: positive displacement', dp0: 14, qm: 40 }, { id: 'b', n: 'Pump B: regenerative turbine', dp0: 11, qm: 32 }];
    put('v-qh',
      sl('qh-fr', 'Line friction at 20 m&sup3;/h', .2, 6, .1, 2, 'bar') + sl('qh-st', 'Static differential', 0, 6, .1, 2, 'bar') + sl('qh-rpm', 'Pump speed', 50, 110, 1, 100, '%') +
      '<div class="two">' + pumps.map(function (p) { return '<div><h4>' + p.n + '</h4><div id="qh-' + p.id + '"></div><p class="note" id="qh-t-' + p.id + '"></p></div>'; }).join('') + '</div>' +
      '<p class="note">Generic illustrative curves. Replace dp0 and Qmax with your Corken or Blackmer datasheet values before design use. The cross marks live SCADA flow and differential.</p>');
    qhDraw = function () {
      var fr = Number($('#qh-fr')?.value), st = Number($('#qh-st')?.value), r = Number($('#qh-rpm')?.value) / 100;
      var live = C.S?.m; var run = C.S && C.S.pump === 'RUN' && !C.S.esd;
      pumps.forEach(function (p) {
        var qm = p.qm * r, h0 = p.dp0 * r * r, k = fr / 400, den = h0 / (qm * qm) + k, q2 = (h0 - st) / den, Q = q2 > 0 ? Math.sqrt(q2) : 0, H = st + k * Q * Q;
        var X = function (q) { return 36 + q / 45 * 254; }, Y = function (h) { return 160 - h / 16 * 150; }, pc = [], sc = [];
        for (var q = 0; q <= 45; q += 1.5) { var hp = h0 * (1 - Math.pow(q / qm, 2)); if (hp >= 0) pc.push(f(X(q), 1) + ',' + f(Y(hp), 1)); var hs = st + k * q * q; if (hs <= 16) sc.push(f(X(q), 1) + ',' + f(Y(hs), 1)); }
        var mk = (run && live) ? '<path d="M' + (X(live.flow) - 5) + ' ' + (Y(live.dp) - 5) + 'l10 10m0-10l-10 10" stroke="var(--alarm)" stroke-width="2.5"/>' : '';
        put('qh-' + p.id, svg('0 0 300 180', '<rect x="36" y="10" width="254" height="150" fill="none" stroke="var(--line)"/><polyline points="' + pc.join(' ') + '" fill="none" stroke="var(--ink)" stroke-width="3"/><polyline points="' + sc.join(' ') + '" fill="none" stroke="var(--op)" stroke-width="2" stroke-dasharray="6 4"/>' +
          (Q > 0 ? '<circle cx="' + X(Q) + '" cy="' + Y(H) + '" r="6" fill="var(--warn)" stroke="var(--ink)" stroke-width="2"/>' : '') + mk + '<text x="36" y="174" class="tg">0</text><text x="290" y="174" class="tg" text-anchor="end">45 m&sup3;/h</text><text x="32" y="16" class="tg" text-anchor="end">16</text><text x="32" y="162" class="tg" text-anchor="end">0 bar</text>', p.n));
        txt('qh-t-' + p.id, Q > 0 ? 'Duty ' + f(Q, 1) + ' m\u00b3/h at ' + f(H, 1) + ' bar' + (run && live ? '. Live ' + f(live.flow, 1) + ' m\u00b3/h at ' + f(live.dp, 1) + ' bar.' : '.') : 'No flow: static differential exceeds shut-off head.');
      });
    };
    ['qh-fr', 'qh-st', 'qh-rpm'].forEach(function (id) { rng(id, function () { qhDraw(); }); });
  }

  /* 5. Single-line diagram */
  function sld() {
    put('v-sld',
      svg('0 0 400 230',
        '<line x1="20" x2="380" y1="24" y2="24" stroke="var(--ink)" stroke-width="5"/><text x="22" y="14" class="tg">400 V MCC bus</text>' +
        [[100, 'SS', 'Soft starter', 'P-101A'], [300, 'VFD', 'VFD', 'P-101B']].map(function (a) {
          return '<g class="fd"><line x1="' + a[0] + '" x2="' + a[0] + '" y1="24" y2="52"/><rect x="' + (a[0] - 12) + '" y="52" width="24" height="16" fill="var(--surface)"/><text x="' + a[0] + '" y="64" class="tg" text-anchor="middle">Q</text>' +
            '<line x1="' + a[0] + '" x2="' + a[0] + '" y1="68" y2="100"/><rect x="' + (a[0] - 32) + '" y="100" width="64" height="30" fill="var(--surface)"/><text x="' + a[0] + '" y="119" class="tg" text-anchor="middle">' + a[2] + '</text>' +
            '<line x1="' + a[0] + '" x2="' + a[0] + '" y1="130" y2="158"/><circle cx="' + a[0] + '" cy="176" r="18" fill="var(--surface)"/><text x="' + a[0] + '" y="179" class="tg" text-anchor="middle">M</text><text x="' + a[0] + '" y="208" class="tg" text-anchor="middle">' + a[3] + '</text></g>';
        }).join('') +
        '<rect x="165" y="86" width="70" height="40" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><text x="200" y="103" class="tg" text-anchor="middle">E-STOP</text><text id="sl-st" x="200" y="118" class="tg" text-anchor="middle">LOOP CLOSED</text>', 'Motor control center single-line diagram') +
      '<div class="row"><button type="button" id="sl-btn" aria-pressed="true">E-stop loop closed</button></div><p class="note" id="sl-txt"></p>');
    var closed = true;
    var draw = function () {
      document.querySelectorAll('#v-sld .fd').forEach(function (g) { g.classList.toggle('dead', !closed); });
      txt('sl-st', closed ? 'LOOP CLOSED' : 'LOOP OPEN'); txt('sl-txt', closed ? 'Both feeders energised. Contactors hold in while the loop is healthy.' : 'Loop open: contactor coils de-energise and both motors are isolated.');
      var b = $('#sl-btn'); if (b) { b.setAttribute('aria-pressed', String(closed)); b.textContent = closed ? 'E-stop loop closed' : 'E-stop loop open'; }
    };
    $('#sl-btn')?.addEventListener('click', function () { closed = !closed; draw(); }); draw();
  }

  /* 6. ESDV actuator (2D) */
  function esdv() {
    put('v-esdv',
      svg('0 0 300 240',
        '<rect x="90" y="20" width="120" height="110" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><polyline id="ev-spring" fill="none" stroke="var(--ink)" stroke-width="2.5" points=""/>' +
        '<rect id="ev-pis" x="94" y="100" width="112" height="8" fill="var(--ink)"/><line id="ev-stem" x1="150" x2="150" y1="108" y2="160" stroke="var(--ink)" stroke-width="4"/>' +
        '<path class="pipe" d="M10 200 H290"/><rect x="110" y="160" width="80" height="60" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><rect id="ev-plug" x="130" y="160" width="40" height="40" fill="var(--ink)"/>' +
        '<text x="216" y="118" class="tg">Air port</text><line x1="214" y1="116" x2="206" y2="116" stroke="var(--ink)"/><text x="12" y="190" class="tg">Flow</text>', 'Fail-closed ESDV actuator') +
      sl('ev-p', 'Instrument air supply', 0, 7, .1, 6, 'bar') + '<label class="vs"><input type="checkbox" id="ev-sol" checked> Pilot solenoid energised</label><p class="note" id="ev-txt"></p>');
    var air = 6, target = 6, raf = 0;
    var draw = function () {
      var s = clamp((air - 2.5) / 2, 0, 1), py = 100 - s * 60;
      $('#ev-pis')?.setAttribute('y', f(py, 1)); $('#ev-stem')?.setAttribute('y1', f(py + 8, 1)); $('#ev-plug')?.setAttribute('y', f(160 - s * 45, 1));
      $('#ev-spring')?.setAttribute('points', zig(150, 26, py - 2, 7, 22));
      txt('ev-txt', 'Air ' + f(air, 1) + ' bar: valve ' + (s >= .98 ? 'OPEN' : (s <= .02 ? 'CLOSED (spring)' : 'STROKING ' + f(s * 100, 0) + ' %')) + '. Spring preload needs about 2.5 bar; full stroke near 4.5 bar. Loss of air or solenoid power closes the valve.');
    };
    var go = function () {
      cancelAnimationFrame(raf);
      if (batt()) { air = target; draw(); return; }
      (function step() { air += (target - air) * .15; if (Math.abs(target - air) < .02) air = target; draw(); if (air !== target) raf = requestAnimationFrame(step); })();
    };
    var read = function () { var on = $('#ev-sol')?.checked; target = on ? Number($('#ev-p')?.value) : 0; go(); };
    rng('ev-p', read); $('#ev-sol')?.addEventListener('change', read);
  }

  /* 7. Cavitation at the impeller (2D) */
  function cav() {
    put('v-cav', '<div id="cv-svg"></div>' + sl('cv-m', 'NPSH margin (follows the NPSH calculator)', -3, 3, .1, margin, 'm') + '<p class="note" id="cv-txt"></p>');
    cavDraw = function () {
      var m = clamp($('#cv-m')?.value, -3, 3, 1.5), n = m >= 1 ? 0 : Math.min(24, Math.round((1 - m) * 6)), vanes = '', bub = '', i;
      for (i = 0; i < 8; i++) vanes += '<path d="M150 100 Q' + f(150 + 40 * Math.cos(i * Math.PI / 4 + .5), 1) + ' ' + f(100 + 40 * Math.sin(i * Math.PI / 4 + .5), 1) + ' ' + f(150 + 72 * Math.cos(i * Math.PI / 4 + 1.1), 1) + ' ' + f(100 + 72 * Math.sin(i * Math.PI / 4 + 1.1), 1) + '" fill="none" stroke="var(--ink)" stroke-width="3"/>';
      for (i = 0; i < n; i++) { var a = i * 2.399, rr = 22 + (i * 37 % 40); bub += '<circle cx="' + f(150 + rr * Math.cos(a), 1) + '" cy="' + f(100 + rr * Math.sin(a), 1) + '" r="' + (3 + i % 4) + '" fill="none" stroke="var(--op)" stroke-width="2"/>'; }
      put('cv-svg', svg('0 0 300 200', '<circle cx="150" cy="100" r="86" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"/><g class="spin">' + vanes + '</g><circle cx="150" cy="100" r="16" fill="var(--ink)"/>' + bub, 'Impeller cavitation view'));
      txt('cv-txt', m >= 1 ? 'No vapor bubbles: margin is adequate.' : (m >= 0 ? 'Marginal: small bubbles at the vane inlet. Expect noise and reduced life.' : 'Cavitation: vapor pockets collapse on the vanes, causing pitting, noise, vibration and lost flow.'));
    };
    rng('cv-m', function () { cavDraw(); });
  }

  /* 8. VLE diagram */
  function vle() {
    put('v-vle', '<canvas id="vl-cv" width="640" height="380" class="vz" aria-label="Propane butane pressure composition diagram"></canvas>' + sl('vl-t', 'Temperature', 0, 60, 1, 40, '\u00b0C') + sl('vl-c', 'Propane in blend', 0, 100, 1, 50, '% vol') + '<p class="note" id="vl-txt"></p>');
    var draw = function () {
      var T = Number($('#vl-t')?.value), c3 = Number($('#vl-c')?.value), cv = $('#vl-cv'), ctx = cv?.getContext?.('2d');
      var r = E.vaporPressure(c3, T, true), p3 = r.p3 / 100, p4 = r.p4 / 100, z = r.x3, pb = r.bara, pd = 1 / (z / p3 + (1 - z) / p4);
      txt('vl-txt', 'At ' + T + ' \u00b0C: bubble point ' + f(pb, 2) + ' bar a, dew point ' + f(pd, 2) + ' bar a. Between the two lines the mixture is part liquid, part vapor. Liquid mole fraction propane ' + f(z, 3) + '.');
      if (!ctx) return;
      var cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--ink').trim() || '#000', ln = cs.getPropertyValue('--line').trim() || '#888', op = cs.getPropertyValue('--op').trim() || '#06c';
      var W = 640, H = 380, x0 = 56, y0 = 20, w = 560, h = 310, ymax = Math.max(p3, 1) * 1.1;
      var X = function (x) { return x0 + x * w; }, Y = function (p) { return y0 + h - p / ymax * h; };
      ctx.clearRect(0, 0, W, H); ctx.strokeStyle = ln; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, w, h);
      ctx.fillStyle = ink; ctx.font = '16px sans-serif'; ctx.fillText('0', x0, y0 + h + 20); ctx.fillText('Propane mole fraction', X(.36), y0 + h + 40); ctx.fillText('1', x0 + w - 6, y0 + h + 20); ctx.fillText('bar a', 4, y0 + 12);
      ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(X(0), Y(p4)); ctx.lineTo(X(1), Y(p3)); ctx.stroke();
      ctx.strokeStyle = op; ctx.setLineDash([8, 5]); ctx.beginPath();
      for (var i = 0; i <= 50; i++) { var y = i / 50, p = 1 / (y / p3 + (1 - y) / p4); if (i) ctx.lineTo(X(y), Y(p)); else ctx.moveTo(X(y), Y(p)); } ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.fillText('Bubble line (liquid)', X(.05), Y(p4) - 14); ctx.fillStyle = op; ctx.fillText('Dew line (vapor)', X(.55), Y(p4) + 36);
      ctx.fillStyle = '#c98a00'; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(z), Y(pb), 7, 0, 7); ctx.fill(); ctx.stroke();
    };
    rng('vl-t', draw); rng('vl-c', draw);
  }

  /* 9. Loop-check schematic */
  function loop() {
    put('v-loop',
      svg('0 0 340 130',
        '<rect x="8" y="40" width="64" height="40" class="bx"/><text x="40" y="64" class="tg" text-anchor="middle">24 VDC</text>' +
        '<rect x="92" y="40" width="64" height="40" class="bx"/><text x="124" y="64" class="tg" text-anchor="middle">Barrier</text>' +
        '<rect x="176" y="40" width="64" height="40" class="bx"/><text x="208" y="64" class="tg" text-anchor="middle">Xmtr</text>' +
        '<rect x="260" y="40" width="72" height="40" class="bx"/><text x="296" y="64" class="tg" text-anchor="middle">PLC AI 250 &#937;</text>' +
        '<path d="M72 52 H92 M156 52 H176 M240 52 H260 M296 80 V108 H40 V80" fill="none" stroke="var(--ink)" stroke-width="2"/>' +
        [[82, 'TP1'], [166, 'TP2'], [250, 'TP3'], [296, 'TP4']].map(function (t, i) { return '<circle class="tp" data-tp="' + i + '" cx="' + t[0] + '" cy="' + (i === 3 ? 108 : 52) + '" r="8"/><text x="' + t[0] + '" y="' + (i === 3 ? 126 : 34) + '" class="tg" text-anchor="middle">' + t[1] + '</text>'; }).join(''), 'Analog loop check schematic') +
      sl('lp-i', 'Loop current', 3.5, 22, .1, 12, 'mA') + '<div class="row" id="lp-btns"><button type="button" data-tp="0">TP1 supply</button><button type="button" data-tp="1">TP2 barrier</button><button type="button" data-tp="2">TP3 xmtr</button><button type="button" data-tp="3">TP4 sense</button></div>' +
      '<div class="result" id="lp-out"></div><p class="note">Typical values: barrier 300 &#937;, sense resistor 250 &#937;, wire 20 &#937;. Transmitters usually need 12 V or more at their terminals.</p>');
    var sel = 3;
    var draw = function () {
      var I = Number($('#lp-i')?.value) / 1000, v = [24, I * 300, 24 - I * 570, I * 250], n = ['Supply terminals', 'Across barrier', 'Transmitter terminals', 'Across PLC sense resistor'];
      document.querySelectorAll('#v-loop .tp').forEach(function (c) { c.classList.toggle('on', Number(c.dataset.tp) === sel); });
      put('lp-out', '<div class="big">' + f(v[sel], 2) + ' V DC</div><p class="sub">Meter reads ' + n[sel] + ' at ' + f(I * 1000, 1) + ' mA. Expect 1.00 to 5.00 V across TP4 for a healthy 4 to 20 mA loop.</p>' +
        (v[2] < 12 ? '<span class="status fault">Transmitter terminals below 12 V: loop is overloaded</span>' : '<span class="status ok">Loop voltage budget OK</span>'));
    };
    document.querySelectorAll('#lp-btns button, #v-loop .tp').forEach(function (b) { b.addEventListener('click', function () { sel = Number(b.dataset.tp); draw(); }); });
    rng('lp-i', draw);
  }

  /* 10. ESD sequence */
  function seq() {
    put('v-seq', '<div id="sq-svg"></div>' + sl('sq-t', 'ESDV closing time', 2, 10, .5, 5, 's') + '<div class="row"><button type="button" id="sq-go" class="primary">Run sequence</button></div><p class="note">Bars show when each action starts and finishes. The run plays at 3x speed.</p>');
    var draw = function (prog) {
      var ct = Number($('#sq-t')?.value) || 5;
      var rows = [['Gas L2 confirmed', 0, .2], ['PLC trip output', .2, .5], ['Pump power trip', .5, .8], ['Suction ESDV closing', .5, .5 + ct], ['Discharge ESDV closing', .5, .5 + ct + 1], ['FAP signal', 1, 1.5], ['Deluge starts', 10, 12]];
      var X = function (t) { return 110 + t / 12 * 180; };
      var body = rows.map(function (r, i) {
        var y = 10 + i * 26, done = prog >= r[2], act = prog >= r[1] && !done;
        return '<text x="106" y="' + (y + 12) + '" class="tg" text-anchor="end">' + r[0] + '</text><rect x="' + X(r[1]) + '" y="' + y + '" width="' + Math.max(3, X(r[2]) - X(r[1])) + '" height="16" class="sqb ' + (done ? 'done' : (act ? 'act' : '')) + '"/>';
      }).join('');
      put('sq-svg', svg('0 0 300 200', body + '<line x1="' + X(Math.min(prog, 12)) + '" x2="' + X(Math.min(prog, 12)) + '" y1="4" y2="194" stroke="var(--alarm)" stroke-width="2"/><text x="110" y="198" class="tg">0 s</text><text x="290" y="198" class="tg" text-anchor="end">12 s</text>', 'Emergency shutdown sequence'));
    };
    var raf = 0;
    $('#sq-go')?.addEventListener('click', function () {
      cancelAnimationFrame(raf); if (batt()) { draw(12); return; }
      var t0 = performance.now(); (function step(now) { var p = Math.min(12, (now - t0) / 1000 * 3); draw(p); if (p < 12) raf = requestAnimationFrame(step); })(t0);
    });
    rng('sq-t', function () { draw(12); }); draw(0);
  }

  function init(c) {
    C = c || {}; E = C.E; if (!E) return;
    [fgd, tank, dpv, qh, sld, esdv, cav, vle, loop, seq].forEach(function (fn) { try { fn(); } catch (e) { /* keep other diagrams alive */ } });
  }
  root.LpgVisuals = {
    init: init,
    setMargin: function (m) { margin = Math.max(-3, Math.min(3, Number(m) || 0)); var el = $('#cv-m'); if (el) { el.value = margin; el.dispatchEvent(new Event('input')); } },
    tick: function () { if ($('#visuals')?.hidden === false && qhDraw) qhDraw(); }
  };
})(window);
