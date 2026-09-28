(function(){
'use strict';
const C=window.ITCity,$=id=>document.getElementById(id),esc=v=>C.text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={master:IT_CITY_MASTER.rows,masterName:IT_CITY_MASTER.file,orders:[],lines:[],view:'delivery',busy:false};
let task=0,renderTimer;
const statusLabel={match:'ตรงกัน',relabel:'ต้องเปลี่ยนบาร์โค้ด',review:'ต้องตรวจสอบ'};
function error(message){$('error').textContent=message;$('error').hidden=!message}
function busy(value){state.busy=value;$('loading').hidden=!value;for(const id of ['orderFiles','masterFile','sampleButton','resetMaster','printButton','exportButton'])$(id).disabled=value;$('printButton').disabled=$('exportButton').disabled=value||!state.lines.length}
function rematch(){const match=C.makeMatcher(state.master);state.lines=C.combine(state.orders).map(r=>({...r,check:match(r)}))}
function setOrders(orders,sample=false){
  C.combine(orders);state.orders=orders;rematch();
  $('fileNames').textContent=(sample?'ไฟล์ตัวอย่าง · ':'')+orders.map(o=>o.file).join('\n');
  $('branchSelect').innerHTML='<option value="">ทุกสาขา</option>'+[...new Map(state.lines.map(r=>[r.branch,r.branchName])).entries()].sort().map(([id,name])=>`<option value="${esc(id)}">${esc(id+' · '+name)}</option>`).join('');
  $('search').value='';$('statusSelect').value='';render();
}
async function readWorkbook(file){
  if(file.size>30*1024*1024)throw Error(`${file.name}: ไฟล์ใหญ่กว่า 30 MB`);
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
  return wb.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true,blankrows:true})}));
}
async function loadOrders(files){
  if(!files.length)return;const ticket=++task;busy(true);error('');
  try{const orders=[];for(const file of files){orders.push(C.parseOrder(await readWorkbook(file),file.name))}await document.fonts.ready;if(ticket===task)setOrders(orders)}
  catch(e){if(ticket===task){state.orders=[];state.lines=[];$('fileNames').textContent='อ่านไฟล์ไม่สำเร็จ';$('branchSelect').innerHTML='<option value="">ทุกสาขา</option>';render();error(e.message)}}
  finally{if(ticket===task)busy(false)}
}
function selectedLines(){const branch=$('branchSelect').value;return state.lines.filter(r=>!branch||r.branch===branch)}
function filteredLines(){const search=C.key($('search').value),status=$('statusSelect').value;return selectedLines().filter(r=>(!status||r.check.status===status)&&(!search||C.key([r.branch,r.part,r.description,r.check.sku,r.check.systemBarcode,r.customerBarcode].join(' ')).includes(search)))}
function badge(check){return `<span class="pill ${check.status}">${esc(statusLabel[check.status])}</span>`}
function matrixData(lines){
  const branches=[...new Set(lines.map(r=>r.branch))].sort(),map=new Map();
  for(const r of lines){const id=JSON.stringify([r.part,r.check.sku]);if(!map.has(id))map.set(id,{part:r.part,description:r.description,sku:r.check.sku,qty:new Map(),total:0});const row=map.get(id);row.qty.set(r.branch,(row.qty.get(r.branch)||0)+r.qty);row.total+=r.qty}
  const rows=[...map.values()].sort((a,b)=>a.part.localeCompare(b.part));
  return {branches,rows};
}
function renderTables(){
  const lines=filteredLines(),matrix=matrixData(lines);
  $('matrixCount').textContent=`${matrix.rows.length} รายการ · ${C.sum(lines)} ชิ้น`;
  const heads=['รหัสลูกค้า','รายการสินค้า','SKU ระบบ',...matrix.branches,'รวมชิ้น'];
  $('matrixTable').innerHTML=`<thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${matrix.rows.map(r=>`<tr>${[r.part,r.description,r.sku||'—',...matrix.branches.map(b=>r.qty.get(b)||''),r.total].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th colspan="3">รวมจำนวนสินค้า</th>${matrix.branches.map(b=>`<th>${C.sum(lines.filter(r=>r.branch===b))}</th>`).join('')}<th>${C.sum(lines)}</th></tr></tfoot>`;
  $('checkCount').textContent=`${lines.length} รายการรายสาขา · ${C.sum(lines)} ชิ้น`;
  $('checkTable').innerHTML=`<thead><tr>${['สาขา / TRB','รหัสลูกค้า / รายการ','จำนวน','SKU ระบบ','บาร์ระบบ','บาร์ลูกค้า','ผลตรวจ'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${lines.map(r=>`<tr><td>${esc(r.branch)}<div class="small">${esc(r.trb)}</div></td><td>${esc(r.part)}<div class="small">${esc(r.description)}</div></td><td>${r.qty}</td><td>${esc(r.check.sku||'—')}</td><td>${esc(r.check.systemBarcode||'—')}</td><td>${esc(r.customerBarcode||'—')}</td><td>${badge(r.check)}<div class="small">${esc(r.check.reason)}</div>${r.check.status==='relabel'?'<div class="small">ยืนยันบาร์ลูกค้าก่อนเปลี่ยน</div>':''}</td></tr>`).join('')}</tbody>`;
}
function rowHtml(r,index){
  const ck=r.check;let note='';
  if($('includeChecks').checked){
    if(ck.status!=='match')note+=`<div class="barcode-note ${ck.status}">${esc(statusLabel[ck.status])}${ck.status==='relabel'?' · ยืนยันบาร์ลูกค้าก่อนเปลี่ยน':''}</div><div class="barcode-note">บาร์ระบบ: ${esc(ck.systemBarcode||'ไม่มี')}<br>บาร์ลูกค้า: ${esc(r.customerBarcode||'ไม่มี')}</div>${ck.status==='review'?`<div class="barcode-note review">${esc(ck.reason)}</div>`:''}`;
  }
  return `<tr data-part="${esc(r.part)}"><td>${index}</td><td>${esc(r.part)}</td><td>${esc(r.description)}${note}</td><td>${r.qty}</td></tr>`;
}
function pageHtml(doc){return `<article class="sheet" data-branch="${esc(doc.branch)}"><header class="document-header"><div class="company"><img src="logo.jpeg" alt="Gadget Villa"><div><strong>บริษัท แก็ดเจ็ต วิลล่า จำกัด</strong><span>Gadget Villa Co., Ltd.</span></div></div><div class="document-title"><h2>ใบสรุปส่งของ</h2></div><address class="company-address"><span>729/28-37 ถนนรัชดาภิเษก แขวงบางโพงพาง เขตยานนาวา กรุงเทพฯ 10120</span><span>โทร. 02-284-1027 · แฟกซ์ 02-284-1027 · เลขประจำตัวผู้เสียภาษี 0105557008364</span></address></header><section class="branch"><div><h3>${esc(doc.name)}</h3><div class="branch-code">รหัสสาขา <strong>${esc(doc.branch)}</strong></div></div><dl class="meta"><dt>เลข PO</dt><dd>${esc(doc.po||'ยังไม่ยืนยัน')}</dd><dt>วันที่ PO</dt><dd>${esc(doc.date||'—')}</dd></dl></section><table class="items"><colgroup><col><col><col><col></colgroup><thead><tr><th>ลำดับ</th><th>รหัสสินค้า</th><th>รายการสินค้า</th><th>จำนวน<br>(ชิ้น)</th></tr></thead><tbody></tbody></table><div class="sheet-spacer"></div><div class="sheet-bottom"><div class="page-total"><span>รวมหน้านี้ <b class="page-items">0</b> รายการ</span><span><b class="page-qty">0</b> ชิ้น</span></div><div class="doc-total"><span>รวมเอกสารนี้ ${doc.items.length} รายการ</span><span>${C.sum(doc.items)} ชิ้น</span></div>${$('includeTrb').checked?`<div class="references"><span>TRB</span><strong>${esc(doc.trb||'ยังไม่ยืนยัน')}</strong></div>`:''}<div class="signatures"><div><div class="line"></div>ผู้ส่งสินค้า<br>วันที่ ................................</div><div><div class="line"></div>ผู้รับสินค้า<br>วันที่ ................................</div></div><footer class="page-footer"><span>${esc(doc.branch)} · ${esc(doc.po||doc.file)}</span><span class="page-number"></span></footer></div></article>`}
function makePages(docs,container){
  container.replaceChildren();
  for(const doc of docs){
    const pages=[];
    function add(){container.insertAdjacentHTML('beforeend',pageHtml(doc));const el=container.lastElementChild;pages.push({el,rows:[]});return pages.at(-1)}
    let current=add();
    doc.items.forEach((row,i)=>{
      const tbody=current.el.querySelector('tbody');tbody.insertAdjacentHTML('beforeend',rowHtml(row,i+1));
      if(current.el.scrollHeight>current.el.clientHeight+1){
        tbody.lastElementChild.remove();if(!current.rows.length)throw Error(`ชื่อหรือข้อมูลสินค้า ${row.part} ยาวเกินหนึ่งหน้า กรุณาตรวจสอบต้นฉบับ`);
        current=add();current.el.querySelector('tbody').insertAdjacentHTML('beforeend',rowHtml(row,i+1));
        if(current.el.scrollHeight>current.el.clientHeight+1)throw Error(`รายการ ${row.part} ยาวเกินหนึ่งหน้า`);
      }
      current.rows.push(row);
    });
    pages.forEach((p,i)=>{p.el.querySelector('.page-items').textContent=p.rows.length;p.el.querySelector('.page-qty').textContent=C.sum(p.rows);p.el.querySelector('.page-total').hidden=pages.length===1;p.el.querySelector('.page-number').textContent=`หน้า ${i+1} / ${pages.length}`;p.el.querySelector('.doc-total').classList.toggle('reserved',i!==pages.length-1)});
  }
}
function renderDelivery(){
  const docs=C.documents(selectedLines()),el=$('deliveryPages');
  const view=$('deliveryView'),wasHidden=view.hidden;view.hidden=false;
  try{makePages(docs,el);$('pageCount').textContent=`${docs.length} เอกสาร · ${el.children.length} หน้า`;if(!docs.length)el.innerHTML='<p class="empty">ไม่มีรายการส่งของ</p>'}
  finally{view.hidden=wasHidden}
}
function switchView(view){state.view=view;for(const name of ['delivery','matrix','checks'])$(name+'View').hidden=name!==view;for(const btn of document.querySelectorAll('[data-view]'))btn.setAttribute('aria-pressed',String(btn.dataset.view===view))}
function render(){
  $('masterName').textContent=`${state.masterName} · ${state.master.length.toLocaleString()} SKU`;
  $('branchCount').textContent=new Set(state.lines.map(r=>r.branch)).size;$('lineCount').textContent=state.lines.length;$('qtyCount').textContent=C.sum(state.lines).toLocaleString();
  $('issueCount').textContent=state.lines.filter(r=>r.check.status==='relabel').length+' / '+state.lines.filter(r=>r.check.status==='review').length;
  $('warnings').innerHTML=state.orders.flatMap(o=>o.warnings).map(w=>`<div class="alert">${esc(w)}</div>`).join('');
  const branch=$('branchSelect').value;$('printScope').textContent=branch||'ทุกสาขา';
  $('printButton').disabled=$('exportButton').disabled=!state.lines.length||state.busy;
  renderTables();renderDelivery();switchView(state.view);
}
async function print(){
  if(state.busy||!state.lines.length)return;error('');
  const container=$('printPages');
  try{await document.fonts.ready;container.classList.add('measure');makePages(C.documents(selectedLines()),container);await Promise.all([...container.querySelectorAll('img')].map(i=>i.decode()));container.classList.remove('measure');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));window.print()}
  catch(e){container.classList.remove('measure');error(e.message)}
}
function exportWorkbook(){
  const lines=state.lines,m=matrixData(lines),wb=XLSX.utils.book_new();
  const sheet=(name,rows,widths)=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(wch=>({wch}));ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})};XLSX.utils.book_append_sheet(wb,ws,name)};
  sheet('Order Matrix',[['รหัสสินค้า IT CITY','รายการสินค้า','SKU ระบบ',...m.branches,'รวมชิ้น'],...m.rows.map(r=>[r.part,r.description,r.sku,...m.branches.map(b=>r.qty.get(b)||0),r.total])],[20,70,22,...m.branches.map(()=>12),14]);
  sheet('ตรวจบาร์โค้ด',[['สาขา','ชื่อสาขา','PO','TRB','รหัสลูกค้า','รายการสินค้า','จำนวน','SKU ระบบ','GTIN ระบบ','บาร์ลูกค้า','สถานะ','หมายเหตุ','ไฟล์ต้นทาง','ชีต','แถวต้นทาง'],...lines.map(r=>[r.branch,r.branchName,r.po,r.trb,r.part,r.description,r.qty,r.check.sku,r.check.systemBarcode,r.customerBarcode,statusLabel[r.check.status],r.check.reason+(r.check.status==='relabel'?' · ยืนยันบาร์ลูกค้าก่อนเปลี่ยน':''),r.file,r.sheet,r.sourceRows.join(', ')])],[12,40,25,28,20,70,10,22,22,40,24,65,70,20,16]);
  const docs=C.documents(lines);sheet('สรุปรายสาขา',[['สาขา','ชื่อสาขา','PO','TRB','รายการ','ชิ้น','ต้องเปลี่ยนบาร์','ต้องตรวจสอบ'],...docs.map(d=>[d.branch,d.name,d.po,d.trb,d.items.length,C.sum(d.items),d.items.filter(r=>r.check.status==='relabel').length,d.items.filter(r=>r.check.status==='review').length])],[12,40,25,28,12,12,20,20]);
  const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array'}),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download='IT-CITY_Order-Matrix.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
$('orderFiles').addEventListener('change',e=>loadOrders([...e.target.files]));
$('masterFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;busy(true);error('');try{const master=C.parseMaster(await readWorkbook(file));state.master=master;state.masterName=file.name;rematch();render()}catch(e){error(e.message+' · ยังคงใช้ฐาน SKU เดิม')}finally{busy(false)}});
$('resetMaster').addEventListener('click',()=>{state.master=IT_CITY_MASTER.rows;state.masterName=IT_CITY_MASTER.file;$('masterFile').value='';error('');rematch();render()});
$('sampleButton').addEventListener('click',()=>{error('');$('orderFiles').value='';setOrders([structuredClone(IT_CITY_DEMO)],true)});
$('branchSelect').addEventListener('change',()=>{error('');render()});
for(const id of ['search','statusSelect'])$(id).addEventListener('input',()=>{clearTimeout(renderTimer);renderTimer=setTimeout(renderTables,100)});
for(const id of ['includeTrb','includeChecks'])$(id).addEventListener('change',()=>{error('');try{renderDelivery()}catch(e){error(e.message)}});
for(const btn of document.querySelectorAll('[data-view]'))btn.addEventListener('click',()=>switchView(btn.dataset.view));
$('printButton').addEventListener('click',print);$('exportButton').addEventListener('click',exportWorkbook);
window.addEventListener('beforeprint',()=>{const container=$('printPages');try{container.classList.add('measure');makePages(C.documents(selectedLines()),container)}catch(e){container.replaceChildren();error(e.message)}finally{container.classList.remove('measure')}});
document.fonts.ready.then(()=>setOrders([structuredClone(IT_CITY_DEMO)],true)).catch(e=>error(e.message));
})();
