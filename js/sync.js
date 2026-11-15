(function () {
  var dim = document.createElement('div'); dim.className = 'navdim'; dim.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dim);
  var ids = ['logPop', 'recPop', 'anPop', 'upPop'];   // every navbar dropdown dims the page: Activity log, Register breakdown, Analytics, Load register
  function sync() {
    var open = ids.some(function (id) { var el = document.getElementById(id); return el && !el.hidden; });
    document.body.classList.toggle('nav-dd-open', open);
  }
  var mo = new MutationObserver(sync);
  ids.forEach(function (id) { var el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] }); });
  sync();
})();
