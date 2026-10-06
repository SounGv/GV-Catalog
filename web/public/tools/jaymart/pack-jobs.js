// Scan-to-pack for Jaymart: lists this customer's scan jobs, creates one from the
// order file that is open (DryRun first, nothing is written until confirmed), and
// opens the scan screen full-window in place. Gets the parsed order through the
// same 'jaymart-order-ready' event the label tool uses.
(()=>{
 'use strict';
 const style=document.createElement('style');
 style.textContent=`#packTool h2{margin:0;font-size:16px}#packTool .pack-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
 #packTool .pack-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}#packTool button{min-height:44px}#packConfirm .pc-actions button{min-height:44px}#packTool button,#packScreen .pack-bar button{border:1px solid var(--green-dark);background:var(--green);color:#fff;border-radius:10px;padding:10px 14px;font-weight:700}
 #packTool button.secondary,#packScreen .pack-bar button{background:#fff;color:var(--green-dark);border-color:var(--line)}#packTool button:disabled{opacity:.5;cursor:default}
 #packTool table{width:100%;border-collapse:collapse;font-size:13px}#packTool th,#packTool td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}#packTool th{color:var(--muted);font-size:12px;background:#f3f6f8}
 #packTool td.num{text-align:right;font-variant-numeric:tabular-nums}#packTool td.empty{color:var(--muted);text-align:center;padding:22px}#packTool .pack-msg{font-size:13px;margin-bottom:10px}#packTool .pack-msg.bad{color:var(--red)}
  #packScreen{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:#f7f8fa}#packScreen[hidden]{display:none}
 #packScreen .pack-bar{display:flex;align-items:center;gap:12px;padding:6px 12px;border-bottom:1px solid var(--line);background:#fff;font-weight:800}#packScreen .pack-bar button{padding:6px 12px}
 #packFrame{display:block;flex:1;width:100%;min-height:0;border:0;background:#f7f8fa} #packConfirm{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,20,16,.5)}
 #packConfirm .pc-box{width:100%;max-width:460px;max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:20px 22px;box-shadow:0 24px 60px rgba(0,0,0,.3)}
 #packConfirm h3{margin:0;font-size:17px}#packConfirm .pc-file{margin:3px 0 0;font-size:13px;color:var(--muted);word-break:break-all}
 #packConfirm .pc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}#packConfirm .pc-stats div{background:#f3f6f8;border-radius:10px;padding:10px 12px}
 #packConfirm .pc-stats span{display:block;font-size:12px;color:var(--muted)}#packConfirm .pc-stats strong{font-size:22px}
 #packConfirm .pc-row{display:flex;gap:9px;align-items:flex-start;font-size:13px;margin:6px 0}#packConfirm .pc-row>span{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800}
 #packConfirm .pc-row.ok>span{background:#e3f6ee;color:#087c67}#packConfirm .pc-row.warn>span{background:#fdf0cf;color:#8a6400}#packConfirm .pc-row small{color:var(--muted)}
 #packConfirm details{margin-top:12px;font-size:12px;color:var(--muted)}#packConfirm summary{cursor:pointer}#packConfirm pre{margin:8px 0 0;padding:10px;background:#f3f6f8;border-radius:8px;white-space:pre-wrap;font-size:12px;max-height:160px;overflow:auto}
 #packConfirm .pc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}#packConfirm .pc-actions button{border-radius:10px;padding:10px 16px;font-weight:700;border:1px solid var(--line);background:#fff;color:var(--green-dark)}
 #packConfirm .pc-actions #pcOk{background:var(--green);color:#fff;border-color:var(--green-dark)}
 body.pack-open{overflow:hidden}@media print{#packTool,#packScreen,#packConfirm{display:none!important}}`;
 document.head.append(style);

 const tool=document.createElement('section');tool.id='packTool';tool.hidden=true;
 tool.innerHTML=`<div class="pack-head"><h2>ยิงสแกนลงลัง</h2><span id="packJobCount" style="font-size:12px;color:var(--muted)"></span></div>
 <div class="pack-actions"><button id="packJobButton" type="button">สร้างงานยิงสแกนจากไฟล์ที่เปิดอยู่</button><button id="packRefresh" class="secondary" type="button">รีเฟรชรายการงาน</button></div>
 <div id="packMsg" class="pack-msg" role="status"></div><div style="overflow-x:auto"><table id="packJobs"></table></div>`;
 document.getElementById('workPanels').append(tool);

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
      GVJobReport.render({table:$('packJobs'),jobs:data.jobs,countEl:$('packJobCount'),emptyText:'ยังไม่มีงานสแกน — เลือกไฟล์ออเดอร์ กดตรวจสอบ แล้วกด "สร้างงานยิงสแกนจากไฟล์ที่เปิดอยู่"',onChange:loadPackJobs});
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
   if(!await confirmDryRun(p,sourceFile))return;
   const {jobId}=await send(false);
   window.dispatchEvent(new CustomEvent('jaymart-scan-created'));
   openPackJob(jobId);
  }catch(e){msg('สร้างงานยิงสแกนไม่สำเร็จ: '+e.message,true)}
  finally{button.disabled=false}
 }

 // DryRun result as a readable box (the raw fields stay one click away); resolves true on "สร้างงานและเริ่มสแกน".
 function confirmDryRun(p,sourceFile){
  return new Promise(resolve=>{
   const nf=n=>Number(n||0).toLocaleString('th-TH');
   const skipped=(p.skipped_rows||[]).slice(0,8).map(r=>`${esc(r.branch)} ${esc(r.part)}: ${esc(r.reason)}`).join('<br>');
   const check=(ok,text)=>`<div class="pc-row ${ok?'ok':'warn'}"><span>${ok?'✓':'!'}</span><div>${text}</div></div>`;
   const raw=['rows_in','matched','to_insert','to_update','skipped','null_count','duplicate_count'].map(k=>`${k}: ${p[k]}`).join('\n');
   const sample=(p.sample_diff||[]).map(r=>`${r.branch} ${r.part} × ${r.qty_required}`).join('\n');
   const wrap=document.createElement('div');wrap.id='packConfirm';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');
   wrap.innerHTML=`<div class="pc-box"><h3>สร้างงานยิงสแกน Jaymart</h3><p class="pc-file">${esc(sourceFile)}</p>
    <div class="pc-stats"><div><span>รายการ</span><strong>${nf(p.to_insert)}</strong></div><div><span>สาขา</span><strong>${nf(p.branch_count)}</strong></div><div><span>ชิ้น</span><strong>${nf(p.qty_total)}</strong></div></div>
    ${check(!p.skipped,p.skipped?`ข้าม ${nf(p.skipped)} แถว<br><small>${skipped}</small>`:'อ่านครบทุกแถว ไม่มีแถวที่ข้าม')}
    ${check(!p.null_count,p.null_count?`${nf(p.null_count)} แถวข้อมูลไม่ครบ (สาขา/รหัสสินค้า/จำนวน)`:'ทุกรายการมีบาร์โค้ดลูกค้า (ITEM_CODE)')}
    ${check(!p.duplicate_count,p.duplicate_count?`รวมแถวซ้ำ ${nf(p.duplicate_count)} แถว (นับรวมเป็นรายการเดียว)`:'ไม่มีรายการซ้ำ')}
    ${p.existing_job_ids&&p.existing_job_ids.length?check(false,`เคยสร้างงานจากไฟล์นี้แล้ว ${p.existing_job_ids.length} งาน — กดสร้างจะได้งานใหม่แยกอีกงาน`):''}
    <details><summary>ดูรายละเอียดตรวจสอบ (DryRun)</summary><pre>${esc(raw+'\n\nsample_diff:\n'+sample)}</pre></details>
    <div class="pc-actions"><button type="button" id="pcCancel">ยกเลิก</button><button type="button" id="pcOk">สร้างงานและเริ่มสแกน</button></div></div>`;
   const done=v=>{document.removeEventListener('keydown',onKey);wrap.remove();resolve(v)};
   const onKey=e=>{if(e.key==='Escape')done(false)};
   wrap.addEventListener('click',e=>{if(e.target===wrap)done(false)});
   document.addEventListener('keydown',onKey);
   document.body.append(wrap);
   wrap.querySelector('#pcCancel').onclick=()=>done(false);wrap.querySelector('#pcOk').onclick=()=>done(true);wrap.querySelector('#pcOk').focus();
  });
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
 window.addEventListener('jaymart-panel-open',e=>{if(e.detail==='pack')loadPackJobs()});
 window.addEventListener('jaymart-order-ready',e=>{report=e.detail;msg('')});
 $('orderFile').addEventListener('change',()=>{report=null});
 loadPackJobs();
})();
