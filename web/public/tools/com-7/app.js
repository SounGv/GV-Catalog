// Com7 barcode check: read the PO PDFs, take each line's barcode as the customer barcode, and compare it
// with the Catalog's main barcode through the shared rule (shared/barcode-check.js). A line whose
// barcode differs is a red row: the product needs its barcode changed before it goes to Com7.
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SCRIPT_BASE=document.currentScript?.src||location.href;
const state={pos:[],custBarcodes:null,catalog:null,gtinToSku:new Map(),busy:false};

function toast(text){const t=$('toast');t.textContent=text;t.className='toast show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.className='toast'},4200)}
function setStep(done,now){document.querySelectorAll('#steps .stp').forEach(s=>{const n=Number(s.dataset.step);s.classList.toggle('done',n<=done);s.classList.toggle('now',n===now)})}

// ---- PDF -> PO lines (column positions of the Com7 purchase-order template) ----
let pdfLib;
function lib(){
 if(!pdfLib)pdfLib=import(new URL('../shared/pdf.mjs',SCRIPT_BASE).href).then(m=>{m.GlobalWorkerOptions.workerSrc=new URL('../shared/pdf.worker.mjs',SCRIPT_BASE).href;return m});
 return pdfLib;
}
const number=v=>{const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:NaN};
async function readPo(file){
 const pdfjs=await lib();
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const out={file:file.name,po:'',lines:[],warnings:[]};
 for(let p=1;p<=doc.numPages;p++){
  const content=await (await doc.getPage(p)).getTextContent();
  const frags=content.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5],end:i.transform[4]+i.width}));
  if(!out.po){const m=frags.map(f=>f.s).join(' ').match(/(\d{1,3}(?:,\d{3})+|\d{5,})\s*-\s*(\d+)/);if(m)out.po=m[1].replace(/,/g,'')+'-'+m[2]}
  // table rows: a running number at the left edge and a barcode right after it
  const rows=[];
  for(const f of [...frags].sort((a,b)=>b.y-a.y||a.x-b.x)){
   const r=rows.find(r=>Math.abs(r.y-f.y)<=3);
   if(r)r.f.push(f);else rows.push({y:f.y,f:[f]});
  }
  for(const r of rows){
   const seq=r.f.find(f=>f.x<60&&/^\d{1,3}$/.test(f.s)),bc=r.f.find(f=>f.x>=60&&f.x<140&&/^\d{8,14}$/.test(f.s));
   if(!seq||!bc)continue;
   const desc=r.f.filter(f=>f.x>=140&&f.x<340).sort((a,b)=>a.x-b.x).map(f=>f.s).join(' ');
   const right=r.f.filter(f=>f.x>=340&&/^[\d,.]+$/.test(f.s));
   const qty=right.find(f=>f.end>380&&f.end<=440),price=right.find(f=>f.end>440&&f.end<=520),amount=right.find(f=>f.end>520);
   const line={seq:Number(seq.s),barcode:bc.s,desc,qty:qty?number(qty.s):NaN,price:price?number(price.s):NaN,amount:amount?number(amount.s):NaN};
   const tag=`PO ${out.po||file.name} บรรทัด ${line.seq}`;
   if(!(line.qty>0))out.warnings.push(`${tag}: อ่านจำนวนไม่ได้ กรุณาเทียบกับใบ PO`);
   else if(Number.isFinite(line.price)&&Number.isFinite(line.amount)&&Math.abs(line.qty*line.price-line.amount)>1)out.warnings.push(`${tag}: จำนวน × ราคา ไม่เท่ายอดเงิน (${line.qty} × ${line.price} ≠ ${line.amount}) กรุณาเทียบกับใบ PO`);
   out.lines.push(line);
  }
 }
 if(!out.po)out.po=file.name.replace(/\.pdf$/i,'');
 if(!out.lines.length)out.warnings.push(`${file.name}: ไม่พบรายการสินค้า (ไม่ใช่ PO ของ Com7 หรือเป็นไฟล์รูปสแกน)`);
 return out;
}

