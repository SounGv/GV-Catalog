/**
 * Shared offline PDF -> table reader for the PO converter tools.
 *
 * Turns the text layer of a PDF into the same `[{ name, rows: string[][] }]`
 * shape the Excel readers produce, so each tool's existing header detection
 * and parsing runs unchanged. Layout-based (no OCR): it only works for PDFs
 * that contain real text arranged in a table, not scanned images.
 */
(function (root) {
  'use strict';
  const BASE = (() => {
    try { return new URL('.', document.currentScript.src).href; } catch { return '/tools/shared/'; }
  })();
  let libPromise;
  function lib() {
    if (!libPromise) {
      libPromise = import(BASE + 'pdf.mjs').then((m) => {
        m.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.mjs';
        return m;
      });
    }
    return libPromise;
  }

  const median = (list) => {
    const s = [...list].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  // Group text fragments of one page into visual lines, then merge fragments of a line into cells.
  function pageLines(items) {
    const frags = items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.height || i.transform[3]) || 8 }));
    if (!frags.length) return [];
    const tol = Math.max(1.5, median(frags.map((f) => f.h)) * 0.5);
    frags.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const f of frags) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - f.y) <= tol) last.frags.push(f);
      else lines.push({ y: f.y, frags: [f] });
    }
    return lines.map((line) => {
      line.frags.sort((a, b) => a.x - b.x);
      const cells = [];
      for (const f of line.frags) {
        const prev = cells[cells.length - 1];
        const gap = prev ? f.x - prev.end : Infinity;
        if (prev && gap <= Math.max(2, f.h * 0.45)) {
          prev.str += (gap > 0.5 && !/\s$/.test(prev.str) ? ' ' : '') + f.str;
          prev.end = Math.max(prev.end, f.x + f.w);
        } else cells.push({ str: f.str, x: f.x, end: f.x + f.w });
      }
      return cells;
    });
  }

  // Column boundaries = vertical gaps in the text of rows that look like table rows (>= 3 cells).
  function columnStarts(rows) {
    const tableRows = rows.filter((r) => r.length >= 3);
    const source = tableRows.length ? tableRows : rows;
    const spans = source.flat().map((c) => [c.x, c.end]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of spans) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1] + 1.5) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    return merged.map((m) => m[0]);
  }

  async function read(file) {
    const pdfjs = await lib();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const rows = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      rows.push(...pageLines(content.items));
    }
    if (!rows.length) throw Error(`${file.name}: PDF นี้ไม่มีข้อความ (เป็นรูปสแกน) อ่านไม่ได้ กรุณาส่งออกเป็นไฟล์ Excel`);
    const starts = columnStarts(rows);
    const colOf = (x) => {
      let c = 0;
      for (let i = 0; i < starts.length; i++) if (x >= starts[i] - 1.5) c = i;
      return c;
    };
    const grid = rows.map((cells) => {
      const row = new Array(starts.length).fill('');
      for (const cell of cells) {
        const c = colOf(cell.x);
        row[c] = row[c] ? row[c] + ' ' + cell.str : cell.str;
      }
      return row;
    });
    return [{ name: 'PDF', rows: grid }];
  }

  root.PdfRows = { read };
})(window);
