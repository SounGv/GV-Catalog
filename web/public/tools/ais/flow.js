// Step bar for the AIS tool: 1 upload PO -> 2 check and calculate -> 3 pick a print job.
// Read-only: it only watches the page the converter script already updates.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 function setStep(done,now){
  document.querySelectorAll('#steps .stp').forEach(s=>{const n=Number(s.dataset.step);s.classList.toggle('done',n<=done);s.classList.toggle('now',n===now)});
 }
 // Loaded and nothing left to check -> step 3; loaded with items to check -> step 2; nothing yet -> step 1.
 function sync(){
  const loaded=$('results').classList.contains('show');
  const bad=Number($('statBad').textContent)||0;
  if(!loaded)return setStep(0,1);
  bad?setStep(1,2):setStep(2,3);
 }
 const observer=new MutationObserver(sync);
 observer.observe($('results'),{attributes:true,attributeFilter:['class']});
 observer.observe($('statBad'),{childList:true,characterData:true,subtree:true});
 $('reset').addEventListener('click',()=>setTimeout(sync,0));
 sync();
})();
