// "Create scan job" confirmation box shared by the retailer tools. Shows the DryRun result as three
// key numbers and check rows; the raw DryRun fields stay one click away. Resolves true on confirm.
//   GVDryRunConfirm(preview, sourceFile, customerName) -> Promise<boolean>
(()=>{
 'use strict';
 const css=`#gvDryRun{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,20,16,.5);font-family:inherit}
 #gvDryRun .pc-box{width:100%;max-width:460px;max-height:90vh;overflow:auto;background:#fff;color:#18232b;border-radius:16px;padding:20px 22px;box-shadow:0 24px 60px rgba(0,0,0,.3);line-height:1.6}
 #gvDryRun h3{margin:0;font-size:17px}#gvDryRun .pc-file{margin:3px 0 0;font-size:13px;color:#64748b;word-break:break-all}
 #gvDryRun .pc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}#gvDryRun .pc-stats div{background:#f3f6f8;border-radius:10px;padding:10px 12px}
 #gvDryRun .pc-stats span{display:block;font-size:12px;color:#64748b}#gvDryRun .pc-stats strong{font-size:22px}
 #gvDryRun .pc-row{display:flex;gap:9px;align-items:flex-start;font-size:13px;margin:6px 0}#gvDryRun .pc-row>span{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800}
 #gvDryRun .pc-row.ok>span{background:#e3f6ee;color:#087c67}#gvDryRun .pc-row.warn>span{background:#fdf0cf;color:#8a6400}#gvDryRun .pc-row small{color:#64748b}
 #gvDryRun details{margin-top:12px;font-size:12px;color:#64748b}#gvDryRun summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
 #gvDryRun pre{margin:0;padding:10px;background:#f3f6f8;border-radius:8px;white-space:pre-wrap;font-size:12px;max-height:160px;overflow:auto}
 #gvDryRun .pc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
 #gvDryRun .pc-actions button{min-height:44px;border-radius:10px;padding:10px 16px;font-weight:700;border:1px solid #d6dce1;background:#fff;color:#123b2c;cursor:pointer}
 #gvDryRun .pc-actions #pcOk{background:#185c45;color:#fff;border-color:#123b2c}
 #gvDryRun button:focus-visible,#gvDryRun summary:focus-visible{outline:3px solid #18232b;outline-offset:2px}
 @media print{#gvDryRun{display:none!important}}`;
 let styled=false;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.GVDryRunConfirm=function(p,sourceFile,customerName){
  if(!styled){const st=document.createElement('style');st.textContent=css;document.head.append(st);styled=true}
  return new Promise(resolve=>{
   const nf=n=>Number(n||0).toLocaleString('th-TH');
   const skipped=(p.skipped_rows||[]).slice(0,8).map(r=>`${esc(r.branch)} ${esc(r.part)}: ${esc(r.reason)}`).join('<br>');
   const check=(ok,text)=>`<div class="pc-row ${ok?'ok':'warn'}"><span>${ok?'✓':'!'}</span><div>${text}</div></div>`;
   const raw=['rows_in','matched','to_insert','to_update','skipped','null_count','duplicate_count'].map(k=>`${k}: ${p[k]}`).join('\n');
   const sample=(p.sample_diff||[]).map(r=>`${r.branch} ${r.part} × ${r.qty_required}`).join('\n');
   const wrap=document.createElement('div');wrap.id='gvDryRun';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');
   wrap.innerHTML=`<div class="pc-box"><h3>สร้างงานยิงสแกน ${esc(customerName||'')}</h3><p class="pc-file">${esc(sourceFile)}</p>
    <div class="pc-stats"><div><span>รายการ</span><strong>${nf(p.to_insert)}</strong></div><div><span>สาขา</span><strong>${nf(p.branch_count)}</strong></div><div><span>ชิ้น</span><strong>${nf(p.qty_total)}</strong></div></div>
    ${check(!p.skipped,p.skipped?`ข้าม ${nf(p.skipped)} แถว<br><small>${skipped}</small>`:'อ่านครบทุกแถว ไม่มีแถวที่ข้าม')}
    ${check(!p.null_count,p.null_count?`${nf(p.null_count)} แถวข้อมูลไม่ครบ (สาขา/รหัสสินค้า/จำนวน)`:'ข้อมูลสาขา รหัสสินค้า และจำนวนครบทุกแถว')}
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
 };
})();
