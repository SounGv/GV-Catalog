// Reads an IT City purchase-order PDF (POB...) into order lines, whether the PDF has a text layer or is a scan.
// A scan goes through offline OCR (tesseract.js, files in shared/ocr/), then the staff review and fix the
// numbers in a dialog before anything is used. Checks shown in the dialog: barcode check digit,
// quantity x unit cost = amount, and the sum of amounts against the document total.
//
//   GVPdfOcr.read(file, { onProgress(text) }) -> Promise<{ sheets, warnings }>   (rejects "cancelled" if the user cancels)
//   sheets = [{ name, rows }] with the header
//     DOC_PO, DEST_CODE, DEST_NAME, DOC_DATE, ITEM_NO, BARCODE, DESCRIPTION, QTY, UNIT_COST, AMOUNT
//   so it.parseOrder() can treat it like any other order sheet.
//
// One file may hold several POs (one per branch) or a single PO (one file, one branch); pages are grouped by PO number.
(()=>{
 'use strict';
 const BASE=(()=>{try{return new URL('.',document.currentScript.src).href}catch{return'/tools/shared/'}})();
 const HEADER=['DOC_PO','DEST_CODE','DEST_NAME','DOC_DATE','ITEM_NO','BARCODE','DESCRIPTION','QTY','UNIT_COST','AMOUNT'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const loadScript=src=>new Promise((ok,bad)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>bad(Error('โหลดไฟล์ OCR ไม่สำเร็จ: '+src));document.head.append(s)});

 // ---- number helpers ----
 const money=v=>{const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:NaN};
 const CONFUSED={O:'0',o:'0',Q:'0',D:'0',I:'1',l:'1','|':'1',i:'1',S:'5',s:'5',B:'8',Z:'2',z:'2',G:'6',g:'9',q:'9'};
 const digitsOf=t=>String(t||'').replace(/[A-Za-z|]/g,c=>CONFUSED[c]??'').replace(/\D/g,'');
 // GS1 check digit for 8, 12, 13 and 14 digit codes.
 function checkDigitOk(code){
  if(!/^\d{8}$|^\d{12,14}$/.test(code))return false;
  const d=[...code].map(Number),last=d.pop();let sum=0;
  d.reverse().forEach((v,i)=>{sum+=v*(i%2===0?3:1)});
  return (10-sum%10)%10===last;
 }

 // ---- page words -> table rows (works on words from OCR or from a PDF text layer) ----
 // word = { text, x0, x1, y0, y1 } in page pixels, y down.
 const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0};
 function groupLines(words){
  const h=median(words.map(w=>w.y1-w.y0))||10,lines=[];
  for(const w of [...words].sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1)||a.x0-b.x0)){
   const cy=(w.y0+w.y1)/2,l=lines.find(l=>Math.abs(l.cy-cy)<=h*0.6);
   if(l){l.words.push(w);l.cy=(l.cy*(l.words.length-1)+cy)/l.words.length;l.y0=Math.min(l.y0,w.y0);l.y1=Math.max(l.y1,w.y1)}
   else lines.push({cy,y0:w.y0,y1:w.y1,words:[w]});
  }
  for(const l of lines)l.words.sort((a,b)=>a.x0-b.x0);
  return lines;
 }
 const lineText=l=>l.words.map(w=>w.text).join(' ');

 // Column order of the IT City PO table.
 const COLS=['no','item','barcode','desc','qty','unit','amount'];
 // Fallback column boundaries as fractions of the page width (measured on the POB template).
 const FRACTION=[0.093,0.225,0.352,0.64,0.705,0.82];
 function columnBounds(lines,pageW){
  const head=lines.find(l=>/barcode/i.test(lineText(l))&&/(q'?ty|qty|amount)/i.test(lineText(l)))||lines.find(l=>/barcode/i.test(lineText(l)));
  let cuts=FRACTION.map(f=>f*pageW);
  if(head){
   const find=re=>head.words.find(w=>re.test(w.text));
   const c=w=>w?(w.x0+w.x1)/2:null;
   const centers=[c(find(/^no\.?$/i)),c(find(/^item/i)),c(find(/^barcode/i)),c(find(/^desc/i)),c(find(/q'?ty|qty/i)),c(find(/^unit/i)),c(find(/^amount/i))];
   if(centers.filter(v=>v!==null).length>=6){
    const k=centers.map((v,i)=>v??(i?centers[i-1]+pageW*0.08:pageW*0.07));
    cuts=k.slice(1).map((v,i)=>(k[i]+v)/2);
    // the description column is wide: its text starts at the left edge, not at the header centre
    cuts[2]=Math.min(cuts[2],(k[2]+k[3])/2);
   }
  }
  return {cuts,head};
 }
 const colOf=(w,cuts)=>{const x=(w.x0+w.x1)/2;let i=0;while(i<cuts.length&&x>cuts[i])i++;return COLS[i]};

 function parseTable(words,pageW){
  const lines=groupLines(words),{cuts,head}=columnBounds(lines,pageW);
  const start=head?lines.indexOf(head)+1:0,rows=[];let subtotal=NaN,done=false;
  for(let li=start;li<lines.length&&!done;li++){
   const l=lines[li],cells={};
   for(const w of l.words)(cells[colOf(w,cuts)]??=[]).push(w);
   const txt=c=>(cells[c]||[]).map(w=>w.text).join(' ').trim();
   const seq=/^\d{1,3}$/.test(txt('no')),barcodeDigits=digitsOf(txt('barcode'));
   const hasMoney=!!(cells.unit||cells.amount);
   if(seq&&barcodeDigits.length>=8){
    rows.push({no:Number(txt('no')),item:txt('item').replace(/\s+/g,''),barcode:barcodeDigits,desc:txt('desc'),qty:txt('qty'),unit:txt('unit'),amount:txt('amount'),box:{y0:l.y0,y1:l.y1,cuts},lineIndex:li});
   }else if(rows.length&&!seq&&!hasMoney&&!txt('barcode')&&txt('desc')&&!/notes|มูลค่า|ภาษี|total|vat/i.test(lineText(l))){
    rows[rows.length-1].desc+=' '+txt('desc'); // wrapped product name
   }else if(rows.length&&hasMoney&&!seq){
    // first money line after the last item is the document subtotal
    if(Number.isNaN(subtotal))subtotal=money(txt('amount')||txt('unit'));done=true;
   }else if(rows.length&&/notes/i.test(lineText(l))){done=true}
  }
  return {rows,subtotal,cuts};
 }

 // ---- header: PO number, date, ship-to text ----
 function parseHeader(words,pageW){
  const lines=groupLines(words),all=lines.map(lineText).join('\n');
  const po=(all.match(/\bPO[A-Z]?\d{8,}\b/i)||all.replace(/\s+/g,'').match(/PO[A-Z]?\d{10,}/i)||[''])[0].toUpperCase();
  const date=(all.match(/ORDER\s*DATE\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)||all.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)||[,''])[1];
  const page=all.match(/Page\s*(\d+)\s*(?:of|o[f1]|\/)\s*(\d+)/i);
  const vendor=lines.find(l=>/vendor|V\d{5}/i.test(lineText(l)));
  let shipTo='';
  if(vendor){
   const right=vendor.words.filter(w=>(w.x0+w.x1)/2>pageW*0.55).map(w=>w.text).join(' ');
   // OCR puts a space between Thai letters: close them up
   shipTo=right.replace(/^.*?[:：]\s*/,'').replace(/[|_]+/g,' ').replace(/\s+/g,' ').trim().replace(/(?<=[฀-๿])\s+(?=[฀-๿])/g,'');
  }
  const total=(()=>{const l=lines.find(l=>/มูลค่า.*สุทธิ|net|grand/i.test(lineText(l)));const nums=l?.words.map(w=>money(w.text)).filter(n=>n>0)||[];return nums.length?nums[nums.length-1]:NaN})();
  return {po,date,page:page?Number(page[1]):0,pages:page?Number(page[2]):0,shipTo,total};
 }

 // ---- destination from the file name: "...(ส่งคลังสำโรง-StockOnline).pdf" ----
 function nameHint(fileName){
  const m=[...fileName.matchAll(/\(([^)]*)\)/g)].map(x=>x[1]).filter(t=>/ส่ง/.test(t)).pop();
  if(!m)return null;
  const raw=m.replace(/^\s*ส่ง\s*/,'').trim();if(!raw)return null;
  const parts=raw.split(/[-–]/).map(s=>s.trim()).filter(Boolean);
  const latin=parts.find(p=>/^[A-Za-z0-9 ]+$/.test(p)),thai=parts.find(p=>/[฀-๿]/.test(p));
  const code=(latin||raw).toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(0,20)||'';
  const name=thai&&latin?`${thai} (${latin})`:raw;
  return {code,name};
 }

 // ---- PDF -> words per page ----
 let pdfjsPromise;
 const pdfjs=()=>pdfjsPromise||(pdfjsPromise=import(BASE+'pdf.mjs').then(m=>{m.GlobalWorkerOptions.workerSrc=BASE+'pdf.worker.mjs';return m}));
 let ocr=null;
 async function ocrWorkers(onProgress){
  if(ocr)return ocr;
  if(typeof Tesseract==='undefined')await loadScript(BASE+'ocr/tesseract.min.js');
  const common={workerPath:BASE+'ocr/worker.min.js',corePath:BASE+'ocr/',langPath:BASE+'ocr/',gzip:true,workerBlobURL:false};
  onProgress('กำลังเตรียมระบบอ่านตัวอักษร (ครั้งแรกใช้เวลาสักครู่)…');
  const text=await Tesseract.createWorker(['eng','tha'],1,common);
  await text.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
  const digits=await Tesseract.createWorker('eng',1,common);
  await digits.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,'});
  ocr={text,digits};return ocr;
 }
 const toWords=data=>(data.words||[]).filter(w=>w.text&&w.text.trim()).map(w=>({text:w.text.trim(),x0:w.bbox.x0,x1:w.bbox.x1,y0:w.bbox.y0,y1:w.bbox.y1,conf:w.confidence}));

 // Second look at each numeric cell with a digits-only reader (much more reliable than the full-page pass).
 async function refineDigits(canvas,rows,workers){
  const crop=(x0,x1,y0,y1)=>{const pad=4,c=document.createElement('canvas');c.width=Math.max(1,x1-x0+2*pad);c.height=Math.max(1,y1-y0+2*pad);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(canvas,x0,y0,x1-x0,y1-y0,pad,pad,x1-x0,y1-y0);return c};
  for(const r of rows){
   const {cuts,y0,y1}=r.box,Y0=Math.max(0,Math.floor(y0-2)),Y1=Math.min(canvas.height,Math.ceil(y1+2));
   const edges=[0,...cuts,canvas.width];
   const cell=i=>[Math.floor(edges[i]),Math.floor(edges[i+1])];
   for(const [field,i] of [['barcode',2],['qty',4],['unit',5],['amount',6]]){
    try{
     const [a,b]=cell(i),res=await workers.digits.recognize(crop(a,b,Y0,Y1));
     const t=(res.data.text||'').replace(/\s+/g,'').trim();
     if(t)r['read_'+field]=t;
    }catch{}
   }
   if(r.read_barcode&&/^\d{8,14}$/.test(r.read_barcode)){
    // keep the digits-only reading unless the full-page pass gave a valid check digit and this one does not
    if(checkDigitOk(r.read_barcode)||!checkDigitOk(r.barcode))r.barcode=r.read_barcode;
   }
   for(const f of ['qty','unit','amount'])if(r['read_'+f]&&/^[\d,]*\.?\d*$/.test(r['read_'+f]))r[f]=r['read_'+f];
  }
 }

 async function readPages(file,onProgress){
  const lib=await pdfjs(),doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,pages=[];
  for(let p=1;p<=doc.numPages;p++){
   const page=await doc.getPage(p),vp1=page.getViewport({scale:1});
   const content=await page.getTextContent();
   const textWords=content.items.filter(i=>i.str&&i.str.trim());
   if(textWords.length>20){
    // digital PDF: use the text layer directly (exact numbers)
    const words=textWords.map(i=>{const x=i.transform[4],y=vp1.height-i.transform[5],h=Math.abs(i.height||i.transform[3])||8;return {text:i.str.trim(),x0:x,x1:x+i.width,y0:y-h,y1:y,conf:100}});
    pages.push({words,width:vp1.width,canvas:null,scanned:false});
    onProgress(`อ่านหน้า ${p} / ${doc.numPages}`);continue;
   }
   onProgress(`กำลังอ่านหน้า ${p} / ${doc.numPages} จากรูปสแกน…`);
   const scale=2.6,vp=page.getViewport({scale}),canvas=document.createElement('canvas');
   canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
   await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:vp}).promise;
   const workers=await ocrWorkers(onProgress),res=await workers.text.recognize(canvas);
   pages.push({words:toWords(res.data),width:canvas.width,canvas,scanned:true,workers});
  }
  return pages;
 }

 // ---- build documents (grouped by PO number) ----
 async function buildDocs(file,onProgress){
  const pages=await readPages(file,onProgress),docs=[],warnings=[];
  let current=null;
  for(let i=0;i<pages.length;i++){
   const pg=pages[i],head=parseHeader(pg.words,pg.width),table=parseTable(pg.words,pg.width);
   if(pg.scanned&&table.rows.length){onProgress(`ตรวจตัวเลขหน้า ${i+1} / ${pages.length}…`);await refineDigits(pg.canvas,table.rows,pg.workers)}
   // a continuation page repeats the PO number ("Page 2 of 2"); one with no number belongs to the PO before it
   const sameAsCurrent=current&&(!head.po||head.po===current.po);
   if(!sameAsCurrent){current={po:head.po,date:head.date,shipTo:head.shipTo,rows:[],subtotal:NaN,total:NaN,pageNos:[]};docs.push(current)}
   current.pageNos.push(i+1);
   if(!current.shipTo&&head.shipTo)current.shipTo=head.shipTo;
   if(!current.date&&head.date)current.date=head.date;
   current.rows.push(...table.rows);
   if(!Number.isNaN(table.subtotal))current.subtotal=table.subtotal;
   if(!Number.isNaN(head.total))current.total=head.total;
  }
  const docsWithRows=docs.filter(d=>d.rows.length);
  if(!docsWithRows.length)throw Error(`${file.name}: ไม่พบตารางรายการสินค้าของ PO (ไม่ใช่รูปแบบ Purchase Order ของ IT City หรืออ่านไม่ออก)`);
  const hint=nameHint(file.name);
  for(const d of docsWithRows){
   // one file with one PO: the file name names the destination; otherwise the ship-to text read from the page
   if(docsWithRows.length===1&&hint){d.destCode=hint.code;d.destName=hint.name}
   else{
    const text=(d.shipTo||'').trim();
    const code=(text.match(/\bW[A-Z0-9]{3,5}\b/i)||[''])[0].toUpperCase()||text.toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(0,12)||('PO'+d.po.slice(-6));
    d.destCode=code;d.destName=text||code;
   }
   if(!d.po)d.po=file.name.replace(/\.pdf$/i,'');
  }
  return {docs:docsWithRows,warnings};
 }

 // ---- review dialog ----
 const CSS=`#ocrReview{position:fixed;inset:0;z-index:1500;background:rgba(10,20,16,.55);display:flex;align-items:center;justify-content:center;padding:14px;font-family:inherit}
 #ocrReview .box{width:100%;max-width:1100px;max-height:94vh;overflow:auto;background:#fff;color:#18232b;border-radius:16px;padding:18px 20px;box-shadow:0 24px 60px rgba(0,0,0,.3);line-height:1.6;font-size:14px}
 #ocrReview h3{margin:0 0 2px;font-size:18px}#ocrReview .sub{margin:0 0 12px;color:#5b6572;font-size:13px}
 #ocrReview .po{border:1px solid #d3ded8;border-radius:12px;padding:12px;margin:0 0 12px}
 #ocrReview .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:10px}
 #ocrReview label{display:block;font-size:12px;color:#5b6572}
 #ocrReview input{width:100%;min-height:40px;padding:6px 8px;border:1px solid #bdccc5;border-radius:8px;font:inherit;font-size:13px;background:#fff}
 #ocrReview table{border-collapse:collapse;width:100%;min-width:860px}#ocrReview th{background:#e8f2ed;text-align:left;padding:6px;font-size:12px;white-space:nowrap}
 #ocrReview td{padding:4px;border-bottom:1px solid #e0e7e3;vertical-align:top}#ocrReview td input{min-height:36px}
 #ocrReview .scroll{overflow:auto;border:1px solid #e0e7e3;border-radius:8px}
 #ocrReview tr.bad td{background:#fbcfca}#ocrReview tr.warn td{background:#fff4d6}
 #ocrReview .flag{display:block;font-size:11px;font-weight:700;color:#a3140b}#ocrReview .flag.warn{color:#7a5a00}
 #ocrReview .sum{margin:8px 0 0;font-size:13px}#ocrReview .sum.bad{color:#a3140b;font-weight:700}#ocrReview .sum.ok{color:#0b5f3e;font-weight:700}
 #ocrReview .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
 #ocrReview .btns button{min-height:44px;padding:8px 18px;border-radius:8px;font:inherit;font-weight:700;cursor:pointer;border:1px solid #c8d5d0;background:#fff;color:#28443a}
 #ocrReview .btns .go{background:#185c45;color:#fff;border-color:#123b2c}
 #ocrReview .err{color:#a3140b;font-weight:700;margin:8px 0 0}`;
 function analyse(rows){
  return rows.map(r=>{
   const flags=[],qty=Number(String(r.qty).replace(/,/g,'')),unit=money(r.unit),amount=money(r.amount);
   const code=digitsOf(r.barcode);
   if(!checkDigitOk(code))flags.push(['bad','เลขบาร์โค้ดไม่ผ่านการตรวจเลขท้าย ตรวจเทียบกับใบจริง']);
   if(!(Number.isInteger(qty)&&qty>0))flags.push(['bad','จำนวนไม่ถูกต้อง']);
   else if(Number.isFinite(unit)&&Number.isFinite(amount)&&Math.abs(qty*unit-amount)>0.06)flags.push(['bad',`จำนวน × ราคา ≠ ยอดเงิน (${(qty*unit).toLocaleString(undefined,{maximumFractionDigits:2})})`]);
   if(!String(r.item).trim())flags.push(['warn','ไม่มีรหัสสินค้า']);
   return flags;
  });
 }
 function review(docs,fileName){
  return new Promise((resolve,reject)=>{
   if(!document.getElementById('ocrReviewCss')){const s=document.createElement('style');s.id='ocrReviewCss';s.textContent=CSS;document.head.append(s)}
   const back=document.createElement('div');back.id='ocrReview';back.setAttribute('role','dialog');back.setAttribute('aria-modal','true');
   const box=document.createElement('div');box.className='box';back.append(box);
   const render=()=>{
    box.innerHTML=`<h3>ตรวจข้อมูลที่อ่านจากไฟล์ PDF</h3><p class="sub">${esc(fileName)} · ${docs.length} PO · แก้ตัวเลขที่อ่านผิดให้ตรงกับใบจริง แถวสีแดงคือยังไม่ผ่านการตรวจ</p>${docs.map((d,di)=>{
     const flags=analyse(d.rows),sum=d.rows.reduce((a,r)=>a+(money(r.amount)||0),0),target=Number.isFinite(d.subtotal)?d.subtotal:NaN;
     const sumOk=Number.isFinite(target)?Math.abs(sum-target)<0.06:null;
     return `<section class="po" data-d="${di}"><div class="meta"><label>เลข PO<input data-f="po" value="${esc(d.po)}"></label><label>วันที่ PO<input data-f="date" value="${esc(d.date)}"></label><label>รหัสปลายทาง<input data-f="destCode" value="${esc(d.destCode)}"></label><label>ชื่อปลายทาง<input data-f="destName" value="${esc(d.destName)}"></label></div>
      <div class="scroll"><table><thead><tr><th>#</th><th>รหัสสินค้า</th><th>บาร์โค้ด</th><th>รายการสินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>ยอดเงิน</th><th></th></tr></thead><tbody>${d.rows.map((r,ri)=>{const f=flags[ri],cls=f.some(x=>x[0]==='bad')?'bad':f.length?'warn':'';return `<tr class="${cls}" data-r="${ri}"><td>${ri+1}</td><td><input data-f="item" value="${esc(r.item)}" style="min-width:110px"></td><td><input data-f="barcode" value="${esc(r.barcode)}" inputmode="numeric" style="min-width:140px"></td><td><input data-f="desc" value="${esc(r.desc)}" style="min-width:260px"></td><td><input data-f="qty" value="${esc(r.qty)}" inputmode="numeric" style="width:70px"></td><td><input data-f="unit" value="${esc(r.unit)}" inputmode="decimal" style="width:90px"></td><td><input data-f="amount" value="${esc(r.amount)}" inputmode="decimal" style="width:100px"></td><td>${f.map(x=>`<span class="flag ${x[0]}">${esc(x[1])}</span>`).join('')}<button type="button" data-del="${ri}" style="min-height:36px;border:1px solid #e0aca8;background:#fff;color:#a3140b;border-radius:8px;cursor:pointer">ลบแถว</button></td></tr>`}).join('')}</tbody></table></div>
      <p class="sum ${sumOk===null?'':sumOk?'ok':'bad'}">${d.rows.length} รายการ · ${d.rows.reduce((a,r)=>a+(Number(String(r.qty).replace(/,/g,''))||0),0)} ชิ้น · ยอดรวมที่คำนวณ ${sum.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}${sumOk===null?' · ไม่พบยอดรวมท้ายใบให้เทียบ':sumOk?' · ✓ ตรงกับยอดท้ายใบ':` · ✗ ไม่ตรงกับยอดท้ายใบ ${target.toLocaleString(undefined,{minimumFractionDigits:2})}`}</p></section>`}).join('')}
     <p class="err" role="alert"></p><div class="btns"><button type="button" data-c>ยกเลิก</button><button type="button" data-recheck>ตรวจใหม่</button><button type="button" class="go" data-ok>ใช้ข้อมูลนี้</button></div>`;
   };
   const pull=()=>{
    for(const sec of box.querySelectorAll('.po')){
     const d=docs[Number(sec.dataset.d)];
     for(const el of sec.querySelectorAll('.meta input'))d[el.dataset.f]=el.value;
     for(const tr of sec.querySelectorAll('tbody tr')){const r=d.rows[Number(tr.dataset.r)];for(const el of tr.querySelectorAll('input'))r[el.dataset.f]=el.value}
    }
   };
   box.addEventListener('click',e=>{
    if(e.target.closest('[data-c]')){back.remove();reject(Error('cancelled'));return}
    if(e.target.closest('[data-recheck]')){pull();render();return}
    const del=e.target.closest('[data-del]');
    if(del){pull();const sec=del.closest('.po'),d=docs[Number(sec.dataset.d)];d.rows.splice(Number(del.dataset.del),1);render();return}
    if(e.target.closest('[data-ok]')){
     pull();
     const problems=[];
     for(const d of docs){
      if(!d.po.trim())problems.push('มี PO ที่ยังไม่ได้ใส่เลข PO');
      if(!d.destCode.trim())problems.push(`PO ${d.po}: ยังไม่ได้ใส่รหัสปลายทาง`);
      if(!d.rows.length)problems.push(`PO ${d.po}: ไม่มีรายการสินค้า`);
      analyse(d.rows).forEach((f,i)=>{if(f.some(x=>x[0]==='bad'))problems.push(`PO ${d.po} แถว ${i+1}: ${f.find(x=>x[0]==='bad')[1]}`)});
     }
     if(problems.length){box.querySelector('.err').textContent='ยังใช้ไม่ได้: '+problems.slice(0,4).join(' · ')+(problems.length>4?` · และอีก ${problems.length-4} จุด`:'');return}
     back.remove();resolve(docs);
    }
   });
   document.addEventListener('keydown',function onKey(e){if(e.key==='Escape'&&document.body.contains(back)){back.remove();document.removeEventListener('keydown',onKey);reject(Error('cancelled'))}});
   render();document.body.append(back);box.querySelector('[data-ok]').focus();
  });
 }

 async function read(file,{onProgress=()=>{}}={}){
  const {docs,warnings}=await buildDocs(file,onProgress);
  onProgress('รอตรวจข้อมูลที่อ่านได้…');
  const confirmed=await review(docs,file.name);
  const rows=[HEADER];
  for(const d of confirmed)for(const r of d.rows)rows.push([d.po.trim(),d.destCode.trim().toUpperCase(),d.destName.trim(),d.date.trim(),String(r.item).trim(),digitsOf(r.barcode),String(r.desc).trim(),Number(String(r.qty).replace(/,/g,'')),money(r.unit),money(r.amount)]);
  return {sheets:[{name:'PO',rows}],warnings};
 }
 window.GVPdfOcr={read,_test:{buildDocs,parseTable,parseHeader,nameHint,checkDigitOk,digitsOf,HEADER}};
})();
