// Product barcode stickers for the retailer tools (Com7, IT City): one row per customer barcode in the open
// orders (quantities added up); the models whose customer barcode differs from the Catalog are listed first in red.
// Name on top, the customer's barcode underneath (EAN-13 for valid 13-digit codes, Code 128 otherwise), on 32.3 x 20 mm labels, 3 per row, one 100 x row-pitch mm page per row — the
// same roll and geometry as the AIS stickers, starting from the AIS printer adjustments saved on this station.
//
//   const st = GVProductStickers.mount(hostElement, { shop: 'Com7', note: '…' })
//   st.update([{ code, model, desc, qty, status }])   status: 'change' | 'same' | 'unknown'
// Needs JsBarcode (code128). The page's own button styles apply.
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Label sizes. dot = printer dots per barcode module at 203 dpi (2 = 0.25 mm, 3 = 0.375 mm).
 const SIZES={
  s3:{label:'3 ดวง/แถว · 32.3 × 20 มม. (ม้วนเดียวกับ AIS)',dieW:32.3,dieH:20,cols:3,pageW:100,sheetLeft:1.5,padX:.8,bcW:28.5,bcH:5.6,eanBarH:4.4,dot:2,nameBase:7.4,nameMin:5,detail:5,digits:7.2},
  // the Jaymart roll: 50 x 30 mm, 2 across, same look and spacing as the Jaymart sticker; page size, row height and
  // offsets start from what this computer saved in the Jaymart tool (gv-jm-label-*)
  s2:{label:'2 ดวง/แถว · 50 × 30 มม. (ม้วนเดียวกับ Jaymart)',jaymart:true,dieW:50,dieH:30,cols:2,pageW:106,sheetLeft:3,gapX:0,padX:4,bcW:40,bcH:9.5,dot:2,eanDot:3,eanBarH:8,nameBase:10,nameMin:7,detail:7.5,digits:9.5,detailLines:2,center:true}};
 const AIS={pitch:'gv-ais-productPitch',shift:'gv-ais-productShift',shiftX:'gv-ais-productShiftX'};
 const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
 const write=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
 const rank={change:2,unknown:1,same:0};
 const PX=96/25.4;
 const CSS=`.gv-st .st-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}.gv-st .st-actions button{margin:0}
.gv-st .st-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}.gv-st .st-head h2{margin:0}
.gv-st .st-note{font-size:13px;color:#5b6572;margin:4px 0 8px}
.gv-st .st-wrap{overflow:auto;border:1px solid #d3ded8;border-radius:10px}
.gv-st table{border-collapse:collapse;width:100%;min-width:720px;font-size:13px}.gv-st th{background:#e8f2ed;text-align:left;padding:8px;white-space:nowrap}.gv-st td{padding:6px 8px;border-top:1px solid #e0e7e3;vertical-align:middle}
.gv-st td.num,.gv-st th.num{text-align:right}.gv-st .code{font-family:ui-monospace,Consolas,monospace}
.gv-st tr.st-change td{background:#fdeceb}.gv-st tr.st-unknown td{background:#fff6dc}
.gv-st .tag-change{color:#9b2a22;font-weight:700}.gv-st .tag-unknown{color:#6f5200;font-weight:700}.gv-st .tag-same{color:#0f5a3c;font-weight:700}
.gv-st input.st-text{width:100%;min-width:240px;min-height:36px;border:1px solid #c8d5d0;border-radius:6px;padding:4px 8px;font:inherit}
.gv-st input.st-qty{width:80px;min-height:36px;border:1px solid #c8d5d0;border-radius:6px;padding:4px 8px;text-align:right;font:inherit}
.gv-st input[type=checkbox]{width:20px;height:20px}
.gv-st details{margin:10px 0;border:1px solid #d3ded8;border-radius:10px;padding:8px 12px}.gv-st summary{cursor:pointer;font-weight:700}
.gv-st .st-grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}.gv-st .st-grid label{display:flex;flex-direction:column;font-size:13px;gap:4px}
.gv-st .st-grid input[type=number]{width:120px;min-height:36px;border:1px solid #c8d5d0;border-radius:6px;padding:4px 8px}.gv-st .st-grid .st-check{flex-direction:row;align-items:center;gap:6px}
.gv-st .st-type{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700}.gv-st .st-type select{min-height:40px;border:1px solid #c8d5d0;border-radius:6px;padding:4px 8px;font:inherit;font-weight:400}
.gv-st .st-preview{background:#eef3f5;border-radius:10px;padding:12px;overflow:auto}
.st-row{display:flex;box-sizing:border-box;background:#fff;margin-bottom:6px}
.st-label{box-sizing:border-box;overflow:hidden;font-family:Arial,sans-serif;color:#000;text-align:center;outline:1px dashed #b8c4cc;position:relative}
.st-center .st-in{justify-content:center;padding:2mm 0 1mm}.st-center .st-line{line-height:1.15}.st-center .st-detail{margin:.5mm auto .9mm}.st-center .st-bc{margin-top:0;padding-bottom:0}.st-center .st-digits{margin-top:.6mm}
.st-label.st-blank{outline-style:dotted;opacity:.5}
.st-in{position:relative;padding-top:1.3mm;height:100%;box-sizing:border-box;display:flex;flex-direction:column}
.st-bc{margin-top:auto;padding-bottom:1.3mm}
.st-digits{font-size:7.6pt;line-height:1.05;margin-top:.25mm;font-weight:700}
.st-line{font-weight:800;line-height:1.1;white-space:nowrap}.st-line span{display:inline-block;transform-origin:center}
.st-detail{font-weight:700;font-size:5.4pt;line-height:1.15;margin:.2mm auto 0;padding:0 1mm;max-height:2.3em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}`;

 function brandOf(desc){const w=String(desc).trim().split(/\s+/)[0]||'';return /^[A-Z][A-Z0-9-]+$/i.test(w)?w.toUpperCase():''}
 // The detail line: the description without the brand and the model number (both are on line 1).
 function detailOf(desc,brand,model){
  let s=String(desc).replace(/\s+/g,' ').trim();
  if(brand)s=s.replace(new RegExp('^'+brand+'\\s*','i'),'');
  if(model)s=s.replace(new RegExp('\\(?\\b'+String(model).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\b\\)?\\s*','i'),'');
  return s.replace(/^CS\s+/i,'').replace(/\s+/g,' ').trim();
 }
 // The detail line from the Catalog name ("UGR-ALL-53| Ugreen CM570... 90514 HDMI Splitter 1 In 4 Out" ->
 // "HDMI Splitter 1 In 4 Out"): the shop's file can be a scan whose text is misread.
 let catalogNames=null,catalogLoading=null;
 function loadCatalogNames(){
  if(!catalogLoading)catalogLoading=fetch('/api/catalog/barcodes',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{catalogNames=new Map(d.rows.map(r=>[String(r.sku).trim().toUpperCase(),String(r.name||'')]))}).catch(()=>{catalogNames=new Map()});
  return catalogLoading;
 }
 function catalogDetail(model){
  if(!catalogNames||!model)return'';
  let n=catalogNames.get(String(model).trim().toUpperCase())||'';if(!n)return'';
  n=n.replace(/^[^|]*\|\s*/,'').replace(/^\[[^\]]*\]\s*/,'').replace(/\S*[\u00c0-\u00ff]\S*/g,' ').replace(/\s+/g,' ').trim();
  n=n.replace(/^.*?\b(ugreen|fantech|orsen|eloop)\b\s*/i,''); // drop notes before the brand (e.g. a Thai reminder)
  n=n.replace(/^[A-Z]{1,4}\d{2,4}[A-Z]?\s*(?:\.{2,}|#)?\s*/i,'');      // internal code: CM570... / DP102 .. / NW102..
  const m=String(model).toUpperCase(),base=m.replace(/-BOX$/,'');
  for(const t of [m,base+'BOX',base])n=n.replace(new RegExp('^\\(?'+t.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\)?\\s*','i'),'');
  return n.replace(/^[.#\s]+/,'').trim();
 }

 function fit(text,maxPx,base,min){
  const s=String(text||'');if(!s)return{size:base,scale:1};
  const ctx=document.createElement('canvas').getContext('2d'),w=size=>{ctx.font=`700 ${size}pt Arial,sans-serif`;return ctx.measureText(s).width};
  let lo=min,hi=base;if(w(hi)<=maxPx)return{size:hi,scale:1};
  for(let i=0;i<16;i++){const m=(lo+hi)/2;if(w(m)<=maxPx)lo=m;else hi=m}
  return{size:lo,scale:Math.min(1,maxPx/Math.max(w(lo),1))};
 }
 // EAN-13 (the retail barcode on the product box): used for 13-digit codes with a valid check digit.
 // Drawn here in module units — 0.25 mm per module (2 dots at 203 dpi), 11 / 7 module quiet zones,
 // guard bars longer than the data bars, digits under the bars as on retail packs.
 const EAN={L:['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'],
  G:['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'],
  R:['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'],
  P:['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']};
 function eanOk(code){
  if(!/^\d{13}$/.test(code))return false;
  const d=[...code].map(Number),last=d.pop();let sum=0;
  d.reverse().forEach((v,i)=>{sum+=v*(i%2===0?3:1)});
  return (10-sum%10)%10===last;
 }
 function ean13(code,p){
  const d=[...code].map(Number),par=EAN.P[d[0]];
  let bits='101';for(let i=1;i<=6;i++)bits+=EAN[par[i-1]][d[i]];
  bits+='01010';for(let i=7;i<=12;i++)bits+=EAN.R[d[i]];bits+='101';
  // heights in modules: data bars p.bcH mm, guard bars 0.9 mm longer, digits sized like the Code 128 digits
  const m=(p.eanDot||p.dot)*25.4/203,FS=p.digits*.3528/m,Q=11,W=Q+95+7,BAR=Math.round((p.eanBarH||p.bcH)/m),GUARD=BAR+Math.round(.9/m),H=Math.ceil(GUARD+FS*.75),guard=i=>i<3||(i>=45&&i<50)||i>=92;
  let rects='';
  for(let i=0;i<95;){if(bits[i]!=='1'){i++;continue}let j=i;while(j<95&&bits[j]==='1'&&guard(j)===guard(i))j++;rects+=`<rect x="${Q+i}" y="0" width="${j-i}" height="${guard(i)?GUARD:BAR}"/>`;i=j}
  const t=(x,s)=>`<text x="${x}" y="${H-.6}" text-anchor="middle">${s}</text>`;
  let text=t(Q-5,d[0]);
  for(let i=0;i<6;i++)text+=t(Q+3+7*i+3.5,d[i+1]);
  for(let i=0;i<6;i++)text+=t(Q+50+7*i+3.5,d[i+7]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="display:block;margin:0 auto;width:${(W*m).toFixed(2)}mm;height:${(H*m).toFixed(2)}mm" role="img" aria-label="EAN-13 ${code}"><g fill="#000">${rects}</g><g font-family="Arial,Helvetica,sans-serif" font-size="${FS.toFixed(2)}" font-weight="700" fill="#000">${text}</g></svg>`;
 }
 const mod=p=>p.dot*25.4/203; // one barcode module in mm
 function barcode(code,p){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  JsBarcode(svg,code,{format:'CODE128',width:1,height:100,displayValue:false,margin:0,marginLeft:10,marginRight:10});
  const modules=parseFloat(svg.getAttribute('width')); // JsBarcode writes "143px"
  svg.setAttribute('viewBox',`0 0 ${modules} 100`);svg.setAttribute('preserveAspectRatio','none');
  // whole printer dots per module at 203 dpi, never wider than the label allows
  svg.setAttribute('style',`display:block;margin:0 auto;width:${Math.min(p.bcW,modules*mod(p)).toFixed(2)}mm;height:${p.bcH}mm`);
  return svg.outerHTML;
 }

 function mount(host,{shop='',note=''}={}){
  if(!document.getElementById('gvStickerCss')){const s=document.createElement('style');s.id='gvStickerCss';s.textContent=CSS;document.head.append(s)}
  const KEY=`gv-${String(shop).toLowerCase().replace(/[^a-z0-9]+/g,'')}-sticker-`;
  host.classList.add('gv-st');
  host.innerHTML=`<div class="st-head"><h2>พิมพ์สติกเกอร์บาร์โค้ดสินค้า</h2><span class="st-note">${shop==='Catalog'?'บาร์โค้ดและชื่อจาก GV Catalog':'บาร์โค้ดตามไฟล์ของ '+esc(shop)}</span></div>
   <p class="st-note">${shop==='Catalog'?'ติ๊กรุ่นที่จะพิมพ์ · ใส่จำนวนดวงของแต่ละรุ่น · แก้ข้อความใต้บาร์โค้ดได้ · แถวสีแดง = บาร์โค้ดที่ร้านใช้ต่างจากบาร์หลัก':'ติ๊กรุ่นที่จะพิมพ์ · แถวสีแดง = บาร์โค้ดในไฟล์ร้านไม่ตรงกับ Catalog ต้องเปลี่ยนบาร์โค้ด · จำนวนดวงเริ่มจากยอดรวมในไฟล์ที่เปิดอยู่ แก้ได้'}${note?' · '+esc(note):''}</p>
   <div class="st-actions"><button type="button" class="secondary" data-act="pick-change">เลือกเฉพาะรุ่นที่ต้องเปลี่ยนบาร์โค้ด</button><span class="st-note" data-el="summary"></span></div>
   <div class="st-wrap"><table data-el="table"></table></div>
   <div class="st-actions"><label class="st-type">ขนาดสติกเกอร์ <select data-set="size">${Object.entries(SIZES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label><label class="st-type">ชนิดบาร์โค้ด <select data-set="type"><option value="auto">อัตโนมัติ (EAN-13 ถ้าเลขถูก ไม่งั้น Code 128)</option><option value="ean">EAN-13</option><option value="c128">Code 128</option></select></label></div>
   <div class="st-actions"><button type="button" data-act="print">พิมพ์สติกเกอร์ที่เลือก</button><button type="button" class="secondary" data-act="test">พิมพ์ทดสอบ 2 แถว</button></div>
   <details><summary>ตั้งค่าเครื่องพิมพ์ (ปรับเมื่อพิมพ์ไม่ตรง · จำไว้ในเครื่องนี้)</summary>
    <div class="st-grid">
     <label>ช่องว่างระหว่างแถว (มม.)<input data-set="pitch" type="number" min="0" max="6" step="0.5" value="0"></label>
     <label>เลื่อนขึ้น–ลง (มม.)<input data-set="shift" type="number" min="-6" max="8" step="0.5" value="0"></label>
     <label>เลื่อนซ้าย–ขวา (มม.)<input data-set="shiftX" type="number" min="-4" max="6" step="0.5" value="0"></label>
     <label class="st-check"><input data-set="sep" type="checkbox" checked> เว้น 1 แถวว่างหลังจบแต่ละรุ่น</label>
    </div>
    <p class="st-note">ตั้งไดรเวอร์: 3 ดวง/แถว = กระดาษ 100 × 20 มม. · 2 ดวง/แถว = ใช้ขนาดกระดาษเดียวกับสติกเกอร์ Jaymart (ระบบใช้ค่าระยะที่ตั้งไว้ใน Jaymart) · Scale 100% · ถ้าเครื่องนี้เคยปรับค่าใน AIS ไว้ ระบบใช้ค่านั้นเป็นค่าเริ่มต้น</p>
   </details>
   <div class="st-preview" data-el="preview"></div>`;
  const q=s=>host.querySelector(s),setting=k=>q(`[data-set="${k}"]`);
  let items=[];const kept=new Map(); // code -> what the user changed {pick, qty, text}

  for(const k of ['pitch','shift','shiftX']){const v=read(KEY+k)??read(AIS[k]);if(v!==null&&v!=='')setting(k).value=v}
  {const v=read(KEY+'sep');if(v!==null)setting('sep').checked=v==='1'}
  {const v=read(KEY+'type');if(['auto','ean','c128'].includes(v))setting('type').value=v}
  {const v=read(KEY+'size');if(SIZES[v])setting('size').value=v}
  // EAN-13 only for a 13-digit code with a valid check digit; anything else stays Code 128 whatever is chosen
  const useEan=code=>setting('type').value!=='c128'&&eanOk(code);

  let lastLines=[];
  function update(lines){
   lastLines=lines;
   if(!catalogNames)loadCatalogNames().then(()=>{if(lastLines===lines)update(lines)});
   const by=new Map();
   for(const r of lines){
    const code=String(r.code||'').trim();if(!code)continue;
    const g=by.get(code)||{code,model:r.model||'',desc:r.desc||'',qty:0,status:r.status||'unknown',pick:!!r.pick};
    g.qty+=Number(r.qty)||0;if(rank[r.status]>rank[g.status])g.status=r.status;if(!g.model&&r.model)g.model=r.model;
    by.set(code,g);
   }
   items=[...by.values()].sort((a,b)=>rank[b.status]-rank[a.status]||String(a.model).localeCompare(String(b.model),undefined,{numeric:true}));
   for(const it of items){
    it.brand=brandOf(it.desc);
    const k=kept.get(it.code)||{};
    it.pick=k.pick??it.pick??false; /* nothing ticked until staff choose; red rows show what must change */ it.qty=k.qty??it.qty;it.text=k.text??(catalogDetail(it.model)||detailOf(it.desc,it.brand,it.model));
   }
   draw();
   return items.length;
  }
  const keep=it=>kept.set(it.code,{pick:it.pick,qty:it.qty,text:it.text});
  function draw(){
   const tag=s=>s==='change'?'<span class="tag-change">⚠ ต้องเปลี่ยนบาร์โค้ด</span>':s==='unknown'?'<span class="tag-unknown">ต้องตรวจสอบ</span>':'<span class="tag-same">✓ ตรงกับ Catalog</span>';
   q('[data-el=table]').innerHTML=`<thead><tr><th><input type="checkbox" data-all aria-label="เลือกทั้งหมด"></th><th>รุ่น</th><th>บาร์โค้ด (ในไฟล์ร้าน)</th><th>ข้อความใต้บาร์โค้ด</th><th class="num">จำนวนดวง</th><th>ผลตรวจ</th></tr></thead><tbody>${items.map((it,i)=>`<tr class="st-${it.status}"><td><input type="checkbox" data-i="${i}" data-f="pick" ${it.pick?'checked':''} aria-label="เลือก ${esc(it.model||it.code)}"></td><td class="code">${esc([it.brand,it.model].filter(Boolean).join(' ')||'—')}</td><td class="code">${esc(it.code)}</td><td><input class="st-text" data-i="${i}" data-f="text" value="${esc(it.text)}"></td><td class="num"><input class="st-qty" type="number" min="0" max="5000" step="1" data-i="${i}" data-f="qty" value="${it.qty}"></td><td>${tag(it.status)}</td></tr>`).join('')}</tbody>`;
   syncAll();sum();
  }
  function syncAll(){const all=q('[data-all]');if(!all)return;all.checked=items.length>0&&items.every(x=>x.pick);all.indeterminate=!all.checked&&items.some(x=>x.pick)}
  function sum(){
   const sel=items.filter(x=>x.pick&&x.qty>0),n=sel.reduce((a,x)=>a+x.qty,0),bad=items.filter(x=>x.status==='change').length;
   const notEan=setting('type').value==='ean'?sel.filter(x=>!eanOk(x.code)).length:0;
   q('[data-el=summary]').textContent=`เลือก ${sel.length} รุ่น · ${n.toLocaleString()} ดวง`+(bad?` · รุ่นที่ต้องเปลี่ยนบาร์โค้ด ${bad} รุ่น`:' · ไม่มีรุ่นที่ต้องเปลี่ยนบาร์โค้ด')+(notEan?` · ${notEan} รุ่นเลขไม่ใช่ EAN-13 ที่ถูกต้อง จะพิมพ์เป็น Code 128`:'');
   const btn=q('[data-act=print]');btn.textContent=n?`พิมพ์สติกเกอร์ที่เลือก (${n.toLocaleString()} ดวง)`:'พิมพ์สติกเกอร์ที่เลือก';btn.disabled=!n;q('[data-act=test]').disabled=!n;
   preview();
  }
  function onEdit(e){
   const t=e.target;
   if(t.matches('[data-all]')){for(const it of items){it.pick=t.checked;keep(it)}draw();return}
   const it=items[Number(t.dataset.i)],f=t.dataset.f;if(!it||!f)return;
   if(f==='pick')it.pick=t.checked;
   else if(f==='qty')it.qty=Math.max(0,Math.min(5000,Math.floor(Number(t.value)||0)));
   else if(f==='text')it.text=t.value;
   keep(it);if(f==='pick')syncAll();sum();
  }
  const num=(k,lo,hi)=>{const v=Number(setting(k).value);return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):0};
  const jm=(id,def)=>{const v=Number(read('gv-jm-label-'+id));return read('gv-jm-label-'+id)!==null&&Number.isFinite(v)?v:def};
  const profile=()=>{
   const P=SIZES[setting('size').value]||SIZES.s3;
   if(P.jaymart){const gap=jm('labelGap',0),left=jm('labelLeft',3),right=jm('labelRight',3);
    return{...P,gapX:gap,pageW:100+gap+left+right,rowPitch:jm('labelPitch',30)+num('pitch',0,6),shift:jm('labelY',0)+num('shift',-6,8),sheetLeft:Math.max(0,left+num('shiftX',-4,6))}}
   return{...P,rowPitch:P.dieH+num('pitch',0,6),shift:num('shift',-6,8),sheetLeft:Math.max(0,P.sheetLeft+num('shiftX',-4,6))}};
  function label(it,p){
   const maxPx=Math.min(p.dieW-p.padX*2,p.bcW-1)*PX,title=[it.brand,it.model].filter(Boolean).join(' '),f=fit(title,maxPx,p.nameBase,p.nameMin);
   const lines=(title?`<div class="st-line"><span style="font-size:${f.size.toFixed(2)}pt;transform:scaleX(${f.scale.toFixed(4)})">${esc(title)}</span></div>`:'')+(it.text?`<div class="st-detail" style="font-size:${p.detail}pt;-webkit-line-clamp:${p.detailLines||2};max-height:${(p.detailLines||2)*1.15}em">${esc(it.text)}</div>`:'');
   return`<div class="st-label${p.center?' st-center':''}" style="width:${p.dieW}mm;height:${p.dieH}mm"><div class="st-in" style="top:${p.shift}mm${p.center?`;padding-left:${p.padX}mm;padding-right:${p.padX}mm`:''}">${lines}<div class="st-bc">${useEan(it.code)?ean13(it.code,p):barcode(it.code,p)+`<div class="st-digits" style="font-size:${p.digits}pt">${esc(it.code)}</div>`}</div></div></div>`;
  }
  // rows of 3; after each model the row is finished with blanks and one empty row is left (switch)
  function rows(test){
   const p=profile(),sel=items.filter(x=>x.pick&&x.qty>0),sep=setting('sep').checked&&!test,out=[];let row=[];
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
  const rowHtml=(p,r)=>`<div class="st-row" style="width:${p.pageW}mm;height:${p.rowPitch}mm;padding-left:${p.sheetLeft}mm;column-gap:${p.gapX||0}mm">${r.join('')}</div>`;
  function preview(){
   const host2=q('[data-el=preview]');
   if(!items.some(x=>x.pick&&x.qty>0)){host2.innerHTML='<p class="st-note">เลือกรุ่นและจำนวนดวงเพื่อดูตัวอย่าง</p>';return}
   try{const {p,out}=rows(false);host2.innerHTML=out.slice(0,3).map(r=>rowHtml(p,r)).join('')+(out.length>3?`<p class="st-note">ตัวอย่าง 3 แถวแรก จากทั้งหมด ${out.length} แถว</p>`:'')}
   catch(e){host2.innerHTML=`<p class="st-note">${esc(e.message)}</p>`}
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
  const save=()=>{for(const k of ['pitch','shift','shiftX','type','size'])write(KEY+k,setting(k).value);write(KEY+'sep',setting('sep').checked?'1':'0');sum()};

  host.addEventListener('change',e=>{if(e.target.dataset.set)save();else onEdit(e)});
  host.addEventListener('input',e=>{const f=e.target.dataset.f;if(f==='text'||f==='qty')onEdit(e)});
  host.addEventListener('click',e=>{
   const act=e.target.closest('[data-act]')?.dataset.act;
   if(act==='pick-change'){for(const it of items){it.pick=it.status==='change';keep(it)}draw()}
   else if(act==='print')print(false);
   else if(act==='test')print(true);
  });
  return{update};
 }
 window.GVProductStickers={mount};
})();
