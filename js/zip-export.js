/* LPG SCADA Field Guide - in-browser ZIP generator. Exposes window.LpgZip only; never runs init. */
(function (root) {
  'use strict';
  var FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'offline.html', 'robots.txt', 'favicon.svg', 'css/styles.css', 'js/app.js', 'js/scada-engine.js', 'js/visuals.js', 'js/panels.js', 'js/zip-export.js'];
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toBlob(c) { return new Promise(function (res) { c.toBlob(res, 'image/png'); }); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Tank + flame mark, drawn in a unit box (u = size). pad = fraction kept clear for maskable safe zone.
  function mark(ctx, x0, y0, u) {
    ctx.fillStyle = '#d3d7da'; rr(ctx, x0 + u * .125, y0 + u * .47, u * .75, u * .31, u * .155); ctx.fill();
    ctx.fillStyle = '#8b939b'; ctx.fillRect(x0 + u * .40, y0 + u * .47, u * .06, u * .31); ctx.fillRect(x0 + u * .58, y0 + u * .47, u * .06, u * .31);
    ctx.fillStyle = '#c98a00'; ctx.beginPath();
    ctx.moveTo(x0 + u * .5, y0 + u * .12);
    ctx.bezierCurveTo(x0 + u * .53, y0 + u * .27, x0 + u * .66, y0 + u * .30, x0 + u * .66, y0 + u * .39);
    ctx.arc(x0 + u * .5, y0 + u * .39, u * .16, 0, Math.PI, false);
    ctx.bezierCurveTo(x0 + u * .34, y0 + u * .32, x0 + u * .38, y0 + u * .27, x0 + u * .5, y0 + u * .12);
    ctx.fill();
  }
  function icon(size, maskable) {
    var c = canvas(size, size), ctx = c.getContext('2d');
    ctx.fillStyle = '#2b3036';
    if (maskable) ctx.fillRect(0, 0, size, size); else { rr(ctx, 0, 0, size, size, size * .19); ctx.fill(); }
    var inner = maskable ? size * .62 : size * .86; var off = (size - inner) / 2;
    mark(ctx, off, off, inner);
    return c;
  }
  function banner(w, h, title, sub) {
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#2b3036'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c98a00'; ctx.fillRect(0, h - h * .02, w, h * .02);
    var u = Math.min(w, h) * (w > h ? .62 : .4); mark(ctx, w > h ? w * .05 : (w - u) / 2, w > h ? (h - u) / 2 : h * .12, u);
    ctx.fillStyle = '#f1f3f4'; ctx.textBaseline = 'middle';
    var fs = Math.round(Math.min(w, h) * (w > h ? .1 : .06));
    ctx.font = '700 ' + fs + 'px "Arial Narrow", Arial, sans-serif';
    if (w > h) { ctx.textAlign = 'left'; ctx.fillText(title, w * .05 + u + w * .03, h * .44); ctx.font = fs * .55 + 'px Arial, sans-serif'; ctx.fillStyle = '#b9c0c6'; ctx.fillText(sub, w * .05 + u + w * .03, h * .58); }
    else { ctx.textAlign = 'center'; ctx.fillText(title, w / 2, h * .66); ctx.font = fs * .7 + 'px Arial, sans-serif'; ctx.fillStyle = '#b9c0c6'; ctx.fillText(sub, w / 2, h * .72); }
    return c;
  }
  // Wrap a 32x32 PNG into an ICO container (PNG-in-ICO)
  async function ico() {
    var png = new Uint8Array(await (await toBlob(icon(32, false))).arrayBuffer());
    var buf = new ArrayBuffer(22 + png.length), dv = new DataView(buf);
    dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, 1, true);
    dv.setUint8(6, 32); dv.setUint8(7, 32); dv.setUint8(8, 0); dv.setUint8(9, 0);
    dv.setUint16(10, 1, true); dv.setUint16(12, 32, true); dv.setUint32(14, png.length, true); dv.setUint32(18, 22, true);
    new Uint8Array(buf, 22).set(png);
    return new Blob([buf], { type: 'image/x-icon' });
  }
  function loadJSZip() {
    if (root.JSZip) return Promise.resolve(root.JSZip);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = JSZIP_URL; s.onload = function () { res(root.JSZip); }; s.onerror = function () { rej(new Error('JSZip failed to load')); };
      document.head.appendChild(s);
    });
  }
  async function build() {
    var JSZip = await loadJSZip(); var zip = new JSZip();
    for (var i = 0; i < FILES.length; i++) {
      var r = await fetch(FILES[i], { cache: 'no-cache' }); if (!r.ok) throw new Error('Missing ' + FILES[i]);
      zip.file(FILES[i], await r.text());
    }
    [72, 96, 128, 144, 152, 192, 384, 512].forEach(function (s) { zip.file('icons/icon-' + s + '.png', toBlob(icon(s, false))); });
    [192, 512].forEach(function (s) { zip.file('icons/icon-maskable-' + s + '.png', toBlob(icon(s, true))); });
    zip.file('apple-touch-icon.png', toBlob(icon(180, true)));
    zip.file('favicon.ico', ico());
    zip.file('images/og-image.png', toBlob(banner(1200, 630, 'LPG Pumping SCADA Field Guide', 'Dubai UAE \u00b7 AGAC.ae \u00b7 ISA-101')));
    zip.file('screenshots/screenshot-narrow.png', toBlob(banner(540, 960, 'LPG SCADA', 'Field guide for Dubai')));
    zip.file('screenshots/screenshot-wide.png', toBlob(banner(1280, 720, 'LPG Pumping SCADA', 'Design \u00b7 PLC \u00b7 SCADA \u00b7 Tools')));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }
  async function download() {
    var blob = await build(); var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'scada-LPG-Pumping-guide.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  root.LpgZip = { build: build, download: download, icon: icon };
})(window);