// ---- customer barcode file (optional): which barcodes Com7 already lists ----
async function readCustomerFile(file){
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellText:false,raw:true});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});
 let col=-1;
 for(const r of rows.slice(0,5)){const i=r.findIndex(c=>/บาร์โค้ดลูกค้า/.test(String(c)));if(i>=0){col=i;break}}
 if(col<0)throw Error('ไม่พบคอลัมน์ "บาร์โค้ดลูกค้า" ในไฟล์นี้');
 const set=new Set();
 for(const r of rows.slice(1)){const v=r[col];if(v===''||v==null)continue;const s=typeof v==='number'?String(Math.round(v)):String(v).trim();if(/^\d{8,14}$/.test(s))set.add(s)}
 return set;
}

// ---- Catalog: GTIN -> SKU, and the set of SKUs, to find each line's model ----
async function loadCatalog(){
 state.catalog=null;
 const ruleReady=await GVBarcodeCheck.load();
 try{
  const d=await fetch('/api/catalog/barcodes',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('HTTP '+r.status)));
  state.gtinToSku=new Map();const skus=new Map();
  for(const p of d.rows){
   const sku=String(p.sku).trim().toUpperCase();skus.set(sku,String(p.gtin||''));
   for(const g of String(p.gtin||'').split(/[\s,;|/]+/))if(/^\d{8,14}$/.test(g)&&!state.gtinToSku.has(g))state.gtinToSku.set(g,sku);
  }
  state.catalog=skus;
 }catch{state.catalog=null}
 $('catalogWarn').hidden=!!(ruleReady&&state.catalog);
}
// Model numbers for a line: `byBarcode` = the SKU whose main barcode is the PO barcode,
// `byName` = the longest SKU written in the product name (the PO prints it in brackets).
function modelsOf(line){
 if(!state.catalog)return{byBarcode:'',byName:''};
 const byBarcode=state.gtinToSku.get(line.barcode)||'';
 const tokens=String(line.desc).toUpperCase().split(/[\s()\[\],]+/).filter(t=>t.length>=4);
 let byName='';
 for(const t of tokens){
  for(const key of [t,t.replace(/BOX$/,'-BOX')])if(state.catalog.has(key)&&key.length>byName.length)byName=key;
  // catalog models such as "SPK7204/93" are written without the "/93" suffix on a PO
  for(const sku of state.catalog.keys())if(sku.includes('/')&&sku.split('/')[0]===t&&sku.length>byName.length)byName=sku;
 }
 return{byBarcode,byName};
}
// "60126-BOX" and "60126" are the same model; "SPK7204/93" is "SPK7204".
const baseOf=sku=>String(sku).replace(/-BOX$/,'').split('/')[0];
function checkLine(line){
 const {byBarcode,byName}=modelsOf(line);
 const model=byBarcode||byName;
 if(!model)return{model:'',status:'unknown',note:''};
 // The barcode is a known Catalog barcode but belongs to another model than the one named on the PO.
 if(byBarcode&&byName&&baseOf(byBarcode)!==baseOf(byName))return{model:byName,status:'change',note:`บาร์โค้ดนี้เป็นของรุ่น ${byBarcode} แต่ชื่อใน PO เป็นรุ่น ${byName}`};
 return{model,status:GVBarcodeCheck.status(model,line.barcode),note:''};
}

