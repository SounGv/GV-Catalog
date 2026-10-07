// Page flow for the Jaymart tool: 1 choose file -> 2 check -> 3 pick a job.
// Step 3 is ordered and remembers what is done:
//   A4 delivery form (every branch printed)  ->  product stickers (every branch printed)
//   ->  Excel download and scan-to-pack, in either order.
// A finished job shows a green tick; a job whose turn has not come is locked with the reason.
// Progress is kept in this browser per order file (name + size + modified time).
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const STORE='gv-jaymart-progress-v1';
 const tiles=[...document.querySelectorAll('#stepWork .tile[data-panel]')];
 const panels={form:'panelForm',label:'labelTool',pack:'packTool'};
 const needsReport=new Set(['form','label']);
 const blank=()=>({a4:[],labels:[],allLabels:false,excel:false,scan:false,skip:false});
 let hasReport=false,fileKey='',branchIds=[],branchInfo=[],prog=blank(),skipArmed=0;

 // ---- small helpers ----
 function toast(text){const t=$('toast');if(!t)return;t.textContent=text;t.className='toast show error';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.className='toast'},3600)}
 function readStore(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch{return{}}}
 function save(){if(!fileKey)return;try{const all=readStore();all[fileKey]=prog;const keys=Object.keys(all);if(keys.length>30)for(const k of keys.slice(0,keys.length-30))delete all[k];localStorage.setItem(STORE,JSON.stringify(all))}catch{}}
 const keyOf=f=>f?`${f.name}|${f.size}|${f.lastModified}`:'';

 function setStep(done,now){
  document.querySelectorAll('#steps .stp').forEach(s=>{const n=Number(s.dataset.step);s.classList.toggle('done',n<=done);s.classList.toggle('now',n===now)});
 }

 // ---- what is done / locked ----
 const total=()=>branchIds.length;
 const a4Count=()=>branchIds.filter(id=>prog.a4.includes(id)).length;
 const labelCount=()=>prog.allLabels?total():branchIds.filter(id=>prog.labels.includes(id)).length;
 const a4Done=()=>total()>0&&a4Count()===total();
 const labelDone=()=>total()>0&&labelCount()===total();
 const printsOk=()=>prog.skip||(a4Done()&&labelDone());
 // Without a checked file nothing is in progress, so the scan list stays open (another PC can open an existing job).
 // Jaymart orders go straight to the branch, so no job waits for another: the stickers, Excel and scan
 // are always open. The ticks still show what was printed or downloaded.
 const lockReason={
  label:()=>'',
  export:()=>'',
  pack:()=>'',
 };
 function lockOf(name){return (lockReason[name]||(()=>''))()}

 function paint(tile,{done,locked,reason,sub,badge}){
  tile.classList.toggle('done',!!done);tile.classList.toggle('locked',!!locked);
  tile.setAttribute('aria-disabled',locked?'true':'false');
  tile.dataset.reason=reason||'';
  let b=tile.querySelector('.tile-badge');if(!b){b=document.createElement('em');b.className='tile-badge';tile.append(b)}
  b.textContent=done?'✓ เสร็จแล้ว':locked?'🔒 ล็อก':badge||'';b.hidden=!b.textContent;
  const s=[...tile.querySelectorAll('span')].pop();
  if(s){if(!s.dataset.orig)s.dataset.orig=s.textContent;s.textContent=sub||s.dataset.orig}
 }
 function render(){
  const byName=n=>tiles.find(t=>t.dataset.panel===n);
  const form=byName('form'),label=byName('label'),pack=byName('pack'),excel=$('exportBtn');
  const skipped=prog.skip&&!(a4Done()&&labelDone());
  paint(form,{done:hasReport&&a4Done(),sub:hasReport&&total()?`พิมพ์แล้ว ${a4Count()} / ${total()} สาขา`:''});
  const lr=lockOf('label');
  paint(label,{done:hasReport&&labelDone(),locked:!!lr,reason:lr,sub:lr?`🔒 ${lr}`:hasReport&&total()?`พิมพ์แล้ว ${labelCount()} / ${total()} สาขา`:''});
  const er=lockOf('export');
  paint(excel,{done:hasReport&&prog.excel,locked:!!er,reason:er,sub:er?`🔒 ${er}`:prog.excel&&hasReport?'ดาวน์โหลดแล้ว':''});
  const pr=lockOf('pack');
  paint(pack,{done:hasReport&&prog.scan,locked:!!pr,reason:pr,sub:pr?`🔒 ${pr}`:prog.scan&&hasReport?'สร้างงานยิงสแกนแล้ว':''});
  // tiles that are locked or skipped
  const anyLocked=[lr,er,pr].some(Boolean);
  const link=$('skipLock');link.hidden=!anyLocked;
  if(!anyLocked)skipArmed=0;
  link.textContent=skipArmed?'กดอีกครั้งเพื่อยืนยัน: ข้ามขั้นตอนที่ล็อก (ใช้เมื่อพิมพ์ไม่ได้จริงๆ)':'พิมพ์ไม่ได้ / ข้ามขั้นตอนที่ล็อก';
  paintForm();
  // summary beside the heading
  if(hasReport){
   const done=[a4Done(),labelDone(),prog.excel,prog.scan].filter(Boolean).length;
   $('workHint').textContent=`เสร็จแล้ว ${done} / 4 งาน`+(skipped?' · ข้ามการล็อกแล้ว':'')+' · กดช่องซ้ำเพื่อปิด';
  }
 }

 // ---- A4 form panel: branch picker (printed ticks) and the 'print all' count ----
 function paintForm(){
  const pick=$('formBranchPick'),keep=pick.value;
  pick.replaceChildren(new Option('— เลือกสาขา —',''),...branchInfo.map(b=>new Option(`${prog.a4.includes(b.id)?'✓ ':''}${b.id} · ${b.name}${b.hasMaster?'':' (ไม่มีข้อมูลที่อยู่)'}`,b.id)));
  pick.value=branchInfo.some(b=>b.id===keep)?keep:'';
  const ok=branchInfo.filter(b=>b.hasMaster),left=branchInfo.filter(b=>!b.hasMaster);
  $('formAllCount').textContent=ok.length;
  $('formAllNote').textContent=left.length?`พิมพ์ทุกสาขาที่มีข้อมูลที่อยู่ในครั้งเดียว · ข้าม ${left.length} สาขาที่ไม่มีข้อมูล: ${left.map(b=>b.id).join(', ')}`:'พิมพ์ใบส่งของทุกสาขาในไฟล์ครั้งเดียว ไม่ต้องเลือกทีละสาขา';
 }
 $('formBranchPick').addEventListener('change',e=>{if(!e.target.value)return;$('branchIdInput').value=e.target.value;$('branchFormBtn').click()});

 // ---- panels ----
 function closeAll(){for(const [k,id] of Object.entries(panels)){const p=$(id);if(p)p.hidden=true;tiles.find(t=>t.dataset.panel===k)?.classList.remove('on')}}
 function openPanel(name){
  const panel=$(panels[name]),tile=tiles.find(t=>t.dataset.panel===name);
  if(!panel)return;
  const wasOpen=!panel.hidden;
  closeAll();
  if(wasOpen)return;
  panel.hidden=false;tile.classList.add('on');
  window.dispatchEvent(new CustomEvent('jaymart-panel-open',{detail:name}));
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 for(const t of tiles)t.addEventListener('click',()=>{
  const name=t.dataset.panel;
  if(needsReport.has(name)&&!hasReport)return toast('เลือกไฟล์ออเดอร์และกด "ตรวจสอบและเติมข้อมูล" ก่อน');
  const why=lockOf(name);
  if(why)return toast(why);
  openPanel(name);
 });
 // The Excel tile is the converter's own export button: guard it before the converter sees the click.
 $('exportBtn').addEventListener('click',e=>{
  if(!hasReport){e.stopImmediatePropagation();return toast('เลือกไฟล์ออเดอร์และกด "ตรวจสอบและเติมข้อมูล" ก่อน')}
  const why=lockOf('export');
  if(why){e.stopImmediatePropagation();toast(why)}
 },true);

 // escape hatch: two clicks, so a locked page can never trap a packer when the printer is down
 const link=document.createElement('button');link.type='button';link.id='skipLock';link.className='skip-lock';link.hidden=true;
 $('workPanels').before(link);
 link.addEventListener('click',()=>{
  if(!skipArmed){skipArmed=1;render();clearTimeout(link.timer);link.timer=setTimeout(()=>{skipArmed=0;render()},6000);return}
  skipArmed=0;prog.skip=true;save();render();
 });

 // ---- progress signals from the converter, label and scan scripts ----
 const mark=fn=>e=>{if(!hasReport)return;fn(e.detail||{});save();render()};
 window.addEventListener('jaymart-form-printed',mark(d=>{for(const id of (d.branches||[d.branch]).map(String))if(!prog.a4.includes(id))prog.a4.push(id)}));
 window.addEventListener('jaymart-labels-printed',mark(d=>{if(d.branch)(prog.labels.includes(String(d.branch))||prog.labels.push(String(d.branch)));else prog.allLabels=true}));
 window.addEventListener('jaymart-excel-downloaded',mark(()=>{prog.excel=true}));
 window.addEventListener('jaymart-scan-created',mark(()=>{prog.scan=true}));

 // ---- file and check lifecycle ----
 $('orderFile').addEventListener('change',()=>{
  hasReport=false;fileKey='';branchIds=[];branchInfo=[];prog=blank();
  document.body.classList.remove('has-report');$('checkChip').hidden=true;
  closeAll();render();
  setStep($('orderFile').files.length?1:0,$('orderFile').files.length?2:1);
 });
 window.addEventListener('jaymart-order-ready',e=>{
  hasReport=true;document.body.classList.add('has-report');$('checkChip').hidden=false;
  fileKey=keyOf($('orderFile').files[0]);
  branchIds=(e.detail?.branches||[]).map(b=>String(b.id));
  branchInfo=(e.detail?.branches||[]).map(b=>({id:String(b.id),name:String(b.inputName||'').trim(),hasMaster:!!b.master}));
  prog={...blank(),...(readStore()[fileKey]||{})};
  render();setStep(2,3);
 });
 render();
})();
