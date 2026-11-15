/* NAV NOTCH. When the mouse is still, the tab bar folds into a notch that cycles the exam countdown, the time and the exam-day weather.
   Moving the pointer near the bar (or pressing Tab) brings the tabs back. Styles: css/09-nav-notch.css. Loaded last, after app.js and gate.js. */
(function () {
  const IDLE_MS = 3000, NEAR_PX = 90, LEAVE_MS = 900, SLIDE_MS = 5000, TZ = 'Africa/Lagos';
  const EX1 = '2026-11-27', EX2 = '2026-11-28';
  const tabs = document.querySelector('.tabs');
  const sheen = document.createElement('div'); sheen.className = 'nt-sheen'; sheen.setAttribute('aria-hidden', 'true'); tabs.appendChild(sheen);
  const inner = document.createElement('div'); inner.className = 'nt-inner';
  const row = document.createElement('div'); row.className = 'nt-row';
  inner.appendChild(row); tabs.appendChild(inner);
  tabs.querySelectorAll('.tab').forEach((t, i) => t.style.setProperty('--i', i));   // stagger order for the unfold

  /* --- slide data --- */
  const ymd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const tf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const wdF = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' });
  const dmF = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long' });
  const dayLbl = s => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(new Date(utc(s)));
  const part = (ps, t) => (ps.find(p => p.type === t) || {}).value || '';

  /* building blocks: a big gold numeral, a hairline rule, and a two-line stack (tracked CAPS label over a quiet line) */
  const rule = '<i class="nt-rule"></i>';
  const num = (n, small) => '<span class="nt-num">' + n + (small ? '<small>' + small + '</small>' : '') + '</span>';
  const stack = (cap, line, live) => '<span class="nt-stack"><span class="nt-cap">' + (live ? '<i class="nt-live"></i>' : '') + cap + '</span><span class="nt-line">' + line + '</span></span>';
  const svg = (inner, w) => '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const CLOUD = '<path d="M7 16a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 7.5a4.2 4.2 0 0 1 .5 8.5H7z"/>';
  const ICON = {
    sun:   '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    part:  '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1.5M2.5 8.5H4M4.4 4.4l1 1M12.6 4.4l-1 1"/><path d="M10 20a3.5 3.5 0 0 1-.4-7A4.8 4.8 0 0 1 19 13.2a3.4 3.4 0 0 1 .2 6.8H10z"/>',
    cloud: '<path d="M7 19a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 10.5a4.2 4.2 0 0 1 .5 8.5H7z"/>',
    fog:   '<path d="M4 9h16M3 13h18M6 17h12"/>',
    rain:  CLOUD + '<path d="M8.5 19l-1 2M12.5 19l-1 2M16.5 19l-1 2"/>',
    storm: CLOUD + '<path d="M12.8 14.5l-2.3 3.5h3l-2.3 3.5"/>'
  };
  const wmo = c => svg(ICON[c === 0 ? 'sun' : c <= 2 ? 'part' : c === 3 ? 'cloud' : c <= 48 ? 'fog' : c >= 95 ? 'storm' : 'rain']);
  const DROP = '<svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor" aria-hidden="true"><path d="M12 2.5c3.2 4 6 7.3 6 11a6 6 0 0 1-12 0c0-3.7 2.8-7 6-11z"/></svg>';

  function countdown() {
    const t = utc(ymd()), d1 = (utc(EX1) - t) / 864e5, d2 = (utc(EX2) - t) / 864e5;
    if (d1 > 1)  return num(d1) + rule + stack('Days to exam', 'Fri 27 – Sat 28 November');
    if (d1 === 1) return '<span class="nt-num word">Tomorrow</span>' + rule + stack('Exam begins', 'Friday 27 November');
    if (d1 === 0) return num(1, '/2') + rule + stack('Exam day', 'Today · Day 2 is tomorrow', true);
    if (d2 === 0) return num(2, '/2') + rule + stack('Exam day', 'Today · final day', true);
    return '<span class="nt-done">' + svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 15) + '</span>' + rule + stack('Exam complete', '27 – 28 November');
  }
  let wx = null;
  fetch('https://api.open-meteo.com/v1/forecast?latitude=7.38&longitude=3.95&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FLagos&forecast_days=16')
    .then(r => r.json()).then(j => {
      const o = {}; j.daily.time.forEach((d, i) => o[d] = { c: j.daily.weather_code[i], hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]), p: j.daily.precipitation_probability_max[i] });
      if (o[EX1] || o[EX2]) wx = o;
    }).catch(() => {});

  const slides = [
    () => countdown(),
    () => {
      const now = new Date(), p = tf.formatToParts(now);
      return '<span class="nt-clock"><span class="nt-num" id="ntHM">' + part(p, 'hour') + ':' + part(p, 'minute') + '</span>' +
        '<span class="nt-ss"><span class="nt-ampm" id="ntAP">' + part(p, 'dayPeriod') + '</span><span class="nt-sec" id="ntS">' + part(p, 'second') + '</span></span></span>' +
        rule + stack(wdF.format(now), dmF.format(now));
    },
    () => {
      if (!wx) return null;
      const d = k => { const w = wx[k]; if (!w) return ''; return '<span class="nt-day"><span class="nt-wi">' + wmo(w.c) + '</span><span class="nt-stack"><span class="nt-cap">' + dayLbl(k) + '</span><span class="nt-line"><b class="nt-deg">' + w.hi + '°</b><span class="nt-lo">' + w.lo + '°</span><span class="nt-rain">' + DROP + w.p + '%</span></span></span></span>'; };
      return stack('Ibadan', 'Exam forecast') + rule + d(EX1) + rule + d(EX2);
    }
  ];

  /* --- sizing: only width ever changes, the height stays exactly the tab bar's --- */
  let fullW = 0, idx = 0, slideT = null, notchW = 0;
  const idle = () => tabs.classList.contains('idle');
  function measureFull() { if (!idle()) fullW = tabs.offsetWidth; }
  /* Clock slide: size the hour:minute numerals so their ink is exactly as tall as the AM + seconds stack, and line the two up top and bottom.
     Measured from real glyph ink (canvas metrics + the element's text rect), so it holds for any font size or if the font falls back. */
  const cv = document.createElement('canvas').getContext('2d');
  function fitClock() {
    const hm = document.getElementById('ntHM'), ap = document.getElementById('ntAP'), sc = document.getElementById('ntS');
    if (!hm || !ap || !sc) return;
    const ss = ap.parentNode, k = (inner.getBoundingClientRect().width / inner.offsetWidth) || 1;   // the notch scales while it fades in
    const ink = (el, txt) => {
      const cs = getComputedStyle(el); cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const m = cv.measureText(txt); if (m.fontBoundingBoxAscent == null) return null;
      const r = document.createRange(); r.selectNodeContents(el);
      const base = r.getBoundingClientRect().top + m.fontBoundingBoxAscent * k;
      return { top: base - m.actualBoundingBoxAscent * k, bot: base + m.actualBoundingBoxDescent * k, asc: m.actualBoundingBoxAscent };
    };
    ss.style.transform = ''; hm.style.fontSize = '';
    let a = ink(ap, ap.textContent), c = ink(sc, '0'), h = ink(hm, 'H');
    if (!a || !c || !h) return;
    const target = (c.bot - a.top) / k;                          // AM top to seconds baseline, in CSS px
    hm.style.fontSize = (parseFloat(getComputedStyle(hm).fontSize) * target / h.asc) + 'px';
    a = ink(ap, ap.textContent); c = ink(sc, '0'); h = ink(hm, 'H');
    ss.style.transform = 'translateY(' + ((((h.top + h.bot) - (a.top + c.bot)) / 2) / k) + 'px)';   // centre the stack on the numerals
  }
  function render(animate) {
    let s = null, tries = 0;
    while (!s && tries++ < slides.length) { s = slides[idx % slides.length](); if (!s) idx++; }
    const paint = () => {
      row.innerHTML = s; fitClock();
      notchW = Math.ceil(row.offsetWidth) + 56;
      if (idle()) tabs.style.width = notchW + 'px';
    };
    if (!animate) { paint(); return; }
    inner.classList.add('swap');
    setTimeout(() => { paint(); inner.classList.remove('swap'); }, 160);
  }
  setInterval(() => {
    const a = document.getElementById('ntHM'); if (!a) return;
    const p = tf.formatToParts(new Date());
    a.textContent = part(p, 'hour') + ':' + part(p, 'minute');
    document.getElementById('ntS').textContent = part(p, 'second');
    document.getElementById('ntAP').textContent = part(p, 'dayPeriod');
  }, 1000);

  /* --- idle <-> awake --- */
  let idleT, leaveT = null, morphT;
  const narrow = () => window.matchMedia && matchMedia('(max-width:860px)').matches;
  const gateOn = () => { const g = document.getElementById('gate'); return !!(g && g.classList.contains('on')); };
  const busy = () => {
    const a = document.activeElement;
    // a dropdown is open (Analytics, Activity log, register breakdown), the desk is locked, or the bar has keyboard focus
    return ['anBtn', 'logBtn', 'loadBtn'].some(id => { const e = document.getElementById(id); return e && e.getAttribute('aria-expanded') === 'true'; })
      || gateOn() || (a && tabs.contains(a) && a.matches(':focus-visible'));
  };
  function collapse() {
    if (idle() || narrow()) return;
    if (busy()) { arm(IDLE_MS); return; }          // try again shortly rather than never
    measureFull();
    tabs.style.width = fullW + 'px'; void tabs.offsetWidth;   // pin the start so the width can transition
    clearTimeout(morphT);
    tabs.classList.add('idle'); idx = 0; render(false);
    tabs.style.width = notchW + 'px';
    clearInterval(slideT);
    slideT = setInterval(() => { if (!document.hidden) { idx++; render(true); } }, SLIDE_MS);
  }
  function wake(instant) {
    if (!idle()) return;
    clearInterval(slideT);
    if (instant) { tabs.classList.add('snap'); setTimeout(() => tabs.classList.remove('snap'), 60); }
    tabs.classList.add('morph'); tabs.classList.remove('idle');
    tabs.style.width = fullW + 'px';
    clearTimeout(morphT);
    morphT = setTimeout(() => { tabs.classList.remove('morph'); tabs.style.width = ''; }, 760);   // unfold + the last tab's fade
  }
  const near = (x, y) => {
    const r = tabs.getBoundingClientRect();
    return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)) <= NEAR_PX;
  };
  const arm = ms => { clearTimeout(idleT); idleT = setTimeout(collapse, ms); };

  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (near(e.clientX, e.clientY)) { clearTimeout(leaveT); leaveT = null; clearTimeout(idleT); wake(); }
    else if (!idle() && !leaveT) leaveT = setTimeout(() => { leaveT = null; collapse(); }, LEAVE_MS);
  });
  // the pages are iframes, so the page gets no pointermove over them: entering the page area counts as leaving the bar
  const main = document.querySelector('main');
  if (main) main.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch' && !idle() && !leaveT) leaveT = setTimeout(() => { leaveT = null; collapse(); }, LEAVE_MS); });
  tabs.addEventListener('pointerdown', () => { wake(); if (!idle()) arm(IDLE_MS + 3000); });
  tabs.addEventListener('focusin', () => { clearTimeout(idleT); wake(true); });
  tabs.addEventListener('focusout', () => arm(LEAVE_MS));
  window.addEventListener('resize', () => { if (narrow() && idle()) wake(true); measureFull(); });
  document.addEventListener('click', () => { if (!idle()) arm(IDLE_MS + 3000); });

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { measureFull(); arm(IDLE_MS); });
})();
