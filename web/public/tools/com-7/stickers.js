// Com7 product barcode stickers: one row per barcode in the open POs (quantities added up), the models
// whose PO barcode differs from the Catalog are ticked first. Prints Com7's own barcode (from the PO) on
// 32.3 x 20 mm labels, 3 per row, one 100 x row-pitch mm page per row — the same roll and geometry as
// the AIS stickers, and it starts from the AIS printer adjustments if this station has saved them.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const P={dieW:32.3,dieH:20,cols:3,pageW:100,sheetLeft:1.5,padX:.8,bcW:28.5,bcH:5.6,nameBase:7.4,nameMin:5};
 const KEY='gv-com7-sticker-',AIS={pitch:'gv-ais-productPitch',shift:'gv-ais-productShift',shiftX:'gv-ais-productShiftX'};
 const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
 const write=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
 let items=[];               // [{code, model, brand, desc, text, qty, status, pick}]
 const kept=new Map();       // what the user changed, kept across re-renders: code -> {pick, qty, text}

 const rank={change:2,unknown:1,same:0};
 function brandOf(desc){const w=String(desc).trim().split(/\s+/)[0]||'';return /^[A-Z][A-Z0-9-]{1,}$/i.test(w)?w.toUpperCase():''}
 // The detail line: the PO description without the brand and the model number (they are on line 1).
 function detailOf(desc,brand,model){
  let s=String(desc).replace(/\s+/g,' ').trim();
  if(brand)s=s.replace(new RegExp('^'+brand+'\\s*','i'),'');
  if(model)s=s.replace(new RegExp('\\(?\\b'+String(model).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\b\\)?\\s*','i'),'');
  return s.replace(/^CS\s+/i,'').replace(/\s+/g,' ').trim();
 }

 function update(rows){
  const by=new Map();
  for(const r of rows){
   const code=String(r.l.barcode||'').trim();if(!code)continue;
   const g=by.get(code)||{code,model:r.model||'',desc:r.l.desc||'',qty:0,status:r.status};
   g.qty+=Number(r.l.qty)||0;if(rank[r.status]>rank[g.status])g.status=r.status;if(!g.model&&r.model)g.model=r.model;
   by.set(code,g);
  }
  items=[...by.values()].sort((a,b)=>rank[b.status]-rank[a.status]||String(a.model).localeCompare(String(b.model),undefined,{numeric:true}));
  for(const it of items){
   it.brand=brandOf(it.desc)||'UGREEN';
   const k=kept.get(it.code)||{};
   it.pick=k.pick??(it.status==='change');
   it.qty=k.qty??it.qty;
   it.text=k.text??detailOf(it.desc,it.brand,it.model);
  }
  $('stepSticker').hidden=!items.length;
  draw();
 }

 function draw(){
  const tag=s=>s==='change'?'<span class="bc-tag-change">⚠ ต้องเปลี่ยนบาร์โค้ด</span>':s==='unknown'?'<span class="bc-tag-unknown">เช็กรุ่นไม่ได้</span>':'<span class="bc-ok">✓ ตรงกับ Catalog</span>';
  $('stTable').innerHTML=`<thead><tr><th><input type="checkbox" id="stAll" aria-label="เลือกทั้งหมด"></th><th>รุ่น</th><th>บาร์โค้ด (ใน PO)</th><th>ข้อความใต้บาร์โค้ด</th><th class="num">จำนวนดวง</th><th>ผลตรวจ</th></tr></thead><tbody>${items.map((it,i)=>`<tr class="${GVBarcodeCheck.rowClass(it.status)}"><td><input type="checkbox" data-i="${i}" data-f="pick" ${it.pick?'checked':''} aria-label="เลือก ${esc(it.model||it.code)}"></td><td class="code">${esc(it.brand)} ${esc(it.model||'—')}</td><td class="code">${esc(it.code)}</td><td><input class="st-text" data-i="${i}" data-f="text" value="${esc(it.text)}"></td><td class="num"><input class="st-qty" type="number" min="0" max="5000" step="1" data-i="${i}" data-f="qty" value="${it.qty}"></td><td>${tag(it.status)}</td></tr>`).join('')}</tbody>`;
  const all=$('stAll');all.checked=items.length>0&&items.every(x=>x.pick);all.indeterminate=!all.checked&&items.some(x=>x.pick);
  sum();
 }
 function sum(){
  const sel=items.filter(x=>x.pick&&x.qty>0),n=sel.reduce((a,x)=>a+x.qty,0),bad=items.filter(x=>x.status==='change').length;
  $('stSummary').textContent=`เลือก ${sel.length} รุ่น · ${n.toLocaleString()} ดวง`+(bad?` · รุ่นที่ต้องเปลี่ยนบาร์โค้ด ${bad} รุ่น`:' · ไม่มีรุ่นที่ต้องเปลี่ยนบาร์โค้ด');
  $('stPrint').textContent=n?`พิมพ์สติกเกอร์ที่เลือก (${n.toLocaleString()} ดวง)`:'พิมพ์สติกเกอร์ที่เลือก';
  $('stPrint').disabled=!n;$('stTest').disabled=!n;
  preview();
 }
 function onEdit(e){
  const t=e.target,i=Number(t.dataset.i);
  if(t.id==='stAll'){for(const it of items){it.pick=t.checked;kept.set(it.code,{...kept.get(it.code),pick:t.checked})}draw();return}
  if(!items[i])return;const it=items[i],f=t.dataset.f;
  if(f==='pick')it.pick=t.checked;
  else if(f==='qty')it.qty=Math.max(0,Math.min(5000,Math.floor(Number(t.value)||0)));
  else if(f==='text')it.text=t.value;
  kept.set(it.code,{pick:it.pick,qty:it.qty,text:it.text});
  if(f==='pick'){const all=$('stAll');all.checked=items.every(x=>x.pick);all.indeterminate=!all.checked&&items.some(x=>x.pick)}
  sum();
 }
 function pickChanged(){for(const it of items){it.pick=it.status==='change';kept.set(it.code,{...kept.get(it.code),pick:it.pick})}draw()}

 // ---- printer adjustments (this station) ----
 function num(id,lo,hi){const v=Number($(id).value);return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):0}
 function profile(){return{...P,rowPitch:20+num('stPitch',0,6),shift:num('stShift',-6,8),sheetLeft:Math.max(0,P.sheetLeft+num('stShiftX',-4,6))}}
 function loadSettings(){
  for(const [id,k] of [['stPitch','pitch'],['stShift','shift'],['stShiftX','shiftX']]){const v=read(KEY+k)??read(AIS[k]);if(v!==null&&v!=='')$(id).value=v}
  const sep=read(KEY+'sep');if(sep!==null)$('stSep').checked=sep==='1';
 }
 function saveSettings(){write(KEY+'pitch',$('stPitch').value);write(KEY+'shift',$('stShift').value);write(KEY+'shiftX',$('stShiftX').value);write(KEY+'sep',$('stSep').checked?'1':'0');preview()}

 // ---- label ----
 const PX=96/25.4;
 function fit(text,maxPx,base,min){
  const s=String(text||'');if(!s)return{size:base,scale:1};
  const ctx=document.createElement('canvas').getContext('2d'),w=size=>{ctx.font=`700 ${size}pt Arial,sans-serif`;return ctx.measureText(s).width};
  let lo=min,hi=base;if(w(hi)<=maxPx)return{size:hi,scale:1};
  for(let i=0;i<16;i++){const m=(lo+hi)/2;if(w(m)<=maxPx)lo=m;else hi=m}
  return{size:lo,scale:Math.min(1,maxPx/Math.max(w(lo),1))};
 }
 function barcode(code){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  JsBarcode(svg,code,{format:'CODE128',width:1,height:100,displayValue:false,margin:0,marginLeft:10,marginRight:10});
  const modules=Number(svg.getAttribute('width'));
  svg.setAttribute('viewBox',`0 0 ${modules} 100`);svg.setAttribute('preserveAspectRatio','none');
  // two printer dots per module at 203 dpi, never wider than the label allows
  svg.setAttribute('style',`display:block;margin:0 auto;width:${Math.min(P.bcW,modules*2*25.4/203).toFixed(2)}mm;height:${P.bcH}mm`);
  return svg.outerHTML;
 }
 function label(it,p){
  const maxPx=Math.min(p.dieW-p.padX*2,p.bcW-1)*PX;
  // line 1 (brand + model) is fitted to the barcode width; the detail wraps to at most two small lines
  const title=`${it.brand} ${it.model}`.trim(),f=fit(title,maxPx,p.nameBase,p.nameMin);
  const lines=`<div class="st-line"><span style="font-size:${f.size.toFixed(2)}pt;transform:scaleX(${f.scale.toFixed(4)})">${esc(title)}</span></div>`+(it.text?`<div class="st-detail">${esc(it.text)}</div>`:'');
  return`<div class="st-label" style="width:${p.dieW}mm;height:${p.dieH}mm"><div class="st-in" style="top:${p.shift}mm">${barcode(it.code)}<div class="st-digits">${esc(it.code)}</div>${lines}</div></div>`;
 }
 // rows of 3; after each model the row is finished with blanks and one empty row is left (switch)
 function rows(test){
  const p=profile(),sel=items.filter(x=>x.pick&&x.qty>0),sep=$('stSep').checked&&!test,out=[];let row=[];
  const push=h=>{row.push(h);if(row.length===p.cols){out.push(row);row=[]}};
  const blank=`<div class="st-label st-blank" style="width:${p.dieW}mm;height:${p.dieH}mm"></div>`;
  for(const [k,it] of sel.entries()){
   const lab=label(it,p),n=test?Math.min(it.qty,p.cols*2):it.qty;
   for(let i=0;i<n;i++)push(lab);
   if(test)break;
   if(sep&&k<sel.length-1){while(row.length)push(blank);out.push(Array(p.cols).fill(blank))}
  }
  if(row.length){while(row.length<p.cols)row.push(blank);out.push(row)}
  return{p,out};
 }
 const rowHtml=(p,r)=>`<div class="st-row" style="width:${p.pageW}mm;height:${p.rowPitch}mm;padding-left:${p.sheetLeft}mm">${r.join('')}</div>`;
 function preview(){
  const host=$('stPreview');if(!host)return;
  if(!items.some(x=>x.pick&&x.qty>0)){host.innerHTML='<p class="hint">เลือกรุ่นและจำนวนดวงเพื่อดูตัวอย่าง</p>';return}
  try{const {p,out}=rows(false);host.innerHTML=out.slice(0,3).map(r=>rowHtml(p,r)).join('')+(out.length>3?`<p class="hint">ตัวอย่าง 3 แถวแรก จากทั้งหมด ${out.length} แถว</p>`:'')}
  catch(e){host.innerHTML=`<p class="alert error">${esc(e.message)}</p>`}
 }
 function print(test){
  const total=items.filter(x=>x.pick&&x.qty>0).reduce((a,x)=>a+x.qty,0);
  if(!total)return;
  if(total>20000){alert('จำนวนเกิน 20,000 ดวง กรุณาแบ่งพิมพ์');return}
  let doc,style;
  try{
   const {p,out}=rows(test);
   document.getElementById('stPrintDoc')?.remove();document.getElementById('stPrintStyle')?.remove();
   doc=document.createElement('div');doc.id='stPrintDoc';doc.innerHTML=out.map(r=>rowHtml(p,r)).join('');
   style=document.createElement('style');style.id='stPrintStyle';
   style.textContent=`#stPrintDoc{display:none}@media print{@page{size:${p.pageW}mm ${p.rowPitch}mm;margin:0}html,body{width:${p.pageW}mm!important;margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}body>:not(#stPrintDoc){display:none!important}#stPrintDoc{display:block!important}#stPrintDoc .st-row{break-after:page;page-break-after:always;margin:0}#stPrintDoc .st-row:last-child{break-after:auto;page-break-after:auto}#stPrintDoc .st-label{outline:0!important}}`;
   document.head.append(style);document.body.append(doc);
  }catch(e){alert('สร้างสติกเกอร์ไม่สำเร็จ: '+e.message);return}
  const clean=()=>{doc.remove();style.remove();window.removeEventListener('afterprint',clean)};
  window.addEventListener('afterprint',clean);
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
 }

 function init(){
  loadSettings();
  $('stTable').addEventListener('change',onEdit);
  $('stTable').addEventListener('input',e=>{if(e.target.dataset.f==='text'||e.target.dataset.f==='qty')onEdit(e)});
  $('stPickChange').addEventListener('click',pickChanged);
  $('stPrint').addEventListener('click',()=>print(false));
  $('stTest').addEventListener('click',()=>print(true));
  for(const id of ['stPitch','stShift','stShiftX','stSep'])$(id).addEventListener('change',saveSettings);
 }
 window.Com7Stickers={update};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
