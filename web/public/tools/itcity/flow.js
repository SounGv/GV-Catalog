// Page flow for the IT City tool, same behaviour as Jaymart: 1 choose file -> 2 check -> 3 pick a job.
// Step 3 is ordered and remembers what is done:
//   delivery forms (every branch printed)  ->  Excel download and scan-to-pack, in either order.
// A finished job shows a green tick; a job whose turn has not come is locked with the reason.
// Progress is kept in this browser per order file(s) (name + size + modified time).
// The sample file and the empty page are never locked.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const STORE='gv-itcity-progress-v1';
 const tiles=[...document.querySelectorAll('#stepWork .tile[data-panel]')];
 const panels={delivery:'panelDelivery',pack:'packView'};
 const blank=()=>({printed:[],excel:false,scan:false,skip:false});
 let hasLines=false,isSample=false,fileKey='',branchIds=[],kinds={},prog=blank(),skipArmed=0;
 const kindNames={direct:'ส่งตรงสาขา',pickpack:'Pickpack'};

 function toast(text){const t=$('toast');t.textContent=text;t.className='toast show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.className='toast'},3600)}
 function readStore(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch{return{}}}
 function save(){if(!fileKey)return;try{const all=readStore();all[fileKey]=prog;const keys=Object.keys(all);if(keys.length>30)for(const k of keys.slice(0,keys.length-30))delete all[k];localStorage.setItem(STORE,JSON.stringify(all))}catch{}}
 const keyOf=files=>[...files].map(f=>`${f.name}|${f.size}|${f.lastModified}`).sort().join('+');

 function setStep(done,now){
  document.querySelectorAll('#steps .stp').forEach(s=>{const n=Number(s.dataset.step);s.classList.toggle('done',n<=done);s.classList.toggle('now',n===now)});
 }

 // ---- what is done / locked ----
 // "Done" is measured against the delivery type chosen above the print button (all types when none):
 // printing every branch of 'ส่งตรงสาขา' completes the step for that type.
 const kind=()=>$('kindSelect').value;
 const scope=()=>kind()?branchIds.filter(id=>kinds[id]===kind()):branchIds;
 const total=()=>scope().length;
 const printedCount=()=>scope().filter(id=>prog.printed.includes(id)).length;
 const printedAll=()=>total()>0&&printedCount()===total();
 const tracked=()=>hasLines&&!isSample;
 // Direct-to-branch bills are never locked: Excel and scan are open without printing first.
 const lockReason=()=>tracked()&&kind()!=='direct'&&!(prog.skip||printedAll())?`ต้องพิมพ์ใบส่งของให้ครบทุกสาขา${kind()?'ของ'+kindNames[kind()]:''}ก่อน`:'';
 // The scan list stays open with no file loaded, so another PC can open an existing job.
 const lockOf=name=>name==='delivery'?'':lockReason();

 function paint(tile,{done,locked,reason,sub}){
  tile.classList.toggle('done',!!done);tile.classList.toggle('locked',!!locked);
  tile.setAttribute('aria-disabled',locked?'true':'false');tile.dataset.reason=reason||'';
  let b=tile.querySelector('.tile-badge');if(!b){b=document.createElement('em');b.className='tile-badge';tile.append(b)}
  b.textContent=done?'✓ เสร็จแล้ว':locked?'🔒 ล็อก':'';b.hidden=!b.textContent;
  const s=[...tile.querySelectorAll('span')].pop();
  if(s){if(!s.dataset.orig)s.dataset.orig=s.textContent;s.textContent=sub||s.dataset.orig}
 }
 function render(){
  const delivery=tiles.find(t=>t.dataset.panel==='delivery'),pack=tiles.find(t=>t.dataset.panel==='pack'),excel=$('exportButton');
  const t=tracked();
  paint(delivery,{done:t&&printedAll(),sub:t&&total()?`${kind()?kindNames[kind()]+' · ':''}พิมพ์แล้ว ${printedCount()} / ${total()} สาขา`:''});
  const why=lockReason();
  paint(excel,{done:t&&prog.excel,locked:!!why,reason:why,sub:why?`🔒 ${why}`:t&&prog.excel?'ดาวน์โหลดแล้ว':''});
  paint(pack,{done:t&&prog.scan,locked:!!why,reason:why,sub:why?`🔒 ${why}`:t&&prog.scan?'สร้างงานยิงสแกนแล้ว':''});
  excel.classList.toggle('need',!hasLines);delivery.classList.toggle('need',!hasLines);
  const link=$('skipLock');link.hidden=!why;
  if(!why)skipArmed=0;
  link.textContent=skipArmed?'กดอีกครั้งเพื่อยืนยัน: ข้ามขั้นตอนที่ล็อก (ใช้เมื่อพิมพ์ไม่ได้จริงๆ)':'พิมพ์ไม่ได้ / ข้ามขั้นตอนที่ล็อก';
  if(hasLines){
   const done=[printedAll(),prog.excel,prog.scan].filter(Boolean).length;
   $('workHint').textContent=t?`เสร็จแล้ว ${done} / 3 งาน`+(prog.skip&&!printedAll()?' · ข้ามการล็อกแล้ว':'')+' · กดช่องซ้ำเพื่อปิด':'กำลังดูไฟล์ตัวอย่าง · เลือกไฟล์จริงเพื่อเริ่มงาน';
  }
 }

 // ---- panels ----
 function closeAll(){for(const [k,id] of Object.entries(panels)){const p=$(id);if(p)p.hidden=true;tiles.find(t=>t.dataset.panel===k)?.classList.remove('on')}}
 function openPanel(name){
  const panel=$(panels[name]),tile=tiles.find(t=>t.dataset.panel===name);
  if(!panel)return;
  const wasOpen=!panel.hidden;
  closeAll();
  if(wasOpen)return;
  panel.hidden=false;tile.classList.add('on');
  window.dispatchEvent(new CustomEvent('itcity-panel-open',{detail:name}));
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 for(const t of tiles)t.addEventListener('click',()=>{
  const name=t.dataset.panel;
  if(name==='delivery'&&!hasLines)return toast('เลือกไฟล์ออเดอร์ก่อน');
  const why=lockOf(name);
  if(why)return toast(why);
  openPanel(name);
 });
 // The Excel tile is the page's own export button: guard it before the export code sees the click.
 $('exportButton').addEventListener('click',e=>{
  if(!hasLines){e.stopImmediatePropagation();return toast('เลือกไฟล์ออเดอร์ก่อน')}
  const why=lockOf('export');
  if(why){e.stopImmediatePropagation();toast(why)}
 },true);

 const link=document.createElement('button');link.type='button';link.id='skipLock';link.className='skip-lock';link.hidden=true;
 $('workPanels').before(link);
 link.addEventListener('click',()=>{
  if(!skipArmed){skipArmed=1;render();clearTimeout(link.timer);link.timer=setTimeout(()=>{skipArmed=0;render()},6000);return}
  skipArmed=0;prog.skip=true;save();render();
 });

 // ---- progress signals from the page code ----
 const mark=fn=>e=>{if(!tracked())return;fn(e.detail||{});save();render()};
 window.addEventListener('itcity-delivery-printed',mark(d=>{for(const id of d.branches||[])if(!prog.printed.includes(String(id)))prog.printed.push(String(id))}));
 window.addEventListener('itcity-excel-downloaded',mark(()=>{prog.excel=true}));
 window.addEventListener('itcity-scan-created',mark(()=>{prog.scan=true}));

 // ---- file lifecycle (the page re-renders on every filter change, so only react to a new file) ----
 const note=document.createElement('p');note.className='lockline';note.id='checkEmpty';note.textContent='เลือกไฟล์ออเดอร์ก่อน ระบบจะตรวจ SKU และบาร์โค้ดให้อัตโนมัติ';
 document.querySelector('#stepCheck .step-head').after(note);
 window.addEventListener('itcity-render',e=>{
  const d=e.detail||{};
  hasLines=!!d.hasLines;isSample=!!d.isSample;
  kinds=d.kinds||{};
  const key=isSample?'':keyOf($('orderFiles').files),ids=(d.branches||[]).map(String).sort();
  if(key!==fileKey||ids.join(',')!==branchIds.join(',')){
   fileKey=key;branchIds=ids;prog={...blank(),...(key?readStore()[key]||{}:{})};
  }
  document.body.classList.toggle('has-report',hasLines);
  $('checkChip').hidden=!hasLines;note.hidden=hasLines;
  if(!hasLines){closeAll();$('workHint').textContent='เลือกไฟล์ก่อน จึงจะพิมพ์ใบส่งของและดาวน์โหลดได้ · ยิงสแกนเปิดได้ตลอด'}
  render();
  hasLines?setStep(2,3):setStep($('orderFiles').files.length?1:0,$('orderFiles').files.length?2:1);
 });
 $('kindSelect').addEventListener('change',render);
 render();
})();
