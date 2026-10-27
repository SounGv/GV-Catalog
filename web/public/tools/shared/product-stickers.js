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

 let fitProbe=null;
 function fit(text,maxPx,base,min){
  const s=String(text||'');if(!s)return{size:base,scale:1};
  // measured on a real (off-screen) element, not a canvas: small text is laid out with hinted glyph widths, wider than the linear canvas measure
  const probe=fitProbe||(fitProbe=Object.assign(document.createElement('span'),{}));
  if(!probe.isConnected){probe.style.cssText='position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-family:Arial,sans-serif;font-weight:800';document.body.append(probe)}
  probe.textContent=s;
  const w=size=>{probe.style.fontSize=size+'pt';return probe.getBoundingClientRect().width};
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

 function mount(host,{shop='',note='',design=''}={}){
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
     <label>ช่องว่างระหว่างดวง (มม.)<input data-set="gapX" type="number" min="0" max="6" step="0.1" value="0"></label>${design==='factory'?`<label>เส้นบาร์: ซ้าย–ขวา (มม.)<input data-set="bcX" type="number" min="-8" max="8" step="0.5" value="0"></label><label>เส้นบาร์: ขึ้น–ลง (มม.)<input data-set="bcY" type="number" min="-8" max="8" step="0.5" value="0"></label><label>เส้นบาร์: ความสูง (%)<input data-set="bcS" type="number" min="50" max="150" step="5" value="100"></label><label>ข้อความ: ซ้าย–ขวา (มม.)<input data-set="txX" type="number" min="-8" max="8" step="0.5" value="0"></label><label>ข้อความ: ขึ้น–ลง (มม.)<input data-set="txY" type="number" min="-8" max="8" step="0.5" value="0"></label><label>ข้อความ: ขนาด (%)<input data-set="txS" type="number" min="60" max="150" step="5" value="100"></label>`:''}
     <label class="st-check"><input data-set="sep" type="checkbox" checked> เว้น 1 แถวว่างหลังจบแต่ละรุ่น</label>
    </div>
    <p class="st-note">ตั้งไดรเวอร์: 3 ดวง/แถว = กระดาษ 100 × 20 มม. · 2 ดวง/แถว = ใช้ขนาดกระดาษเดียวกับสติกเกอร์ Jaymart (ระบบใช้ค่าระยะที่ตั้งไว้ใน Jaymart) · Scale 100% · ถ้าเครื่องนี้เคยปรับค่าใน AIS ไว้ ระบบใช้ค่านั้นเป็นค่าเริ่มต้น</p>
   </details>
   <div class="st-preview" data-el="preview"></div>`;
  const q=s=>host.querySelector(s),setting=k=>q(`[data-set="${k}"]`);
  let items=[];const kept=new Map(); // code -> what the user changed {pick, qty, text}

  for(const k of ['pitch','shift','shiftX','gapX']){const v=read(KEY+k)??(design==='factory'?null:read(AIS[k]));if(v!==null&&v!=='')setting(k).value=v}
  // factory design = a new page with no old printer calibration: start from the roll's real 1.5 mm gap between stickers
  {const v=read(KEY+'sep');if(v!==null)setting('sep').checked=v==='1'}
  {const v=read(KEY+'type');if(['auto','ean','c128'].includes(v))setting('type').value=v}
  {const v=read(KEY+'size');if(SIZES[v])setting('size').value=v}
  // factory design = a new page with no old printer calibration, and each size has its own gap / left-right shift:
  // 3-up starts at the roll's real 1.5 mm gap, 2-up at the Jaymart roll's saved values (no extra)
  const perSize=design==='factory';let curSize=setting('size').value;
  const PS=['gapX','shiftX','shift','pitch','bcX','bcY','bcS','txX','txY','txS'],PS_DEF=(k,sz)=>k==='bcS'||k==='txS'?'100':sz==='s3'&&k==='gapX'?'1.5':sz==='s3'&&k==='shiftX'?'-1.5':'0'; // a row is exactly one label high: the printer's own gap sensor (die-cut stock) finds the next label
  const sizeVals=()=>{for(const k of PS){const el=setting(k);if(!el)continue;const v=read(KEY+k+'_'+curSize);el.value=v??PS_DEF(k,curSize)}};
  // one-time: a 3-up row spacing of 0 saved before the roll's 3 mm gap became the default is moved to 3 (else every row after the first drifts)
  // a 3 mm default shipped for a short time: it is taken back to 0 once, so one page is exactly one row (100 x 20 mm)
  if(perSize&&read(KEY+'rowfix2')!=='1'){if(read(KEY+'pitch_s3')==='3')write(KEY+'pitch_s3','0');write(KEY+'rowfix2','1')}
  if(perSize)sizeVals();
  // EAN-13 only for a 13-digit code with a valid check digit; anything else stays Code 128 whatever is chosen
  const useEan=code=>setting('type').value!=='c128'&&eanOk(code);

  let lastLines=[];
  function update(lines){
   lastLines=lines;
   if(!catalogNames)loadCatalogNames().then(()=>{if(lastLines===lines)update(lines)});
   const by=new Map();
   for(const r of lines){
    const code=String(r.code||'').trim();if(!code)continue;
    const g=by.get(code)||{code,model:r.model||'',desc:r.desc||'',qty:0,status:r.status||'unknown',pick:!!r.pick,mc:r.mc||'',brandHint:r.brand||''};
    g.qty+=Number(r.qty)||0;if(rank[r.status]>rank[g.status])g.status=r.status;if(!g.model&&r.model)g.model=r.model;
    by.set(code,g);
   }
   items=[...by.values()].sort((a,b)=>rank[b.status]-rank[a.status]||String(a.model).localeCompare(String(b.model),undefined,{numeric:true}));
   for(const it of items){
    it.brand=it.brandHint||(/^FAN-/i.test(it.model||'')?'FANTECH':brandOf(it.desc)); // the Catalog's own brand first, else FAN-... part numbers
    const k=kept.get(it.code)||{};
    it.pick=k.pick??it.pick??false; /* nothing ticked until staff choose; red rows show what must change */ it.qty=k.qty??it.qty;it.text=k.text??(catalogDetail(it.model)||detailOf(it.desc,it.brand,it.model));
    // factory design: the product line starts with the brand, as on the maker's own label
    // (FANTECH's line 1 is its FAN-... part number, which already names the brand, so the brand is not repeated below)
    if(design==='factory'&&k.text===undefined&&it.text&&it.brand&&it.brand!=='FANTECH'&&!new RegExp('^'+it.brand,'i').test(it.text))it.text=it.brand+' '+it.text;
    // factory design: whatever line 1 already says (brand, model code, parts of the part number) is not repeated in the name
    if(design==='factory'&&k.text===undefined&&it.text){
     const seen=new Set(`${it.model||''} ${it.mc||''} ${it.brand||''}`.toUpperCase().split(/[^A-Z0-9]+/).filter(w=>w.length>=4));
     const cut=it.text.split(/\s+/).filter(w=>!seen.has(w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g,'').toUpperCase())).join(' ').replace(/\(\s*\)/g,'').replace(/^[-.\s]+/,'').replace(/\s+/g,' ').trim();
     if(cut)it.text=cut;
    }
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
  const numD=(k,lo,hi,def)=>{const el=setting(k);const v=el?Number(el.value):NaN;return el&&el.value!==''&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):def};
  const adj=()=>design==='factory'?{bcX:num('bcX',-8,8),bcY:num('bcY',-8,8),bcS:numD('bcS',50,150,100),txX:num('txX',-8,8),txY:num('txY',-8,8),txS:numD('txS',60,150,100)}:{};
  const profile=()=>{
   const P=SIZES[setting('size').value]||SIZES.s3;
   if(P.jaymart){const gap=jm('labelGap',0),left=jm('labelLeft',3),right=jm('labelRight',3);
    const extra=num('gapX',0,6);
    return{...P,...adj(),gapX:gap+extra,pageW:100+gap+extra+left+right,rowPitch:jm('labelPitch',30)+num('pitch',0,6),shift:jm('labelY',0)+num('shift',-6,8),sheetLeft:Math.max(0,left+num('shiftX',-4,6))}}
   return{...P,...adj(),gapX:num('gapX',0,6),rowPitch:P.dieH+num('pitch',0,6),shift:num('shift',-6,8),sheetLeft:Math.max(0,P.sheetLeft+num('shiftX',-4,6))}};
  // The maker's own label look (UGREEN box label): bold 'Model: X | P/N: SKU', the product name in regular weight on two
  // lines, a wide tall barcode and large digits. Used by the stand-alone sticker page (design:'factory').
  // Largest font (down to `min`) at which the whole text wraps into the space left for it (`avail` mm high); if even the
  // smallest size does not fit, it is cut with an ellipsis. Regular weight, greedy word wrap, measured on a canvas.
  function fitText(text,maxPx,avail,start,min){
   const words=String(text).split(/\s+/).filter(Boolean);
   // measured on a real off-screen element (hinted widths), like fit()
   const probe=document.createElement('span');probe.style.cssText='position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre;font-family:Arial,sans-serif;font-weight:400';document.body.append(probe);
   const width=(t,size)=>{probe.style.fontSize=size+'pt';probe.textContent=t;return probe.getBoundingClientRect().width};
   const count=size=>{let n=1,w=0;const sp=width('a a',size)-width('aa',size);
    for(const x of words){const l=width(x,size);if(w&&w+sp+l>maxPx){n++;w=l}else w+=(w?sp:0)+l}return n};
   let result=null;
   for(let size=start;size>=min-1e-9;size-=.2){const n=count(size);if(n*size*1.2*.3528<=avail){result={size,lines:n};break}}
   // never cut the name: below the usual smallest size keep shrinking (to 70% of it, at least 3pt) until all of it fits
   if(!result){const floor=Math.max(3,min*.7);for(let size=min-.2;size>=floor-1e-9;size-=.2){const n=count(size);if(n*size*1.2*.3528<=avail){result={size,lines:n};break}}
    if(!result){const n=count(floor);result={size:floor,lines:n}}}
   result.rows=balance(words,result.size,result.lines,maxPx,width);
   probe.remove();return result;
  }
  // Break the name into n lines of similar length instead of filling the first lines and leaving one word alone
  // ("KEYCAP SET - ONE PIECE - / TH" -> "KEYCAP SET - / ONE PIECE - TH"). A lone dash stays with the word before it
  // and a break right after a dash is preferred. Falls back to the plain greedy lines when nothing fits.
  function balance(words,size,n,maxPx,width){
   const toks=[];for(const w of words){if(/^[-\u2013\u2014\/|]$/.test(w)&&toks.length)toks[toks.length-1]+=' '+w;else toks.push(w)}
   if(n<2||toks.length<2)return [words.join(' ')];
   const m=toks.length,sp=width('a a',size)-width('aa',size),wd=toks.map(t=>width(t,size));
   const span=(i,j)=>{let w=0;for(let k=i;k<j;k++)w+=wd[k]+(k>i?sp:0);return w};
   const best=Array.from({length:n+1},()=>Array(m+1).fill(Infinity)),from=Array.from({length:n+1},()=>Array(m+1).fill(0));
   best[0][0]=0;
   for(let r=1;r<=n;r++)for(let j=r;j<=m;j++)for(let i=r-1;i<j;i++){
    const w=span(i,j);if(w>maxPx||best[r-1][i]===Infinity)continue;
    const slack=maxPx-w,last=r===n;
    // the last line may be shorter; every other line should be close to full width... of the longest line
    let cost=best[r-1][i]+(last?slack*slack*.5:slack*slack);
    if(i>0&&/[-\u2013\u2014]$/.test(toks[i-1]))cost-=maxPx*maxPx*.14; // break after a dash reads naturally
    if(j-i===1&&!last&&r>1)cost+=maxPx*maxPx*.05;
    if(cost<best[r][j]){best[r][j]=cost;from[r][j]=i}
   }
   if(best[n][m]===Infinity)return [words.join(' ')];
   const rows=[];let j=m;for(let r=n;r>=1;r--){const i=from[r][j];rows.unshift(toks.slice(i,j).join(' '));j=i}
   // a separator dash left at the end of a line adds nothing: "KEYCAP SET -" / "ONE PIECE - TH" -> "KEYCAP SET" / "ONE PIECE - TH"
   return rows.map((row,k)=>k<rows.length-1?row.replace(/\s+[-–—]$/,''):row);
  }
  function labelFactory(it,p){
   const big=p.dieW>40,F=big?{pad:2.2,line:9,detail:9.5,barH:8,digits:9.5}:{pad:1,line:6.2,detail:6,barH:4.2,digits:7};
   // "Move down" (shift > 0) must not push the bottom of the label out of the printed page: the content block is
   // made shorter instead (bars and name give up the room), so nothing is cut off at the bottom
   const tS=(p.txS??100)/100,bS=(p.bcS??100)/100;F.line*=tS;F.detail*=tS;F.barH*=bS;
   const down=Math.max(0,p.shift),upMove=Math.min(0,p.shift),minFont=(big?6:3.8)*Math.min(1,tS),lineH=F.line*1.1*.3528+(big?.8:.5);
   // free height for the name = label - top padding - first line - bottom padding - barcode block; bars shrink (to 60%) only when the name would not get two lines at its smallest size
   const svgH=h=>h+.9+F.digits*.3528*.75,roomFor=h=>p.dieH-F.pad-down-lineH-svgH(h)-1.3-.9;
   let barH=F.barH;while(barH>F.barH*.6&&roomFor(barH)<2*minFont*1.2*.3528)barH-=.25;
   const rawTX=p.txX||0,rawTY=p.txY||0,rawBX=p.bcX||0,rawBY=p.bcY||0,margin=.4;
   // Auto fit to the sticker: the name is fitted to the width that is left after the nudge, and every nudge (barcode, text) is
   // clamped so nothing leaves the label; the person at the printer can move things only as far as the label allows.
   const txMax=((p.dieW-2*margin)-.7*(p.dieW-F.pad*2))/2,clampedTX=Math.max(-txMax,Math.min(txMax,rawTX));
   const effW=Math.max(6,Math.min(p.dieW-F.pad*2,p.dieW-margin*2-2*Math.abs(clampedTX)));
   const downMax=Math.max(0,roomFor(barH)-(it.text?2*minFont*1.2*.3528:0)),txY=Math.max(-(F.pad+down-margin),Math.min(downMax,rawTY)),room=Math.max(0,roomFor(barH)-Math.max(0,txY));
   // FANTECH's own label shows only the part number, in bold, with no 'P/N:' or 'Model:' words
   const line1=/^fantech$/i.test(it.brand||'')?it.model:it.mc?`Model: ${it.mc} | P/N: ${it.model}`:`P/N: ${it.model}`,f=fit(line1,effW*PX*.9,F.line,4.5),q={...p,eanBarH:barH,bcH:barH,digits:F.digits};
   const barSvg=useEan(it.code)?ean13(it.code,q):barcode(it.code,q)+`<div class="st-digits" style="font-size:${F.digits}pt">${esc(it.code)}</div>`;
   const svgW=Number((barSvg.match(/width:([\d.]+)mm/)||[])[1])||p.dieW*.8;
   const d=it.text?fitText(it.text,effW*PX*.94,Math.max(2.4,room),F.detail,minFont):null;
   const detailH=d?d.lines*d.size*1.2*.3528+(big?.8:.5)+(big?0:.7):0,barTop=p.dieH-1.3-svgH(barH),textBottom=F.pad+down+lineH+detailH+Math.max(0,txY);
   const gapAbove=Math.max(0,barTop-(F.pad+down+lineH+detailH)-.2),bcSpace=Math.max(0,(p.dieW-svgW)/2-margin);
   const txX=Math.max(-(p.dieW-effW)/2+margin,Math.min((p.dieW-effW)/2-margin,clampedTX));
   const bcX=Math.max(-bcSpace,Math.min(bcSpace,rawBX)),bcY=Math.max(-gapAbove,Math.min(1.3-margin,rawBY));
   return`<div class="st-label" style="width:${p.dieW}mm;height:${p.dieH}mm"><div class="st-in" style="top:${upMove}mm;padding:${F.pad+down}mm ${F.pad}mm 0"><div class="st-tx" data-ex="${txX}" data-ey="${txY}" style="transform:translate(${txX}mm,${txY}mm);flex:none;width:${effW}mm;margin:0 auto"><div class="st-line" style="font-size:${f.size.toFixed(2)}pt;line-height:1.1"><span style="font-size:${f.size.toFixed(2)}pt;transform:scaleX(${f.scale.toFixed(4)})">${esc(line1)}</span></div>${d?`<div class="st-detail" style="font-weight:400;font-size:${d.size.toFixed(1)}pt;line-height:1.2;padding:0;flex:none;margin:${big?.8:.5}mm 0 ${big?0:.7}mm;-webkit-line-clamp:${Math.max(d.lines,Math.floor(Math.max(2.4,room)/(d.size*1.2*.3528)))};max-height:none">${d&&d.rows&&d.rows.length>1?d.rows.map(r=>`<span style="display:block;white-space:nowrap">${esc(r)}</span>`).join(''):esc(it.text)}</div>`:''}</div><div class="st-bc" data-ex="${bcX}" data-ey="${bcY}" style="transform:translate(${bcX}mm,${bcY}mm)">${barSvg}</div></div></div>`;
  }
  function label(it,p){
   if(design==='factory')return labelFactory(it,p);
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
  const save=()=>{for(const k of perSize?['type','size']:['pitch','shift','shiftX','gapX','type','size'])write(KEY+k,setting(k).value);if(perSize)for(const k of PS){const el=setting(k);if(el)write(KEY+k+'_'+curSize,el.value)}write(KEY+'sep',setting('sep').checked?'1':'0');sum()};

  host.addEventListener('change',e=>{
   if(e.target.dataset.set==='size'&&perSize&&e.target.value!==curSize){for(const k of PS){const el=setting(k);if(el)write(KEY+k+'_'+curSize,el.value)}curSize=e.target.value;sizeVals()}
   if(e.target.dataset.set)save();else onEdit(e)});
  host.addEventListener('input',e=>{const f=e.target.dataset.f;if(f==='text'||f==='qty')onEdit(e)});
  host.addEventListener('click',e=>{
   const act=e.target.closest('[data-act]')?.dataset.act;
   if(act==='pick-change'){for(const it of items){it.pick=it.status==='change';keep(it)}draw()}
   else if(act==='print')print(false);
   else if(act==='test')print(true);
  });
  return{update,reset:()=>kept.clear(),paper:()=>{const q=profile();return{w:q.pageW,h:q.rowPitch}}}; // the page one printed row uses, in mm
 }
 window.GVProductStickers={mount,ready:()=>loadCatalogNames()};
})();
