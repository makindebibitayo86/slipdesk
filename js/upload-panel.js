// Load register panel (css/10-upload-panel.css).
// The Load register button opens this panel instead of jumping straight to the file picker.
//   - click the drop zone (or Enter / Space on it) to browse
//   - drag a file anywhere over the page: the panel opens by itself, drop it on the panel or the button
//   - progress is read from the Load button (app.js drives it), so the panel and the button always agree
//   - Escape or a press anywhere outside closes it
// Loaded state: the button still opens the Records breakdown; "Load a different register" in there opens this panel.
(function () {
  'use strict';
  const btn = document.getElementById('loadBtn'), inp = document.getElementById('xlsxFile'), pop = document.getElementById('upPop'), nav = document.querySelector('nav');
  const SD = window.sdUpload;
  if (!btn || !inp || !pop || !nav || !SD) return;
  const OK = /\.(xlsx|xls|csv)$/i;
  const $ = s => pop.querySelector(s);
  const zone = $('.up-zone'), zt = $('.up-t'), zs = $('.up-s'), msg = $('.up-msg'), nameEl = $('.up-name'), pctEl = $('.up-pct'),
        fsEl = $('.up-fs'), bar = $('.up-bar i'), askP = $('.up-askp'), noBtn = $('.up-no'), yesBtn = $('.up-yes');

  let isOpen = false, byDrag = false, pending = null, errT = 0, doneT = 0, raf = 0, last = null, pickerOK = false, lastState = btn.dataset.state, lastDrag = 0, dragT = 0;
  const state = () => btn.dataset.state;
  const loading = () => state() === 'loading';
  const usable = () => !nav.hasAttribute('inert');          // the sign-in lock makes the navbar inert
  const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  function paintIdle() {
    const n = SD.count();
    zt.textContent = pop.classList.contains('is-drag') ? 'Release to load' : pop.classList.contains('is-hint') ? 'Drop the file here' : n ? 'Drop a new register here' : 'Drop the register here';
    zs.textContent = n ? n.toLocaleString() + ' records loaded · or click to browse' : 'or click to browse';
  }
  function place() {                                          // same placement as the Records breakdown dropdown
    const b = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = pop.offsetWidth, m = 12;
    const parent = (pop.offsetParent || nav).getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const left = Math.max(m, Math.min(cx - w / 2, vw - m - w));
    pop.style.right = 'auto';
    pop.style.left = (left - parent.left) + 'px';
    pop.style.setProperty('--ax', Math.max(24, Math.min(w - 24, cx - left)) + 'px');
    if (window.matchMedia('(max-width:860px)').matches) {
      const nr = nav.getBoundingClientRect();
      pop.style.top = (b.bottom - nr.top + 14) + 'px';
    } else pop.style.top = '';
  }

  function setProg(pr) { bar.style.setProperty('--p', pr); pctEl.textContent = Math.round(pr * 100) + '%'; }
  function enterLoad() {
    const nm = (last && last.name) || SD.busyName() || 'register';
    nameEl.textContent = nm; nameEl.title = nm;
    fsEl.textContent = (last && last.name === nm && last.size != null ? fmtSize(last.size) + ' · ' : '') + 'reading…';
    pop.classList.add('is-load'); pop.classList.remove('is-ask'); clearErr();
    cancelAnimationFrame(raf);
    (function tick() {                                        // mirror the button's own percentage
      const el = btn.querySelector('.lb-pct'), v = el ? parseInt(el.textContent, 10) : NaN;
      if (!isNaN(v)) setProg(v / 100);
      raf = requestAnimationFrame(tick);
    })();
  }
  function leaveLoad() { cancelAnimationFrame(raf); pop.classList.remove('is-load'); }

  function open(viaDrag) {
    if (isOpen || !usable()) return;
    ['closeLogPop', 'closeRecPop', 'closeAnPop'].forEach(k => { if (window[k]) window[k](); });   // only one navbar dropdown open at a time
    isOpen = true; byDrag = !!viaDrag;
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); place();
    if (loading()) enterLoad(); else { leaveLoad(); paintIdle(); }
    if (!viaDrag && !loading()) setTimeout(() => { if (isOpen && !pop.classList.contains('is-ask')) zone.focus({ preventScroll: true }); }, 60);
  }
  function close(restoreFocus) {
    if (!isOpen) return;
    isOpen = false; byDrag = false; pending = null; clearTimeout(doneT);
    leaveLoad(); stopDrag(); clearErr();
    pop.hidden = true; pop.classList.remove('is-ask');
    btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) inp.focus({ preventScroll: true });
  }
  window.closeUpPop = () => close();

  // the button opens the panel (loaded: the breakdown dropdown keeps the click)
  btn.addEventListener('click', e => {
    if (e.target === inp) return;
    if (state() === 'loaded') return;
    e.preventDefault();
    isOpen ? close() : open();
  });
  // keyboard: Enter / Space on the focused file input would open the picker straight away; open the panel instead
  inp.addEventListener('click', e => { if (pickerOK) return; e.preventDefault(); isOpen ? close() : open(); }, true);
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) last = { name: f.name, size: f.size }; }, true);   // runs before app.js clears the input
  const browse = () => { if (loading()) return; pickerOK = true; try { inp.value = ''; inp.click(); } finally { pickerOK = false; } };
  SD.pick = browse;                                           // the footer's upload area calls this when its zone is clicked (the footer's register row only opens that area)
  zone.addEventListener('click', browse);
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); } });
  const rpLoad = document.getElementById('rpLoad');           // "Load a different register" in the Records breakdown
  if (rpLoad) rpLoad.addEventListener('click', e => { e.preventDefault(); setTimeout(() => open(), 0); });

  function showErr(text) {
    clearTimeout(errT); pop.classList.remove('is-err'); void pop.offsetWidth; pop.classList.add('is-err'); msg.textContent = text;
    errT = setTimeout(clearErr, 4500);
  }
  function clearErr() { clearTimeout(errT); pop.classList.remove('is-err'); msg.textContent = ''; }

  function go(file) { last = { name: file.name, size: file.size }; SD.load(file); }
  function accept(file, dropped) {
    if (loading()) return showErr('A register is still loading. Please wait.');
    if (!SD.canRead()) return showErr('The Excel reader needs internet. Reconnect and try again.');
    if (!OK.test(file.name)) return showErr('“' + file.name + '” is not a register file. Use .xlsx, .xls or .csv.');
    if (dropped && SD.count()) {                              // a dropped file would replace what is loaded: ask first
      pending = file; clearErr();
      askP.textContent = 'Loading “' + file.name + '” clears the ' + SD.count().toLocaleString() + ' applications already on this desk.';
      pop.classList.add('is-ask'); setTimeout(() => noBtn.focus({ preventScroll: true }), 60);
      return;
    }
    go(file);
  }
  noBtn.addEventListener('click', () => { pending = null; pop.classList.remove('is-ask'); zone.focus({ preventScroll: true }); });
  yesBtn.addEventListener('click', () => { const f = pending; pending = null; pop.classList.remove('is-ask'); if (f) go(f); });

  // app.js moves the Load button through empty / loading / loaded / error; the panel follows
  new MutationObserver(() => {
    if (isOpen && btn.getAttribute('aria-expanded') !== 'true') btn.setAttribute('aria-expanded', 'true');   // keeps the notch awake while open
    const st = state(); if (st === lastState) return; lastState = st;
    if (!isOpen) return;
    clearTimeout(doneT);
    if (st === 'loading') enterLoad();
    else if (st === 'loaded') {
      if (pop.classList.contains('is-load')) {
        setProg(1); fsEl.textContent = SD.count().toLocaleString() + ' records';
        doneT = setTimeout(() => close(), 900);
      } else paintIdle();
    } else if (st === 'error') {
      const nm = nameEl.textContent || 'that file', why = btn.title && !/^Load the/.test(btn.title) ? btn.title : 'Choose a valid .xlsx, .xls or .csv register.';
      leaveLoad(); paintIdle(); showErr('Couldn’t read “' + nm + '”. ' + why);
    } else { leaveLoad(); paintIdle(); }
  }).observe(btn, { attributes: true, attributeFilter: ['data-state', 'aria-expanded'] });
  new MutationObserver(() => { if (!usable()) close(); }).observe(nav, { attributes: true, attributeFilter: ['inert'] });   // signed out / locked

  // dragging a file over the page (this page or any slip page) opens the panel; dropping anywhere but the panel or the button does nothing
  const hasFiles = e => !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0);
  const overPanel = e => pop.contains(e.target) || btn.contains(e.target);
  function stamp() {
    lastDrag = Date.now(); document.body.classList.add('up-drag');
    if (!dragT) dragT = setInterval(() => {                   // no drag events for a moment: the file left the window
      if (Date.now() - lastDrag > 900) { const was = byDrag; stopDrag(); if (was && isOpen && !pop.classList.contains('is-ask')) close(); }
    }, 250);
  }
  function stopDrag() { clearInterval(dragT); dragT = 0; document.body.classList.remove('up-drag'); pop.classList.remove('is-drag', 'is-hint'); if (isOpen) paintIdle(); }
  function setOver(on) { if (pop.classList.contains('is-drag') !== on) { pop.classList.toggle('is-drag', on); paintIdle(); } }
  function onOver(e, inFrame) {
    if (!hasFiles(e)) return;
    const dt = e.dataTransfer;
    if (inFrame && e.defaultPrevented) { if (byDrag && isOpen) close(); return; }   // over a footer's own drop box: it takes the file
    if (!usable() || loading()) { e.preventDefault(); dt.dropEffect = 'none'; return; }
    stamp();
    if (!isOpen) open(true);
    if (!isOpen) return;
    e.preventDefault();
    if (!pop.classList.contains('is-load') && !pop.classList.contains('is-hint')) { pop.classList.add('is-hint'); paintIdle(); }
    const over = !inFrame && overPanel(e);
    dt.dropEffect = over ? 'copy' : 'none';
    setOver(over);
  }
  function onDrop(e, inFrame) {
    if (!hasFiles(e)) return;
    if (inFrame && e.defaultPrevented) { const was = byDrag; stopDrag(); if (was) close(); return; }   // a footer box handled it
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0], over = !inFrame && overPanel(e), was = byDrag;
    stopDrag();
    if (over && f && usable() && !loading()) { if (!isOpen) open(true); byDrag = false; accept(f, true); }
    else if (was) close();
  }
  function wire(doc, inFrame) {
    if (!doc || doc.__upWired) return; doc.__upWired = true;
    doc.addEventListener('pointerdown', e => { if (isOpen && !overPanel(e)) close(); }, true);   // a press outside closes the panel
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) close(!inFrame); });
    doc.addEventListener('dragover', e => onOver(e, inFrame));
    doc.addEventListener('drop', e => onDrop(e, inFrame));
  }
  wire(document, false);
  Object.keys(frames).forEach(k => {
    const fr = frames[k], attach = () => { try { wire(fr.contentDocument, true); } catch (e) {} };
    fr.addEventListener('load', attach); attach();
  });
})();