// ---- table ----
function allLines(){
 const rows=[];
 for(const po of state.pos)for(const l of po.lines){
  const {model,status,note}=checkLine(l);
  rows.push({po:po.po,l,model,status,note,catalogGtin:model&&state.catalog?(state.catalog.get(model)||''):'',inCust:state.custBarcodes?state.custBarcodes.has(l.barcode):null});
 }
 return rows;
}
function render(){
 const hasPo=state.pos.length>0;
 $('packNeed').hidden=hasPo;
 $('empty').hidden=hasPo||state.busy;$('result').hidden=!hasPo;$('checkChip').hidden=!hasPo;
 setStep(hasPo?1:0,hasPo?2:1);
 if(!hasPo)return;
 const rows=allLines();
 const cur=$('poSelect').value;
 $('poSelect').innerHTML='<option value="">ทุกใบ</option>'+state.pos.map(p=>`<option value="${esc(p.po)}">${esc(p.po)} (${p.lines.length} รายการ)</option>`).join('');
 $('poSelect').value=state.pos.some(p=>p.po===cur)?cur:'';
 const q=$('search').value.trim().toLowerCase(),po=$('poSelect').value,st=$('statusSelect').value;
 const shown=rows.filter(r=>(!po||r.po===po)&&(!st||r.status===st)&&(!q||`${r.po} ${r.model} ${r.l.barcode} ${r.l.desc}`.toLowerCase().includes(q)));
 const count=s=>rows.filter(r=>r.status===s).length;
 $('stats').innerHTML=[['ใบ PO',state.pos.length,''],['รายการ',rows.length,''],['จำนวนชิ้น',rows.reduce((a,r)=>a+(r.l.qty||0),0).toLocaleString(),''],['ต้องเปลี่ยนบาร์โค้ด',count('change'),'bad'],['เช็กไม่ได้',count('unknown'),'warn']].map(([a,b,c])=>`<div class="${c}"><span>${a}</span><strong>${b}</strong></div>`).join('');
 const custHead=state.custBarcodes?'<th>ไฟล์ลูกค้า</th>':'';
 $('table').innerHTML=`<thead><tr><th>PO</th><th class="num">#</th><th>บาร์โค้ดใน PO (ลูกค้า)</th><th>รุ่น</th><th>รายการสินค้า</th><th class="num">จำนวน</th><th>บาร์โค้ดใน Catalog</th><th>ผลตรวจ</th>${custHead}</tr></thead><tbody>${shown.map(r=>`<tr class="${GVBarcodeCheck.rowClass(r.status)}"><td class="code">${esc(r.po)}</td><td class="num">${r.l.seq}</td><td class="code">${esc(r.l.barcode)}</td><td class="code">${esc(r.model||'—')}</td><td class="desc">${esc(r.l.desc)}</td><td class="num">${r.l.qty}</td><td class="code">${esc(r.catalogGtin.split(/[\s,;|/]+/).filter(Boolean).join(' · ')||'—')}</td><td>${r.status==='same'?'<span class="ok">✓ ตรงกับ Catalog</span>':GVBarcodeCheck.tagHtml(r.status)}${r.note?`<span class="mute">${esc(r.note)}</span>`:''}</td>${state.custBarcodes?`<td>${r.inCust?'<span class="ok">✓ มีในไฟล์</span>':'<span class="mute">ไม่มีในไฟล์</span>'}</td>`:''}</tr>`).join('')}</tbody>`;
 $('rowCount').textContent=`แสดง ${shown.length} จาก ${rows.length} รายการ`+(shown.length?'':' · ไม่มีรายการตรงกับตัวกรอง ลองล้างช่องค้นหาหรือเลือก "ทุกใบ"');
}

