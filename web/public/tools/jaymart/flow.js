// Page flow for the Jaymart tool: 1 choose file -> 2 check -> 3 pick a job.
// Drives the step bar and the four job tiles; the converter, label and scan
// scripts keep their own logic and element ids.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const tiles=[...document.querySelectorAll('#stepWork .tile[data-panel]')];
 const panels={form:'panelForm',label:'labelTool',pack:'packTool'};
 const needsReport=new Set(['form','label']);
 let hasReport=false;

 function toast(text){const t=$('toast');if(!t)return;t.textContent=text;t.className='toast show error';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.className='toast'},3200)}

 function setStep(done,now){
  document.querySelectorAll('#steps .stp').forEach(s=>{const n=Number(s.dataset.step);s.classList.toggle('done',n<=done);s.classList.toggle('now',n===now)});
 }
 function refreshNeeds(){
  for(const t of tiles)t.classList.toggle('need',needsReport.has(t.dataset.panel)&&!hasReport);
  $('exportBtn').classList.toggle('need',!hasReport);
 }
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
  openPanel(name);
 });
 // The Excel tile is the converter's own export button; without a result there is nothing to export.
 $('exportBtn').addEventListener('click',e=>{if(!hasReport){e.stopImmediatePropagation();toast('เลือกไฟล์ออเดอร์และกด "ตรวจสอบและเติมข้อมูล" ก่อน')}},true);

 $('orderFile').addEventListener('change',()=>{
  hasReport=false;document.body.classList.remove('has-report');$('checkChip').hidden=true;
  closeAll();refreshNeeds();
  setStep($('orderFile').files.length?1:0,$('orderFile').files.length?2:1);
 });
 window.addEventListener('jaymart-order-ready',()=>{
  hasReport=true;document.body.classList.add('has-report');$('checkChip').hidden=false;
  $('workHint').textContent='เลือกงานที่ต้องการ กดซ้ำเพื่อปิด';
  refreshNeeds();setStep(2,3);
 });
 refreshNeeds();
})();
