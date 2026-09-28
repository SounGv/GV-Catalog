(()=>{
 'use strict';
 const style=document.createElement('style');
 style.textContent=`
 #labelTool{margin:16px 0;border-top:2px solid var(--green);padding:16px 0;letter-spacing:0}#labelTool h2{font-size:18px;margin:0 0 16px}.label-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:14px}.label-controls label{display:grid;gap:5px;font-size:12px}.label-controls input,.label-controls select{height:44px;padding:8px;border:1px solid var(--line);border-radius:4px;max-width:100%}.label-controls input[type=number]{width:100px}.label-controls button{min-height:44px;padding:8px 16px;border:0;border-radius:4px;background:var(--green);color:white}.label-controls button:disabled{opacity:.5;cursor:not-allowed}.label-grid{overflow:auto;max-height:450px}.label-grid table{min-width:850px}.label-grid input[type=text]{width:100%;min-width:180px;padding:8px}.label-grid input[type=number]{width:78px;padding:8px}.label-grid input[type=checkbox]{width:20px;height:20px}#labelStatus{margin:12px 0;white-space:pre-line}#labelPreview{overflow:auto;padding:14px 0;background:#edf0f2;max-height:440px}.jm-roll{background:white;margin:auto;box-sizing:border-box;color:#000;letter-spacing:0;font-family:Arial,sans-serif}.jm-label-row{display:grid;grid-template-columns:50mm 50mm;height:30mm;break-after:page}.jm-label-row:last-child{break-after:auto}.jm-label{width:50mm;height:30mm;padding:4mm 4mm 2mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;outline:1px dashed #bcc3c7;outline-offset:-1px;overflow:hidden}.jm-title,.jm-detail,.jm-digits{display:block;max-width:42mm;text-align:center;white-space:nowrap;overflow:hidden;line-height:1.1}.jm-title{font-size:10pt;font-weight:800}.jm-detail{font-size:7.5pt;font-weight:700;margin:.5mm 0 .7mm}.jm-digits{font-size:9.5pt;font-weight:700;margin-top:.5mm;font-variant-numeric:tabular-nums}.jm-label svg{display:block;flex:0 0 auto;max-width:40mm}#labelPrintDocument{display:none}`;
 document.head.append(style);
 const host=document.createElement('section');host.id='labelTool';host.hidden=true;
 host.innerHTML=`<h2>สติกเกอร์สินค้า 50 × 30 มม. · 2 ดวง/แถว</h2>
 <div class="label-controls"><label>สาขา<select id="labelBranch"></select></label><label>ค้นหารุ่น / บาร์โค้ด<input id="labelSearch" type="search"></label><button id="labelAll">เลือกทั้งหมด</button><button id="labelNone">ล้างการเลือก</button><button id="labelSyncCatalog">ซิงค์บาร์โค้ดจาก Catalog</button></div>
 <div id="labelCatalogInfo" role="status" style="margin-bottom:10px;font-size:12px"></div>
 <div class="label-grid"><table><thead><tr><th>พิมพ์</th><th>ITEM_CODE</th><th>ชื่อรุ่น</th><th>รายละเอียด / สี</th><th>ดวง</th><th>ตรวจกับ Catalog</th></tr></thead><tbody id="labelItems"></tbody></table></div>
 <details><summary>ตั้งค่ากระดาษและตำแหน่งพิมพ์</summary><div class="label-controls">
 <label>ช่องว่างกลาง (มม.)<input id="labelGap" type="number" min="0" max="10" step="0.1" value="0"></label>
 <label>ขอบซ้าย (มม.)<input id="labelLeft" type="number" min="0" max="10" step="0.1" value="3"></label>
 <label>ขอบขวา (มม.)<input id="labelRight" type="number" min="0" max="10" step="0.1" value="3"></label>
 <label>ปรับตำแหน่งเนื้อหา (มม.)<input id="labelY" type="number" min="-2" max="2" step="0.1" value="0"></label>
 </div><p>หน้าพิมพ์ 106 × 30 มม. · สเกล 100% · ขอบ None · Gap ระหว่างแถวในไดรเวอร์ 3 มม.</p></details>
 <div id="labelStatus" role="status"></div><div class="label-controls"><button id="labelPreviewBtn">ตรวจตัวอย่าง</button><button id="labelPrintBtn">พิมพ์ที่เลือก</button><button id="labelTestBtn">พิมพ์ทดสอบ 1 แถว</button></div><div id="labelPreview"></div>`;
 document.querySelector('.main').prepend(host);
 const $=id=>document.getElementById(id);let report=null,items=[],overrides=new Map(),catalogByBarcode=null;
 const compact=v=>String(v||'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();
 /**
  * Informational only: cross-checks each ITEM_CODE against the site's live
  * Catalog (product_barcodes, retailer 'Jaymart'). Per the Jaymart skill's
  * invariant, ITEM_CODE stays the barcode of truth printed on the sticker —
  * this never rewrites x.code, it only tells staff whether Catalog already
  * has this exact barcode on file for the matching SKU.
  */
 async function syncCatalogBarcodes(){
  const btn=$('labelSyncCatalog'),info=$('labelCatalogInfo');btn.disabled=true;info.textContent='กำลังซิงค์จาก Catalog…';
  try{
   const res=await fetch('/api/catalog/barcodes');
   if(res.status===401){location.href='/admin/login?next='+encodeURIComponent(location.pathname);return}
   if(!res.ok)throw Error('ซิงค์ไม่สำเร็จ (HTTP '+res.status+')');
   const data=await res.json(),map=new Map();
   for(const p of data.rows){const b=p.retailerBarcodes?.Jaymart;if(b)map.set(compact(b),{sku:p.sku,name:p.name})}
   catalogByBarcode=map;info.textContent=`ซิงค์แล้ว · บาร์โค้ด Jaymart ${map.size.toLocaleString()} รายการใน Catalog`;draw();
  }catch(e){info.textContent=e.message||'ซิงค์ไม่สำเร็จ'}
  finally{btn.disabled=false}
 }
 function catalogCell(code){
  if(!catalogByBarcode)return'—';
  const hit=catalogByBarcode.get(compact(code));
  return hit?`ตรงกับ SKU ${hit.sku}`:'ยังไม่มีบันทึกใน Catalog';
 }
 function shortName(desc){
  const sku=(desc.match(/\b\d{5}(?:-?BOX|[A-Z])?\b/i)||[])[0]||'';
  const color=(desc.match(/\b(Black|White|Purple|Grey|Gray|Silver|Blue)\b/i)||[])[0]||'';
  const length=(desc.match(/\b\d+(?:\.\d+)?M\b/i)||[])[0]||'';
  const watt=(desc.match(/\b\d+W\b/i)||[])[0]||'';
  const capacity=(desc.match(/\b\d+mAh\b/i)||[])[0]||'';
  let kind='';
  if(/power\s*bank/i.test(desc))kind=`Power Bank ${capacity} ${watt}`;
  else if(/wall char[eg]/i.test(desc))kind=`Wall Charger ${watt}`;
  else if(/headphones/i.test(desc))kind=`${(desc.match(/HiTune\s+\w+/i)||[''])[0]} Headphones`;
  else if(/earbuds|airdots/i.test(desc))kind=`${(desc.match(/HiTune\s+\w+/i)||[''])[0]} Earbuds`;
  else if(/case/i.test(desc))kind=`Case ${(desc.match(/iPhone\s*\d+\s*(?:Pro|Air)?/i)||[''])[0]}`;
  else if(/Lightning/i.test(desc))kind=`Lightning to USB-C ${length}`;
  else if(/USB.*(?:cable|connector)/i.test(desc))kind=`${/USB.?C.*M to M/i.test(desc)?'USB-C to USB-C':'USB 2.0 to USB-C'} ${watt} ${length}`;
  return {title:sku?`UGREEN ${sku.toUpperCase().replace(/-?BOX$/,'-BOX')}`:'',detail:[kind,color].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()};
 }
 function rebuild(){
  const map=new Map();for(const b of report.branches){if($('labelBranch').value&&b.id!==$('labelBranch').value)continue;for(const r of b.rows){if(!map.has(r.item))map.set(r.item,{code:String(r.item),desc:r.desc,qty:0,selected:true,...shortName(r.desc),conflict:false});const x=map.get(r.item);x.qty+=Number(r.unit);if(x.desc!==r.desc)x.conflict=true;}}
  items=[...map.values()].map(x=>Object.assign(x,overrides.get(`${$('labelBranch').value}:${x.code}`)||{}));$('labelPreview').replaceChildren();draw();
 }
 function draw(){const tbody=$('labelItems');tbody.replaceChildren();const q=$('labelSearch').value.toLowerCase();for(const x of items){if(!`${x.code} ${x.desc} ${x.title}`.toLowerCase().includes(q))continue;const row=document.createElement('tr');const cell=()=>{const td=document.createElement('td');row.append(td);return td;};const check=document.createElement('input');check.type='checkbox';check.checked=x.selected;check.setAttribute('aria-label',`พิมพ์ ${x.code}`);cell().append(check);check.onchange=()=>{x.selected=check.checked;save(x);};cell().textContent=x.code;
   for(const key of ['title','detail','qty']){const input=document.createElement('input');input.type=key==='qty'?'number':'text';input.value=x[key];input.min='0';input.step='1';input.title=x.desc;input.setAttribute('aria-label',`${key} ${x.code}`);cell().append(input);input.onchange=()=>{x[key]=key==='qty'?Number(input.value):input.value.trim();save(x);};}cell().textContent=catalogCell(x.code);tbody.append(row);}status();}
 function save(x){overrides.set(`${$('labelBranch').value}:${x.code}`,{title:x.title,detail:x.detail,qty:x.qty,selected:x.selected});$('labelPreview').replaceChildren();status();}
 function status(message){const selected=items.filter(x=>x.selected);$('labelStatus').textContent=message||`${selected.length} รุ่น · ${selected.reduce((n,x)=>n+x.qty,0)} ดวง`;}
 function config(){const read=id=>{const e=$(id);if(!e.checkValidity()||e.value==='')throw Error('ตรวจสอบค่าระยะกระดาษ');return Number(e.value);};return {gap:read('labelGap'),left:read('labelLeft'),right:read('labelRight'),y:read('labelY')};}
 function build(test=false){
  const selected=items.filter(x=>x.selected&&x.qty!==0);if(!selected.length)throw Error('เลือกรุ่นและจำนวนก่อนพิมพ์');
  for(const x of selected){if(!/^\d+$/.test(x.code)||!Number.isSafeInteger(x.qty)||x.qty<0||!x.title||!x.detail||x.conflict)throw Error(`ตรวจสอบชื่อ จำนวน หรือข้อมูลซ้ำที่ไม่ตรงกัน: ${x.code}`);}
  const total=selected.reduce((n,x)=>n+x.qty,0);if(total>20000)throw Error('จำนวนเกิน 20,000 ดวง กรุณาแบ่งพิมพ์');
  const cfg=config(),roll=document.createElement('div');roll.className='jm-roll';roll.style.width=`${100+cfg.gap+cfg.left+cfg.right}mm`;roll.style.padding=`0 ${cfg.right}mm 0 ${cfg.left}mm`;
  let count=0,row;for(const x of selected){for(let i=0;i<x.qty;i++){if(test&&count>=2)break;if(count%2===0){row=document.createElement('div');row.className='jm-label-row';row.style.columnGap=cfg.gap+'mm';roll.append(row);}const l=document.createElement('div');l.className='jm-label';l.style.paddingTop=`${4+cfg.y}mm`;l.style.paddingBottom=`${2-cfg.y}mm`;for(const [cls,value] of [['jm-title',x.title],['jm-detail',x.detail]]){const e=document.createElement('div');e.className=cls;e.textContent=value;l.append(e);}const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');l.append(svg);JsBarcode(svg,x.code,{format:'CODE128',width:2,height:76,displayValue:false,margin:20,marginTop:0,marginBottom:0});const w=parseFloat(svg.getAttribute('width'));svg.setAttribute('viewBox',`0 0 ${w} 76`);svg.style.width=Math.min(w*.125,40)+'mm';svg.style.height='9.5mm';const digits=document.createElement('div');digits.className='jm-digits';digits.textContent=x.code;l.append(digits);row.append(l);count++;}}
  return {roll,cfg,count};
 }
 function fitLabel(label){
  const maxWidth=42*96/25.4;
  for(const e of label.querySelectorAll('.jm-title,.jm-detail,.jm-digits')){const min=e.classList.contains('jm-detail')?7:e.classList.contains('jm-title')?8.5:9;let size=parseFloat(getComputedStyle(e).fontSize);while(e.scrollWidth>maxWidth+.5&&size>min){size=Math.max(min,size-.25);e.style.fontSize=size+'px';}if(e.scrollWidth>maxWidth+.5){e.style.whiteSpace='normal';e.style.overflowWrap='anywhere';e.style.maxHeight='2.2em';}}
  for(let i=0;i<24&&label.scrollHeight>label.clientHeight;i++){const detail=label.querySelector('.jm-detail'),title=label.querySelector('.jm-title'),digits=label.querySelector('.jm-digits'),svg=label.querySelector('svg');if(parseFloat(getComputedStyle(detail).fontSize)>7)detail.style.fontSize=(parseFloat(getComputedStyle(detail).fontSize)-.25)+'px';else if(parseFloat(getComputedStyle(title).fontSize)>8.5)title.style.fontSize=(parseFloat(getComputedStyle(title).fontSize)-.25)+'px';else if(parseFloat(getComputedStyle(digits).fontSize)>9)digits.style.fontSize=(parseFloat(getComputedStyle(digits).fontSize)-.25)+'px';else svg.style.height=Math.max(8,parseFloat(svg.style.height)-.25)+'mm';}
  const box=label.getBoundingClientRect();for(const e of label.children){const r=e.getBoundingClientRect();if(r.left<box.left-.5||r.right>box.right+.5||r.top<box.top-.5||r.bottom>box.bottom+.5)throw Error('ข้อความยาวเกินพื้นที่ กรุณาย่อชื่อก่อนพิมพ์');}
 }
 function preview(test=false){const result=build(test);$('labelPreview').replaceChildren(result.roll);for(const l of result.roll.querySelectorAll('.jm-label'))fitLabel(l);status(`${result.count} ดวง · ${Math.ceil(result.count/2)} แถว · หน้ากระดาษ ${100+result.cfg.gap+result.cfg.left+result.cfg.right} × 30 มม.`);return result;}
 function clean(){document.getElementById('labelPrintDocument')?.remove();document.getElementById('labelPrintStyle')?.remove();}
 async function print(test){try{clean();const {roll,cfg}=preview(test);await document.fonts.ready;const doc=document.createElement('div');doc.id='labelPrintDocument';doc.append(roll.cloneNode(true));const css=document.createElement('style');css.id='labelPrintStyle';css.textContent=`@page{size:${100+cfg.gap+cfg.left+cfg.right}mm 30mm;margin:0}@media print{html,body{margin:0!important;padding:0!important;background:white!important}body>:not(#labelPrintDocument){display:none!important}#labelPrintDocument{display:block!important}.jm-label{outline:0}.jm-roll{margin:0!important}.jm-label-row{break-inside:avoid}}`;document.head.append(css);document.body.append(doc);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.print();}catch(e){clean();status(e.message);}}
 window.addEventListener('afterprint',clean);
 window.addEventListener('jaymart-order-ready',e=>{report=e.detail;overrides.clear();host.hidden=false;$('labelBranch').replaceChildren(new Option('ทุกสาขา',''),...report.branches.map(b=>new Option(`${b.id} · ${b.inputName}`,b.id)));rebuild();});
 $('orderFile').addEventListener('change',()=>{host.hidden=true;report=null;items=[];clean();});
 $('labelBranch').onchange=rebuild;$('labelSearch').oninput=draw;
 $('labelAll').onclick=()=>{items.forEach(x=>{x.selected=true;save(x);});draw();};$('labelNone').onclick=()=>{items.forEach(x=>{x.selected=false;save(x);});draw();};
 $('labelSyncCatalog').onclick=syncCatalogBarcodes;
 $('labelPreviewBtn').onclick=()=>{try{preview();}catch(e){$('labelPreview').replaceChildren();status(e.message);}};$('labelPrintBtn').onclick=()=>print(false);$('labelTestBtn').onclick=()=>print(true);
})();
