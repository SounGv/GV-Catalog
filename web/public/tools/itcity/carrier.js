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

 // IT City stores in the carrier's DATA file (code + store name only; one code per store where DATA repeats a store,
 // the one used in past carrier orders), and the IT City branch codes (W…) paired with them, checked on PO 2 Oct 26.
 const STORES=[["IT001","เอช เซ็นทรัล เชียงใหม่"],["IT003","เอช สเปลฟิวเจอร์พาร์ค รังสิต"],["IT005","ไอทีซิตี้ เซ็นทรัลพลาซ่า ขอนแก่น"],["IT006","ไอทีซิตี้ เซ็นทรัลพลาซ่า เชียงราย"],["IT007","ไอที ซิตี้ เซ็นทรัลพลาซ่า พระราม2"],["IT008","ไอทีซิตี้ เซ็นทรัลเฟสติวัล เชียงใหม่"],["IT009","ไอทีซิตี้ เซ็นทรัลเวสท์เกต"],["IT010","ไอทีซิตี้ แฟชั่นไอส์แลนด์"],["IT011","ไอทีซิตี้ วีสแควร์ นครสวรรค์"],["IT012","ไอทีซิตี้ สตาร์พลาซ่า ระยอง"],["IT013","ไอทีซิตี้ เสริมไทยคอมเพล็กซ์ มหาสารคาม"],["IT014","ไอทีซิตี้ รอยัลพาร์ค ราชบุรี"],["IT015","ไอทีซิตี้ เซ็นทรัลเฟสติวัล หาดใหญ่"],["IT017","เอซ เซ็นทรัล ขอนแก่น"],["IT018","ไอทีซิตี้ ตึกคอมแลนด์มาร์ค อุดรธานี"],["IT020","ไอทีซิตี้ เซ็นทรัลพลาซ่า อุดรธานี"],["IT021","ไอทีซิตี้ เดอะมอลล์ โคราช"],["IT022","ไอทีซิตี้ เดอะมอลล์งามวงศ์วาน"],["IT024","ไอทีซิตี้ เซ็นทรัลแอร์พอร์ต เชียงใหม่"],["IT025","ไอทีซิตี้ เซ็นทรัลพลาซา พระราม2"],["IT027","ไอทีซิตี้ เดอะมอลล์ บางแค"],["IT028","ซีเอสซี เดอะมอลล์ บางแค"],["IT029","ไอทีซิตี้ สยามพารากอน"],["IT030","ไอทีซิตี้ เซ็นทรัล เวิลด์"],["IT031","ไอทีซิตี้ เซ็นทรัล ปิ่นเกล้า"],["IT032","เอช ฟอร์จูน"],["IT033","ACE @ เทอร์มินอล 21"],["IT035","ACE @ เซ็นทรัล จันทบุรี"],["IT036","ไอทีซิตี้ ซีคอนสแควร์ ศรีนครินทร์"],["IT037","IT CITY @ เซ็นทรัล ชลบุรี"],["IT038","ซีเอสซี โลตัส สาขาโชคชัย"],["IT039","ซีเอสซี เซ็นทรัลพลาซ่า ศาลายา"],["IT040","ไอทีซิตี้ เซ็นทรัลพลาซ่า ภูเก็ต"],["IT041","ไอทีซิตี้ เซ็นทรัล ลำปาง"],["IT042","ไอทีซิตี้ ศูนย์การค้ามาร์เก็ตวิลเลจ หัวหิน"],["IT043","ไอที.มาเก็ต วินเลจ สุวรรณภูมิ"],["IT044","ไอทีซิตี้ ตึกคอม พัทยา"],["IT045","ไอทีซิตี้ นาซ่ามอลล์ สุพรรณบุรี"],["IT046","ไอทีซิตี้ โรบินสันถลาง"],["IT047","Cศรีราชา"],["IT048","ไอทีซิตี้ เซ็นทรัลพิษณุโลก"],["IT049","ไอทีซิตี้ ทวีกิจซุปเปอร์เซ็นเตอร์บุรีรัมย์"],["IT050","ไอทีซิตี้ ศูนย์การค้าอัศวรรณช้อปปิ้งคอมเพล็กซ์หนองคาย"],["IT052","ไอทีซิตี้ เซ็นทรัลพลาซ่า มหาชัย"],["IT053","ไอทีซิตี้ เซ็นทรัล นครศรีธรรมราช"],["IT054","ไอทีซิตี้ โลตัส ถลาง"],["IT056","ไอทีซิตี้ เซ็นทรัลพลาซา นครราชสีมา"],["IT057","It.@ บิ๊กซี เลย"],["IT058","ไอทีซิตี้ เทอร์มินอล 21 โคราช"],["IT059","ซีเอสซี เซ็นทรัลเฟสติวัลสาขาเชียงใหม่"],["IT060","ไอทีซิตี้ เทสโก้โลตัสอู่ทอง"],["IT061","ไอทีซิตี้ โรบินสันสุพรรณบุรี"],["IT062","ไอทีซิตี้ เทสโก้โลตัสสมุทรสงคราม"],["IT063","ไอทีซิตี้ เทสโก้โลตัส บางกรวยไทรน้อย"],["IT064","เอช เซ็นทรัลฯ สาขาอุบลราชธานี"],["IT065","ไอทีซิตี้ เทสโก้โลตัส สงขลา"],["IT066","AMD Shop@ เมกา บางนา"],["IT067","ไอทีซิตี้ ฟิวเจอร์พาร์ค รังสิต"],["IT068","ไอทีซิตี้ ไอทีมอลล์ ฟอร์จูนทาว์น"],["IT071","ไอที ซิตี้ ซีคอน บางแค"],["IT072","ไอที ซิตี้ พันธุ์ทิพย์พลาซ่า งามวงศ์วาน"],["IT074","ไอที ซิตี้ สาขา ฟอร์จูนทาวน์"],["IT075","ACE @ เมกาบางนา"],["IT076","ไอทีซิตี้ เมกา บางนา"],["IT077","ไอที ซิตี้ เซียร์รังสิต"],["IT081","ไอที ซิตี้ โลตัส บางกรวยไทรน้อย 2"],["IT082","ไอที ซิตี้ เซ็นทรัลพลาซ่า ศาลายา"],["IT083","ไอทีซิตี้ ท๊อปไอที พิษณุโลก"],["IT084","ไอทีซิตี้ เดอะมอลล์ บางกะปิ"],["IT085","ไอทีซิตี้ เทสโก้โลตัส โคกสำโรง"],["IT086","ไอทีซิตี้ เทสโก้โลตัส อู่ตะเภา"],["IT087","ซีเอสซี โลตัส สาขาสมุย ชั้น1"],["IT088","ไอที ซิตี้ เซ็นทรัล ศรีราชา"],["IT089","ไอทีซิตี้ เทสโก้โลตัส แกลง"],["IT090","ซีเอสซี โลตัส สาขาหนองจอก"],["IT091","ไอทีซิตี้ เทสโก้โลตัส โพนทอง"],["IT092","ไอทีซิตี้ เทสโก้โลตัส อมตะนคร"],["IT093","ซีเอสซี โลตัส สาขาบางใหญ่ ชั้น1"],["IT094","ซีเอสซี โลตัส สาขาศรีนครินทร์"],["IT095","ไอทีซิตี้ โรบินสัน ศรีสมาน"],["IT096","SAMSUNG Brand Shop สาขาบิ๊กซีฯ เชียงราย2"],["IT097","ซัมซุง บิ๊กซี แพร่"],["IT098","ไอทีซิตี้ มาร์คโฟร์ แพร่"],["IT099","ซี เอส ซี บิ๊กซี ติวานนท์"],["IT100","ไอทีซิตี้ เทสโก้โลตัส พยัฆคภูมิพิสัย"],["IT101","ไอทีซีตี้ เทสโก้โลตัส จอมทอง / เชียงใหม่"],["IT102","ซี เอส ซี เอ็ม บี เค เซ็นเตอร์"],["IT103","SAMSUNG Brand Shop (SES) สาขาเกตเวย์เอกมัย ชั้น3"],["IT104","it.@ เซ็นทรัล อยุธยา"],["IT105","ไอทีซิตี้ เทสโก้โลตัสฉลอง ภูเก็ต"],["IT106","ไอทีซิตี้ เซ็นทรัลพลาซ่า แจ้งวัฒนะ"],["IT107","ไอทีซิตี้ อิมพีเรียบ สำโรง"],["IT108","IT บิ๊กซี ภูเก็ต"],["IT109","ACE โรบินสัน ฉะเชิงเทรา"],["IT110","ไอที ซิตี้ เซ็นทรัล นครปฐม"],["IT111","IT CITY-CSC เซ็นทรัล จันทบุรี"],["IT112","ซัมซุง แบรนด์ ชอพ บิ๊กซี น่าน"],["IT113","ไอที ซิตี้ สาขาเดอะมอลล์งามวงศ์วาน ชั้น6"],["IT114","ไอที ซิตี้ เซ็นทรัล เชียงใหม่แอร์พอร์ต"],["IT115","ไอที ซิตี้ เซ็นทรัล เวสต์วิลล์"],["IT116","ไอทีซิตี้ เทสโก้โลตัสรวมโชค เชียงใหม่"],["IT117","ไอที ซิตี้ สาขาแฟชั่นไอส์แลนด์2"],["IT118","ไอทีซิตี้ ไอทีสแควร์"],["IT119","ไอที ซิตี้ โรบินสัน สาขาสระบุรี ชั้น2"],["IT123","ไอที ซิตี้ เซ็นทรัลพลาซา พระราม 3"]];
 const W2IT={"W0003":"IT077","W0005":"IT036","W0009":"IT068","W0013":"IT123","W0018":"IT045","W0022":"IT044","W0028":"IT067","W0029":"IT072","W0031":"IT023","W0042":"IT021","W0053":"IT076","W0055":"IT071","W0059":"IT025","W0070":"IT008","W0076":"IT015","W0096":"IT048","W0097":"IT041","W0103":"IT009","W0107":"IT031","W0108":"IT020","W0174":"IT001","W0175":"IT006","W0180":"IT069","W0184":"IT030","W0231":"IT024","W0242":"IT117","W0254":"IT082","W0258":"IT027","W0319":"IT022","W0396":"IT017","W0413":"IT075","W0436":"IT037","W0443":"IT046","W0445":"IT054","W0456":"IT040","W0467":"IT084","W0472":"IT080","W0008":"IT012","W0035":"IT050","W0063":"IT062","W0078":"IT049","W0086":"IT013","W0111":"IT053","W0117":"IT058","W0123":"IT056","W0125":"IT052","W0146":"IT063","W0196":"IT074","W0209":"IT093","W0250":"IT059","W0251":"IT119","W0291":"IT064","W0308":"IT047","W0405":"IT104","W0431":"IT111","W0442":"IT043","W0485":"IT110","W0492":"IT007","W0500":"IT109","W0550":"IT108"};

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
 const grams=s=>{const g=new Set();for(let i=0;i<s.length-1;i++)g.add(s.slice(i,i+2));return g};
 const thaiKey=s=>String(s||'').toLowerCase().replace(STRIP,'');
 // A guess is offered only when it is safe: every place word of the English name, put into Thai, is in exactly one
 // carrier store name; any English word we cannot put into Thai means no guess. Thai names (scanned PO) need a
 // close match. Anything else is left for staff to pick.
 const GENERIC=new Set(['it','city','the','shopping','center','centre','complex','branch','store','shop','department']);
 const EXTRA={samut:'สมุทร',songkhram:'สงคราม',sakhon:'สาคร',thammarat:'ธรรมราช',pathom:'ปฐม',ratchasima:'ราชสีมา',nakhonsithammarat:'นครศรีธรรมราช',prakan:'ปราการ',thani:'ธานี',chanthaburi:'จันทบุรี',chachoengsao:'ฉะเชิงเทรา',saraburi:'สระบุรี',lopburi:'ลพบุรี',kanchanaburi:'กาญจนบุรี',ratchaburi:'ราชบุรี',hua:'หัว',hin:'หิน',khon:'ขอน',kaen:'แก่น',chiang:'เชียง',mai:'ใหม่',rai:'ราย',hat:'หาด',yai:'ใหญ่',bang:'บาง',na:'นา',kapi:'กะปิ',ramindra:'รามอินทรา',ramintra:'รามอินทรา',rattanathibet:'รัตนาธิเบศร์',westgate:'เวสท์เกต',grand:'แกรนด์',world:'เวิลด์',east:'อีสต์',ville:'วิลล์',bangkhen:'บางเขน',rangsit:'รังสิต',future:'ฟิวเจอร์',park:'พาร์ค',plaza:'พลาซ',central:'เซ็นทรัล',mall:'มอลล์',lotus:'โลตัส',tesco:'เทสโก้'};
 const thaiWord=w=>EXTRA[w]??EN[w];
 const compact=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
 function suggest(name){
  const stores=data?data.rows.filter(r=>/^IT/i.test(r.code)):STORES.map(([code,name])=>({code,name}));
  const n=String(name||'');
  if(/[฀-๿]/.test(n)){
   const exact=stores.find(r=>thaiKey(r.name)===thaiKey(n));if(exact)return exact.code;
   const kg=grams(thaiKey(n));if(kg.size<3)return'';
   let best='',score=0,second=0;
   for(const r of stores){const g=grams(thaiKey(r.name));let hit=0;for(const x of kg)if(g.has(x))hit++;const sc=hit*2/(kg.size+g.size||1);if(sc>score){second=score;score=sc;best=r.code}else if(sc>second)second=sc}
   return score>=.85||(score>=.6&&score-second>=.12)?best:'';
  }
  const words=n.toLowerCase().replace(/it\s*city/g,' ').split(/[^a-z0-9]+/).filter(w=>w&&!GENERIC.has(w)&&!/^\d+$/.test(w));
  if(!words.length)return'';
  const thai=words.map(thaiWord);
  if(thai.some(t=>t===undefined))return'';            // a word we cannot read in Thai: no guess
  const need=thai.filter(Boolean);if(!need.length)return'';
  const hits=stores.filter(r=>{const k=compact(r.name);return need.every(t=>k.includes(compact(t)))});
  return hits.length===1?hits[0].code:'';
 }

 // The PO's own ship-to (scanned IT City POB): name + address, split into sub-district / district / province / zip.
 function poAddress(name,address){
  let a=String(address||'').replace(/\s+/g,' ').trim();if(!a)return null;
  a=a.replace(/\sด\s*\.\s*/g,' ต.').replace(/([ตอจ])\s*\.\s*/g,'$1.').replace(/(ต\.|ตำบล|แขวง|อ\.|อำเภอ|เขต|จ\.|จังหวัด)/g,' $1').replace(/\s+/g,' ').trim();
  const clean=v=>v.replace(/(กรุงเทพ\S*|กทม\.?)$/,'').trim();
  const pick=re=>{const m=a.match(re);return m?clean(m[1]):''};
  const bkk=/กรุงเทพ|กทม/.test(a);
  return{name:String(name||'').trim(),address:a,
   sub:pick(/(?:ต\.|ตำบล|แขวง)\s*([^\s\d.]+)/),
   district:pick(/(?:อ\.|อำเภอ|เขต)\s*([^\s\d.]+)/),
   province:bkk?'กรุงเทพมหานคร':pick(/(?:จ\.|จังหวัด)\s*([^\s\d.]+)/),
   zip:pick(/(\d{5})(?!.*\d{5})/)};
 }

 // ---- branches of the open order ----
 function update(lines){
  const seen=new Map();
  for(const r of lines)if(!seen.has(r.branch))seen.set(r.branch,{id:r.branch,name:r.branchName||r.branch,kind:r.trb?'Pickpack':'ส่งตรงสาขา',po:poAddress(r.branchName,r.address)});
  branches=[...seen.values()].map(b=>{const remembered=map[b.id]||W2IT[b.id],auto=remembered?'':suggest(b.name);return{...b,code:remembered||auto||'',auto:!remembered&&!!auto,box:boxes.get(b.id)??1,on:!offs.has(b.id)}});
  draw();
 }
 const byCode=()=>new Map((data?.rows||[]).map(r=>[r.code,r]));
 function draw(){
  const host=$('carrierBody');if(!host)return;
  $('carrierData').textContent=data?`ไฟล์ที่อยู่: ${data.file} · ${data.rows.filter(r=>/^IT/i.test(r.code)).length} ร้าน IT City · อ่านเมื่อ ${data.savedAt}`:'ยังไม่มีไฟล์ที่อยู่ · เลือกไฟล์ DATA ORDER ของขนส่ง (ครั้งเดียว ระบบจำไว้ในเครื่องนี้)';
  if(!branches.length){host.innerHTML='<p class="muted">เลือกไฟล์ออเดอร์ก่อน</p>';return}
  const codes=byCode(),opts=(data?.rows||STORES.map(([code,name])=>({code,name}))).filter(r=>/^IT/i.test(r.code)).map(r=>`<option value="${esc(r.code)}">${esc(r.code)} · ${esc(r.name)}</option>`).join('');
  // the same columns as the carrier's ORDER sheet, plus the PO branch it comes from
  const cell=v=>`<td>${esc(v??'')}</td>`;
  host.innerHTML=`<div class="table-scroll"><table class="carrier-table"><thead><tr><th>ส่ง</th><th>สาขาใน PO</th><th>ไอดีสาขา (รหัสร้าน)</th><th>ที่อยู่</th><th>ถนน*แขวง</th><th>เขต</th><th>จังหวัด</th><th>รหัสไปรษณีย์</th><th>Zone</th><th>ชื่อผู้ติดต่อ</th><th>เบอร์โทร1</th><th>เบอร์โทร2 / Fax</th><th class="num">BOX</th></tr></thead><tbody>${branches.map((b,i)=>{
   const r=codes.get(b.code)||b.po||{},tag=!b.code?(b.po?'<span class="pill unchecked">ไม่มี · ใช้ที่อยู่จาก PO</span>':'<span class="pill review">ไม่มี · เว้นว่าง</span>'):b.auto?'<span class="pill unchecked">ระบบเลือกให้</span>':'';
   return`<tr class="${b.code?'':'need-code'}${b.on?'':' off'}"><td><input type="checkbox" data-i="${i}" data-f="on" ${b.on?'checked':''} aria-label="ส่ง ${esc(b.id)}"></td><td><b>${esc(b.id)}</b><br><small>${esc(b.name)}</small></td><td><select data-i="${i}" data-f="code"><option value="">— เลือก —</option>${opts}</select>${tag}</td>${cell([r.name,r.address].filter(Boolean).join(' '))}${cell(r.sub)}${cell(r.district)}${cell(r.province)}${cell(r.zip)}${cell('')}${cell(r.contact)}${cell(r.phone1)}${cell(r.phone2||(b.code?'0':''))}<td class="num"><input type="number" min="0" max="999" step="1" data-i="${i}" data-f="box" value="${b.box}"></td></tr>`}).join('')}</tbody></table></div>`;
  host.querySelectorAll('select[data-f=code]').forEach(s=>{s.value=branches[Number(s.dataset.i)].code});
  const on=branches.filter(b=>b.on),missing=on.filter(b=>!b.code).length;
  $('carrierSummary').textContent=`${on.length} สาขา · ${on.reduce((a,b)=>a+(Number(b.box)||0),0)} กล่อง`+(missing?` · ไม่มีไอดีสาขา ${missing} สาขา (ไฟล์จะเว้นว่างไว้)`:'');
  $('carrierWarn').hidden=!!data;
  $('carrierDownload').disabled=!on.length; // no DATA file: the PO's own ship-to address is used
 }
 function onEdit(e){
  const t=e.target,b=branches[Number(t.dataset.i)];if(!b)return;
  if(t.dataset.f==='code'){b.code=t.value;b.auto=false;if(t.value)map[b.id]=t.value;else delete map[b.id];write(KEY_MAP,map);changed()}
  else if(t.dataset.f==='box'){b.box=Math.max(0,Math.floor(Number(t.value)||0));boxes.set(b.id,b.box)}
  else if(t.dataset.f==='on'){b.on=t.checked;if(t.checked)offs.delete(b.id);else offs.add(b.id)}
  if(t.dataset.f!=='box')draw();else{const on=branches.filter(x=>x.on);$('carrierSummary').textContent=`${on.length} สาขา · ${on.reduce((a,x)=>a+(Number(x.box)||0),0)} กล่อง`}
 }
 async function onFile(e){
  const f=e.target.files[0];if(!f)return;
  try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const rows=parseData(wb);data={file:f.name,savedAt:new Date().toLocaleString('th-TH'),rows};write(KEY_DATA,data);
   for(const b of branches)if(!map[b.id]&&!b.code){const s=suggest(b.name);if(s){b.code=s;b.auto=true}}
   draw();changed()}
  catch(err){alert('อ่านไฟล์ที่อยู่ไม่ได้: '+(err.message||err))}
  e.target.value='';
 }
 // the ORDER rows for the ticked branches; null (with a message) when a branch has no carrier code yet
 function build(){
  // a branch with no branch ID is kept with the ID left blank (and its PO name in the address so it can be found)
  const on=branches.filter(b=>b.on);
  const codes=byCode(),head=['','ที่อยู่','ถนน*แขวง','เขต','จังหวัด','รหัสไปรษณีย์','Zone','ชื่อผู้ติดต่อ','เบอร์โทร1','เบอร์โทร2 / Fax','BOX','น้ำหนัก','Client code','Order No.'];
  const rows=on.map(b=>{if(!b.code){const p=b.po||{};return['',p.address?[p.name,p.address].filter(Boolean).join(' '):`${b.name} (${b.id})`,p.sub||'',p.district||'',p.province||'',/^\d+$/.test(p.zip||'')?Number(p.zip):'','','','','',Number(b.box)||0,'','','']}const r=codes.get(b.code)||b.po||{};const zip=/^\d+$/.test(r.zip||'')?Number(r.zip):(r.zip||'');return[b.code,[r.name,r.address].filter(Boolean).join(' '),r.sub||'',r.district||'',r.province||'',zip,'',r.contact||'',r.phone1||'',r.phone2||(codes.has(b.code)?0:''),Number(b.box)||0,'','','']});
  const ws=XLSX.utils.aoa_to_sheet([head,...rows]);
  ws['!cols']=[10,90,14,14,14,12,8,18,16,16,8,10,12,12].map(w=>({wch:w}));
  ws['!autofilter']={ref:`A1:N${rows.length+1}`};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ORDER');
  return{wb,rows:[head,...rows]};
 }
 function init(){
  const host=$('panelCarrier');if(!host)return;
  host.innerHTML=`<div class="view-heading"><h2>สรุปส่งขนส่ง</h2><span id="carrierSummary"></span></div>
   <p class="muted">ชีต ORDER ตามแบบฟอร์มขนส่ง · เลือกไอดีสาขา (IT0xx จากไฟล์หลัก DATA) ให้สาขาใน PO ครั้งแรกครั้งเดียว ระบบจำไว้ในเครื่องนี้ · กรอกจำนวนกล่องแล้วดาวน์โหลด</p>
   <div class="carrier-file"><label class="field">ไฟล์ที่อยู่ขนส่ง (DATA ORDER … .xlsx)<input id="carrierFile" type="file" accept=".xlsx,.xls"></label><p id="carrierData" class="muted"></p></div>
   <div id="carrierBody"></div>
   <p id="carrierWarn" class="carrier-warn" hidden>ยังไม่ได้เลือกไฟล์ DATA ORDER · ช่องแขวง เขต ผู้ติดต่อ เบอร์โทร จะไม่ครบ (อ่านจาก PO) · เลือกไฟล์ด้านบนครั้งเดียว ระบบจำไว้ในเครื่องนี้</p><div class="carrier-go"><button id="carrierDownload" type="button">ดาวน์โหลด Excel</button><span class="muted">ไฟล์เดียว: ชีต ORDER (ส่งขนส่ง) · Order Matrix · ตรวจบาร์โค้ด · สรุปรายสาขา</span></div>`;
  $('carrierFile').addEventListener('change',onFile);
  $('carrierBody').addEventListener('change',onEdit);
  $('carrierBody').addEventListener('input',e=>{if(e.target.dataset.f==='box')onEdit(e)});
  // one download: the page's export puts the ORDER sheet first, then the order-check sheets
  $('carrierDownload').addEventListener('click',()=>$('exportButton')?.click());
  draw();
 }
 function addressOf(id){
  const b=branches.find(x=>x.id===id);if(!b)return null;
  const r=b.code?byCode().get(b.code):null;
  if(r)return{code:b.code,name:r.name,address:r.address,contact:r.contact,phone:r.phone1};
  return b.po?{code:b.code||'',name:b.po.name,address:b.po.address,contact:'',phone:''}:(b.code?{code:b.code}:null);
 }
 const changed=()=>window.dispatchEvent(new CustomEvent('itcity-carrier-change'));
 window.ITCityCarrier={update,build,addressOf};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
