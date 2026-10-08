// Shared barcode check for the retailer tools: is the customer's barcode the same as our own
// main barcode (GTIN in the Catalog)? If not, the product needs its barcode changed (a customer
// sticker over ours). Same rule everywhere so every tool marks the same rows red.
//
//   'change'  customer barcode differs from the Catalog GTIN  -> red row
//   'same'    equal                                           -> nothing to do
//   'unknown' model not in the Catalog, no valid GTIN, or no customer barcode / not loaded yet
(()=>{
 'use strict';
 let map=null,loading=null,byRetailer=new Map();
 const norm=v=>String(v??'').trim().toUpperCase();
 function load(){
  if(!loading)loading=fetch('/api/catalog/barcodes',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status))).then(d=>{map=new Map(d.rows.map(p=>[norm(p.sku),String(p.gtin??'').trim()]));byRetailer=new Map();for(const p of d.rows)for(const [shop,code] of Object.entries(p.retailerBarcodes||{}))byRetailer.set(norm(shop)+'|'+String(code).trim(),String(p.sku).trim());return map}).catch(()=>{loading=null;return null});
  return loading;
 }
 // `model` is the Catalog SKU (the model number); "60131BOX" is read as "60131-BOX".
 function status(model,customerBarcode){
  if(!map)return'unknown';
  let key=norm(model);if(/^\d{4,6}BOX$/.test(key))key=key.replace(/BOX$/,'-BOX');
  // A product can carry more than one main barcode (listed on separate lines); "ctn" and other text is not a barcode.
  const gtins=String(map.get(key)??'').split(/[\s,;|/]+/).filter(g=>/^\d{8,14}$/.test(g)),customer=String(customerBarcode??'').trim();
  if(!gtins.length||!customer)return'unknown';
  return gtins.includes(customer)?'same':'change';
 }
 const rowClass=s=>s==='change'?'bc-row-change':s==='unknown'?'bc-row-unknown':'';
 const tagHtml=s=>s==='change'?'<span class="bc-tag-change">⚠ ต้องเปลี่ยนบาร์โค้ด</span>':s==='unknown'?'<span class="bc-tag-unknown">เช็กรุ่นใน Catalog ไม่ได้</span>':'';
 // The Catalog SKU a shop's own item code is registered to (Catalog > product > retailer barcodes), '' when none.
 const skuOf=(shop,code)=>byRetailer.get(norm(shop)+'|'+String(code??'').trim())||'';
 window.GVBarcodeCheck={load,status,skuOf,rowClass,tagHtml,isLoaded:()=>!!map};
})();
