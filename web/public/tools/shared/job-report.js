// Scan-job history and report for one retailer tool, shared by Jaymart, IT City and Com7.
// Renders the job list into the tool's own <table>, adds filters (search, date range, status),
// a summary of the filtered jobs, and a per-job Excel report link (/api/pack/jobs/<id>/report).
// The "open scan" button keeps the data-pack-job attribute the tools already listen for.
//   GVJobReport.render({ table, jobs, countEl?, emptyText? })
(()=>{
 'use strict';
 const css=`.jr-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:0 0 10px}
 .jr-bar label{display:block;font-size:12px;color:#5b6572;flex:1 1 150px}.jr-bar input,.jr-bar select{display:block;width:100%;min-height:44px;margin-top:4px;padding:8px 10px;border:1px solid #bdccc5;border-radius:8px;background:#fff;color:#18232b;font:inherit;font-size:14px}
 .jr-bar button{min-height:44px;padding:8px 14px;border:1px solid #c8d5d0;border-radius:8px;background:#fff;color:#28443a;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
 .jr-sum{margin:0 0 8px;font-size:13px;color:#3d4752;line-height:1.7}.jr-sum b{font-variant-numeric:tabular-nums}
 .jr-act{display:flex;gap:6px;flex-wrap:wrap}.jr-act a,.jr-act button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:6px 12px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;white-space:nowrap}
 .jr-act a{border:1px solid #c8d5d0;background:#fff;color:#28443a}
 .jr-st{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:800;white-space:nowrap}.jr-st.done{background:#e3f6ee;color:#0b5f3e}.jr-st.doing{background:#fff4d6;color:#7a5a00}.jr-st.todo{background:#eef1f4;color:#3d4752}
 .jr-empty{padding:22px 12px;text-align:center;color:#5b6a62}`;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bangkokDay=iso=>new Date(iso).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
 const when=iso=>new Date(iso).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'});
 const statusOf=j=>j.branchCount>0&&j.closedCount===j.branchCount?'done':j.scanned>0?'doing':'todo';
 const statusText={done:'✓ ครบทุกบิลแล้ว',doing:'กำลังยิง',todo:'ยังไม่เริ่ม'};
 const filters=new WeakMap();
 function ensureStyle(){if(document.getElementById('jrStyle'))return;const s=document.createElement('style');s.id='jrStyle';s.textContent=css;document.head.append(s)}

 function render({table,jobs,countEl,emptyText}){
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
  filters.set(table,{table,jobs,countEl,emptyText});
  const val=k=>bar.querySelector(`[data-f=${k}]`).value;
  const q=val('q').trim().toLowerCase(),from=val('from'),to=val('to'),st=val('st');
  const shown=jobs.filter(j=>{
   const day=bangkokDay(j.createdAt);
   return (!q||`${j.sourceFile} ${j.createdBy||''}`.toLowerCase().includes(q))&&(!from||day>=from)&&(!to||day<=to)&&(!st||statusOf(j)===st);
  });
  const sum=k=>shown.reduce((a,j)=>a+(j[k]||0),0);
  bar.querySelector('.jr-sum').innerHTML=jobs.length?`แสดง <b>${shown.length}</b> จาก ${jobs.length} งาน · สแกนแล้ว <b>${sum('scanned').toLocaleString()}</b> / ต้องการ <b>${sum('required').toLocaleString()}</b> ชิ้น · ครบแพ็ค <b>${sum('closedCount')}</b> / ${sum('branchCount')} บิล`:'';
  if(countEl)countEl.textContent=jobs.length+' งาน';
  table.innerHTML=shown.length?`<thead><tr><th>ไฟล์</th><th>สร้างเมื่อ</th><th>สถานะ</th><th class="num" style="text-align:right">สแกนแล้ว / ต้องการ</th><th class="num" style="text-align:right">ครบแพ็คแล้ว</th><th></th></tr></thead><tbody>${shown.map(j=>{const s=statusOf(j);return `<tr><td>${esc(j.sourceFile)}</td><td>${esc(when(j.createdAt)+(j.createdBy?' · '+j.createdBy:''))}</td><td><span class="jr-st ${s}">${statusText[s]}</span></td><td class="num">${j.scanned.toLocaleString()} / ${j.required.toLocaleString()}</td><td class="num">${j.closedCount} / ${j.branchCount}</td><td><div class="jr-act"><button type="button" data-pack-job="${esc(j.id)}">เปิดสแกน</button><a href="/api/pack/jobs/${encodeURIComponent(j.id)}/report" download>รายงาน Excel</a></div></td></tr>`}).join('')}</tbody>`:`<tbody><tr><td class="empty jr-empty">${esc(jobs.length?'ไม่มีงานตรงกับตัวกรอง · กด "ล้างตัวกรอง"':(emptyText||'ยังไม่มีงานสแกน'))}</td></tr></tbody>`;
 }
 window.GVJobReport={render};
})();