// ---- scan-to-pack: each PO is one bill (its number is the bill code the scan screen searches) ----
function packError(text){const e=$('packError');e.hidden=!text;e.textContent=text||''}
async function createPackJob(){
 if(!state.pos.length)return packError('ยังไม่มีรายการ กรุณาเลือกไฟล์ PO ก่อน');
 const button=$('packJobButton');button.disabled=true;packError('');
 const sourceFile=state.pos.map(p=>p.file).join(' + ');
 let createdBy='';try{createdBy=localStorage.getItem('gv-pack-scanner-name')||''}catch{}
 const lines=allLines().map(r=>({branch:r.po,branchName:'Com7 · PO '+r.po,po:r.po,part:r.l.barcode,sku:r.model,description:r.l.desc,customerBarcode:r.l.barcode,systemBarcode:String(r.catalogGtin).split(/[\s,;|/]+/).find(g=>/^\d{8,14}$/.test(g))||'',qty:r.l.qty}));
 const send=async dryRun=>{const res=await fetch('/api/pack/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:'Com7',sourceFile,createdBy,dryRun,lines})});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||('HTTP '+res.status));return data};
 try{
  const p=(await send(true)).preview;
  if(!await GVDryRunConfirm(p,sourceFile,'Com7'))return;
  const {jobId}=await send(false);
  openPackJob(jobId);
 }catch(e){packError('สร้างงานยิงสแกนไม่สำเร็จ: '+e.message)}
 finally{button.disabled=false}
}
async function loadPackJobs(){
 const table=$('packJobs');$('packJobCount').textContent='กำลังโหลด…';
 try{
  const res=await fetch('/api/pack/jobs?customer=Com7',{cache:'no-store'});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||('HTTP '+res.status));
    GVJobReport.render({table:$('packJobs'),jobs:data.jobs,countEl:$('packJobCount'),emptyText:'ยังไม่มีงานสแกน · เลือกไฟล์ PO แล้วกด "สร้างงานยิงสแกนจาก PO ที่เปิดอยู่"'});
 }catch(e){$('packJobCount').textContent='';packError('โหลดรายการงานสแกนไม่สำเร็จ: '+e.message)}
}
function openPackJob(jobId){
 $('packScreen').hidden=false;document.body.classList.add('pack-open');
 const frame=$('packFrame');frame.onload=()=>frame.focus();frame.src='/pack/'+encodeURIComponent(jobId)+'?embed=1';
}
function closePackJob(){$('packFrame').src='about:blank';$('packScreen').hidden=true;document.body.classList.remove('pack-open');loadPackJobs()}
$('packJobs').addEventListener('click',e=>{const id=e.target.closest('[data-pack-job]')?.dataset.packJob;if(id)openPackJob(id)});
$('packJobButton').addEventListener('click',createPackJob);$('packRefresh').addEventListener('click',loadPackJobs);$('packBack').addEventListener('click',closePackJob);
loadPackJobs();

// ---- file events ----
function showError(list){const e=$('error');e.hidden=!list.length;e.innerHTML=list.map(esc).join('<br>')}
async function onPoFiles(){
 const files=[...$('poFiles').files];
 $('poNames').textContent=files.map(f=>f.name).join(' · ');
 state.pos=[];showError([]);
 if(!files.length){render();return}
 state.busy=true;$('loading').hidden=false;render();
 const warnings=[];
 const results=await Promise.allSettled(files.map(readPo));
 const read=[];
 for(const [i,r] of results.entries()){
  if(r.status==='fulfilled'){read.push(r.value);warnings.push(...r.value.warnings)}
  else warnings.push(`${files[i].name}: อ่านไฟล์ไม่ได้ (${r.reason?.message||r.reason})`);
 }
 // Two files with the same PO number would double-count a bill.
 const seen=new Set();
 state.pos=read.filter(p=>{if(seen.has(p.po)){warnings.push(`ข้ามไฟล์ ${p.file}: PO ${p.po} ซ้ำกับไฟล์ที่เลือกก่อนหน้า`);return false}seen.add(p.po);return true});
 state.pos.sort((a,b)=>a.po.localeCompare(b.po,undefined,{numeric:true}));
 state.busy=false;$('loading').hidden=true;showError(warnings);render();
}
async function onCustFile(){
 const f=$('custFile').files[0];state.custBarcodes=null;$('custName').textContent=f?f.name:'';
 if(f){try{state.custBarcodes=await readCustomerFile(f);$('custName').textContent=`${f.name} · ${state.custBarcodes.size} บาร์โค้ด`}catch(e){toast(e.message||'อ่านไฟล์บาร์โค้ดลูกค้าไม่ได้');$('custFile').value='';$('custName').textContent=''}}
 render();
}
$('poFiles').addEventListener('change',onPoFiles);
$('custFile').addEventListener('change',onCustFile);
for(const id of ['search','poSelect','statusSelect'])$(id).addEventListener('input',render);
$('retryCatalog').addEventListener('click',async()=>{await loadCatalog();render()});
loadCatalog().then(render);
render();
})();
