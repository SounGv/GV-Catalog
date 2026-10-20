// "สรุปส่งขนส่ง": the carrier's ORDER sheet for the branches in the open IT City order — the same columns as the
// carrier template (store code, recipient + address, sub-district, district, province, zip, zone, contact, phones,
// BOX, weight, client code, order no.), values only, one row per branch.
// Addresses come from the carrier's own "DATA ORDER …" workbook (sheet DATA) that staff drop in; it is kept in this
// browser only. IT City branch codes (W0003…) are paired once with the carrier's codes (IT001…); the pairing is
// suggested from the names and remembered on this computer.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const KEY_DATA='gv-itcity-carrier-data',KEY_MAP='gv-itcity-carrier-map';
 const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
 const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
 let data=read(KEY_DATA);                 // {file, savedAt, rows:[{code,name,address,sub,district,province,zip,contact,phone1,phone2}]}
 const map=read(KEY_MAP)||{};             // W-code -> carrier code
 let branches=[];                         // [{id,name,kind,code,auto,box,on}]
 const boxes=new Map(),offs=new Set();    // edits kept across re-renders

 // ---- the carrier's DATA sheet ----
 const norm=s=>String(s??'').trim();
 function parseData(wb){
  const ws=wb.Sheets.DATA||wb.Sheets[wb.SheetNames.find(n=>/data/i.test(n))]||wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
  const h=rows.findIndex(r=>r.some(c=>/รหัสร้าน/.test(c)));if(h<0)throw Error('ไม่พบหัวตาราง "รหัสร้าน" ในชีต DATA');
  const head=rows[h].map(norm),col=re=>head.findIndex(c=>re.test(c));
  const c={code:col(/รหัสร้าน/),name:col(/ชื่อร้าน|Recipient/i),address:col(/^ที่อยู่|Address/i),sub:col(/แขวง|ตำบล|Subdistrict/i),district:col(/^เขต|อำเภอ/),province:col(/จังหวัด|Province/i),zip:col(/ไปรษณีย์|Zip/i),contact:col(/ผู้ติดต่อ|Contact/i),phone1:col(/เบอร์โทร1|Phone/i),phone2:col(/เบอร์โทร2|Fax/i)};
  const out=[];
  for(const r of rows.slice(h+1)){const code=norm(r[c.code]);if(!code)continue;const o={code};for(const k of Object.keys(c))if(k!=='code')o[k]=c[k]>=0?norm(r[c[k]]):'';out.push(o)}
  if(!out.length)throw Error('ชีต DATA ไม่มีรายการร้าน');
  return out;
 }

 // ---- name matching: IT City names (English in the Excel order, Thai in a scanned PO) against the carrier's Thai names ----
 const EN={central:'เซ็นทรัล',centralplaza:'เซ็นทรัลพลาซ่า',plaza:'พลาซ่า',festival:'เฟสติวัล',westgate:'เวสท์เกต',future:'ฟิวเจอร์',park:'พาร์ค',rangsit:'รังสิต',seacon:'ซีคอน',square:'สแควร์',fortune:'ฟอร์จูน',town:'ทาวน์',zeer:'เซียร์',mega:'เมกา',bangna:'บางนา',robinson:'โรบินสัน',lotus:'โลตัส',tesco:'เทสโก้',mall:'มอลล์',korat:'โคราช',pattaya:'พัทยา',tukcom:'ตึกคอม',chiangmai:'เชียงใหม่',chiangrai:'เชียงราย',phuket:'ภูเก็ต',khonkaen:'ขอนแก่น',rama:'พระราม',pinklao:'ปิ่นเกล้า',bangkae:'บางแค',suphanburi:'สุพรรณบุรี',nasa:'นาซ่า',rayong:'ระยอง',star:'สตาร์',srinakarin:'ศรีนครินทร์',ladprao:'ลาดพร้าว',bangkapi:'บางกะปิ',pantip:'พันธุ์ทิพย์',ngamwongwan:'งามวงศ์วาน',udon:'อุดร',udonthani:'อุดรธานี',hatyai:'หาดใหญ่',nakhon:'นคร',sawan:'สวรรค์',ratchasima:'ราชสีมา',ubon:'อุบล',chonburi:'ชลบุรี',sriracha:'ศรีราชา',salaya:'ศาลายา',mahachai:'มหาชัย',terminal:'เทอร์มินอล',fashion:'แฟชั่น',island:'ไอส์แลนด์',marina:'มารีน่า',ayutthaya:'อยุธยา',korakot:'',lampang:'ลำปาง',phitsanulok:'พิษณุโลก',nongkhai:'หนองคาย',buriram:'บุรีรัมย์',surat:'สุราษฎร์',samui:'สมุย',krabi:'กระบี่',trang:'ตรัง',songkhla:'สงขลา',sakon:'สกล',roiet:'ร้อยเอ็ด',kalasin:'กาฬสินธุ์',mahasarakham:'มหาสารคาม',sermthai:'เสริมไทย',taweekit:'ทวีกิจ',aswann:'อัศวรรณ',westville:'',bangyai:'บางใหญ่',rattanathibet:'รัตนาธิเบศร์',cheangwattana:'แจ้งวัฒนะ',chaengwattana:'แจ้งวัฒนะ',nonthaburi:'นนทบุรี',samutsongkhram:'สมุทรสงคราม',samutprakan:'สมุทรปราการ',bangkhae:'บางแค',paragon:'พารากอน',emporium:'เอ็มโพเรียม',siam:'สยาม',lak:'หลัก',si:'สี่'};
 const STRIP=/(ไอที\s*ซิตี้|ไอทีซิตี้|it\s*city|เอช|เอซ|สาขา|ห้าง|ศูนย์การค้า|\s+)/gi;
 const thaiKey=s=>String(s||'').toLowerCase().replace(STRIP,'');
 // A guess is offered only when it is safe: every place word of the English name, put into Thai, is in exactly one
 // carrier store name; any English word we cannot put into Thai means no guess. Thai names (scanned PO) need a
 // close match. Anything else is left for staff to pick.
 const GENERIC=new Set(['it','city','the','shopping','center','centre','complex','branch','store','shop','department']);
 const EXTRA={samut:'สมุทร',songkhram:'สงคราม',sakhon:'สาคร',thammarat:'ธรรมราช',pathom:'ปฐม',ratchasima:'ราชสีมา',nakhonsithammarat:'นครศรีธรรมราช',prakan:'ปราการ',thani:'ธานี',chanthaburi:'จันทบุรี',chachoengsao:'ฉะเชิงเทรา',saraburi:'สระบุรี',lopburi:'ลพบุรี',kanchanaburi:'กาญจนบุรี',ratchaburi:'ราชบุรี',hua:'หัว',hin:'หิน',khon:'ขอน',kaen:'แก่น',chiang:'เชียง',mai:'ใหม่',rai:'ราย',hat:'หาด',yai:'ใหญ่',bang:'บาง',na:'นา',kapi:'กะปิ',ramindra:'รามอินทรา',ramintra:'รามอินทรา',rattanathibet:'รัตนาธิเบศร์',westgate:'เวสท์เกต',grand:'แกรนด์',world:'เวิลด์',east:'อีสต์',ville:'วิลล์',bangkhen:'บางเขน',rangsit:'รังสิต',future:'ฟิวเจอร์',park:'พาร์ค',plaza:'พลาซ',central:'เซ็นทรัล',mall:'มอลล์',lotus:'โลตัส',tesco:'เทสโก้'};
 const thaiWord=w=>EXTRA[w]??EN[w];
 const compact=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
 function suggest(name){
  if(!data)return'';
  const stores=data.rows.filter(r=>/^IT/i.test(r.code));
  const n=String(name||'');
  if(/[฀-๿]/.test(n)){
   const kg=grams(thaiKey(n));if(kg.size<3)return'';
   let best='',score=0,second=0;
   for(const r of stores){const g=grams(thaiKey(r.name));let hit=0;for(const x of kg)if(g.has(x))hit++;const sc=hit*2/(kg.size+g.size||1);if(sc>score){second=score;score=sc;best=r.code}else if(sc>second)second=sc}
   return score>=.6&&score-second>=.12?best:'';
  }
  const words=n.toLowerCase().replace(/it\s*city/g,' ').split(/[^a-z0-9]+/).filter(w=>w&&!GENERIC.has(w)&&!/^\d+$/.test(w));
  if(!words.length)return'';
  const thai=words.map(thaiWord);
  if(thai.some(t=>t===undefined))return'';            // a word we cannot read in Thai: no guess
  const need=thai.filter(Boolean);if(!need.length)return'';
  const hits=stores.filter(r=>{const k=compact(r.name);return need.every(t=>k.includes(compact(t)))});
  return hits.length===1?hits[0].code:'';
 }

 // ---- branches of the open order ----
 function update(lines){
  const seen=new Map();
  for(const r of lines)if(!seen.has(r.branch))seen.set(r.branch,{id:r.branch,name:r.branchName||r.branch,kind:r.trb?'Pickpack':'ส่งตรงสาขา'});
  branches=[...seen.values()].map(b=>{const remembered=map[b.id],auto=remembered?'':suggest(b.name);return{...b,code:remembered||auto||'',auto:!remembered&&!!auto,box:boxes.get(b.id)??1,on:!offs.has(b.id)}});
  draw();
 }
 const byCode=()=>new Map((data?.rows||[]).map(r=>[r.code,r]));
 function draw(){
  const host=$('carrierBody');if(!host)return;
  $('carrierData').textContent=data?`ไฟล์ที่อยู่: ${data.file} · ${data.rows.filter(r=>/^IT/i.test(r.code)).length} ร้าน IT City · อ่านเมื่อ ${data.savedAt}`:'ยังไม่มีไฟล์ที่อยู่ · เลือกไฟล์ DATA ORDER ของขนส่ง (ครั้งเดียว ระบบจำไว้ในเครื่องนี้)';
  if(!branches.length){host.innerHTML='<p class="muted">เลือกไฟล์ออเดอร์ก่อน</p>';return}
  const codes=byCode(),opts=(data?.rows||[]).filter(r=>/^IT/i.test(r.code)).map(r=>`<option value="${esc(r.code)}">${esc(r.code)} · ${esc(r.name)}</option>`).join('');
  // the same columns as the carrier's ORDER sheet, plus the PO branch it comes from
  const cell=v=>`<td>${esc(v??'')}</td>`;
  host.innerHTML=`<div class="table-scroll"><table class="carrier-table"><thead><tr><th>ส่ง</th><th>สาขาใน PO</th><th>ไอดีสาขา (รหัสร้าน)</th><th>ที่อยู่</th><th>ถนน*แขวง</th><th>เขต</th><th>จังหวัด</th><th>รหัสไปรษณีย์</th><th>Zone</th><th>ชื่อผู้ติดต่อ</th><th>เบอร์โทร1</th><th>เบอร์โทร2 / Fax</th><th class="num">BOX</th></tr></thead><tbody>${branches.map((b,i)=>{
   const r=codes.get(b.code)||{},tag=!b.code?'<span class="pill review">ไม่มี · เว้นว่าง</span>':b.auto?'<span class="pill unchecked">ระบบเดา ตรวจก่อน</span>':'';
   return`<tr class="${b.code?'':'need-code'}${b.on?'':' off'}"><td><input type="checkbox" data-i="${i}" data-f="on" ${b.on?'checked':''} aria-label="ส่ง ${esc(b.id)}"></td><td><b>${esc(b.id)}</b><br><small>${esc(b.name)}</small></td><td><select data-i="${i}" data-f="code"><option value="">— เลือก —</option>${opts}</select>${tag}</td>${cell([r.name,r.address].filter(Boolean).join(' '))}${cell(r.sub)}${cell(r.district)}${cell(r.province)}${cell(r.zip)}${cell('')}${cell(r.contact)}${cell(r.phone1)}${cell(r.phone2||(b.code?'0':''))}<td class="num"><input type="number" min="0" max="999" step="1" data-i="${i}" data-f="box" value="${b.box}"></td></tr>`}).join('')}</tbody></table></div>`;
  host.querySelectorAll('select[data-f=code]').forEach(s=>{s.value=branches[Number(s.dataset.i)].code});
  const on=branches.filter(b=>b.on),missing=on.filter(b=>!b.code).length;
  $('carrierSummary').textContent=`${on.length} สาขา · ${on.reduce((a,b)=>a+(Number(b.box)||0),0)} กล่อง`+(missing?` · ไม่มีไอดีสาขา ${missing} สาขา (ไฟล์จะเว้นว่างไว้)`:'');
  $('carrierDownload').disabled=!data||!on.length;
 }
 function onEdit(e){
  const t=e.target,b=branches[Number(t.dataset.i)];if(!b)return;
  if(t.dataset.f==='code'){b.code=t.value;b.auto=false;if(t.value)map[b.id]=t.value;else delete map[b.id];write(KEY_MAP,map)}
  else if(t.dataset.f==='box'){b.box=Math.max(0,Math.floor(Number(t.value)||0));boxes.set(b.id,b.box)}
  else if(t.dataset.f==='on'){b.on=t.checked;if(t.checked)offs.delete(b.id);else offs.add(b.id)}
  if(t.dataset.f!=='box')draw();else{const on=branches.filter(x=>x.on);$('carrierSummary').textContent=`${on.length} สาขา · ${on.reduce((a,x)=>a+(Number(x.box)||0),0)} กล่อง`}
 }
 async function onFile(e){
  const f=e.target.files[0];if(!f)return;
  try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const rows=parseData(wb);data={file:f.name,savedAt:new Date().toLocaleString('th-TH'),rows};write(KEY_DATA,data);
   for(const b of branches)if(!map[b.id]&&!b.code){const s=suggest(b.name);if(s){b.code=s;b.auto=true}}
   draw()}
  catch(err){alert('อ่านไฟล์ที่อยู่ไม่ได้: '+(err.message||err))}
  e.target.value='';
 }
 // the ORDER rows for the ticked branches; null (with a message) when a branch has no carrier code yet
 function build(){
  // a branch with no branch ID is kept with the ID left blank (and its PO name in the address so it can be found)
  const on=branches.filter(b=>b.on);
  const codes=byCode(),head=['','ที่อยู่','ถนน*แขวง','เขต','จังหวัด','รหัสไปรษณีย์','Zone','ชื่อผู้ติดต่อ','เบอร์โทร1','เบอร์โทร2 / Fax','BOX','น้ำหนัก','Client code','Order No.'];
  const rows=on.map(b=>{if(!b.code)return['',`${b.name} (${b.id})`,'','','','','','','','',Number(b.box)||0,'','',''];const r=codes.get(b.code)||{};const zip=/^\d+$/.test(r.zip||'')?Number(r.zip):(r.zip||'');return[b.code,[r.name,r.address].filter(Boolean).join(' '),r.sub||'',r.district||'',r.province||'',zip,'',r.contact||'',r.phone1||'',r.phone2||0,Number(b.box)||0,'','','']});
  const ws=XLSX.utils.aoa_to_sheet([head,...rows]);
  ws['!cols']=[10,90,14,14,14,12,8,18,16,16,8,10,12,12].map(w=>({wch:w}));
  ws['!autofilter']={ref:`A1:N${rows.length+1}`};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ORDER');
  return{wb,rows:[head,...rows]};
 }
 function download(){
  const out=build();if(out.error){alert(out.error);return}
  const wb=out.wb,d=new Date(),dd=String(d.getDate()).padStart(2,'0'),mm=String(d.getMonth()+1).padStart(2,'0'),yy=String((d.getFullYear()+543)%100).padStart(2,'0');
  XLSX.writeFile(wb,`ORDER_IT_CITY_${dd}_${mm}_${yy}.xlsx`);
 }
 function init(){
  const host=$('panelCarrier');if(!host)return;
  host.innerHTML=`<div class="view-heading"><h2>สรุปส่งขนส่ง</h2><span id="carrierSummary"></span></div>
   <p class="muted">ไฟล์ Excel ตามแบบฟอร์มขนส่ง (ชีต ORDER) · เลือกไอดีสาขา (IT0xx จากไฟล์หลัก DATA) ให้สาขาใน PO ครั้งแรกครั้งเดียว ระบบจำไว้ในเครื่องนี้ · กรอกจำนวนกล่องแล้วดาวน์โหลด</p>
   <div class="carrier-file"><label class="field">ไฟล์ที่อยู่ขนส่ง (DATA ORDER … .xlsx)<input id="carrierFile" type="file" accept=".xlsx,.xls"></label><p id="carrierData" class="muted"></p></div>
   <div id="carrierBody"></div>
   <div class="carrier-go"><button id="carrierDownload" type="button">ดาวน์โหลด Excel สรุปส่งขนส่ง</button></div>`;
  $('carrierFile').addEventListener('change',onFile);
  $('carrierBody').addEventListener('change',onEdit);
  $('carrierBody').addEventListener('input',e=>{if(e.target.dataset.f==='box')onEdit(e)});
  $('carrierDownload').addEventListener('click',download);
  draw();
 }
 window.ITCityCarrier={update,build};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
