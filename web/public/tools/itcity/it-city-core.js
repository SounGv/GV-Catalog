(function(root){
'use strict';
const text=v=>v==null?'':String(v).trim();
const key=v=>text(v).normalize('NFKC').toUpperCase().replace(/[–—]/g,'-').replace(/\s+/g,' ');
const head=v=>key(v).replace(/[\s_./-]/g,'');
const groupKey=(...v)=>JSON.stringify(v);
const sum=rows=>rows.reduce((n,r)=>n+r.qty,0);
function bars(value){return [...new Set(text(value).split(/[,;|\r\n]+/).map(text).filter(Boolean))]}
function qty(value,where){
  if(value==null||text(value)==='')return 0;
  const n=Number(typeof value==='string'?value.replace(/,/g,''):value);
  if(!Number.isSafeInteger(n)||n<0)throw Error(`จำนวนสินค้าไม่ถูกต้อง: ${where} (${text(value)})`);
  return n;
}
function header(rows,required){
  for(let row=0;row<Math.min(rows.length,30);row++){
    const names=(rows[row]||[]).map(head);
    if(required.every(name=>names.includes(head(name))))return {row,index:name=>names.indexOf(head(name)),names};
  }
  return null;
}
function parseMaster(sheets){
  for(const sheet of sheets){
    const h=header(sheet.rows,['เลข SKU','GTIN']);if(!h)continue;
    const rows=sheet.rows.slice(h.row+1).filter(r=>text(r[h.index('เลข SKU')])).map(r=>({sku:text(r[h.index('เลข SKU')]),name:text(r[h.index('ชื่อ SKU')]),gtin:bars(r[h.index('GTIN')])[0]||''}));
    if(!rows.length)throw Error('ไฟล์ SKU ไม่มีรายการสินค้า');
    return rows;
  }
  throw Error('ไม่พบคอลัมน์ เลข SKU และ GTIN ในไฟล์ระบบ');
}
function parseOrder(sheets,file){
  const matrices=[],transfers=[],pos=[],docLines=[];
  for(const s of sheets){
    const mh=header(s.rows,['PRODUCT_CODE']);
    if(mh){
      const branches=[];
      (s.rows[mh.row]||[]).forEach((v,col)=>{if(/^W[A-Z0-9]+$/i.test(text(v)))branches.push({id:key(v),col,name:text(s.rows[mh.row-1]?.[col])||key(v)})});
      if(branches.length){
        const codeCol=mh.index('PRODUCT_CODE'),nameCol=mh.index('PRODUCT_NAME')>=0?mh.index('PRODUCT_NAME'):codeCol+1;
        const title=s.rows.slice(0,mh.row+1).flat().map(text).join(' '),titlePo=title.match(/\bPO[A-Z0-9]+\b/i)?.[0]||'',date=title.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)?.[0]||'';
        // Footer rows ("TRB" / "TRB NO" / "PO NO") carry one reference per branch column.
        const refRow=pattern=>s.rows.find(r=>pattern.test(head(r[0])))||[];
        const trbRow=refRow(/^TRB(NO)?$/),poRow=refRow(/^PONO$/);
        const lines=[];
        for(let i=mh.row+1;i<s.rows.length;i++){
          const r=s.rows[i],part=text(r[codeCol]),description=text(r[nameCol]);
          if(!part||!description||/^(TT AMOUNT|TOTAL|TRB|TRB NO|PO NO|GRAND TOTAL)$/i.test(part))continue;
          for(const b of branches){
            const n=qty(r[b.col],`${file} / ${s.name} / แถว ${i+1}`);if(!n)continue;
            const trb=/^TRB/i.test(text(trbRow[b.col]))?text(trbRow[b.col]):'',po=/^PO/i.test(text(poRow[b.col]))?text(poRow[b.col]):titlePo;
            lines.push({branch:b.id,branchName:b.name,part,description,qty:n,trb,po,date,file,sourceRow:i+1,sheet:s.name,customerBarcode:'',refLabel:trb?'':text(poRow[0]),refValue:trb?'':text(poRow[b.col])});
          }
        }
        matrices.push({lines,branches,date,hasTrb:lines.some(l=>l.trb),sheet:s.name});
      }
    }
    const th=header(s.rows,['TO_WH','PART_NO','ORDERED','ITEM_DESCRIPTION']);
    if(th)for(let i=th.row+1;i<s.rows.length;i++){
      const r=s.rows[i],part=text(r[th.index('PART_NO')]);if(!part)continue;
      const n=qty(r[th.index('ORDERED')],`${file} / ${s.name} / แถว ${i+1}`);if(!n)continue;
      const branch=key(r[th.index('TO_WH')]);if(!branch)throw Error(`ไม่มีรหัสสาขา: ${file} แถว ${i+1}`);
      const status=key(r[th.index('STATUS')]);if(/CANCEL|VOID|ยกเลิก/.test(status))throw Error(`พบรายการยกเลิกที่ยังมีจำนวน: ${file} แถว ${i+1}`);
      transfers.push({branch,branchName:branch,part,description:text(r[th.index('ITEM_DESCRIPTION')]),qty:n,trb:text(r[th.index('TRANSFER_REQ_NO')]),customerBarcode:text(r[th.index('BARCODE')]),po:'',date:text(r[th.index('DATE_ENTERED')]).slice(0,10),file,sourceRow:i+1,sheet:s.name});
    }
    // A purchase-order document (POB...) read from a PDF: one PO per destination, barcode on every line.
    const dh=header(s.rows,['DOC_PO','DEST_CODE','ITEM_NO','BARCODE','QTY']);
    if(dh)for(let i=dh.row+1;i<s.rows.length;i++){
      const r=s.rows[i],part=text(r[dh.index('ITEM_NO')]);if(!part)continue;
      const n=qty(r[dh.index('QTY')],`${file} / ${s.name} / แถว ${i+1}`);if(!n)continue;
      const branch=key(r[dh.index('DEST_CODE')]);if(!branch)throw Error(`ไม่มีรหัสปลายทาง: ${file} แถว ${i+1}`);
      docLines.push({branch,branchName:text(r[dh.index('DEST_NAME')])||branch,part,description:text(r[dh.index('DESCRIPTION')]),qty:n,trb:'',po:text(r[dh.index('DOC_PO')]),date:text(r[dh.index('DOC_DATE')]),file,sourceRow:i+1,sheet:s.name,customerBarcode:text(r[dh.index('BARCODE')]),refLabel:'',refValue:''});
    }
    const ph=header(s.rows,['PO_NO','Item_Code','PO_Qty']);
    if(ph)for(let i=ph.row+1;i<s.rows.length;i++){
      const r=s.rows[i];if(text(r[ph.index('PO_NO')]))pos.push({po:text(r[ph.index('PO_NO')]),part:text(r[ph.index('Item_Code')]),qty:qty(r[ph.index('PO_Qty')],`${file} / PO / ${i+1}`),date:ph.index('PO_Date')>=0?text(r[ph.index('PO_Date')]).slice(0,10):''});
    }
  }
  const warnings=[],trbMatrices=matrices.filter(m=>m.hasTrb),directMatrices=matrices.filter(m=>!m.hasTrb);
  const tally=list=>{const m=new Map();for(const r of list){const k=groupKey(r.branch,r.part);m.set(k,(m.get(k)||0)+r.qty)}return m};
  const sameTally=(a,b)=>[...new Set([...a.keys(),...b.keys()])].filter(k=>(a.get(k)||0)!==(b.get(k)||0));
  const lines=[];
  let legacyBase=false;
  if(transfers.length){
    // PR tables with TRB numbers (pick-pack) must reconcile with the TRB sheet; a single
    // PR table with no TRB row keeps the legacy behaviour of being the comparison base.
    legacyBase=!trbMatrices.length&&matrices.length===1;
    const compare=trbMatrices.length?trbMatrices:(legacyBase?matrices:[]);
    const prLines=compare.flatMap(m=>m.lines);
    if(prLines.length){
      const refs=new Set(prLines.map(r=>r.trb).filter(Boolean));
      if(refs.size){
        const outside=transfers.filter(r=>!refs.has(r.trb));
        if(outside.length)throw Error(`${file}: มี TRB ${outside.length} แถวนอกตาราง PR กรุณาแยก PO ให้ตรงกัน`);
      }
      const diff=sameTally(tally(prLines),tally(transfers));
      if(diff.length)throw Error(`${file}: จำนวน PR กับ TRB ไม่ตรงกัน ${diff.length} รายการ (${diff.slice(0,3).map(k=>JSON.parse(k).join(' / ')).join(', ')})`);
      const names=new Map(compare.flatMap(m=>m.branches.map(b=>[b.id,b.name])));
      for(const r of transfers){r.branchName=names.get(r.branch)||r.branch;r.date=compare[0].date||r.date}
      if(legacyBase)for(const r of transfers)r.po=prLines[0].po;
    }else warnings.push(`${file}: ไม่มีตาราง PR ใช้จำนวนจาก TRB และแสดงรหัสสาขาแทนชื่อ`);
    lines.push(...transfers);
  }else if(trbMatrices.length){
    lines.push(...trbMatrices.flatMap(m=>m.lines));
    warnings.push(`${file}: ไม่มีชีต TRB จึงยังตรวจบาร์โค้ดลูกค้าไม่ได้`);
  }
  if(!legacyBase&&directMatrices.length){
    const direct=directMatrices.flatMap(m=>m.lines);
    lines.push(...direct);
    if(direct.length)warnings.push(`${file}: ส่งตรงสาขา ${new Set(direct.map(r=>r.branch)).size} สาขา (ไม่มี TRB / ไม่มีบาร์โค้ดลูกค้าให้ตรวจ)`);
  }
  lines.push(...docLines);
  if(!transfers.length&&!matrices.length&&!docLines.length)throw Error(`${file}: ไม่พบตาราง PR หรือ TRB ที่ระบุสาขาปลายทาง (ชีต PO อย่างเดียวไม่ระบุยอดรายสาขา)`);
  if(!lines.length)throw Error(`${file}: ไม่พบจำนวนสั่งที่มากกว่า 0`);
  // Lines without a PO number (pick-pack/TRB): take the one PO in the PO sheet not already claimed by a direct branch.
  const claimed=new Set(lines.map(r=>r.po).filter(Boolean)),poIds=[...new Set(pos.map(r=>r.po))];
  const missingPo=lines.filter(r=>!r.po);
  if(missingPo.length){
    const free=poIds.filter(p=>!claimed.has(p));
    if(free.length===1)for(const r of missingPo)r.po=free[0];
    else if(poIds.length===1)for(const r of missingPo)r.po=poIds[0];
    else warnings.push(`${file}: ยังยืนยันเลข PO ไม่ได้`);
  }
  const used=new Set(lines.map(r=>r.po).filter(Boolean));
  // The PO sheet's PO_Date is the authoritative "วันที่ PO"; the TRB entry date and table titles are only fallbacks.
  const poDate=new Map(pos.filter(r=>r.date).map(r=>[r.po,r.date]));
  for(const r of lines)r.date=poDate.get(r.po)||r.date;
  for(const po of used){
    const poLines=pos.filter(r=>r.po===po);if(!poLines.length)continue;
    const mine=lines.filter(r=>r.po===po),got=new Map(),expected=new Map();
    for(const r of mine)got.set(r.part,(got.get(r.part)||0)+r.qty);
    for(const r of poLines)expected.set(r.part,(expected.get(r.part)||0)+r.qty);
    const diff=[...new Set([...got.keys(),...expected.keys()])].filter(k=>(got.get(k)||0)!==(expected.get(k)||0));
    if(diff.length)throw Error(`${file}: ยอดกระจายสาขาไม่ตรงกับ PO ${po} จำนวน ${diff.length} รายการ (${diff.slice(0,3).join(', ')})`);
  }
  const unrelated=poIds.filter(p=>!used.has(p));
  if(unrelated.length)warnings.push(`${file}: ไม่รวม PO อื่นที่ไม่มีการกระจายสาขาใน PR นี้: ${unrelated.join(', ')}`);
  // Keep raw rows for audit; aggregate only within the same PO/TRB/branch/part.
  const grouped=new Map();
  for(const r of lines){
    const id=groupKey(r.po,r.trb,r.branch,r.part),old=grouped.get(id);
    if(old){if(old.customerBarcode!==r.customerBarcode||key(old.description)!==key(r.description))throw Error(`${r.part}: ข้อมูลสินค้าซ้ำขัดแย้งกันใน TRB เดียวกัน`);old.qty+=r.qty;old.sourceRows.push(r.sourceRow)}
    else grouped.set(id,{...r,sourceRows:[r.sourceRow]});
  }
  return {file,lines:[...grouped.values()],warnings};
}
function combine(orders){
  const seen=new Map(),lines=[];
  for(const order of orders)for(const r of order.lines){
    const id=groupKey(r.po||r.file,r.trb,r.branch,r.part);
    if(seen.has(id))throw Error(`รายการออเดอร์ซ้ำข้ามไฟล์: ${r.branch} / ${r.part} / ${r.trb||r.po} (${seen.get(id)} และ ${r.file})`);
    seen.set(id,r.file);lines.push({...r});
  }
  return lines;
}
function makeMatcher(master){
  const bySku=new Map(),byBar=new Map();
  for(const r of master){const sku=key(r.sku);if(!bySku.has(sku))bySku.set(sku,[]);bySku.get(sku).push(r);const b=bars(r.gtin)[0];if(b){if(!byBar.has(b))byBar.set(b,[]);byBar.get(b).push(r)}}
  return row=>{
    const description=key(row.description),tokens=[...new Set(description.match(/\b\d{5}[A-Z]?(?:[- ]?BOX)?\b/g)||[])];
    let candidates=[];
    for(const token of tokens){
      const base=token.replace(/[- ]?BOX$/,''),isBox=token.endsWith('BOX')||/\bBOX\b/.test(description);
      if(isBox){candidates.push(...(bySku.get(base+'-BOX')||[]));if(!bySku.has(base+'-BOX'))candidates.push(...(bySku.get(base)||[]))}
      else {candidates.push(...(bySku.get(base)||[]));if(bySku.has(base+'-BOX'))candidates.push(...bySku.get(base+'-BOX'))}
    }
    candidates=[...new Set(candidates)];
    const customer=bars(row.customerBarcode),barHits=[...new Set(customer.flatMap(b=>byBar.get(b)||[]))];
    let hit=null,reason='';
    if(candidates.length===1)hit=candidates[0];
    else if(candidates.length>1){const same=candidates.filter(c=>customer.includes(c.gtin));if(same.length===1)hit=same[0];else reason='พบหลาย SKU หรือหลายรุ่นย่อย ต้องยืนยันสินค้าที่จัด'}
    else if(!tokens.length&&barHits.length===1)hit=barHits[0];
    else reason=tokens.length?'ไม่พบ SKU ของรุ่นที่ระบุในชื่อสินค้า':'ไม่พบ SKU หรือบาร์โค้ดที่จับคู่ได้แน่ชัด';
    const result={sku:hit?.sku||'',systemBarcode:hit?.gtin||'',customerBarcode:row.customerBarcode||'',status:'review',reason,target:'',candidates:candidates.map(c=>c.sku)};
    if(!hit)return result;
    if(!hit.gtin){result.reason='SKU ระบบไม่มี GTIN';return result}
    if(!customer.length){result.status='unchecked';result.reason='ไม่มีบาร์โค้ดลูกค้าให้ตรวจ (ส่งตรงสาขา)';return result}
    if(customer.includes(hit.gtin)){result.status='match';result.reason=customer.length>1?'ตรงกับหนึ่งในบาร์โค้ดลูกค้า':'SKU และบาร์โค้ดตรงกัน';return result}
    if(barHits.some(r=>key(r.sku)!==key(hit.sku))){result.reason='รุ่นในชื่อสินค้าและบาร์โค้ดชี้ไปคนละ SKU';return result}
    if(customer.length!==1||/[eE][+-]\d+/.test(customer[0])){result.reason='มีหลายบาร์โค้ดหรือรูปแบบบาร์ไม่ชัดเจน ต้องยืนยันบาร์ที่จะใช้';return result}
    result.status='relabel';result.reason='รุ่นตรง แต่บาร์โค้ดต่าง: ต้องเปลี่ยนบาร์โค้ด';result.target=customer[0];return result;
  };
}
function documents(lines){
  const grouped=new Map();
  for(const r of lines){const id=groupKey(r.file,r.po,r.trb,r.branch);if(!grouped.has(id))grouped.set(id,{id,branch:r.branch,name:r.branchName,po:r.po,date:r.date,trb:r.trb,refLabel:r.refLabel||'',refValue:r.refValue||'',file:r.file,items:[]});grouped.get(id).items.push(r)}
  return [...grouped.values()].sort((a,b)=>a.branch.localeCompare(b.branch)||a.po.localeCompare(b.po)||a.trb.localeCompare(b.trb));
}
const api={text,key,bars,header,parseMaster,parseOrder,combine,makeMatcher,documents,sum};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ITCity=api;
})(typeof window!=='undefined'?window:globalThis);
