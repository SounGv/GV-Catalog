// Turns every "กลับหน้าหลัก" link on the tool pages into one clear, touch-sized button.
(function () {
  var css = 'a.gv-back{display:inline-flex!important;align-items:center;gap:8px;min-height:44px;padding:0 18px 0 12px!important;'
    + 'border-radius:999px;background:#fff!important;color:#131516!important;border:1.5px solid #131516;'
    + 'font:700 15px/1.2 inherit!important;font-family:inherit!important;text-decoration:none!important;'
    + 'box-shadow:0 2px 6px rgba(19,21,22,.18);margin-top:10px!important;margin-bottom:14px!important;box-sizing:border-box}'
    + 'a.gv-back:hover{background:#CDEB03!important}a.gv-back:active{transform:translateY(1px)}'
    + 'a.gv-back:focus-visible{outline:3px solid #CDEB03;outline-offset:2px}'
    + 'a.gv-back .gv-back-ic{display:inline-flex;width:26px;height:26px;border-radius:50%;background:#131516;color:#CDEB03;'
    + 'align-items:center;justify-content:center;font-size:18px;line-height:1}'
    + '@media print{a.gv-back{display:none!important}}';
  function run() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var as = document.querySelectorAll('a');
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      if (a.textContent.indexOf('กลับหน้าหลัก') < 0) continue;
      var left = parseFloat(getComputedStyle(a).paddingLeft) || 0;
      a.className = 'gv-back'; a.removeAttribute('style');
      if (left > 0) a.style.marginLeft = left + 'px';
      a.innerHTML = '<span class="gv-back-ic" aria-hidden="true">&lsaquo;</span>กลับหน้าหลัก';
      a.setAttribute('aria-label', 'กลับหน้าหลัก');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
