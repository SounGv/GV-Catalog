/* Print page numbers always refer to the complete job, before filtering. */
function createPackingPrint(app) {
  const { state, els, key, text, numeric, cartonNumbers, cartonOrder, cartonLabel, esc } = app;
  const excluded = new Set();
  let tablePage = 0;
  const pageSize = 50;
  const section = document.createElement('section');
  section.className = 'print-selection';
  section.innerHTML = `
    <h3>เลือกรายการพิมพ์</h3>
    <div class="selection-fields">
      <label>เรียงลำดับใบ<select id="printSort"><option value="sku-all">ตามรุ่น · ทุกใบของรุ่นเดียวกันออกติดกัน (รวมลังรวม)</option><option value="sku">ตามรุ่น · ลังรวมแยกไว้ท้าย</option><option value="loc">ตามที่เก็บ (Picking Location)</option><option value="ctn">ตามเลขลัง CTN (แบบเดิม)</option></select></label>
      <label>PL<select id="printPlFilter"><option value="">ทุก PL</option></select></label>
      <label>รุ่น / SKU<textarea id="printSkuFilter" rows="2" placeholder="20134, 25830"></textarea></label>
      <label>เลขลังจริง<input id="printCartonFilter" placeholder="900-907, 912"></label>
      <label>แถวพิมพ์<input id="printRowFilter" placeholder="1-5, 12"></label>
      <label>ประเภทลัง<select id="printKindFilter"><option value="all">ทั้งหมด</option><option value="single">ลังรุ่นเดียว</option><option value="mixed">ลังรวมหลายรุ่น</option></select></label>
    </div>
    <div class="selection-toolbar"><button id="printSelectAll" type="button">เลือกทั้งหมดที่กรอง</button><button id="printSelectNone" type="button">ไม่เลือกทั้งหมดที่กรอง</button><button id="printClear" type="button">ล้างตัวกรองและช่วงพิมพ์</button><span id="printSelectionCount"></span></div>
    <div class="table-wrap print-row-list"><table id="printSelectionTable"></table></div>
    <div class="selection-toolbar"><button id="printRowsPrev" type="button">ก่อนหน้า</button><span id="printRowsPage"></span><button id="printRowsNext" type="button">ถัดไป</button></div>
    <div id="printRangeError" role="alert"></div>`;
  els.printCard.querySelector('.print-controls').after(section);
  const batchBar = document.createElement('div');
  batchBar.className = 'print-batch';
  batchBar.innerHTML = '<label class="print-control">แบ่งพิมพ์ชุดละ <input id="printBatchSize" type="number" min="1" max="500" step="1" value="30"> ใบ</label><span id="printBatchStatus" role="status"></span><button id="printBatchAll" type="button">พิมพ์ทั้งหมดรวดเดียว</button><button id="printBatchRepeat" type="button" hidden>พิมพ์ชุดล่าสุดซ้ำ</button><button id="printBatchRestart" type="button" hidden>เริ่มชุดแรกใหม่</button>';
  els.printCard.querySelector('.print-controls').after(batchBar);
  const batchUi = { size: batchBar.querySelector('#printBatchSize'), status: batchBar.querySelector('#printBatchStatus'), repeat: batchBar.querySelector('#printBatchRepeat'), all: batchBar.querySelector('#printBatchAll'), restart: batchBar.querySelector('#printBatchRestart') };
  let batchKey = '', batchDone = 0, batchLast = null;
  const batchSize = () => Math.max(1, Math.min(500, Math.floor(Number(batchUi.size.value)) || 30));
  const keyOf = p => `${p.job}|${p.pages.length}|${p.pages[0]?.number}|${p.pages.at(-1)?.number}`;
  function syncBatch(p) {
    const k = keyOf(p);
    if (k !== batchKey) { batchKey = k; batchDone = 0; batchLast = null; }
    const total = p.pages.length, size = batchSize();
    if (total <= size && !batchDone) {
      batchUi.status.textContent = total ? `${total} ใบ — พิมพ์ครั้งเดียว` : '';
      els.directPrint.textContent = els.directPrint.dataset.label || (els.directPrint.dataset.label = els.directPrint.textContent);
    } else if (batchDone >= total) {
      batchUi.status.textContent = `พิมพ์ครบแล้ว ${total}/${total} ใบ`;
      els.directPrint.textContent = 'พิมพ์ครบแล้ว';
    } else {
      const to = Math.min(batchDone + size, total);
      batchUi.status.textContent = `พิมพ์แล้ว ${batchDone}/${total} ใบ · ชุดถัดไป ใบที่ ${batchDone + 1}-${to}`;
      els.directPrint.dataset.label ||= els.directPrint.textContent;
      els.directPrint.textContent = batchDone ? `พิมพ์ชุดถัดไป (${batchDone + 1}-${to})` : `พิมพ์ชุดแรก (1-${to})`;
    }
    els.directPrint.disabled = !total || batchDone >= total;
    batchUi.all.hidden = total <= size && !batchDone;
    batchUi.repeat.hidden = !batchLast;
    batchUi.restart.hidden = !batchDone;
  }
  const endLabel = els.printCopies.parentElement;
  endLabel.firstChild.nodeValue = 'ถึงใบที่ ';
  els.printCopies.placeholder = 'ใบสุดท้าย';
  const startLabel = document.createElement('label');
  startLabel.className = 'print-control';
  startLabel.innerHTML = 'เริ่มจากใบที่ <input id="printFrom" type="number" min="1" step="1" value="1">';
  endLabel.before(startLabel);
  const ui = Object.fromEntries(['printSort', 'printPlFilter', 'printSkuFilter', 'printCartonFilter', 'printRowFilter', 'printKindFilter', 'printSelectionTable', 'printSelectionCount', 'printRangeError', 'printRowsPage', 'printRowsPrev', 'printRowsNext', 'printFrom'].map(id => [id, document.getElementById(id)]));
  try { const saved = localStorage.getItem('gv-pl-print-sort'); if (saved) ui.printSort.value = saved; } catch { /* default order */ }
  const sourceCss = '.label-ref{white-space:normal;overflow-wrap:anywhere;font-size:12pt!important;line-height:1.25}';
  const style = document.createElement('style');
  style.textContent = `${sourceCss}
    .print-selection{padding:0 17px 16px;min-width:0}.print-selection h3{font-size:14px;margin:0 0 10px}.selection-fields{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px}.selection-fields label{display:grid;align-content:start;gap:5px;font-size:12px}.selection-fields input,.selection-fields textarea,.selection-fields select{width:100%;min-width:0;font:inherit;padding:8px;border:1px solid #cbd9df;border-radius:6px;background:white;color:var(--ink)}.selection-fields textarea{resize:vertical}.selection-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;font-size:12px}.selection-toolbar button{font:inherit;padding:7px 10px;border:1px solid #cbd9df;border-radius:6px;background:#fff;color:var(--ink)}button:disabled{opacity:.45;cursor:default}.print-row-list{max-height:310px}.print-row-list table{min-width:780px}.print-row-list input[type=checkbox]{width:18px;height:18px;accent-color:var(--green)}.print-row-list tr[data-kind=mixed] td{background:#edf3fa}.print-head{flex-wrap:wrap}.print-head .status{white-space:normal;line-height:1.5}#printRangeError{color:var(--red);font-size:13px;line-height:1.5}.print-control input[type=number]{width:105px}.results>.card{min-width:0}@media(max-width:700px){.selection-fields{grid-template-columns:1fr 1fr}}@media(max-width:420px){.selection-fields{grid-template-columns:1fr}.selection-toolbar button{flex:1}}`;
  document.head.append(style);

  function queue() {
    const groups = new Map();
    for (const record of state.records) {
      const id = 'single:' + key(record.item);
      if (!groups.has(id)) groups.set(id, { id, rows: [], order: Infinity, total: 0 });
      const group = groups.get(id);
      const pieces = record.pieces?.length ? record.pieces : cartonNumbers(record).map(ctn => ({ ...record, display: ctn }));
      for (const piece of pieces) {
        const ctn = piece.display;
        group.rows.push({ ctn, record: piece, sourceId: piece.sourceId || piece.file || 'PL', kind: 'single', groupId: id });
        group.order = Math.min(group.order, cartonOrder(ctn));
        group.total++;
      }
    }
    for (const group of state.mixedGroups) {
      const id = 'mixed:' + (group.id || JSON.stringify([group.sourceId || group.file || 'PL', group.ctn]));
      groups.set(id, { id, total: 1, order: cartonOrder(group.ctn), rows: group.items.map(record => ({
        ctn: group.ctn, record, sourceId: group.sourceId || group.file || 'PL', kind: 'mixed', groupId: id
      })) });
    }
    // Order of the printed labels. "sku" / "loc": every label of one model comes out together, models in
    // SKU or picking-location order, mixed cartons last (by CTN). "ctn": the old order by first CTN.
    const mode = ui?.printSort?.value || 'sku-all';
    const byCtn = (a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true });
    const sku = g => text(g.rows[0]?.record.item);
    const loc = g => text(g.rows[0]?.record.loc) || '\uffff';
    const compare = mode === 'ctn' ? byCtn : (a, b) => {
      const mixedA = a.id.startsWith('mixed:'), mixedB = b.id.startsWith('mixed:');
      if (mixedA !== mixedB) return mixedA ? 1 : -1;
      if (mixedA) return byCtn(a, b);
      if (mode === 'loc') { const d = loc(a).localeCompare(loc(b), undefined, { numeric: true }); if (d) return d; }
      return sku(a).localeCompare(sku(b), undefined, { numeric: true }) || byCtn(a, b);
    };
    for (const group of groups.values()) group.rows.sort((a, b) => cartonOrder(a.ctn) - cartonOrder(b.ctn));
    let rows = [...groups.values()].sort(compare).flatMap(group => group.rows.map(row => ({ ...row, totalSingleCartons: group.total })));
    if (mode === 'sku-all') {
      // Every label of one model together, whether its carton is single-model or mixed: SKU, then
      // single-model cartons before mixed ones, then carton number.
      rows = rows.map((row, i) => ({ row, i })).sort((a, b) =>
        text(a.row.record.item).localeCompare(text(b.row.record.item), undefined, { numeric: true }) ||
        (a.row.kind === b.row.kind ? 0 : a.row.kind === 'single' ? -1 : 1) ||
        cartonOrder(a.row.ctn) - cartonOrder(b.row.ctn) || a.i - b.i).map(x => x.row);
    }
    return rows.map((row, i) => ({ ...row, index: i + 1 }));
  }

  function parseRanges(value, label) {
    if (!text(value)) return () => true;
    const ranges = text(value).split(/[\s,;]+/).filter(Boolean).map(part => {
      const m = part.match(/^(\d+)(?:[-–](\d+))?$/);
      if (!m) throw Error(`${label}: ใส่เลขหรือช่วง เช่น 1-5, 12`);
      const a = Number(m[1]), b = Number(m[2] || m[1]);
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 1 || b < a) throw Error(`${label}: ช่วงตัวเลขไม่ถูกต้อง`);
      return [a, b];
    });
    return value => ranges.some(([a, b]) => Number(value) >= a && Number(value) <= b);
  }

  function candidates(rows) {
    const skus = new Set(text(ui.printSkuFilter.value).split(/[\s,;]+/).filter(Boolean).map(key));
    const cartonMatch = parseRanges(ui.printCartonFilter.value, 'เลขลังจริง');
    const rowMatch = parseRanges(ui.printRowFilter.value, 'แถวพิมพ์');
    const hits = rows.filter(r => (!ui.printPlFilter.value || r.sourceId === ui.printPlFilter.value) && (!skus.size || skus.has(key(r.record.item)) || skus.has(key(r.record.sourceItem))) &&
      cartonMatch(r.ctn) && rowMatch(r.index) && (ui.printKindFilter.value === 'all' || r.kind === ui.printKindFilter.value));
    // A mixed carton is selected as a unit, even when a single member matched a SKU/row filter.
    const mixed = new Set(hits.filter(r => r.kind === 'mixed').map(r => r.groupId));
    const indexes = new Set(hits.map(r => r.index));
    return rows.filter(r => indexes.has(r.index) || mixed.has(r.groupId));
  }

  function jobId(rows) {
    let hash = 2166136261;
    const input = JSON.stringify(['v48', text(state.lot), rows.map(r => [r.sourceId, r.ctn, r.kind, r.record.item, r.record.qty, r.record.gtin, r.record.loc, r.totalSingleCartons])]);
    for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  // "Printed" marks, one per label row (2 pages), keyed by what the row is rather than its place in
  // the queue, so changing the order keeps the ticks. Kept in this browser per set of PL rows.
  let printedStore = '';
  let printed = new Set();
  function rowKeys(rows) {
    const seen = new Map();
    return rows.map(r => {
      const base = [r.sourceId, r.ctn, r.kind, key(r.record.item), r.record.qty].join('|');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return base + '#' + n;
    });
  }
  function loadPrinted(rows) {
    const keys = rowKeys(rows);
    let hash = 2166136261;
    const input = [...keys].sort().join('\n');
    for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
    const storeKey = 'gv-pl-printed:' + (hash >>> 0).toString(16);
    if (storeKey !== printedStore) {
      printedStore = storeKey;
      try { printed = new Set(JSON.parse(localStorage.getItem(storeKey) || '[]')); } catch { printed = new Set(); }
    }
    return keys;
  }
  function savePrinted() {
    try { localStorage.setItem(printedStore, JSON.stringify([...printed])); } catch { /* ticks then last until reload only */ }
  }
  /** Marks the rows whose two pages were both in a print job. */
  function markPrintedPages(pages) {
    const rows = queue(), keys = loadPrinted(rows), count = new Map();
    for (const page of pages) count.set(page.row.index, (count.get(page.row.index) || 0) + 1);
    for (const [index, n] of count) if (n >= 2) printed.add(keys[index - 1]);
    savePrinted();
  }
  const pagesOf = rows => rows.flatMap(row => [0, 1].map(copy => ({ row, number: (row.index - 1) * 2 + copy + 1, side: copy === 0 ? 'ซ้าย' : 'ขวา' })));

  function plan() {
    const rows = queue(), total = rows.length * 2, available = candidates(rows);
    if (!total) return { rows, available, pages: [], total, job: '' };
    const from = Number(ui.printFrom.value), to = text(els.printCopies.value) ? Number(els.printCopies.value) : total;
    if (!Number.isInteger(from) || from < 1 || from > total) throw Error(`เริ่มจากใบที่: ใส่เลข 1-${total}`);
    if (!Number.isInteger(to) || to < from || to > total) throw Error(`ถึงใบที่: ใส่เลข ${from}-${total}`);
    const pages = [];
    for (const row of available) {
      if (excluded.has(row.index)) continue;
      for (let copy = 0; copy < 2; copy++) {
        const number = (row.index - 1) * 2 + copy + 1;
        if (number >= from && number <= to) pages.push({ row, number, side: copy === 0 ? 'ซ้าย' : 'ขวา' });
      }
    }
    return { rows, available, pages, total, from, to, job: jobId(rows) };
  }

  function label(page) {
    const { row } = page;
    const html = cartonLabel(row.record, row.kind === 'single' ? row.totalSingleCartons : row.ctn);
    return html.replace('<article class="carton-label">', `<article class="carton-label" data-print-page="${page.number}">`);
  }

  function labels(limit = null, p = plan()) {
    return (limit == null ? p.pages : p.pages.slice(0, limit)).map(label).join('');
  }

  function renderRows(p) {
    const count = Math.max(1, Math.ceil(p.available.length / pageSize));
    tablePage = Math.min(tablePage, count - 1);
    const visible = p.available.slice(tablePage * pageSize, (tablePage + 1) * pageSize);
    ui.printSelectionTable.innerHTML = '<thead><tr><th>เลือก</th><th>แถวพิมพ์</th><th>เลขใบ</th><th>PL</th><th>รุ่น / SKU</th><th>QTY</th><th>ประเภท</th><th>เลขลังจริง</th><th>ยอดลังรุ่นเดียว</th></tr></thead><tbody>' + visible.map(r =>
      `<tr data-kind="${r.kind}"><td><input type="checkbox" data-print-row="${r.index}" aria-label="เลือกแถวพิมพ์ ${r.index}" ${excluded.has(r.index) ? '' : 'checked'}></td><td>${r.index}</td><td>${r.index * 2 - 1}-${r.index * 2}</td><td title="${esc(r.record.file)}">${esc(r.record.file)}</td><td>${esc(r.record.item)}</td><td>${esc(r.record.qty)}</td><td>${r.kind === 'mixed' ? 'ลังรวม' : 'รุ่นเดียว'}</td><td>${esc(r.ctn)}</td><td>${r.kind === 'single' ? r.totalSingleCartons : '-'}</td></tr>`
    ).join('') + '</tbody>';
    ui.printRowsPage.textContent = `หน้าตาราง ${tablePage + 1}/${count}`;
    ui.printRowsPrev.disabled = tablePage === 0;
    ui.printRowsNext.disabled = tablePage + 1 >= count;
    ui.printSelectionCount.textContent = `${p.available.filter(r => !excluded.has(r.index)).length}/${p.available.length} แถว · ${p.pages.length} ใบในช่วงพิมพ์`;
  }

  function render() {
    app.syncLot();
    renderSimple();
    try {
      const p = plan();
      ui.printRangeError.textContent = '';
      ui.printFrom.max = els.printCopies.max = p.total || 1;
      renderRows(p);
      els.directPrint.disabled = !p.pages.length;
      syncBatch(p);
      els.printPreview.innerHTML = p.pages.length ? `<div class="print-grid cartons">${labels(24, p)}</div>` : '<div class="print-empty">ไม่มีใบพิมพ์ในรายการและช่วงที่เลือก</div>';
      els.printStatus.textContent = p.pages.length ? `${p.pages.length} ใบ · เริ่มใบ ${p.pages[0].number} · สุดท้ายใบ ${p.pages.at(-1).number} · งาน ${p.job}` : 'ไม่มีใบที่เลือก';
      const small = document.querySelector('#printModeTabs small');
      if (small) small.textContent = `${p.total} ใบทั้งชุด · ${p.pages.length} ใบที่เลือก`;
    } catch (e) {
      ui.printRangeError.textContent = e.message;
      els.directPrint.disabled = true;
      els.printPreview.innerHTML = '';
      els.printStatus.textContent = 'ช่วงพิมพ์ / ตัวกรองไม่ถูกต้อง';
      ui.printSelectionCount.textContent = '';
      ui.printSelectionTable.innerHTML = '';
    }
  }

  function printable(p = plan()) {
    if (!p.pages.length) throw Error('ไม่มีใบพิมพ์ในรายการและช่วงที่เลือก');
    app.syncLot();
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Carton Labels</title><style>${app.printStyles(app.activePrintProfile())}${sourceCss}</style></head><body><main class="print-document" data-expected-pages="${p.pages.length}">${labels(null, p)}</main><script>window.addEventListener('load',async()=>{await document.fonts.ready;if(document.querySelectorAll('.carton-label').length!==${p.pages.length}){alert('จำนวนใบพิมพ์ไม่ครบ');return}window.print()})<\/script></body></html>`;
  }

  function openPrint(p) {
    const w = window.open('', '_blank');
    if (!w) { app.toast('เบราว์เซอร์บล็อกหน้าพิมพ์ กรุณาอนุญาต Pop-up', true); return false; }
    try { w.document.open(); w.document.write(printable(p)); w.document.close(); return true; }
    catch (e) { w.close(); app.toast(e.message || 'สร้างหน้าพิมพ์ไม่สำเร็จ', true); return false; }
  }

  function print() {
    let p;
    try { p = plan(); if (!p.pages.length) throw Error('ไม่มีใบพิมพ์ในรายการและช่วงที่เลือก'); }
    catch (e) { app.toast(e.message, true); return; }
    if (!app.requireLot()) return;
    syncBatch(p);
    if (batchDone >= p.pages.length) return;
    const from = batchDone, to = Math.min(from + batchSize(), p.pages.length);
    const part = { ...p, pages: p.pages.slice(from, to) };
    if (openPrint(part)) { batchLast = part; batchDone = to; markPrintedPages(part.pages); render(); }
  }

  batchUi.all.addEventListener('click', () => {
    let p;
    try { p = plan(); if (!p.pages.length) throw Error('ไม่มีใบพิมพ์ในรายการและช่วงที่เลือก'); }
    catch (e) { app.toast(e.message, true); return; }
    if (!app.requireLot()) return;
    if (p.pages.length > 100 && !confirm(`พิมพ์ ${p.pages.length} ใบเป็นงานเดียว เครื่องพิมพ์อาจหยุดกลางงานและหน้าพิมพ์โหลดช้า ยืนยันพิมพ์ทั้งหมดหรือไม่?`)) return;
    if (openPrint(p)) { batchLast = p; batchDone = p.pages.length; markPrintedPages(p.pages); render(); }
  });
  batchUi.size.addEventListener('input', render);
  batchUi.restart.addEventListener('click', () => { batchDone = 0; batchLast = null; render(); });
  batchUi.repeat.addEventListener('click', () => { if (batchLast && app.requireLot()) openPrint(batchLast); });

  function reset() {
    excluded.clear();
    tablePage = 0;
    batchKey = ''; batchDone = 0; batchLast = null;
    ui.printSkuFilter.value = ui.printCartonFilter.value = ui.printRowFilter.value = '';
    ui.printKindFilter.value = 'all';
    ui.printPlFilter.innerHTML = '<option value="">ทุก PL</option>' + [...new Set(queue().map(r => r.sourceId))].sort().map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join('');
    ui.printFrom.value = '1';
    els.printCopies.value = '';
  }

  ui.printSort.addEventListener('change', () => {
    try { localStorage.setItem('gv-pl-print-sort', ui.printSort.value); } catch { /* not remembered */ }
    excluded.clear(); tablePage = 0; ui.printFrom.value = '1'; els.printCopies.value = '';
    render();
  });
  for (const id of ['printPlFilter', 'printSkuFilter', 'printCartonFilter', 'printRowFilter', 'printKindFilter']) {
    ui[id].addEventListener(id === 'printKindFilter' || id === 'printPlFilter' ? 'change' : 'input', () => { tablePage = 0; render(); });
  }
  ui.printFrom.addEventListener('input', render);
  ui.printSelectionTable.addEventListener('change', event => {
    const index = Number(event.target.dataset.printRow);
    if (!index) return;
    const rows = queue(), row = rows[index - 1];
    const targets = row.kind === 'mixed' ? rows.filter(r => r.groupId === row.groupId) : [row];
    for (const r of targets) event.target.checked ? excluded.delete(r.index) : excluded.add(r.index);
    render();
  });
  for (const [id, select] of [['printSelectAll', true], ['printSelectNone', false]]) {
    document.getElementById(id).addEventListener('click', () => {
      try { for (const r of candidates(queue())) select ? excluded.delete(r.index) : excluded.add(r.index); render(); }
      catch (e) { app.toast(e.message, true); }
    });
  }
  document.getElementById('printClear').addEventListener('click', () => { reset(); render(); });
  ui.printRowsPrev.addEventListener('click', () => { tablePage--; render(); });
  ui.printRowsNext.addEventListener('click', () => { tablePage++; render(); });
  // ---- Simple print panel: Lot, one "print next" button, and one button per model. Everything
  // else (paper, printer, order, batch size, filters, preview) sits under "ตั้งค่า".
  const simple = document.createElement('div');
  simple.className = 'sp';
  simple.innerHTML = `
    <h3 class="sp-title">พิมพ์ใบแปะลัง</h3>
    <div class="sp-lot" id="spLot"></div>
    <div class="sp-box">
      <div class="sp-prog"><span>② พิมพ์แล้ว</span><b id="spCount">–</b></div>
      <div class="sp-bar"><i id="spBar"></i></div>
      <button class="sp-go" id="spGo" type="button">พิมพ์ต่อ</button>
      <p class="sp-hint">กดปุ่มนี้ซ้ำไปเรื่อยๆ ระบบพิมพ์ต่อจากที่ค้าง และติ๊กว่าพิมพ์แล้วให้เอง</p>
    </div>
    <div class="sp-box">
      <h4>รายการรุ่น</h4>
      <input class="sp-search" id="spSearch" placeholder="ค้นหา SKU หรือยิงบาร์โค้ด" aria-label="ค้นหา SKU">
      <div class="sp-list" id="spList"></div>
    </div>`;
  const settings = document.createElement('details');
  settings.className = 'sp-settings';
  settings.innerHTML = '<summary>⚙ ตั้งค่า</summary>';
  const card = els.printCard;
  const lotLabel = document.getElementById('lotInput')?.closest('label');
  [...card.children].forEach(child => settings.append(child));
  card.append(simple, settings);
  // Settings shows only three choices and the label preview; the older detailed controls stay in the
  // page (hidden) because the print engine still reads them with their defaults.
  const essentials = document.createElement('div');
  essentials.className = 'sp-essentials';
  for (const field of [document.getElementById('printerProfile'), ui.printSort, batchUi.size]) {
    const label = field?.closest('label');
    if (label) essentials.append(label);
  }
  const previewTitle = document.createElement('p');
  previewTitle.className = 'sp-hint';
  previewTitle.textContent = 'ตัวอย่างใบแปะ (24 ใบแรก)';
  for (const child of [...settings.children]) if (child.tagName !== 'SUMMARY' && child !== els.printPreview) child.style.display = 'none';
  settings.querySelector('summary').after(essentials, previewTitle);
  if (els.printPreview.parentElement !== settings) settings.append(els.printPreview);
  if (lotLabel) {
    if (lotLabel.firstChild?.nodeType === Node.TEXT_NODE) lotLabel.firstChild.nodeValue = '① เลข Lot / ตู้ ';
    simple.querySelector('#spLot').append(lotLabel);
  }
  const sp = { count: simple.querySelector('#spCount'), bar: simple.querySelector('#spBar'), go: simple.querySelector('#spGo'), search: simple.querySelector('#spSearch'), list: simple.querySelector('#spList') };
  let openModel = '';
  const spStyle = document.createElement('style');
  spStyle.textContent = `.sp{padding:16px 17px;display:grid;gap:12px}.sp-title{margin:0;font-size:17px}
    .sp-lot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-weight:700}.sp-lot label{display:flex!important;align-items:center;gap:8px;flex:1;min-width:220px;margin:0!important;width:auto!important;font-weight:700}.sp-lot input{flex:1;min-height:46px;font-size:16px!important;border:2px solid #185c45!important;border-radius:10px!important;padding:0 12px!important}
    .sp-box{border:1px solid #dbe4df;border-radius:14px;padding:14px;background:#fff}.sp-box h4{margin:0 0 8px;font-size:15px}
    .sp-prog{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px;font-weight:700}.sp-prog b{font-size:22px;font-variant-numeric:tabular-nums}
    .sp-bar{height:14px;border-radius:7px;background:#e2ebe6;overflow:hidden}.sp-bar i{display:block;height:100%;width:0;background:#14773e;transition:width .3s}
    .sp-go{display:block;width:100%;min-height:60px;margin-top:12px;border:0;border-radius:12px;background:#185c45;color:#fff;font:inherit;font-size:18px;font-weight:800;cursor:pointer}.sp-go small{display:block;font-size:13px;font-weight:500;opacity:.9}.sp-go:disabled{background:#8fb9a5;cursor:default}
    .sp-hint{margin:8px 2px 0;color:#5b6670;font-size:13px}
    .sp-search{width:100%;min-height:44px;border:1px solid #cbd9df;border-radius:10px;padding:0 12px;font:inherit;margin-bottom:8px}
    .sp-list{display:grid;gap:6px;max-height:520px;overflow:auto}
    .sp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #dbe4df;border-radius:10px;padding:8px 10px;background:#fff}.sp-row.done{background:#eaf7ef;border-color:#bfe3cc}.sp-row.part{background:#fff6dc;border-color:#f0d58e}
    .sp-sku{font-weight:800;font-size:16px}.sp-meta{color:#5b6670;font-size:12px}
    .sp-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .sp-chip{min-height:42px;border-radius:999px;border:1px solid #cbd9df;background:#fff;padding:0 14px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}
    .sp-chip.print{background:#185c45;color:#fff;border-color:#185c45}.sp-chip.ok{background:#c9ecd6;color:#14773e;border-color:#9fd3b3}.sp-chip.mid{background:#ffe7a6;color:#946200;border-color:#f0cf70}
    .sp-settings{border-top:1px solid #dfe9e3}.sp-essentials{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:0 17px 8px}.sp-essentials label{display:flex!important;flex-direction:column;align-items:stretch!important;gap:4px;width:auto!important;margin:0!important;font-size:13px}.sp-essentials select,.sp-essentials input{min-height:44px;width:100%!important;font-size:15px}.sp-settings>.sp-hint{padding:0 17px}.sp-settings>summary{cursor:pointer;padding:14px 17px;font-weight:700;color:#185c45}`;
  document.head.append(spStyle);

  /**
   * Print units in print order with printed state: one per model for its single-model (full) cartons,
   * and one per mixed carton. A model never includes its labels inside mixed cartons: those print
   * only with their mixed carton.
   */
  function models() {
    const rows = queue(), keys = loadPrinted(rows), byItem = new Map();
    rows.forEach((row, i) => {
      const id = row.kind === 'mixed' ? row.groupId : key(row.record.item);
      const name = row.kind === 'mixed' ? `ลังรวม ${row.ctn}` : row.record.item;
      if (!byItem.has(id)) byItem.set(id, { id, item: name, loc: row.kind === 'mixed' ? '' : row.record.loc, mixed: row.kind === 'mixed', members: [], rows: [], done: 0 });
      if (row.kind === 'mixed') byItem.get(id).members.push(row.record.item);
      const m = byItem.get(id);
      m.rows.push(row);
      if (printed.has(keys[i])) { m.done++; row.printed = true; }
    });
    return { rows, keys, list: [...byItem.values()] };
  }

  function printRows(rows, again = false) {
    if (!rows.length) return;
    if (!app.requireLot()) return;
    const job = { pages: pagesOf(rows) };
    if (openPrint(job)) { markPrintedPages(job.pages); render(); }
    else if (again) render();
  }

  function renderSimple() {
    let data;
    try { data = models(); } catch { return; }
    const { rows, list } = data;
    const doneModels = list.filter(m => m.done === m.rows.length).length;
    const donePages = rows.filter(r => r.printed).length * 2;
    sp.count.textContent = `${doneModels} / ${list.length} รุ่น`;
    sp.bar.style.width = list.length ? `${(doneModels / list.length) * 100}%` : '0';
    const step = Math.max(2, batchSize() - (batchSize() % 2));
    const next = rows.filter(r => !r.printed).slice(0, step / 2);
    if (next.length) {
      const first = next[0].record.item, last = next.at(-1).record.item;
      sp.go.disabled = false;
      sp.go.innerHTML = `พิมพ์ต่อ ${next.length * 2} ใบ<small>${first === last ? `รุ่น ${esc(first)}` : `รุ่น ${esc(first)} → ${esc(last)}`} · พิมพ์แล้ว ${donePages.toLocaleString()} / ${(rows.length * 2).toLocaleString()} ใบ</small>`;
    } else {
      sp.go.disabled = true;
      sp.go.innerHTML = rows.length ? 'พิมพ์ครบทุกรุ่นแล้ว ✓' : 'อัปโหลดไฟล์ก่อน';
    }
    const q = key(sp.search.value);
    const rank = m => (m.done && m.done < m.rows.length ? 0 : m.done === 0 ? 1 : 2);
    const shown = list.filter(m => !q || m.id.includes(q) || key(m.item).includes(q) || m.members.some(x => key(x).includes(q))).sort((a, b) => rank(a) - rank(b));
    sp.list.innerHTML = shown.map(m => {
      const total = m.rows.length, left = total - m.done;
      const state = m.done === total ? 'done' : m.done ? 'part' : '';
      let actions;
      if (state === 'done') {
        actions = openModel === m.id
          ? `<button class="sp-chip" data-sp="again" data-model="${esc(m.id)}" type="button">พิมพ์ซ้ำ</button><button class="sp-chip" data-sp="undo" data-model="${esc(m.id)}" type="button">ยกเลิกติ๊ก</button>`
          : `<button class="sp-chip ok" data-sp="open" data-model="${esc(m.id)}" type="button">✓ พิมพ์แล้ว</button>`;
      } else if (state === 'part') {
        actions = `<button class="sp-chip mid" data-sp="print" data-model="${esc(m.id)}" type="button">พิมพ์ที่เหลือ ${left * 2} ใบ</button>`;
      } else {
        actions = `<button class="sp-chip print" data-sp="print" data-model="${esc(m.id)}" type="button">พิมพ์ ${total * 2} ใบ</button>`;
      }
      const where = m.mixed ? `รุ่น ${m.members.map(esc).join(', ')}` : esc(m.loc || '—');
      return `<div class="sp-row ${state}"><div><div class="sp-sku">${esc(m.item)}</div><div class="sp-meta">${where} · ${total * 2} ใบ${state === 'part' ? ` · พิมพ์ไป ${m.done * 2}/${total * 2}` : ''}</div></div><div class="sp-actions">${actions}</div></div>`;
    }).join('') || '<p class="sp-hint">ไม่พบรุ่นที่ค้นหา</p>';
  }

  sp.go.addEventListener('click', () => {
    const { rows } = models();
    const step = Math.max(2, batchSize() - (batchSize() % 2));
    printRows(rows.filter(r => !r.printed).slice(0, step / 2));
  });
  sp.search.addEventListener('input', renderSimple);
  sp.list.addEventListener('click', event => {
    const button = event.target.closest('[data-sp]');
    if (!button) return;
    const { list, rows, keys } = models();
    const model = list.find(m => m.id === button.dataset.model);
    if (!model) return;
    const action = button.dataset.sp;
    if (action === 'open') { openModel = model.id; renderSimple(); return; }
    openModel = '';
    if (action === 'print') printRows(model.rows.filter(r => !r.printed));
    else if (action === 'again') printRows(model.rows, true);
    else if (action === 'undo') {
      for (const row of model.rows) printed.delete(keys[rows.indexOf(row)]);
      savePrinted();
      render();
    }
  });

  /** Printed state of every model at once: id -> { done, total } label rows. */
  function modelStatusMap() {
    return new Map(models().list.map(m => [m.id, { done: m.done, total: m.rows.length }]));
  }
  /** Prints the single-model (full) carton labels of the given models, in print order. */
  function printModels(items) {
    const ids = new Set(items.map(key));
    printRows(models().rows.filter(r => r.kind === 'single' && ids.has(key(r.record.item))));
  }

  /** Same id the print queue gives a mixed carton. */
  const mixedCartonId = g => 'mixed:' + (g.id || JSON.stringify([g.sourceId || g.file || 'PL', g.ctn]));
  /** Printed state of every mixed carton: carton id -> { done, total } label rows. */
  function cartonStatusMap() {
    const map = new Map();
    for (const row of models().rows) {
      if (row.kind !== 'mixed') continue;
      const s = map.get(row.groupId) || { done: 0, total: 0 };
      s.total++;
      if (row.printed) s.done++;
      map.set(row.groupId, s);
    }
    return map;
  }
  /** Prints the picked models' full cartons and the picked mixed cartons (every label in them), in print order. */
  function printSelection(items, cartonIds) {
    const ids = new Set(items.map(key)), cartons = new Set(cartonIds);
    printRows(models().rows.filter(r => (r.kind === 'single' && ids.has(key(r.record.item))) || cartons.has(r.groupId)));
  }

  return { queue, labels, plan, render, printable, print, reset, modelStatusMap, printModels, mixedCartonId, cartonStatusMap, printSelection };
}
