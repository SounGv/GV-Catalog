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
  const endLabel = els.printCopies.parentElement;
  endLabel.firstChild.nodeValue = 'ถึงใบที่ ';
  els.printCopies.placeholder = 'ใบสุดท้าย';
  const startLabel = document.createElement('label');
  startLabel.className = 'print-control';
  startLabel.innerHTML = 'เริ่มจากใบที่ <input id="printFrom" type="number" min="1" step="1" value="1">';
  endLabel.before(startLabel);
  const ui = Object.fromEntries(['printPlFilter', 'printSkuFilter', 'printCartonFilter', 'printRowFilter', 'printKindFilter', 'printSelectionTable', 'printSelectionCount', 'printRangeError', 'printRowsPage', 'printRowsPrev', 'printRowsNext', 'printFrom'].map(id => [id, document.getElementById(id)]));
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
    const result = [];
    for (const group of [...groups.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      for (const row of group.rows) result.push({ ...row, totalSingleCartons: group.total, index: result.length + 1 });
    }
    return result;
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
    try {
      const p = plan();
      ui.printRangeError.textContent = '';
      ui.printFrom.max = els.printCopies.max = p.total || 1;
      renderRows(p);
      els.directPrint.disabled = !p.pages.length;
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

  function print() {
    let p;
    try { p = plan(); if (!p.pages.length) throw Error('ไม่มีใบพิมพ์ในรายการและช่วงที่เลือก'); }
    catch (e) { app.toast(e.message, true); return; }
    if (!app.requireLot()) return;
    const w = window.open('', '_blank');
    if (!w) return app.toast('เบราว์เซอร์บล็อกหน้าพิมพ์ กรุณาอนุญาต Pop-up', true);
    try { w.document.open(); w.document.write(printable(p)); w.document.close(); }
    catch (e) { w.close(); app.toast(e.message || 'สร้างหน้าพิมพ์ไม่สำเร็จ', true); }
  }

  function reset() {
    excluded.clear();
    tablePage = 0;
    ui.printSkuFilter.value = ui.printCartonFilter.value = ui.printRowFilter.value = '';
    ui.printKindFilter.value = 'all';
    ui.printPlFilter.innerHTML = '<option value="">ทุก PL</option>' + [...new Set(queue().map(r => r.sourceId))].sort().map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join('');
    ui.printFrom.value = '1';
    els.printCopies.value = '';
  }

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
  return { queue, labels, plan, render, printable, print, reset };
}
