// Scan-to-pack for Jaymart: lists this customer's scan jobs, creates one from the
// order file that is open (DryRun first, nothing is written until confirmed), and
// opens the scan screen full-window in place. Gets the parsed order through the
// same 'jaymart-order-ready' event the label tool uses.
(()=>{
 'use strict';
 const style=document.createElement('style');
 style.textContent=`#packTool{margin-top:18px}#packTool h2{margin:0;font-size:18px}#packTool .pack-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
 #packTool .pack-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}#packTool button,.pack-side button,#packScreen .pack-bar button{border:1px solid var(--green-dark);background:var(--green);color:#fff;border-radius:10px;padding:10px 14px;font-weight:700}
 #packTool button.secondary,#packScreen .pack-bar button{background:#fff;color:var(--green-dark);border-color:var(--line)}#packTool button:disabled{opacity:.5;cursor:default}
 #packTool table{width:100%;border-collapse:collapse;font-size:13px}#packTool th,#packTool td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}#packTool th{color:var(--muted);font-size:12px;background:#f3f6f8}
 #packTool td.num{text-align:right;font-variant-numeric:tabular-nums}#packTool td.empty{color:var(--muted);text-align:center;padding:22px}#packTool .pack-msg{font-size:13px;margin-bottom:10px}#packTool .pack-msg.bad{color:var(--red)}
 .pack-side{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.pack-side h3{margin:0 0 8px;font-size:15px}.pack-side button{width:100%}
 #packScreen{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:#f7f8fa}#packScreen[hidden]{display:none}
 #packScreen .pack-bar{display:flex;align-items:center;gap:12px;padding:6px 12px;border-bottom:1px solid var(--line);background:#fff;font-weight:800}#packScreen .pack-bar button{padding:6px 12px}
 #packFrame{display:block;flex:1;width:100%;min-height:0;border:0;background:#f7f8fa}body.pack-open{overflow:hidden}@media print{#packTool,.pack-side,#packScreen{display:none!important}}`;
 document.head.append(style);

 const tool=document.createElement('section');tool.id='packTool';tool.className='card';tool.style.padding='18px';
 tool.innerHTML=`<div class="pack-head"><h2>ยิงสแกนลงลัง</h2><span id="packJobCount" style="font-size:12px;color:var(--muted)"></span></div>
 <div class="pack-actions"><button id="packJobButton" type="button" disabled>สร้างงานยิงสแกนจากไฟล์ที่เปิดอยู่</button><button id="packRefresh" class="secondary" type="button">รีเฟรชรายการงาน</button></div>
 <div id="packMsg" class="pack-msg" role="status"></div><div style="overflow-x:auto"><table id="packJobs"></table></div>`;
 document.querySelector('.main').append(tool);

 const side=document.createElement('section');side.className='pack-side';
 side.innerHTML='<h3>ยิงสแกนลงลัง</h3><button id="packOpenButton" type="button">เปิดหน้ายิงสแกนสินค้า</button>';
 document.querySelector('aside.panel').append(side);

 const screen=document.createElement('div');screen.id='packScreen';screen.hidden=true;
 screen.innerHTML='<div class="pack-bar"><button id="packBack" type="button">‹ กลับ Jaymart</button><span>ยิงสแกนลงลัง · Jaymart</span></div><iframe id="packFrame" title="หน้ายิงสแกน" allow="camera; microphone; fullscreen"></iframe>';
 document.body.append(screen);

 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let report=null;
 const msg=(text,bad)=>{$('packMsg').textContent=text||'';$('packMsg').className='pack-msg'+(bad?' bad':'')};

 async function loadPackJobs(){
  $('packJobCount').textContent='กำลังโหลด…';
  try{
   const res=await fetch('/api/pack/jobs?customer=Jaymart',{cache:'no-store'});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||('HTTP '+res.status));
   const when=iso=>new Date(iso).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'});
   $('packJobCount').textContent=data.jobs.length+' งาน';
   $('packJobs').innerHTML=data.jobs.length?'<thead><tr><th>ไฟล์ออเดอร์</th><th>สร้างเมื่อ</th><th>สแกนแล้ว / ต้องการ</th><th>ครบแพ็คแล้ว</th><th></th></tr></thead><tbody>'+data.jobs.map(j=>`<tr><td>${esc(j.sourceFile)}</td><td>${esc(when(j.createdAt)+(j.createdBy?' · '+j.createdBy:''))}</td><td class="num">${j.scanned.toLocaleString()} / ${j.required.toLocaleString()}</td><td class="num">${j.closedCount} / ${j.branchCount}</td><td><button type="button" data-pack-job="${esc(j.id)}">เปิดสแกน</button></td></tr>`).join('')+'</tbody>':'<tbody><tr><td class="empty">ยังไม่มีงานสแกน — เลือกไฟล์ออเดอร์ กดตรวจสอบ แล้วกด "สร้างงานยิงสแกนจากไฟล์ที่เปิดอยู่"</td></tr></tbody>';
  }catch(e){$('packJobCount').textContent='';msg('โหลดรายการงานสแกนไม่สำเร็จ: '+e.message,true)}
 }

 // The whole order file (every branch), ITEM_CODE as the barcode to scan — the
 // customer barcode is the truth for Jaymart, there is no system barcode to fall back to.
 async function createPackJob(){
  if(!report)return msg('ยังไม่มีรายการ — เลือกไฟล์ออเดอร์แล้วกด "ตรวจสอบและเติมข้อมูล" ก่อน',true);
  const sourceFile=$('orderFile').files[0]?.name||'Jaymart order';
  let createdBy='';try{createdBy=localStorage.getItem('gv-pack-scanner-name')||''}catch{}
  const lines=report.branches.flatMap(b=>b.rows.map(r=>({branch:String(b.id),branchName:String(b.inputName||'').trim()||b.master?.name||'',po:r.po||'',part:String(r.item),description:r.desc||'',customerBarcode:String(r.item),qty:Number(r.unit)})));
  if(!lines.length)return msg('ไฟล์นี้ไม่มีรายการสินค้าให้ยิง',true);
  const button=$('packJobButton');button.disabled=true;msg('');
  const send=async dryRun=>{const res=await fetch('/api/pack/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:'Jaymart',sourceFile,createdBy,dryRun,lines})});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||('HTTP '+res.status));return data};
  try{
   const p=(await send(true)).preview;
   const sample=p.sample_diff.map(s=>`  ${s.branch} ${s.part} × ${s.qty_required}`).join('\n');
   const skipped=p.skipped_rows.length?`\nรายการที่ข้าม:\n${p.skipped_rows.map(s=>`  ${s.branch} ${s.part}: ${s.reason}`).join('\n')}`:'';
   const dup=p.existing_job_ids.length?`\n\n⚠ เคยสร้างงานจากไฟล์นี้แล้ว ${p.existing_job_ids.length} งาน — กดยืนยันจะได้งานใหม่แยกอีกงาน`:'';
   const text=`ตรวจก่อนสร้างงานยิงสแกน Jaymart (DryRun)\n\nrows_in: ${p.rows_in}\nmatched: ${p.matched}\nto_insert: ${p.to_insert}\nto_update: ${p.to_update}\nskipped: ${p.skipped}\nnull_count: ${p.null_count}\nduplicate_count: ${p.duplicate_count}\n\n${p.branch_count} สาขา · รวม ${p.qty_total} ชิ้น\nsample_diff:\n${sample}${skipped}${dup}\n\nยืนยันสร้างงาน?`;
   if(!confirm(text))return;
   const {jobId}=await send(false);
   openPackJob(jobId);
  }catch(e){msg('สร้างงานยิงสแกนไม่สำเร็จ: '+e.message,true)}
  finally{button.disabled=!report}
 }

 function openPackJob(jobId){
  screen.hidden=false;document.body.classList.add('pack-open');
  const frame=$('packFrame');frame.onload=()=>frame.focus();frame.src='/pack/'+encodeURIComponent(jobId)+'?embed=1';
 }
 function closePackJob(){$('packFrame').src='about:blank';screen.hidden=true;document.body.classList.remove('pack-open');loadPackJobs()}

 $('packJobs').addEventListener('click',e=>{const id=e.target.closest('[data-pack-job]')?.dataset.packJob;if(id)openPackJob(id)});
 $('packJobButton').addEventListener('click',createPackJob);
 $('packRefresh').addEventListener('click',loadPackJobs);
 $('packBack').addEventListener('click',closePackJob);
 $('packOpenButton').addEventListener('click',()=>{tool.scrollIntoView({behavior:'smooth',block:'start'});loadPackJobs()});
 window.addEventListener('jaymart-order-ready',e=>{report=e.detail;$('packJobButton').disabled=false;msg('')});
 $('orderFile').addEventListener('change',()=>{report=null;$('packJobButton').disabled=true});
 loadPackJobs();
})();
