// Client for the GV print agent (print-agent/ on the computer the TSC printer is plugged into, 127.0.0.1:9101).
// A sticker row is drawn to a 1-bit bitmap (SVG foreignObject -> canvas at 203 dpi) and sent with the exact label size,
// so the paper form picked in Chrome / the driver no longer decides the row height. Shared by the AIS page and the sticker pages.
window.GVAgent = (function () {
  var URL_ = 'http://127.0.0.1:9101';

  // true when the agent answers; false when it is not running
  function ping() {
    return fetch(URL_ + '/ping', { signal: AbortSignal.timeout(900) }).then(function (r) { return r.ok; }, function () { return false; });
  }

  // innerHtml is drawn on a widthMm x heightMm white page with cssText applied; returns {w,h,data} (data = base64 bitmap, MSB first, 1 = black)
  async function raster(innerHtml, cssText, widthMm, heightMm) {
    var dpm = 203 / 25.4, W = Math.ceil(widthMm * dpm / 8) * 8, H = Math.round(heightMm * dpm), k = W / (widthMm * 96 / 25.4);
    var css = String(cssText).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject width="' + W + '" height="' + H + '">'
      + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + widthMm + 'mm;height:' + heightMm + 'mm;transform:scale(' + k + ');transform-origin:0 0;overflow:hidden;background:#fff">'
      + '<style>' + css + '</style>' + innerHtml + '</div></foreignObject></svg>';
    var img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
    var px = g.getImageData(0, 0, W, H).data, bytes = new Uint8Array(W / 8 * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4, lum = px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11;
      if (px[i + 3] > 40 && lum < 165) bytes[y * (W / 8) + (x >> 3)] |= 0x80 >> (x & 7);
    }
    var bin = ''; for (var j = 0; j < bytes.length; j += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 8192));
    return { w: W, h: H, data: btoa(bin) };
  }

  // rows: [{html, copies?}] in print order; identical consecutive rows are merged into copies, identical rows are rasterised once.
  // Returns {ok, error, handled}: handled=false means the caller should fall back to the browser print dialog.
  async function printRows(printer, widthMm, heightMm, rows, draw) {
    var jobs = [], cache = new Map();
    for (var n = 0; n < rows.length; n++) {
      var html = rows[n], last = jobs[jobs.length - 1];
      if (last && last.html === html) { last.copies++; continue; }
      if (!cache.has(html)) cache.set(html, await draw(html));
      jobs.push({ html: html, copies: 1, w: cache.get(html).w, h: cache.get(html).h, data: cache.get(html).data });
    }
    var res = await fetch(URL_ + '/print', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ printer: printer, widthMm: widthMm, heightMm: heightMm, gapMm: 3, jobs: jobs.map(function (j) { return { w: j.w, h: j.h, data: j.data, copies: j.copies }; }) })
    });
    var b = await res.json().catch(function () { return {}; });
    return { ok: res.ok, error: b.error || b.result || '', handled: res.ok || !/ยังไม่รองรับ/.test(b.error || '') };
  }

  return { ping: ping, raster: raster, printRows: printRows };
})();
