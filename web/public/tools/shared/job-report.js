// Scan-job history and report for one retailer tool, shared by Jaymart, IT City and Com7.
// Renders the job list into the tool's own <table>, adds filters (search, date range, status),
// a summary of the filtered jobs, and a per-job Excel report link (/api/pack/jobs/<id>/report).
// The "open scan" button keeps the data-pack-job attribute the tools already listen for.
//   GVJobReport.render({ table, jobs, countEl?, emptyText?, onChange })
// `onChange` reloads the list after a job is edited or deleted. Edit changes the display name and
// note; delete is offered only for a job with no scans and shows a DryRun first.
(()=>{
 'use strict';
 const css=`.jr-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:0 0 10px}
 .jr-bar label{display:block;font-size:12px;color:#5b6572;flex:1 1 150px}.jr-bar input,.jr-bar select{display:block;width:100%;min-height:44px;margin-top:4px;padding:8px 10px;border:1px solid #bdccc5;border-radius:8px;background:#fff;color:#18232b;font:inherit;font-size:14px}
 .jr-bar button{min-height:44px;padding:8px 14px;border:1px solid #c8d5d0;border-radius:8px;background:#fff;color:#28443a;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
 .jr-sum{margin:0 0 8px;font-size:13px;color:#3d4752;line-height:1.7}.jr-sum b{font-variant-numeric:tabular-nums}
 .jr-act{display:flex;gap:6px;flex-wrap:wrap}.jr-act a,.jr-act button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:6px 12px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;white-space:nowrap}
 .jr-act a{border:1px solid #c8d5d0;background:#fff;color:#28443a}
 .jr-st{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:800;white-space:nowrap}.jr-st.done{background:#e3f6ee;color:#0b5f3e}.jr-st.doing{background:#fff4d6;color:#7a5a00}.jr-st.todo{background:#eef1f4;color:#3d4752}
 .jr-empty{padding:22px 12px;text-align:center;color:#5b6a62}
 .jr-title{font-weight:800}.jr-sub{display:block;font-size:12px;color:#5b6572;overflow-wrap:anywhere}.jr-note{display:block;font-size:12px;color:#3d4752;margin-top:2px}
 .jr-act .jr-del{border:1px solid #e0aca8;background:#fff;color:#a3140b}
 #jrModal{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,20,16,.5);font-family:inherit}
 #jrModal .jr-box{width:100%;max-width:460px;max-height:90vh;overflow:auto;background:#fff;color:#18232b;border-radius:16px;padding:20px 22px;box-shadow:0 24px 60px rgba(0,0,0,.3);line-height:1.6}
 #jrModal h3{margin:0 0 4px;font-size:17px}#jrModal .jr-file{margin:0 0 12px;font-size:13px;color:#64748b;overflow-wrap:anywhere}
 #jrModal label{display:block;font-size:13px;font-weight:700;margin-top:10px}#jrModal input,#jrModal textarea{display:block;width:100%;min-height:44px;margin-top:4px;padding:8px 10px;border:1px solid #bdccc5;border-radius:8px;font:inherit;font-size:14px}
 #jrModal textarea{min-height:88px;resize:vertical}
 #jrModal .jr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}#jrModal .jr-stats div{background:#f3f6f8;border-radius:10px;padding:8px 12px}#jrModal .jr-stats span{display:block;font-size:12px;color:#64748b}#jrModal .jr-stats strong{font-size:20px}
 #jrModal .jr-msg{margin:8px 0 0;font-size:13px}#jrModal .jr-msg.bad{color:#a3140b}
 #jrModal pre{margin:8px 0 0;padding:10px;background:#f3f6f8;border-radius:8px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
 #jrModal summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:#5b6572;font-size:13px}
 #jrModal .jr-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
 #jrModal .jr-btns button{min-height:44px;padding:8px 16px;border-radius:8px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1px solid #c8d5d0;background:#fff;color:#28443a}
 #jrModal .jr-btns .jr-ok{background:#185c45;color:#fff;border-color:#123b2c}#jrModal .jr-btns .jr-danger{background:#a3140b;color:#fff;border-color:#7d0f08}`;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bangkokDay=iso=>new Date(iso).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
 const when=iso=>new Date(iso).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'});
 const statusOf=j=>j.branchCount>0&&j.closedCount===j.branchCount?'done':j.scanned>0?'doing':'todo';
 const statusText={done:'✓ ครบทุกบิลแล้ว',doing:'กำลังยิง',todo:'ยังไม่เริ่ม'};
 const filters=new WeakMap();
 const label=j=>j.title||j.sourceFile;
 // A small modal shared by edit and delete. build(box, close) fills it; resolves when it is closed.
 function modal(build){
  return new Promise(done=>{
   const back=document.createElement('div');back.id='jrModal';back.setAttribute('role','dialog');back.setAttribute('aria-modal','true');
   const box=document.createElement('div');box.className='jr-box';back.append(box);
   const onKey=e=>{if(e.key==='Escape')close()};
   const close=()=>{back.remove();document.removeEventListener('keydown',onKey);done()};
   document.addEventListener('keydown',onKey);
   back.addEventListener('mousedown',e=>{if(e.target===back)close()});
   build(box,close);document.body.append(back);(box.querySelector('input,textarea,button')||box).focus();
  });
 }
 async function api(url,method,body){
  const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||('HTTP '+res.status));return data;
 }
 function editJob(job,onChange){
  return modal((box,close)=>{
   box.innerHTML=`<h3>แก้ไขงาน</h3><p class="jr-file">ไฟล์: ${esc(job.sourceFile)}</p><label>ชื่องาน<input id="jrTitle" maxlength="120" placeholder="เช่น รอบ 2 ส่งตรงหน้าสาขา" value="${esc(job.title||'')}"></label><label>หมายเหตุ<textarea id="jrNote" maxlength="500" placeholder="ไม่ใส่ก็ได้">${esc(job.note||'')}</textarea></label><p class="jr-msg" role="status"></p><div class="jr-btns"><button type="button" data-c>ยกเลิก</button><button type="button" class="jr-ok" data-s>บันทึก</button></div>`;
   const msg=box.querySelector('.jr-msg');box.querySelector('[data-c]').onclick=close;
   box.querySelector('[data-s]').onclick=async e=>{
    e.target.textContent='กำลังบันทึก…';
    try{await api('/api/pack/jobs/'+encodeURIComponent(job.id),'PATCH',{title:box.querySelector('#jrTitle').value,note:box.querySelector('#jrNote').value});close();if(onChange)onChange()}
    catch(err){e.target.textContent='บันทึก';msg.className='jr-msg bad';msg.textContent='บันทึกไม่สำเร็จ: '+err.message}
   };
  });
 }
 async function deleteJob(job,onChange){
  let preview;
  try{preview=(await api('/api/pack/jobs/'+encodeURIComponent(job.id),'DELETE',{dryRun:true})).preview}catch(err){alert('ตรวจงานก่อนลบไม่สำเร็จ: '+err.message);return}
  return modal((box,close)=>{
   const d=preview.sample_diff[0]||{};
   box.innerHTML=`<h3>ลบงานนี้?</h3><p class="jr-file">${esc(label(job))}</p><div class="jr-stats"><div><span>บิล</span><strong>${d.branches??0}</strong></div><div><span>รายการ</span><strong>${d.lines??0}</strong></div><div><span>สแกนแล้ว</span><strong>${d.scans??0}</strong></div></div>${d.rejected_scans?`<p class="jr-msg">มีการยิงที่ถูกปฏิเสธ ${d.rejected_scans} ครั้ง (ไม่อยู่ใน PO) จะถูกลบไปด้วย</p>`:''}${preview.blocked?`<p class="jr-msg bad">${esc(preview.blocked)}</p>`:'<p class="jr-msg">ลบแล้วกู้คืนไม่ได้ · ลบได้เฉพาะงานที่ยังไม่เริ่มยิง · ไฟล์ PO ต้นฉบับไม่ถูกลบ</p>'}<details><summary>ดูรายละเอียดตรวจสอบ (DryRun)</summary><pre>${esc(JSON.stringify(preview,null,2))}</pre></details><p class="jr-msg bad" data-err></p><div class="jr-btns"><button type="button" data-c>ยกเลิก</button>${preview.blocked?'':'<button type="button" class="jr-danger" data-d>ลบงานนี้</button>'}</div>`;
   box.querySelector('[data-c]').onclick=close;
   const del=box.querySelector('[data-d]');
   if(del)del.onclick=async()=>{
    del.textContent='กำลังลบ…';
    try{await api('/api/pack/jobs/'+encodeURIComponent(job.id),'DELETE');close();if(onChange)onChange()}
    catch(err){del.textContent='ลบงานนี้';box.querySelector('[data-err]').textContent='ลบไม่สำเร็จ: '+err.message}
   };
  });
 }
 function ensureStyle(){if(document.getElementById('jrStyle'))return;const s=document.createElement('style');s.id='jrStyle';s.textContent=css;document.head.append(s)}

 function render({table,jobs,countEl,emptyText,onChange}){
  ensureStyle();
  const holder=table.parentElement;
  let bar=holder.previousElementSibling&&holder.previousElementSibling.classList.contains('jr-wrap')?holder.previousElementSibling:null;
  if(!bar){
   bar=document.createElement('div');bar.className='jr-wrap';
   bar.innerHTML=`<div class="jr-bar"><label>ค้นหา<input type="search" data-f="q" placeholder="ชื่อไฟล์ / ชื่อผู้สร้าง"></label><label>ตั้งแต่วันที่<input type="date" data-f="from"></label><label>ถึงวันที่<input type="date" data-f="to"></label><label>สถานะ<select data-f="st"><option value="">ทั้งหมด</option><option value="done">ครบทุกบิลแล้ว</option><option value="doing">กำลังยิง</option><option value="todo">ยังไม่เริ่ม</option></select></label><button type="button" data-f="clear">ล้างตัวกรอง</button></div><p class="jr-sum" role="status"></p>`;
   holder.before(bar);
   const redraw=()=>render(filters.get(table));
   bar.addEventListener('input',redraw);
   bar.querySelector('[data-f=clear]').addEventListener('click',()=>{for(const el of bar.querySelectorAll('[data-f]'))if(el.tagName!=='BUTTON')el.value='';redraw()});
  }
  filters.set(table,{table,jobs,countEl,emptyText,onChange});
  if(!table.dataset.jrBound){table.dataset.jrBound='1';table.addEventListener('click',e=>{
   const o=filters.get(table),ed=e.target.closest('[data-jr-edit]'),de=e.target.closest('[data-jr-del]');
   const find=id=>o.jobs.find(j=>j.id===id);
   if(ed)editJob(find(ed.dataset.jrEdit),o.onChange);else if(de)deleteJob(find(de.dataset.jrDel),o.onChange);
  })}
  const val=k=>bar.querySelector(`[data-f=${k}]`).value;
  const q=val('q').trim().toLowerCase(),from=val('from'),to=val('to'),st=val('st');
  const shown=jobs.filter(j=>{
   const day=bangkokDay(j.createdAt);
   return (!q||`${j.sourceFile} ${j.title||''} ${j.note||''} ${j.createdBy||''}`.toLowerCase().includes(q))&&(!from||day>=from)&&(!to||day<=to)&&(!st||statusOf(j)===st);
  });
  const sum=k=>shown.reduce((a,j)=>a+(j[k]||0),0);
  bar.querySelector('.jr-sum').innerHTML=jobs.length?`แสดง <b>${shown.length}</b> จาก ${jobs.length} งาน · สแกนแล้ว <b>${sum('scanned').toLocaleString()}</b> / ต้องการ <b>${sum('required').toLocaleString()}</b> ชิ้น · ครบแพ็ค <b>${sum('closedCount')}</b> / ${sum('branchCount')} บิล`:'';
  if(countEl)countEl.textContent=jobs.length+' งาน';
  table.innerHTML=shown.length?`<thead><tr><th>ไฟล์</th><th>สร้างเมื่อ</th><th>สถานะ</th><th class="num" style="text-align:right">สแกนแล้ว / ต้องการ</th><th class="num" style="text-align:right">ครบแพ็คแล้ว</th><th></th></tr></thead><tbody>${shown.map(j=>{const s=statusOf(j);return `<tr><td>${j.title?`<span class="jr-title">${esc(j.title)}</span><span class="jr-sub">${esc(j.sourceFile)}</span>`:esc(j.sourceFile)}${j.note?`<span class="jr-note">📝 ${esc(j.note)}</span>`:''}</td><td>${esc(when(j.createdAt)+(j.createdBy?' · '+j.createdBy:''))}</td><td><span class="jr-st ${s}">${statusText[s]}</span></td><td class="num">${j.scanned.toLocaleString()} / ${j.required.toLocaleString()}</td><td class="num">${j.closedCount} / ${j.branchCount}</td><td><div class="jr-act"><button type="button" data-pack-job="${esc(j.id)}">เปิดสแกน</button><a href="/api/pack/jobs/${encodeURIComponent(j.id)}/report" download>รายงาน Excel</a><button type="button" data-jr-edit="${esc(j.id)}" style="border:1px solid #c8d5d0;background:#fff;color:#28443a">แก้ไข</button>${j.startedCount===0?`<button type="button" class="jr-del" data-jr-del="${esc(j.id)}">ลบ</button>`:''}</div></td></tr>`}).join('')}</tbody>`:`<tbody><tr><td class="empty jr-empty">${esc(jobs.length?'ไม่มีงานตรงกับตัวกรอง · กด "ล้างตัวกรอง"':(emptyText||'ยังไม่มีงานสแกน'))}</td></tr></tbody>`;
 }
 window.GVJobReport={render};
})();
