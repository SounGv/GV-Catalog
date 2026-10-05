// Scannable code for the delivery forms: a Code128 barcode of the branch ID or the PO / TRB number.
// The pack-scan screen finds a bill when that exact text is scanned or typed, so the value printed
// here must be the same text the scan job holds. Needs JsBarcode (code128) on the page.
//   GVBranchCode.svg(value) -> '<svg ...>' string, or '' when it cannot be made
(()=>{
 'use strict';
 const PX_TO_MM=25.4/96;
 window.GVBranchCode={
  svg(value,{height=11,module=1.2}={}){
   const v=String(value??'').trim();
   if(!v||typeof JsBarcode==='undefined')return'';
   const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
   try{JsBarcode(s,v,{format:'CODE128',displayValue:false,height:40,width:module,margin:0,background:'transparent'})}catch{return''}
   const w=parseFloat(s.getAttribute('width')),h=parseFloat(s.getAttribute('height'));
   if(!(w>0&&h>0))return'';
   s.setAttribute('viewBox',`0 0 ${w} ${h}`);s.setAttribute('preserveAspectRatio','none');
   // true size: bar width as encoded, height fixed in millimetres so a short code is not tall and thin
   s.removeAttribute('width');s.removeAttribute('height');s.removeAttribute('style');
   s.setAttribute('style',`width:${(w*PX_TO_MM).toFixed(1)}mm;height:${height}mm;display:block`);
   s.setAttribute('class','scan-code');s.setAttribute('role','img');s.setAttribute('aria-label','บาร์โค้ด '+v);
   return s.outerHTML;
  },
 };
})();
