// Column indices — identical to COL in Code.gs
const COL = { EXAM_NUM:1, PAY_REF:2, PAY_STATUS:3, SURNAME:7, FIRSTNAME:8, OTHERNAME:9, DOB:11, PHONE:12, PHOTO_URL:31 };
const DOCS = window.SD_PAGES;
const frames = {
  registration: document.getElementById('f-registration'),
  exam: document.getElementById('f-exam'),
  log: document.getElementById('f-log'),
  analysis: document.getElementById('f-analysis'),
  legal: document.getElementById('f-legal'),
  print: document.getElementById('f-print'),
  attendance: document.getElementById('f-attendance'),
  school: document.getElementById('f-school')
};
let ROWS = null, HDR = [];
var LASTTAB = 'registration';

// ── Keep both slip panels the same height, so switching pages never changes the page length ──
function syncPanelHeights() {   // each panel now ends where its own slip ends: clear any forced height
  try { ['registration', 'exam'].forEach(n => { const el = frames[n].contentDocument.getElementById(n === 'exam' ? 'slipStage' : 'rightPane'); if (el) el.style.minHeight = ''; }); } catch (e) {}
}
let _shT; function queueSyncPanels() { cancelAnimationFrame(_shT); _shT = requestAnimationFrame(syncPanelHeights); }
window.queueSyncPanels = queueSyncPanels;
// ── Navigation ──
function show(page) {
  if (page === 'school' && !window.sdSchoolPick) {   // the school chosen survives a refresh or a sign-in (this tab only); with none remembered there is nothing to open
    try { window.sdSchoolPick = JSON.parse(sessionStorage.getItem('sd.schoolPick') || 'null'); } catch (e) { window.sdSchoolPick = null; }
    if (!window.sdSchoolPick) page = 'print';
  }
  if (!frames[page]) page = 'registration';
  if (page === 'registration' || page === 'exam') LASTTAB = page;   // the slip page the Back button returns to
  // Switching tabs keeps whatever is on each one (search box, results, slip).
  Object.keys(frames).forEach(k => frames[k].classList.toggle('active', k === page));
  document.body.classList.toggle('on-analysis', page === 'analysis');
  if (page === 'print') { if (window.closeRecPop) window.closeRecPop(); try { frames.print.contentWindow.renderPrint(); } catch (e) {} }   // the Print page reads the loaded register each time it opens
  if (page === 'attendance') { if (window.closeRecPop) window.closeRecPop(); try { frames.attendance.contentWindow.renderAttendance(); frames.attendance.contentWindow.scrollTo(0, 0); } catch (e) {} }   // the Overall attendance page reads the loaded register each time it opens
  if (page === 'school') { if (window.closeRecPop) window.closeRecPop(); try { frames.school.contentWindow.renderSchool(); frames.school.contentWindow.scrollTo(0, 0); } catch (e) {} }   // the school page reads the school picked on Attendances each time it opens
  if (page === 'analysis') { if (window.closeRecPop) window.closeRecPop(); try { frames.analysis.contentWindow.renderAnalysis(); } catch (e) {} }   // the Analysis page replaces the breakdown dropdown
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === ((page === 'print' || page === 'attendance' || page === 'school') ? 'analysis' : page)));   // the Print page belongs to Analysis, so that tab stays lit
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  document.getElementById('logBtn').classList.toggle('on', page === 'log');
  if (page === 'log') document.getElementById('logBtn').setAttribute('aria-current', 'page'); else document.getElementById('logBtn').removeAttribute('aria-current');
  if (page === 'log') renderLogPage();
  window.moveTabDrop && window.moveTabDrop(true);
  if (page !== 'log') queueSyncPanels();
  try { frames[page].contentWindow.fitSlip && frames[page].contentWindow.fitSlip(); } catch (e) {}
}
// Legal page (Disclaimer | Privacy & data protection | Terms of use): the footer links open it on the tab they name
function openLegal(tab) {
  show('legal');
  try { frames.legal.contentWindow.openLegalTab(tab); } catch (e) {}
}
window.openLegal = openLegal;
// Auto-detect: a search on either tab fills BOTH tabs with that candidate, then opens
//   payment confirmed -> Exam Slip tab (the slip, in colour)
//   not confirmed yet -> Registration Slip tab (the Exam tab holds their slip greyed out)
function _isPaidStatus(v) {
  const t = String(v || '').toUpperCase();
  if (!t) return false;
  if (/PENDING|UNPAID|NOT |MISMATCH|CANCEL|FLAG|REJECT|FAIL/.test(t)) return false;
  return /CONFIRM|CLEARED|PAID|APPROVED|VERIFIED|SUCCESS/.test(t);
}
function routeTo(idx, q) {
  setTimeout(() => {
    const row = ROWS && ROWS[idx]; if (!row) return;
    const paid = _isPaidStatus(row[COL.PAY_STATUS]);
    const target = paid ? 'exam' : 'registration';
    window.SD_CURRENT = { row: row, tab: target };
    logSearch({ q: q, res: paid ? 'Found — payment confirmed' : 'Found — payment pending', row: row, opened: paid ? 'Exam Slip' : 'Registration Slip' });
    show(target);
    const note = '';
    ['registration', 'exam'].forEach(name => {
      try { frames[name].contentWindow.openRow(idx, q, name === 'registration' ? note : ''); } catch (e) {}
    });
  }, 0);
  return true;
}
// The Clear button on either tab empties both
function clearBoth() {
  window.SD_CURRENT = null;
  Object.keys(frames).forEach(k => { try { frames[k].contentWindow.clearAll(); } catch (e) {} });
}
document.querySelectorAll('.tab:not(#logBtn):not(#anBtn)').forEach(t => t.addEventListener('click', () => show(t.dataset.page)));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));


// ── Search log ──
// Every search run on either tab is recorded: when, what was typed, how it matched, which candidate record
// came up and what the result was. Kept in this browser (survives refresh and restart) and downloaded as a
// "Search Log" sheet in its own workbook, so the register file itself is never modified.
const LOG_KEY = 'slipdesk.searchlog.v1';
let SLOG = [], REG_NAME = '', REG_FP = null, _FM = null;   // _FM: the escalation flags worked out from the log (cleared whenever the log changes)
try { SLOG = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); if (!Array.isArray(SLOG)) SLOG = []; } catch (e) { SLOG = []; }
function _saveLog() { _FM = null; try { localStorage.setItem(LOG_KEY, JSON.stringify(SLOG)); } catch (e) {} }
const _p2 = n => String(n).padStart(2, '0');
function _stamp(d) { return d.getFullYear() + '-' + _p2(d.getMonth() + 1) + '-' + _p2(d.getDate()) + ' ' + _p2(d.getHours()) + ':' + _p2(d.getMinutes()) + ':' + _p2(d.getSeconds()); }
const _proper = v => String(v == null ? '' : v).trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
function _methodOf(q, row) {
  const qq = String(q || '').trim().toUpperCase(), qd = qq.replace(/\D/g, '');
  const ref = String(row[COL.PAY_REF] || '').trim().toUpperCase(), ex = String(row[COL.EXAM_NUM] || '').trim().toUpperCase();
  const ph = String(row[COL.PHONE] || '').replace(/\D/g, '').slice(-10);
  if (qq && qq === ref) return 'Payment reference';
  if (qq && qq === ex) return 'Exam number';
  if (qd.length >= 10 && qd.slice(-10) === ph) return 'Phone number';
  return 'Name';
}
// r: { q, res, row?, opened? }  (row = the register row that came up)
function logSearch(r) {
  try {
    const row = r.row || null, now = new Date();
    const rec = {
      n: (SLOG.length ? SLOG[SLOG.length - 1].n : 0) + 1,
      time: _stamp(now),
      query: String(r.q == null ? '' : r.q).trim(),
      method: row ? _methodOf(r.q, row) : '',
      result: r.res,
      name: row ? [_proper(row[COL.SURNAME]), _proper(row[COL.FIRSTNAME]), _proper(row[COL.OTHERNAME])].filter(Boolean).join(' ') : '',
      payRef: row ? String(row[COL.PAY_REF] || '').trim() : '',
      examNo: row ? String(row[COL.EXAM_NUM] || '').trim() : '',
      payStatus: row ? String(row[COL.PAY_STATUS] || '').trim() : '',
      opened: r.opened || '',
      photo: row ? _photoId(row[COL.PHOTO_URL]) : '',
      register: REG_NAME,
      type: 'search',
      regFp: REG_FP ? REG_FP.id : '',
      uid: (window.SD_USER && window.SD_USER.id) || '',
      user: (window.SD_USER && window.SD_USER.name) || ''
    };
    SLOG.push(rec); _saveLog(); renderLog(true);
  } catch (e) {}
}
window.logSearch = logSearch;
const EV_LABEL = { signin: 'Signed in', signout: 'Signed out', lock: 'Auto-locked', fail: 'Failed sign-in', session: 'Session ended', clear: 'Log cleared',
  file: 'Register loaded', filechg: 'Register changed', fileoff: 'Register disconnected', fileerr: 'Register load failed', print: 'Slip printed', logdl: 'Log downloaded', recdl: 'Records downloaded', resume: 'Session resumed', pwchg: 'Password changed', escalate: 'Escalated for review', unflag: 'Review flag removed', klock: 'Locked' };
const EV_CLASS = { signin: 'ev-in', signout: 'ev-out', lock: 'ev-lock', fail: 'ev-fail', session: 'ev-sess', clear: 'ev-clear',
  file: 'ev-in', filechg: 'ev-lock', fileoff: 'ev-lock', fileerr: 'ev-fail', print: 'ev-print', logdl: 'ev-out', recdl: 'ev-out', resume: 'ev-in', pwchg: 'ev-lock', escalate: 'ev-esc', unflag: 'ev-out', klock: 'ev-lock' };
// Row tints by event type (session/log-download rows stay plain)
const LG_HUE = { signin: 'lg-h-in', resume: 'lg-h-in', signout: 'lg-h-out', fail: 'lg-h-red', fileerr: 'lg-h-red', clear: 'lg-h-red', lock: 'lg-h-amber', filechg: 'lg-h-amber', fileoff: 'lg-h-amber', print: 'lg-h-blue', pwchg: 'lg-h-amber', recdl: 'lg-h-violet', escalate: 'lg-h-amber', klock: 'lg-h-amber' };
const _isEvent = r => !!r.type && r.type !== 'search';
const _group = r => !_isEvent(r) || r.type === 'escalate' || r.type === 'unflag' ? 'search' : /^file/.test(r.type) ? 'file' : r.type === 'print' ? 'print' : 'access';
function _photoId(u) { const m = String(u || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }
// Candidate avatar: initials first, swapped for the passport photo once it loads (stays on initials if there is none)
function _candAv(r, px) {
  if (!window.sdAvatar) return null;
  const d = window.sdAvatar({ name: r.name || '?' }, px);
  let pid = r.photo;
  // Entries logged before photos were recorded: look the candidate up in the loaded register by payment reference
  if (!pid && ROWS && r.payRef) { const row = ROWS.find(x => String(x[COL.PAY_REF] || '').trim() === r.payRef); if (row) pid = _photoId(row[COL.PHOTO_URL]); }
  if (pid) {
    const im = new Image(); im.alt = '';
    im.onload = () => { d.textContent = ''; im.style.objectPosition = 'center 20%'; d.appendChild(im); };
    im.src = 'https://lh3.googleusercontent.com/d/' + pid;
  }
  return d;
}
const _nameOf = row => [_proper(row[COL.SURNAME]), _proper(row[COL.FIRSTNAME]), _proper(row[COL.OTHERNAME])].filter(Boolean).join(' ');
// Account activity: type = signin | signout | lock | fail | session | clear.  u = the user it concerns.
function logEvent(type, detail, u, when) {
  try {
    u = u || window.SD_USER || null;
    const rec = {
      n: (SLOG.length ? SLOG[SLOG.length - 1].n : 0) + 1,
      time: _stamp(when instanceof Date ? when : new Date()),
      query: '', method: '', result: EV_LABEL[type] || type, name: '', payRef: '', examNo: '', payStatus: '', opened: '',
      register: REG_NAME, regFp: REG_FP ? REG_FP.id : '', type: type, detail: detail || '',
      uid: u ? u.id : '', user: u ? u.name : ''
    };
    SLOG.push(rec); _saveLog(); renderLog(true);
  } catch (e) {}
}
window.logEvent = logEvent;
let _lastPrint = 0;
function logPrint() {
  const now = Date.now(); if (now - _lastPrint < 2000) return; _lastPrint = now;
  const act = document.querySelector('main iframe.active');
  if (act && act.id === 'f-legal') { logEvent('print', 'Legal notice'); return; }
  if (act && act.id === 'f-print') { logEvent('print', 'Attendance list page'); return; }
  if (act && act.id === 'f-attendance') { logEvent('print', 'Overall attendance page'); return; }
  let d = (act && act.id === 'f-exam') ? 'Exam slip' : 'Registration slip';
  const c = window.SD_CURRENT;
  if (c && c.row) {
    const r = c.row;
    d += ' · ' + _nameOf(r) + (String(r[COL.PAY_REF] || '').trim() ? ' · ' + String(r[COL.PAY_REF]).trim() : '') + ' · payment ' + (String(r[COL.PAY_STATUS] || '').trim() || 'pending');
  } else d += ' · no candidate on screen';
  logEvent('print', d);
}
window.logPrint = logPrint;
function _resClass(r) {
  if (_isEvent(r)) return EV_CLASS[r.type] || 'ev-out';
  return /^Found/.test(r.result) ? (/pending/i.test(r.result) ? 'pend' : 'ok') : (/^No match/.test(r.result) ? 'miss' : 'multi');
}
// Job title of whoever the entry concerns (shown ahead of "Signed in" / "Signed out")
function _roleOf(r) {
  if (!r || (r.type !== 'signin' && r.type !== 'signout')) return '';
  const u = (window.SD_USERS || []).find(x => x.id === r.uid);
  return u && u.title ? u.title : '';
}
function _roleLine(role, text, result) {
  const f = document.createDocumentFragment();
  const b = document.createElement('span'); b.className = 'lg-role'; b.textContent = role; f.appendChild(b);
  // "Signed in" next to a SIGNED IN pill says the same thing twice, so only add text that tells us something new
  if (text && String(text).trim().toLowerCase() !== String(result || '').trim().toLowerCase()) {
    const sp = document.createElement('span'); sp.className = 'lp-dot'; sp.setAttribute('aria-hidden', 'true'); f.appendChild(sp);
    const t = document.createElement('span'); t.className = 'lg-rtext'; t.textContent = text; f.appendChild(t);
  }
  return f;
}
function _userChip(r) {
  const wrap = document.createElement('span'); wrap.className = 'lp-user';
  if (!r.user) { wrap.classList.add('none'); wrap.textContent = r.type ? 'System (nobody signed in)' : 'Before accounts'; return wrap; }
  const u = (window.SD_USERS || []).find(x => x.id === r.uid) || { name: r.user };
  if (window.sdAvatar) wrap.appendChild(window.sdAvatar(u, 20));
  const nm = document.createElement('span'); nm.textContent = r.user; wrap.appendChild(nm);
  return wrap;
}
function _fillUserFilter() {
  const sel = document.getElementById('lpUser'); if (!sel || !window.SD_USERS || sel.options.length > 1) return;
  window.SD_USERS.forEach(u => { const o = document.createElement('option'); o.value = u.id; o.textContent = u.name; sel.appendChild(o); });
}
// Blank rows keep the Activity log dropdown the same size: it is never shorter than 5 rows, and while a clear is in progress it keeps the height it had.
function _lpFill(ul, real) {
  const mk = h => { const li = document.createElement('li'); li.className = 'lp-fill'; li.setAttribute('aria-hidden', 'true'); if (h) li.style.height = h + 'px'; ul.appendChild(li); };
  for (let i = real; i < 5; i++) mk();
  const lock = +ul.dataset.lock || 0;
  if (lock) { const rem = lock - ul.offsetHeight; if (rem > 0) { const full = Math.floor(rem / 56); for (let i = 0; i < full; i++) mk(); const left = rem - full * 56; if (left >= 1) mk(left); } }
}
function renderLog(bump) {
  _fillUserFilter();
  renderLogPage();
  try { const rf = frames.registration.contentWindow; if (rf.syncFlag) rf.syncFlag(); } catch (e) {}   // the Flag for review button follows the log (a cleared log un-flags everyone)
  const n = SLOG.length, el = document.getElementById('logN');
  const was = el.dataset.n;                                 // undefined on the first render, so loading the page does not pop
  el.textContent = n.toLocaleString(); el.hidden = !n;   // no entries: no badge, like a notifier
  el.dataset.n = n;
  // pop whenever the number changes, whoever changed it (search, print, sign-in, a loaded register)
  if (n && (bump || (was !== undefined && +was !== n))) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  const fu = document.getElementById('lpUser').value, ft = document.getElementById('lpType').value;
  const shown = SLOG.filter(r => (!fu || r.uid === fu) && (!ft || _group(r) === ft));
  document.getElementById('lpCount').textContent = n ? (shown.length === n ? n.toLocaleString() + ' entr' + (n === 1 ? 'y' : 'ies') : shown.length.toLocaleString() + ' of ' + n.toLocaleString()) : '';
  const admin = !!(window.SD_USER && window.SD_USER.admin);
  document.getElementById('lpDl').disabled = !n;
  const clr = document.getElementById('lpClr'); clr.disabled = !n || !admin;
  clr.title = admin ? '' : 'Only an administrator can clear the log';
  const ul = document.getElementById('lpList'); ul.textContent = '';
  if (!shown.length) { _lpFill(ul, 0); const li = document.createElement('li'); li.className = 'lp-empty'; li.textContent = n ? 'Nothing matches that filter.' : 'No activity yet. Sign-ins and searches will be recorded here.'; ul.appendChild(li); return; }
  shown.slice(-15).reverse().forEach(r => {
    const li = document.createElement('li');
    const hue = _rowHue(r); if (hue) li.className = hue;
    const top = document.createElement('div'); top.className = 'lp-top';
    const t = document.createElement('span'); t.className = 'lp-t'; t.textContent = r.time.slice(5, 16);
    if (_isEvent(r)) {
      // Staff event: rounded-square avatar (candidates keep the round gold-ringed photo), name + time, then pill + role
      li.className = (hue ? hue + ' ' : '') + 'lp-evt';
      const u = r.user ? ((window.SD_USERS || []).find(x => x.id === r.uid) || { name: r.user }) : null;
      let av = u && window.sdAvatar ? window.sdAvatar(u, 32) : null;
      if (!av) { av = document.createElement('span'); av.className = 'av av-sys'; av.style.width = av.style.height = '32px'; av.textContent = 'SYS'; }
      li.appendChild(av);
      const col = document.createElement('div'); col.className = 'ev-col';
      const head = document.createElement('div'); head.className = 'ev-head';
      const nm = document.createElement('span'); nm.className = 'ev-name' + (r.user ? '' : ' none'); nm.textContent = r.user || (r.type ? 'System' : 'Before accounts');
      head.append(nm, t); col.appendChild(head);
      const line = document.createElement('div'); line.className = 'ev-line';
      const b = document.createElement('span'); b.className = 'lp-badge ' + _resClass(r); b.textContent = r.result;
      const role = _roleOf(r);
      if (role) {
        // Role first, a divider, then the status pill
        const rl = document.createElement('span'); rl.className = 'lg-role'; rl.textContent = role;
        const vb = document.createElement('span'); vb.className = 'lp-vbar'; vb.setAttribute('aria-hidden', 'true');
        line.append(rl, vb, b);
      } else line.appendChild(b);
      if (r.detail && String(r.detail).trim().toLowerCase() !== String(r.result).trim().toLowerCase()) { const d = document.createElement('span'); d.className = 'lg-rtext'; d.textContent = r.detail; line.appendChild(d); }
      col.appendChild(line); li.appendChild(col);
    } else {
      // Search: a found candidate is a card (photo | name + verified tick, then Ref / Exam No. stacked beneath); a miss or multiple match stays one line
      if (r.name) {
        li.className = 'lp-found' + (r.flag ? ' lg-h-amber' : '');
        const av = _candAv(r, 36); if (av) li.appendChild(av);
        const col = document.createElement('div'); col.className = 'lp-fcol';
        const nm = document.createElement('div'); nm.className = 'lp-fname';
        const nt = document.createElement('span'); nt.className = 'lp-fn'; nt.textContent = r.name; nm.appendChild(nt);
        const k = _resClass(r);
        if (k === 'ok') { const v = document.createElement('span'); v.className = 'lp-vtick'; v.title = 'Payment confirmed'; v.setAttribute('aria-label', 'Payment confirmed'); v.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#1e8e3e"/><path d="M4.6 8.4l2.3 2.3 4.5-4.9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'; nm.appendChild(v); }
        if (k === 'pend') { const v = document.createElement('span'); v.className = 'lp-vtick'; v.title = 'Payment pending'; v.setAttribute('aria-label', 'Payment pending'); v.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#d9a227"/><path d="M8 4.2V8l2.4 1.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'; nm.appendChild(v); }
        else if (k !== 'ok') { const bg = document.createElement('span'); bg.className = 'lp-badge ' + k; bg.textContent = r.result.replace(/^Found — /, ''); nm.appendChild(bg); }
        col.appendChild(nm);
        const ids = [r.payRef, r.examNo].filter(Boolean);
        if (ids.length) {
          const d = document.createElement('div'); d.className = 'lp-fsub';
          ids.forEach((x, i) => { if (i) { const sp = document.createElement('span'); sp.className = 'lp-sep'; sp.textContent = '|'; d.appendChild(sp); } d.appendChild(document.createTextNode(x)); });
          col.appendChild(d);
        }
        if (r.flag) { const d = document.createElement('div'); d.className = 'lp-fsub'; const fb = document.createElement('span'); fb.className = 'lp-badge ev-esc'; fb.textContent = 'Escalated for review'; d.appendChild(fb); col.appendChild(d); }
        li.appendChild(col); li.appendChild(t);
      } else {
        const c = document.createElement('span'); c.className = 'lp-cand';
        const q = document.createElement('span'); q.className = 'lp-q2'; q.textContent = r.query || '—'; c.appendChild(q);
        top.append(c, t); li.appendChild(top);
        const res = document.createElement('div'); res.className = 'lp-res';
        const b = document.createElement('span'); b.className = 'lp-badge ' + _resClass(r); b.textContent = r.result; res.appendChild(b);
        li.appendChild(res);
      }
    }
    ul.appendChild(li);
  });
  _lpFill(ul, Math.min(shown.length, 15));
}
function downloadLog(list) {
  list = Array.isArray(list) ? list : SLOG;
  if (!list.length) return;
  const head = ['No.', 'Date & time', 'User', 'Activity', 'What was typed', 'Matched by', 'Result', 'Candidate', 'Payment ref', 'Exam number', 'Payment status', 'Opened on', 'Details', 'Register file', 'Register version'];
  const aoa = [head].concat(list.map(r => [r.n, r.time, r.user || '(before accounts)', _isEvent(r) ? r.result : (r.flag ? 'Search · Escalated for review' : 'Search'), r.query, r.method, _isEvent(r) ? '' : r.result, r.name, r.payRef, r.examNo, r.payStatus, r.opened, r.detail || (r.flag ? 'Tagged for escalated review by ' + (r.flag.by || 'staff') + ' · ' + r.flag.at : ''), r.register, r.regFp || '']));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [6, 20, 28, 18, 26, 18, 26, 32, 16, 16, 18, 14, 70, 22, 18].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Activity Log');
  const d = new Date();
  XLSX.writeFile(wb, 'SlipDesk-ActivityLog-' + d.getFullYear() + '-' + _p2(d.getMonth() + 1) + '-' + _p2(d.getDate()) + '.xlsx');
  logEvent('logdl', 'Downloaded ' + list.length.toLocaleString() + (list.length === 1 ? ' entry' : ' entries') + ' as Excel' + (list === SLOG ? '' : ' (filtered view)'));
}
(function () {
  const btn = document.getElementById('logBtn'), pop = document.getElementById('logPop');
  const foot = pop.querySelector('.lp-foot'); let hold = 0;   // hold: a click that has just opened the box must not also close it
  const askOff = () => { clearTimeout(foot._t); foot.classList.remove('asking', 'cleared'); foot.style.height = ''; foot.style.boxSizing = ''; };   // also releases the height lock below
  const releaseLock = () => { delete document.getElementById('lpList').dataset.lock; };   // the list may change height again
  const close = () => { releaseLock(); pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); askOff(); };
  const outClose = () => { if (Date.now() - hold > 300) close(); };
  window.closeLogPop = close;
  // From the slip pages the Activity log tab drops its quick-view panel down; on the log page itself it is already open.
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (frames.log.classList.contains('active')) { close(); return; }
    const open = pop.hidden;
    if (!open) { close(); return; }
    openPop();
  });
  function openPop() {
    if (window.closeRecPop) window.closeRecPop();   // only one navbar dropdown open at a time
    if (window.closeAnPop) window.closeAnPop();
    if (window.closeUpPop) window.closeUpPop();
    releaseLock(); renderLog();
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    const nav = document.querySelector('nav').getBoundingClientRect(), bar = document.querySelector('.tabs').getBoundingClientRect(), b = btn.getBoundingClientRect();
    const half = pop.offsetWidth / 2;
    const cx = Math.max(half + 12, Math.min(b.left + b.width / 2, window.innerWidth - half - 12));
    pop.style.left = (cx - nav.left) + 'px';
    pop.style.top = (bar.bottom - nav.top + 12) + 'px';
    const pr = pop.getBoundingClientRect();
    pop.style.setProperty('--ax', Math.max(24, Math.min(pr.width - 24, b.left + b.width / 2 - pr.left)) + 'px');
  }
  window.addEventListener('resize', close);
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) outClose(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (foot.classList.contains('asking') || foot.classList.contains('cleared')) { askOff(); document.getElementById('lpClr').focus(); } else close(); } });
  Object.keys(frames).forEach(k => frames[k].addEventListener('load', () => { try { frames[k].contentDocument.addEventListener('click', outClose); } catch (e) {} }));
  document.getElementById('lpDl').addEventListener('click', () => downloadLog());
  document.getElementById('lpOpen').addEventListener('click', () => { close(); show('log'); });
  // Clear log: asks inside the box itself (the buttons are replaced by the question). The full log page has its own confirmation (pages/log.js).
  const askText = () => { const n = SLOG.length; document.getElementById('lpAskT').textContent = 'Clear all ' + n.toLocaleString() + (n === 1 ? ' log entry?' : ' log entries?'); const d = document.getElementById('lpAskD'); d.textContent = 'Download the log first if you still need it. This cannot be undone.'; d.style.color = ''; d.style.fontWeight = ''; };
  document.getElementById('lpClr').addEventListener('click', () => {
    if (!(window.SD_USER && window.SD_USER.admin) || !SLOG.length) return;
    askText(); const lst = document.getElementById('lpList'); lst.dataset.lock = Math.round(lst.getBoundingClientRect().height);   // clearing leaves blank rows, never a shorter dropdown
    foot.style.boxSizing = 'border-box'; foot.style.height = foot.getBoundingClientRect().height + 'px';   // the question and the confirmation both live inside the footer's normal height: the dropdown never grows or shrinks
    foot.classList.add('asking');
    setTimeout(() => document.getElementById('lpNo').focus({ preventScroll: true }), 30);   // Cancel is the safe default
  });
  document.getElementById('lpNo').addEventListener('click', () => { askOff(); releaseLock(); const c = document.getElementById('lpClr'); if (!c.disabled) c.focus({ preventScroll: true }); });
  window.clearLogNow = () => {   // the confirmation (here, or on the full log page) has been answered Yes
    if (!(window.SD_USER && window.SD_USER.admin) || !SLOG.length) return;
    const cnt = SLOG.length; SLOG = []; _saveLog();
    logEvent('clear', 'Cleared ' + cnt.toLocaleString() + (cnt === 1 ? ' entry' : ' entries') + ' from the log');
  };
  document.getElementById('lpYes').addEventListener('click', () => {
    const n = SLOG.length; window.clearLogNow();
    const last = SLOG[SLOG.length - 1];
    if (!last || last.type !== 'clear') {   // nothing was cleared: say so, stay on the question
      const d = document.getElementById('lpAskD'); d.textContent = 'The log could not be cleared. Only an administrator can clear it.'; d.style.color = '#b3261e'; d.style.fontWeight = '600'; return;
    }
    document.getElementById('lpOkD').textContent = (n === 1 ? '1 entry was' : n.toLocaleString() + ' entries were') + ' removed. Recorded in the new log.';
    foot.classList.remove('asking'); foot.classList.add('cleared');   // the footer says "Log cleared", then returns to its buttons by itself
    document.getElementById('lpOkDone').focus({ preventScroll: true });
    clearTimeout(foot._t); foot._t = setTimeout(() => { if (foot.classList.contains('cleared')) { askOff(); const c = document.getElementById('lpClr'); if (!c.disabled && !pop.hidden) c.focus({ preventScroll: true }); } }, 3000);
  });
  document.getElementById('lpOkDone').addEventListener('click', () => { askOff(); const c = document.getElementById('lpClr'); if (!c.disabled) c.focus({ preventScroll: true }); });
  document.getElementById('lpUser').addEventListener('change', () => renderLog());
  document.getElementById('lpType').addEventListener('change', () => renderLog());
  renderLog();
})();

// ── Activity log page: lives in its own file (pages/log.js, shown in the f-log iframe). This page keeps the data and hands the helpers over. ──
const _cat = r => !_isEvent(r) ? 'search'
  : (r.type === 'signin' || r.type === 'resume') ? 'signin'
  : (r.type === 'signout' || r.type === 'lock' || r.type === 'klock' || r.type === 'session') ? 'signout'
  : r.type === 'fail' ? 'fail' : r.type === 'escalate' ? (_flags().on.has(r.n) ? 'escalated' : 'admin') : r.type === 'print' ? 'print' : /^file/.test(r.type) ? 'file' : 'admin';
// A flag stands from the moment a candidate is tagged until the tag is removed (the last tag or removal for that candidate decides)
const _fkey = r => String(r.payRef || r.examNo || r.name || '').trim().toUpperCase();
function _flags() {
  if (_FM) return _FM;
  const last = new Map();
  SLOG.forEach(r => {
    if (r.type === 'escalate' || r.type === 'unflag') { const k = _fkey(r); if (k) last.set(k, r.type === 'escalate' ? r.n : 0); }
    else if (!_isEvent(r) && r.flag) { const k = _fkey(r); if (k) last.set(k, r.n); }   // the usual way: the search entry itself carries the tag
  });
  const on = new Set(); last.forEach(n => { if (n) on.add(n); });
  _FM = { last: last, on: on }; return _FM;
}
const _inCat = (r, c) => c === 'pending' ? (!_isEvent(r) && _resClass(r) === 'pend') : c === 'escalated' ? _flags().on.has(r.n) : _cat(r) === c;
function _curFlagKey() {
  const c = window.SD_CURRENT, row = c && c.row; if (!row) return '';
  return _fkey({ payRef: String(row[COL.PAY_REF] || ''), examNo: String(row[COL.EXAM_NUM] || ''), name: _nameOf(row) });
}
window.sdFlagState = () => { const k = _curFlagKey(); return { has: !!k, on: !!k && !!_flags().last.get(k) }; };
// The Flag for review button on the Registration Slip: tags (or un-tags) the candidate on screen, and the Activity log records it
window.sdToggleFlag = () => {
  try {
    const c = window.SD_CURRENT, row = c && c.row, k = _curFlagKey(); if (!row || !k) return false;
    const cur = _flags().last.get(k), on = !!cur, type = on ? 'unflag' : 'escalate';
    // One entry, not two: the tag goes on the search that opened this slip, and comes off the same entry. Only when there is no such search is a separate entry written.
    if (on) { const e = SLOG.find(r => r.n === cur); if (e && !_isEvent(e)) { delete e.flag; _saveLog(); renderLog(true); return false; } }
    else {
      let e = null; for (let i = SLOG.length - 1; i >= 0 && !e; i--) { const r = SLOG[i]; if (!_isEvent(r) && r.name && _fkey(r) === k) e = r; }
      if (e) { e.flag = { by: (window.SD_USER && window.SD_USER.name) || '', uid: (window.SD_USER && window.SD_USER.id) || '', at: _stamp(new Date()) }; _saveLog(); renderLog(true); return true; }
    }
    const name = _nameOf(row), ref = String(row[COL.PAY_REF] || '').trim(), ex = String(row[COL.EXAM_NUM] || '').trim(), st = String(row[COL.PAY_STATUS] || '').trim();
    const rec = {
      n: (SLOG.length ? SLOG[SLOG.length - 1].n : 0) + 1, time: _stamp(new Date()),
      query: '', method: '', result: EV_LABEL[type], name: name, payRef: ref, examNo: ex, payStatus: st || 'Pending', opened: 'Registration Slip',
      photo: _photoId(row[COL.PHOTO_URL]), register: REG_NAME, regFp: REG_FP ? REG_FP.id : '', type: type,
      detail: [name, [ref, ex].filter(Boolean).join(' | '), on ? 'Review flag removed' : 'Payment ' + (st || 'pending').toLowerCase() + ' · tagged for escalated review, to be confirmed'].filter(Boolean).join('\n'),
      uid: (window.SD_USER && window.SD_USER.id) || '', user: (window.SD_USER && window.SD_USER.name) || ''
    };
    SLOG.push(rec); _saveLog(); renderLog(true);
    return !on;
  } catch (e) { return false; }
};
function _rowHue(r) { return r.flag ? 'lg-h-amber' : r.type === 'file' ? 'lg-loaded' : (LG_HUE[r.type] || (!r.type || r.type === 'search' ? 'lg-h-search' : '')); }
window.sdLogApi = {
  entries: () => SLOG, users: () => window.SD_USERS || [], isAdmin: () => !!(window.SD_USER && window.SD_USER.admin),
  isEvent: _isEvent, cat: _cat, inCat: _inCat, resClass: _resClass, rowHue: _rowHue, roleOf: _roleOf, roleLine: _roleLine, userChip: _userChip, candAv: _candAv,
  download: downloadLog, clearNow: () => window.clearLogNow && window.clearLogNow(), back: () => show(LASTTAB || 'registration')
};
// Redraw the log page (only when it is the page on screen)
function renderLogPage() { try { const w = frames.log.contentWindow; if (frames.log.classList.contains('active') && w.renderLogPage) w.renderLogPage(); } catch (e) {} }

// ── One shared Excel loader feeds both pages ──
function push(name) {
  const w = frames[name].contentWindow;
  if (ROWS && w && typeof w.setRows === 'function') w.setRows(ROWS);
}
// ── Site footer ──
// Edit this block to change what the footer says. Rows left empty ('') are simply not shown.
const FOOTER_CONFIG = {
  org:      'Office of the Head of Service, Oyo State Government Secretariat',
  tagline:  'The Pacesetter State',
  about:    'An IT support tool from the Office of the Head of Service for colleagues on site during the 2026 Compulsory Examination. Look up a candidate by name, payment reference or exam number, check payment, print their slip, and analyse the registration data.',
  helpPhone:'08139493098',          // shown as a tap-to-call number (works without internet)
  whatsapp: '2348139493098',        // international format, no +
  email:    '',                     // e.g. 'helpdesk@yourdomain.gov.ng'
  hours:    '',                     // e.g. 'Mon – Fri, 8:00am – 4:00pm'
  address:  '',                     // e.g. 'Secretariat, Ibadan, Oyo State'
  year:     2026,
  version:  'v1.86',
  // Social icons under the about text. Paste each full profile link into url; leave url '' to fall back to the site's home page, delete a line to remove the icon.
  // email: uses the email above (mailto) when set; whatsapp: uses the number above.
  social: [
    { k: 'email',     label: 'Email',     url: '' },
    { k: 'whatsapp',  label: 'WhatsApp',  url: '' },
    { k: 'x',         label: 'X',         url: '' },
    { k: 'github',    label: 'GitHub',    url: 'https://github.com/makindebibitayo86/slipdesk' },
    { k: 'linkedin',  label: 'LinkedIn',  url: '' }
  ]
};
const SOCIAL_ICONS = {
  email: ['0 0 24 24', 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457'],
  whatsapp: ['0 0 24 24', 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52s.198-.298.298-.497c.099-.198.05-.371-.025-.52s-.669-1.612-.916-2.207c-.242-.579-.487-.5-.669-.51a13 13 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074s2.096 3.2 5.077 4.487c.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413s.248-1.289.173-1.413c-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413'],
  x: ['0 0 24 24', 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z'],
  github: ['0 0 24 24', 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'],
  linkedin: ['0 0 448 512', 'M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3M135.4 416H69V202.2h66.5V416zM102.2 96a38.5 38.5 0 1 1 0 77 38.5 38.5 0 1 1 0-77m282.1 320h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9z'],
};
let NET = { isp: '', ip: '', city: '', domain: '', full: '' };       // provider and place of this station's connection, looked up online
let REG_BUSY = '';                  // name of the file being read right now (drives the footer box)
let LOADED_AT = null;               // set when the register (spreadsheet) is loaded

const FOOTER_CSS = `
#slipFooter{position:static;display:block;margin:0;color:rgba(255,255,255,.82);font-family:"DM Sans","Segoe UI",Arial,sans-serif;font-size:13px;line-height:1.6;
  background:linear-gradient(180deg,#4a1220 0%,#350d18 100%);border-top:4px solid #c4962a}
#slipFooter *{box-sizing:border-box}
#slipFooter .ft-main{max-width:1500px;margin:0 auto;padding:40px 14px 28px;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr);gap:36px}
#slipFooter .ft-main>div{min-width:0}
#slipFooter h4{font-family:"Crimson Pro",Georgia,serif;font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e2b84d;margin:0 0 14px;padding-bottom:8px;position:relative}
#slipFooter h4::after{content:"";position:absolute;left:0;bottom:0;width:30px;height:2px;background:#c4962a;border-radius:2px}
#slipFooter .brandrow{display:flex;align-items:center;gap:13px;margin-bottom:14px}
#slipFooter .crest{display:flex;align-items:center;justify-content:center;background:#fff;border-radius:12px;padding:4px 6px;flex-shrink:0;box-shadow:0 0 0 2px rgba(196,150,42,.7),0 2px 8px rgba(0,0,0,.3)}
#slipFooter .crest img{display:block;height:40px;width:auto}
#slipFooter .brand{display:flex;flex-direction:row;align-items:center;gap:14px;line-height:1.15}
#slipFooter .brand b{font-family:"Crimson Pro",Georgia,serif;font-size:22px;font-weight:700;letter-spacing:.01em;color:#fff;white-space:nowrap}
#slipFooter .brand b.stack{display:flex;flex-direction:column;align-items:flex-start;gap:0;line-height:.95;letter-spacing:.02em}
#slipFooter .brand b.stack span{display:block}
#slipFooter .brand .sep{width:2px;align-self:stretch;min-height:34px;background:#e2b84d;border-radius:1px;opacity:.85}
#slipFooter .brand .tag{display:flex;flex-direction:column;gap:3px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#e2b84d;font-weight:600;white-space:nowrap}
@media(max-width:420px){#slipFooter .brand .sep,#slipFooter .brand .tag{display:none}}
#slipFooter p{margin:0 0 10px;color:rgba(255,255,255,.75)}
#slipFooter ul{list-style:none;margin:0;padding:0}
#slipFooter li{margin:0}
#slipFooter .lk-pair{display:flex;align-items:center;gap:10px}
#slipFooter .lk-sep{color:rgba(226,184,77,.6)}
#slipFooter a,#slipFooter button.lnk{color:rgba(255,255,255,.88);text-decoration:none;display:inline-block;padding:5px 0;background:none;border:0;font:inherit;cursor:pointer;text-align:left}
#slipFooter a:hover,#slipFooter button.lnk:hover{color:#e2b84d;text-decoration:underline;text-underline-offset:3px}
#slipFooter a:focus-visible,#slipFooter button:focus-visible{outline:2px solid #e2b84d;outline-offset:2px;border-radius:4px}
#slipFooter .row{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
#slipFooter .row .ic{width:18px;flex-shrink:0;text-align:center}
#slipFooter .phone{font-size:17px;font-weight:700;color:#fff}
#slipFooter .small{font-size:12px;color:rgba(255,255,255,.62)}
#slipFooter .status{background:rgba(0,0,0,.22);border:1px solid rgba(226,184,77,.28);border-radius:12px;padding:12px 14px}
#slipFooter .status .row{margin-bottom:6px;align-items:center}
#slipFooter .status .row:last-child{margin-bottom:0}

#slipFooter .status{overflow:hidden;max-width:100%}
#slipFooter .st-net{display:flex;align-items:center;gap:10px;min-width:0}
#slipFooter .st-logo{position:relative;width:26px;height:26px;flex-shrink:0;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:visible;box-shadow:0 1px 4px rgba(0,0,0,.35)}
#slipFooter .st-logo img{width:18px;height:18px;object-fit:contain;border-radius:3px}
#slipFooter .st-logo img.full{width:100%;height:100%;border-radius:7px;object-fit:cover}
#slipFooter .st-logo em{font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.02em;color:#fff;width:100%;height:100%;border-radius:7px;display:flex;align-items:center;justify-content:center;background:#6d1f2e}
#slipFooter .st-logo em[hidden],#slipFooter .st-logo img[hidden]{display:none}
#slipFooter .st-logo .dot{position:absolute;right:-3px;bottom:-3px;margin:0;width:10px;height:10px;border:2px solid #2a0a12;box-sizing:content-box}
#slipFooter .st-div{height:1px;margin:0 -14px;background:linear-gradient(90deg,transparent,rgba(226,184,77,.38) 18%,rgba(226,184,77,.38) 82%,transparent)}
#slipFooter .st-recs{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;cursor:pointer;border-radius:8px;margin:-4px 0;padding:4px 0}
#slipFooter .st-recs:focus-visible{outline:2px solid #e2b84d;outline-offset:3px}
#slipFooter .st-recs .ic{width:18px;flex-shrink:0;text-align:center}
#slipFooter .st-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
#slipFooter .st-t b{font-weight:700;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#slipFooter .st-t small{font-size:11.5px;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#slipFooter .st-act{flex-shrink:0;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;line-height:1;border-radius:50%;border:1px solid rgba(226,184,77,.7);color:#e2b84d;transition:background .15s,color .15s}
#slipFooter .st-recs:hover .st-act{background:#e2b84d;color:#350d18}
#slipFooter .st-recs.empty .st-act{background:rgba(226,184,77,.18)}
#slipFooter .st-recs.busy{cursor:progress}
#slipFooter .st-recs.busy .st-act,#slipFooter .st-recs.off .st-act{opacity:.45;border-color:rgba(255,255,255,.3);color:#fff;background:none}
#slipFooter .st-recs.busy .ic{animation:ftSpin 1s linear infinite}
#slipFooter .st-recs.off{cursor:not-allowed}
#slipFooter .status{display:flex;flex-direction:column;justify-content:space-around;transition:border-color .15s,background .15s}
#slipFooter .status{position:relative}
#slipFooter .st-main{flex:1;display:flex;flex-direction:column;justify-content:space-around;transition:opacity .2s ease,transform .3s cubic-bezier(.2,.7,.2,1),filter .2s ease}
#slipFooter .status.asking .st-main,#slipFooter .status.done .st-main,#slipFooter .status.picking .st-main{opacity:0;transform:translateY(-8px) scale(.98);filter:blur(2px);pointer-events:none}
#slipFooter .status.asking{border-color:rgba(236,120,110,.75);background:rgba(72,10,20,.55);box-shadow:0 0 0 3px rgba(236,120,110,.12)}
#slipFooter .status.done{border-color:rgba(123,216,143,.65);background:rgba(10,40,24,.35);box-shadow:0 0 0 3px rgba(123,216,143,.1)}
#slipFooter .st-confirm{position:absolute;inset:0;padding:12px 14px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,visibility 0s .3s}
#slipFooter .status.asking .st-confirm,#slipFooter .status.done .st-confirm{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .22s ease .1s,visibility 0s}
#slipFooter .cf-ask{position:absolute;inset:0;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:3px;transform:translateY(12px);transition:transform .34s cubic-bezier(.2,.8,.25,1) .08s,opacity .2s}
#slipFooter .status.asking .cf-ask{transform:none}
#slipFooter .status.done .cf-ask{opacity:0;transform:translateY(-8px);pointer-events:none}
#slipFooter .cf-ask b{font-size:14.5px;color:#fff;display:flex;align-items:center;gap:8px}
#slipFooter .cf-ask b i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(236,120,110,.2);color:#f19a91;font-size:12px}
#slipFooter .cf-ask .small{line-height:1.4}
#slipFooter .cf-btns{display:flex;gap:8px;margin-top:8px}
#slipFooter .cf-btns button{all:unset;box-sizing:border-box;flex:1;text-align:center;height:30px;line-height:28px;border-radius:999px;font-size:12.5px;font-weight:700;cursor:pointer;border:1px solid transparent;transition:background .15s,color .15s,border-color .15s}
#slipFooter .cf-btns button:focus-visible{outline:2px solid #e2b84d;outline-offset:2px}
#slipFooter .cf-btns .cf-no{border-color:rgba(255,255,255,.3)!important;color:rgba(255,255,255,.9)}
#slipFooter .cf-btns .cf-no:hover{background:rgba(255,255,255,.1)}
#slipFooter .cf-btns .cf-yes{background:#d9534f;color:#fff}
#slipFooter .cf-btns .cf-yes:hover{background:#ec6a65}
#slipFooter .cf-done{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;gap:12px;opacity:0;transform:scale(.94);transition:opacity .2s,transform .34s cubic-bezier(.2,.9,.3,1.2)}
#slipFooter .status.done .cf-done{opacity:1;transform:none;transition-delay:.12s}
#slipFooter .cf-done b{font-size:14.5px;color:#fff}
#slipFooter .cf-done svg{width:30px;height:30px;flex-shrink:0}
#slipFooter .cf-done circle{fill:none;stroke:#7bd88f;stroke-width:2}
#slipFooter .cf-done path{fill:none;stroke:#7bd88f;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:24}
#slipFooter .status.done .cf-done path{animation:cfTick .45s ease .3s forwards}
@keyframes cfTick{to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){#slipFooter .st-main,#slipFooter .st-confirm,#slipFooter .cf-ask,#slipFooter .cf-done{transition:none}#slipFooter .status.done .cf-done path{animation:none;stroke-dashoffset:0}}
#slipFooter .st-rw{position:relative;margin:-4px 0}
#slipFooter .st-rw .st-recs{margin:0;gap:7px}
#slipFooter .st-rw .st-recs .ic{width:16px}
#slipFooter .st-rw .st-act{width:22px;height:22px;font-size:12px}
#slipFooter .st-rw.has .st-t{margin-right:23px}
#slipFooter .st-clr{all:unset;box-sizing:border-box;position:absolute;z-index:1;right:27px;top:calc(50% - 11px);width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;line-height:1;border-radius:50%;border:1px solid rgba(226,184,77,.7);color:#e2b84d;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
#slipFooter .st-clr:hover,#slipFooter .st-clr:focus-visible{background:rgba(255,77,77,.16);border-color:#ff5252;color:#ff5252}
#slipFooter .st-clr:focus-visible{outline:2px solid #e2b84d;outline-offset:3px}
#slipFooter .st-clr[hidden]{display:none}
#slipFooter .bin{width:100%;height:100%;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}
#slipFooter .st-clr .bin{width:13px;height:13px}
#slipFooter .cf-ask b i .bin{width:12px;height:12px}
#slipFooter .bin .lid{transform-box:fill-box;transform-origin:15% 100%;transition:transform .18s ease}
#slipFooter .st-clr:hover .lid,#slipFooter .st-clr:focus-visible .lid{transform:translateY(-1.5px) rotate(-14deg)}
@media(prefers-reduced-motion:reduce){#slipFooter .bin .lid{transition:none}}
/* Upload area: the same swap as Disconnect, but gold. Opens when the register row is clicked or a file is dragged over the box. Only the zone opens the explorer. */
#slipFooter .status.picking{border-color:rgba(226,184,77,.6);background:rgba(226,184,77,.05);box-shadow:0 0 0 3px rgba(226,184,77,.1)}
#slipFooter .st-up{position:absolute;inset:0;padding:8px;display:flex;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,visibility 0s .3s}
#slipFooter .status.picking .st-up{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .22s ease .1s,visibility 0s}
#slipFooter .up-z{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 22px;text-align:center;cursor:pointer;outline:none;
  border:1.5px dashed rgba(226,184,77,.6);border-radius:10px;background:rgba(226,184,77,.06);
  transform:translateY(10px);transition:transform .34s cubic-bezier(.2,.8,.25,1) .08s,background .15s,border-color .15s}
#slipFooter .status.picking .up-z{transform:none}
#slipFooter .up-z:hover{background:rgba(226,184,77,.12);border-color:#e2b84d}
#slipFooter .up-z:focus-visible{border-color:#e2b84d;box-shadow:0 0 0 2px rgba(226,184,77,.5)}
#slipFooter .up-z svg{width:26px;height:26px;margin-bottom:2px;fill:none;stroke:#e2b84d;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform .25s cubic-bezier(.2,.8,.25,1)}
#slipFooter .up-z:hover svg{transform:translateY(-2px)}
#slipFooter .up-z b{font-size:14px;line-height:1.25;color:#fff}
#slipFooter .up-z small{font-size:11.5px;line-height:1.35;color:rgba(255,255,255,.62);white-space:pre-line}
#slipFooter .status.drag .up-z{border-style:solid;border-color:#f6dc8c;background:rgba(226,184,77,.2)}
#slipFooter .status.drag .up-z svg{transform:translateY(-4px)}
#slipFooter .up-z.is-err{border-color:#ef8a80;background:rgba(236,120,110,.1);animation:ftShake .4s}
#slipFooter .up-z.is-err svg{display:none}
#slipFooter .up-z.is-err small{color:#f19a91}
@keyframes ftShake{20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
#slipFooter .up-x{all:unset;box-sizing:border-box;position:absolute;z-index:1;right:15px;top:15px;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:rgba(255,255,255,.7);cursor:pointer;font-size:15px;line-height:1;transition:background .15s,color .15s}
#slipFooter .up-x:hover{background:rgba(255,255,255,.14);color:#fff}
#slipFooter .up-x:focus-visible{outline:2px solid #e2b84d;outline-offset:2px}
#slipFooter .up-ask{display:none;position:absolute;inset:0;padding:12px 14px;flex-direction:column;justify-content:center;gap:3px}
#slipFooter .status.replacing .up-z{display:none}
#slipFooter .status.replacing .up-ask{display:flex}
#slipFooter .status.replacing .up-x{display:none}
#slipFooter .up-ask b{font-size:14.5px;color:#fff}
#slipFooter .up-ask .small{line-height:1.4}
#slipFooter .cf-btns .up-go{background:#e2b84d;color:#350d18}
#slipFooter .cf-btns .up-go:hover{background:#f6dc8c}
@media(prefers-reduced-motion:reduce){#slipFooter .st-up,#slipFooter .up-z,#slipFooter .up-z svg{transition:none}#slipFooter .up-z.is-err{animation:none}}
#slipFooter .status.drag{border-color:#e2b84d;background:rgba(226,184,77,.14)}
@keyframes ftSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#slipFooter .st-recs.busy .ic{animation:none}}
#slipFooter .dot{width:9px;height:9px;border-radius:50%;background:#7bd88f;display:inline-block;margin:0 4.5px}
#slipFooter .dot.off{background:#f0a04b}
#slipFooter .social{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 0;padding:0;list-style:none}
#slipFooter .social a{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border-radius:50%;border:1px solid rgba(226,184,77,.55);background:rgba(0,0,0,.18);color:#e2b84d;text-decoration:none;transition:background .15s,color .15s,border-color .15s,transform .15s}
#slipFooter .social a:hover{background:#e2b84d;border-color:#e2b84d;color:#350d18;text-decoration:none;transform:translateY(-2px)}
#slipFooter .social a[data-k=email]:hover{background:#EA4335;border-color:#EA4335;color:#fff}#slipFooter .social a[data-k=whatsapp]:hover{background:#25D366;border-color:#25D366;color:#fff}#slipFooter .social a[data-k=x]:hover{background:#fff;border-color:#fff;color:#000}#slipFooter .social a[data-k=github]:hover{background:#fff;border-color:#fff;color:#181717}#slipFooter .social a[data-k=linkedin]:hover{background:#0A66C2;border-color:#0A66C2;color:#fff}
#slipFooter .social svg{width:17px;height:17px;display:block;fill:currentColor}
@media(prefers-reduced-motion:reduce){#slipFooter .social a{transition:none}#slipFooter .social a:hover{transform:none}}
#slipFooter .ft-legal{border-top:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.2)}
#slipFooter .ft-bar{max-width:1500px;margin:0 auto;padding:12px 14px 22px;display:flex;align-items:center;gap:10px 24px;font-size:12px;color:rgba(255,255,255,.6)}
#slipFooter .ft-ver{flex:1 1 auto;text-align:center}
#slipFooter .ft-top{flex:none}
@media(max-width:900px){#slipFooter .ft-bar{flex-direction:column;align-items:flex-start}#slipFooter .ft-ver{flex:none;text-align:left}}
@media(max-width:980px){#slipFooter .ft-main{grid-template-columns:1fr 1fr;gap:30px}}
@media(max-width:560px){#slipFooter .ft-main{grid-template-columns:1fr;padding:30px 14px 20px}}
@media print{#slipFooter{display:none !important}}`;

function footerHTML(crest) {
  const c = FOOTER_CONFIG;
  const pretty = c.helpPhone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
  const intl = '+' + c.whatsapp;
  const rows = [
    '<div class="row"><span class="ic">📞</span><div><a class="phone" href="tel:' + intl + '">' + pretty + '</a><div class="small">Call or SMS: works without internet</div></div></div>',
    '<div class="row"><span class="ic">💬</span><div><a href="https://wa.me/' + c.whatsapp + '" target="_blank" rel="noopener">Chat on WhatsApp</a><div class="small">Needs an internet connection</div></div></div>'
  ];
  if (c.email)   rows.push('<div class="row"><span class="ic">✉️</span><a href="mailto:' + c.email + '">' + c.email + '</a></div>');
  if (c.hours)   rows.push('<div class="row"><span class="ic">🕘</span><span>' + c.hours + '</span></div>');
  if (c.address) rows.push('<div class="row"><span class="ic">📍</span><span>' + c.address + '</span></div>');
  const SOC_HOME = { email: 'https://mail.google.com/', whatsapp: 'https://wa.me/' + c.whatsapp, x: 'https://x.com/', github: 'https://github.com/', linkedin: 'https://linkedin.com/', };
  const social = (c.social || []).filter(s => SOCIAL_ICONS[s.k]).map(s => {
    const url = s.url || (s.k === 'email' && c.email ? 'mailto:' + c.email : SOC_HOME[s.k]);
    const ic = SOCIAL_ICONS[s.k];
    return '<li><a data-k="' + s.k + '" href="' + url + '" target="_blank" rel="noopener" aria-label="' + s.label + '" title="' + s.label + '"><svg viewBox="' + ic[0] + '" aria-hidden="true" focusable="false"><path d="' + ic[1] + '"/></svg></a></li>';
  }).join('');
  return `
<div class="ft-main">
  <div>
    <div class="brandrow"><span class="crest"><img src="${crest}" alt="Oyo State crest"></span>
      <div class="brand"><b class="stack"><span>Slip</span><span>Desk</span></b><i class="sep" aria-hidden="true"></i><span class="tag"><span>Oyo State</span><span>2026 Compulsory Exam</span></span></div></div>
    <p>${c.about}</p>
    ${social ? '<ul class="social" aria-label="Social links">' + social + '</ul>' : ''}
  </div>
  <div role="navigation" aria-label="Quick links">
    <h4>Quick links</h4>
    <ul>
      <li class="lk-pair"><button class="lnk" data-go="registration">Registration</button><span class="lk-sep" aria-hidden="true">|</span><button class="lnk" data-go="exam">Examination</button></li>
      <li class="lk-pair"><button class="lnk" data-go="analysis" data-an="breakdown">Report</button><span class="lk-sep" aria-hidden="true">|</span><button class="lnk" data-go="analysis" data-an="analysis">Analysis</button></li>
      <li class="lk-pair"><button class="lnk" data-go="analysis" data-an="revenue">Revenue</button><span class="lk-sep" aria-hidden="true">|</span><button class="lnk" data-go="analysis" data-an="attendance">Attendances</button></li>
      <li class="lk-pair"><button class="lnk" data-go="analysis" data-an="others">Others</button><span class="lk-sep" aria-hidden="true">|</span><button class="lnk" data-go="log">Activity</button></li>
      <li class="lk-pair"><button class="lnk" data-legal="disclaimer">Disclaimer</button><span class="lk-sep" aria-hidden="true">|</span><button class="lnk" data-legal="terms">Terms</button><span class="lk-sep" aria-hidden="true">|</span><button class="lnk" data-legal="privacy">Privacy</button></li>
    </ul>
  </div>
  <div>
    <h4>Help desk</h4>
    ${rows.join('')}
    <p class="small" id="ftNoteH" style="margin-top:10px">Have your <b>full name</b>, <b>phone number</b> and <b>payment reference</b> ready when you contact us.</p>
  </div>
  <div>
    <h4>This station</h4>
    <div class="status" id="ftStatus">
      <div class="st-main" id="ftMain">
      <div class="st-net">
        <span class="st-logo" id="ftLogo" aria-hidden="true"><em id="ftMono">·</em><img id="ftImg" alt="" hidden><i class="dot" id="ftDot"></i></span>
        <span class="st-t"><b id="ftConn">Checking connection…</b><small id="ftIp"></small></span>
      </div>
      <div class="st-div" aria-hidden="true"></div>
      <div class="st-rw" id="ftRow">
      <button type="button" class="st-recs empty" id="ftBtn" title="Click to upload or replace the register, or drop a file here">
        <span class="ic" id="ftIc">🗂️</span>
        <span class="st-t"><b id="ftRecs">No register loaded</b><small id="ftMeta">Click or drop a file to upload</small></span>
        <span class="st-act" id="ftAct">Upload</span>
      </button>
        <button type="button" class="st-clr" id="ftOff" data-unload="1" hidden title="Disconnect register" aria-label="Disconnect register"><svg class="bin" viewBox="0 0 24 24" aria-hidden="true"><g class="lid"><path d="M4 7h16"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/></g><path d="M6 7l1 12.2a1 1 0 0 0 1 .8h8a1 1 0 0 0 1-.8L18 7"/><path d="M10 11v5M14 11v5"/></svg></button>
      </div>
      </div>
      <div class="st-confirm" id="ftConfirm" role="alertdialog" aria-labelledby="ftCT" aria-describedby="ftCD" inert>
        <div class="cf-ask">
          <b id="ftCT"><i aria-hidden="true"><svg class="bin" viewBox="0 0 24 24" aria-hidden="true"><g class="lid"><path d="M4 7h16"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/></g><path d="M6 7l1 12.2a1 1 0 0 0 1 .8h8a1 1 0 0 0 1-.8L18 7"/><path d="M10 11v5M14 11v5"/></svg></i>Disconnect register?</b>
          <span class="small" id="ftCD">Clears <span id="ftCN">0</span> applications from this desk. Your file is not deleted.</span>
          <div class="cf-btns"><button type="button" class="cf-no" id="ftNo" data-cancel="1">Cancel</button><button type="button" class="cf-yes" data-confirm="1">Disconnect</button></div>
        </div>
        <div class="cf-done" role="status"><svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13"/><path d="M9 15.5l4 4 8-9"/></svg><b>Register disconnected</b></div>
      </div>
      <div class="st-up" id="ftUp" role="dialog" aria-label="Upload register" inert>
        <div class="up-z" id="ftZone" role="button" tabindex="0" aria-label="Choose a register file, or drop one here">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
          <b id="ftUpT">Drop the register here</b><small id="ftUpS">or click to browse</small>
        </div>
        <button type="button" class="up-x" id="ftUpX" aria-label="Cancel upload" title="Cancel">✕</button>
        <div class="up-ask" role="alertdialog" aria-label="Replace the loaded register?">
          <b>Replace register?</b><span class="small" id="ftUpAskP"></span>
          <div class="cf-btns"><button type="button" class="cf-no" id="ftUpNo">Cancel</button><button type="button" class="cf-yes up-go" id="ftUpYes">Replace</button></div>
        </div>
      </div>
    </div>
    <p class="small" id="ftNoteS" style="margin-top:10px">Slips are issued only after payment has been confirmed against the register.</p>
  </div>
</div>
<div class="ft-legal">
<div class="ft-bar">
  <span>© ${c.year} ${c.org}.</span>
  <span class="ft-ver">Slip Desk · IT support tool · ${c.version}</span>
  <span class="ft-top"><button class="lnk" data-top="1"><span class="arw arw-u" aria-hidden="true">↑</span> Back to top</button></span>
</div></div>`;
}

// Make the "Slips are issued…" note sit level with the "Have your full name…" note by letting the station box grow
function alignNotes(d) {
  try {
    const st = d.getElementById('ftStatus'), a = d.getElementById('ftNoteS'), h = d.getElementById('ftNoteH'), main = d.querySelector('#slipFooter .ft-main');
    if (!st || !a || !h || !main) return;
    st.style.minHeight = ''; h.style.marginTop = '10px';
    if (d.defaultView.getComputedStyle(main).gridTemplateColumns.split(' ').length < 4) return;   // stacked on narrow screens
    const diff = Math.round(h.getBoundingClientRect().top - a.getBoundingClientRect().top);   // >0: help desk note is lower, so the box grows; <0: the box is already taller, so the help note moves down
    if (diff > 0) st.style.minHeight = (st.offsetHeight + diff) + 'px';
    else if (diff < 0) h.style.marginTop = (10 - diff) + 'px';
  } catch (e) {}
}
function setFooterStatus(d) {
  try {
    const conn = d.getElementById('ftConn'); if (!conn) return;
    const on = d.defaultView.navigator.onLine, canRead = typeof XLSX !== 'undefined';
    d.getElementById('ftDot').className = 'dot' + (on ? '' : ' off');
    conn.textContent = on ? (NET.isp || 'Online') : 'Offline';
    d.getElementById('ftIp').textContent = on ? (NET.ip ? NET.ip + (NET.city ? ' · ' + NET.city : '') : 'Locating…') : 'No internet connection';
    conn.title = on ? (NET.full || 'Looking up the provider and location of this connection') : 'No internet connection';
    const mono = d.getElementById('ftMono'), img = d.getElementById('ftImg');
    mono.textContent = on && NET.isp ? NET.isp.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '–';
    const doms = on ? logoDomains() : [], key = doms.join('|'), loc = on ? localLogo() : '';
    if (loc) {
      // MTN, Airtel and Glo: the built-in image shows straight away; the icon from the provider's own website is looked up in the background and replaces it as soon as one is found
      const dk = 'L:' + loc + ':' + (LOGO_FOUND[loc] || '');
      if (img.dataset.d !== dk) {
        img.dataset.d = dk; img.onload = img.onerror = null;
        if (LOGO_FOUND[loc]) img.classList.remove('full'), img.src = LOGO_FOUND[loc];
        else img.classList.add('full'), img.src = ISP_LOGOS[loc];
      }
      img.hidden = false; mono.hidden = true;
      const site = logoDomains()[0];
      if (site && LOGO_FOUND[loc] === undefined && !LOGO_BUSY[loc]) {
        LOGO_BUSY[loc] = 1;
        const urls = []; ['', 'www.'].forEach(w => LOGO_PATHS.forEach(x => urls.push('https://' + w + site + '/' + x)));
        let n = 0; const probe = new Image(), nextUrl = () => { clearTimeout(probe._t); if (n >= urls.length) { LOGO_FOUND[loc] = ''; LOGO_BUSY[loc] = 0; return; } probe.src = urls[n++]; probe._t = setTimeout(nextUrl, 5000); };
        probe.onload = () => { if (probe.naturalWidth >= 16) { clearTimeout(probe._t); probe.onload = probe.onerror = null; LOGO_FOUND[loc] = probe.src; LOGO_BUSY[loc] = 0; updateFooterStatus(); } else nextUrl(); };
        probe.onerror = nextUrl; nextUrl();
      }
    } else if (doms.length && img.dataset.d !== key) {
      img.classList.remove('full'); img.dataset.d = key; img.hidden = true; mono.hidden = false;
      const urls = []; doms.forEach(dm => { urls.push('https://' + dm + '/favicon.ico', 'https://icons.duckduckgo.com/ip3/' + dm + '.ico'); });
      let n = 0; const next = () => { if (n >= urls.length) { img.hidden = true; mono.hidden = false; return; } img.src = urls[n++]; };
      img.onload = () => { if (img.naturalWidth >= 16) { img.hidden = false; mono.hidden = true; } else next(); }; img.onerror = next; next();
    }
    if (!loc && (!on || !doms.length)) { img.hidden = true; mono.hidden = false; img.dataset.d = ''; }
    const btn = d.getElementById('ftBtn'), recs = d.getElementById('ftRecs'), meta = d.getElementById('ftMeta'), act = d.getElementById('ftAct');
    const has = !!(ROWS && ROWS.length), busy = !!REG_BUSY, off = !busy && !canRead;
    const upBox = d.getElementById('ftStatus'); if (busy && upBox && upBox.__up) upBox.__up.close(false, true);   // the upload area gives way to the "Reading register…" row
    btn.className = 'st-recs' + (busy ? ' busy' : off ? ' off' : has ? '' : ' empty');
    btn.disabled = busy || off;
    if (busy) { recs.textContent = 'Reading register…'; meta.textContent = 'Please wait'; act.textContent = '…'; }
    else if (off) { recs.textContent = has ? ROWS.length.toLocaleString() + ' applications' : 'No register loaded'; meta.textContent = 'Reconnect to upload'; act.textContent = has ? '⟳' : '↑'; }
    else if (has) { recs.textContent = ROWS.length.toLocaleString() + ' applications'; meta.textContent = 'Loaded ' + (LOADED_AT || ''); act.textContent = '⟳'; }
    else { recs.textContent = 'No register loaded'; meta.textContent = 'Click or drop a file to upload'; act.textContent = '↑'; }
    const off2 = d.getElementById('ftOff'), rw = d.getElementById('ftRow'); if (off2) off2.hidden = !has || busy; if (rw) rw.classList.toggle('has', has && !busy);
    act.setAttribute('aria-label', has ? 'Replace register' : 'Upload register');
    btn.title = busy ? 'Reading the register, please wait' : has ? 'Click to replace the register, or drop a new file here' : 'Click to upload the register, or drop a file here';
    alignNotes(d);
  } catch (e) {}
}
// Where to look on a provider's own website for its icon (same list as the logo-check scratch page), and what was found for each of MTN / Airtel / Glo this session ('' = nothing found, keep the built-in image)
const LOGO_PATHS = ["apple-touch-icon.png", "apple-touch-icon-precomposed.png", "android-chrome-192x192.png", "favicon-196x196.png", "favicon-96x96.png", "favicon-32x32.png", "favicon.png", "favicon.svg", "favicon.ico", "logo.png", "logo.svg", "images/logo.png", "img/logo.png", "assets/images/logo.png", "assets/img/logo.png", "wp-content/uploads/logo.png"];
let LOGO_FOUND = {}, LOGO_BUSY = {};
// Real logos of the three main Nigerian providers, kept built in only as the fallback when the provider's own website gives no icon
const ISP_LOGOS = {"mtn": "data:image/png;base64,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", "glo": "data:image/png;base64,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", "airtel": "data:image/png;base64,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"};
function localLogo() { const n = NET.isp || ''; return /\bmtn\b/i.test(n) ? 'mtn' : /airtel/i.test(n) ? 'airtel' : /\bglo\b|globacom/i.test(n) ? 'glo' : ''; }
// Websites of the usual Nigerian providers, so a real logo can be found even when the lookup gives no domain
const ISP_SITES = [[/\bmtn\b/i, 'mtnonline.com'], [/airtel/i, 'airtel.com.ng'], [/\bglo\b|globacom/i, 'gloworld.com'], [/9mobile|etisalat/i, '9mobile.com.ng'], [/spectranet/i, 'spectranet.com.ng'], [/smile/i, 'smile.com.ng'], [/fibreone/i, 'fibreone.ng'], [/ipnx/i, 'ipnx.ng'], [/starlink|spacex/i, 'starlink.com'], [/swift/i, 'swiftnetworks.com.ng'], [/tizeti|wifi\.com\.ng/i, 'wifi.com.ng'], [/mainone/i, 'mainone.net'], [/ntel/i, 'ntel.ng'], [/cobranet/i, 'cobranet.ng'], [/vodafone/i, 'vodafone.com'], [/\bmtn\b/i, 'mtn.com']];
function logoDomains() {
  const out = []; ISP_SITES.forEach(x => { if (x[0].test(NET.isp || '') && out.indexOf(x[1]) < 0) out.push(x[1]); });
  const dm = String(NET.domain || '').toLowerCase().replace(/^www\./, ''); if (dm && out.indexOf(dm) < 0) out.push(dm);
  return out;
}
function lookupNet() {   // who provides this station's internet and where it is (one small request to a public IP-lookup service)
  if (!navigator.onLine) { NET = { isp: '', ip: '', city: '', domain: '', full: '' }; return updateFooterStatus(); }
  const get = (url, pick) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 7000);
    return fetch(url, { signal: ac.signal }).then(r => r.json()).then(j => { clearTimeout(t); return pick(j); }).catch(() => { clearTimeout(t); return null; }); };
  const clean = v => String(v || '').replace(/^AS\d+\s+/i, '').replace(/\b(communications?|telecommunications?|limited|ltd\.?|plc|inc\.?|llc|nigeria ltd)\b/gi, '').replace(/[\s,.-]+$/g, '').replace(/\s+/g, ' ').trim();
  const fin = r => { if (!r || !r.isp) return null; return { isp: clean(r.isp) || r.isp, ip: r.ip || '', city: r.city || r.country || '', domain: r.domain || '', both: [r.city, r.country].filter(Boolean).join(', ') }; };
  get('https://ipwho.is/', j => j && j.success !== false ? fin({ isp: (j.connection && (j.connection.isp || j.connection.org)), domain: j.connection && j.connection.domain, ip: j.ip, city: j.city, country: j.country }) : null)
    .then(r => r || get('https://ipapi.co/json/', j => j && !j.error ? fin({ isp: j.org, ip: j.ip, city: j.city, country: j.country_name }) : null))
    .then(r => { NET = r ? { isp: r.isp, ip: r.ip, city: r.city, domain: r.domain, full: 'Provider: ' + r.isp + (r.ip ? '\nIP address: ' + r.ip : '') + (r.both ? '\nLocation: ' + r.both : '') } : { isp: '', ip: '', city: '', domain: '', full: 'Could not look up the provider and location' }; updateFooterStatus(); });
}
window.addEventListener('online', () => { NET = { isp: '', ip: '', city: '', domain: '', full: '' }; LOGO_FOUND = {}; LOGO_BUSY = {}; updateFooterStatus(); lookupNet(); });
window.addEventListener('offline', updateFooterStatus);
setTimeout(lookupNet, 800);
function updateFooterStatus() { Object.keys(frames).forEach(n => { try { setFooterStatus(frames[n].contentDocument); } catch (e) {} }); try { setFooterStatus(document); } catch (e) {} }

// The Disconnect confirm box sits inside each page's footer; a press anywhere outside it (this page, the navbar, another frame) closes it
const FT_CLOSE = {};
// Upload area inside each footer's station box. FT_UP[name] = { open, err } for that page's footer; FT_FROM = the footer a load was started from,
// so a file that cannot be read is reported there (the navbar button and panel report it too).
const FT_UP = {};
let FT_FROM = '';
function ftUploadError(detail) {
  const n = FT_FROM; if (!n || !FT_UP[n]) return;
  FT_FROM = '';
  const why = detail ? String(detail).replace(/\s+/g, ' ').slice(0, 70) : 'Choose a valid .xlsx, .xls or .csv.';
  FT_UP[n].open(false); FT_UP[n].err('Couldn’t read that file. ' + why);
}
document.addEventListener('pointerdown', () => { Object.keys(FT_CLOSE).forEach(k => { try { FT_CLOSE[k](); } catch (e) {} }); }, true);
function addFooter(name, onMain) {   // onMain: the footer of the Profile page, which sits in this document rather than in a frame
  try {
    const d = onMain ? document : frames[name].contentDocument;
    if (!d || !d.body || d.getElementById('slipFooter')) return;
    const hostId = onMain ? '' : { log: 'logPage', analysis: 'anPage', legal: 'lglPage', print: 'prPage' }[name], isLog = !!hostId, host = isLog ? d.getElementById(hostId) : d.body;   // the log, Analysis and Legal pages scroll inside their own box, so their footer goes in there
    if (!host) return;
    const crest = document.querySelector('.brandwrap img').src;
    const st = d.createElement('style'); st.textContent = FOOTER_CSS; d.head.appendChild(st);
    const f = d.createElement('footer'); f.id = 'slipFooter'; f.innerHTML = footerHTML(crest);
    // Run edge to edge: cancel whatever padding the page's body has on the sides and bottom
    if (onMain) { f.style.marginTop = '28px'; f.style.flex = 'none'; }
    else if (isLog) f.style.marginTop = '28px';
    else { const cs = d.defaultView.getComputedStyle(d.body); f.style.margin = '2rem -' + cs.paddingRight + ' -' + cs.paddingBottom + ' -' + cs.paddingLeft; }
    if (name === 'school') f.style.marginTop = '0';   // the School page is one full-screen block (options + sheet): the footer sits flush under it, no strip of page background between them
    if (onMain) host.insertBefore(f, d.querySelector('main').nextSibling); else host.appendChild(f);   // the Profile footer goes right under <main>
    // Register box: click the register row and the box swaps to an upload area (nothing opens the explorer yet); only the area itself opens the picker.
    // Drag a file over the box and the same area opens by itself and takes the drop.
    const stBox = f.querySelector('#ftStatus'), stBtn = f.querySelector('#ftBtn');
    const cfMain = f.querySelector('#ftMain'), cfBox = f.querySelector('#ftConfirm'), upBox = f.querySelector('#ftUp'), zone = f.querySelector('#ftZone'),
          upT = f.querySelector('#ftUpT'), upS = f.querySelector('#ftUpS'), upAskP = f.querySelector('#ftUpAskP'), upNo = f.querySelector('#ftUpNo'), upYes = f.querySelector('#ftUpYes');
    const note = msg => { const m = f.querySelector('#ftMeta'); if (m) { m.textContent = msg; setTimeout(updateFooterStatus, 2600); } };
    const OKF = /\.(xlsx|xls|csv)$/i, cnt = () => (ROWS && ROWS.length) || 0, shortName = n => n.length > 28 ? n.slice(0, 25) + '…' : n;
    const hasF = e => !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0);
    const canRead = () => typeof XLSX !== 'undefined';
    let upByDrag = false, upPending = null, upErrT = 0, dn = 0;
    const clearUpErr = () => { clearTimeout(upErrT); zone.classList.remove('is-err'); };
    function paintUp() {
      const n = cnt(), over = stBox.classList.contains('drag');
      upT.textContent = over ? 'Release to load' : n ? 'Drop a new register here' : 'Drop the register here';
      if (zone.classList.contains('is-err')) return;
      upS.textContent = n ? 'Replaces ' + n.toLocaleString() + ' applications\nor click to browse' : 'or click to browse\n.xlsx, .xls or .csv';
    }
    function upErr(text) {
      clearTimeout(upErrT); zone.classList.remove('is-err'); void zone.offsetWidth; zone.classList.add('is-err'); upS.textContent = text;
      upErrT = setTimeout(() => { clearUpErr(); paintUp(); }, 4500);
    }
    function openUp(byDrag) {
      if (stBox.classList.contains('picking')) return;
      stBox.classList.remove('asking', 'done'); cfBox.inert = true;
      upByDrag = !!byDrag; clearUpErr(); paintUp();
      stBox.classList.add('picking'); cfMain.inert = true; upBox.inert = false;
      if (!byDrag) setTimeout(() => { if (stBox.classList.contains('picking')) zone.focus({ preventScroll: true }); }, 60);
    }
    function closeUp(restoreFocus, keepFrom) {
      if (!stBox.classList.contains('picking')) return;
      stBox.classList.remove('picking', 'drag', 'replacing'); upPending = null; upByDrag = false; dn = 0; clearUpErr();
      if (!keepFrom && FT_FROM === name) FT_FROM = '';
      upBox.inert = true; cfMain.inert = false;
      if (restoreFocus && stBtn && !stBtn.disabled) stBtn.focus({ preventScroll: true });
    }
    stBox.__up = { close: closeUp }; FT_UP[name] = { open: openUp, err: upErr };
    const pickFile = () => { if (REG_BUSY || !canRead()) return; FT_FROM = name; if (window.sdUpload && window.sdUpload.pick) window.sdUpload.pick(); else document.getElementById('xlsxFile').click(); };
    function takeFile(file) {                       // a file dropped on the box
      if (REG_BUSY) return;
      if (!canRead()) { closeUp(false); return note('Reader needs internet · reconnect'); }
      if (!OKF.test(file.name)) { upErr('“' + shortName(file.name) + '” is not a register file. Use .xlsx, .xls or .csv.'); return; }
      if (cnt()) {                                  // something is already loaded: ask before replacing it
        upPending = file; upAskP.textContent = 'Loading “' + shortName(file.name) + '” clears the ' + cnt().toLocaleString() + ' applications already on this desk.';
        stBox.classList.add('replacing'); setTimeout(() => upNo.focus({ preventScroll: true }), 60); return;
      }
      FT_FROM = name; loadRegisterFile(file);
    }
    if (stBtn) stBtn.addEventListener('click', () => { if (REG_BUSY || stBtn.disabled) return; openUp(false); });
    zone.addEventListener('click', pickFile);
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
    f.querySelector('#ftUpX').addEventListener('click', () => closeUp(true));
    upNo.addEventListener('click', () => { upPending = null; stBox.classList.remove('replacing'); zone.focus({ preventScroll: true }); });
    upYes.addEventListener('click', () => { const file = upPending; upPending = null; stBox.classList.remove('replacing'); if (file) { FT_FROM = name; loadRegisterFile(file); } });
    stBox.addEventListener('dragenter', e => { if (hasF(e)) dn++; });
    stBox.addEventListener('dragover', e => {
      if (!hasF(e)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = REG_BUSY || !canRead() ? 'none' : 'copy';   // preventDefault also tells the navbar panel this box takes the file
      if (REG_BUSY || !canRead()) return;
      if (!stBox.classList.contains('picking')) openUp(true);
      if (!stBox.classList.contains('drag')) { clearUpErr(); stBox.classList.add('drag'); paintUp(); }
    });
    stBox.addEventListener('dragleave', e => {
      if (!hasF(e)) return; dn = Math.max(0, dn - 1); if (dn) return;
      stBox.classList.remove('drag'); paintUp(); if (upByDrag) closeUp(false);
    });
    stBox.addEventListener('drop', e => {
      if (!hasF(e)) return; e.preventDefault(); dn = 0; stBox.classList.remove('drag');
      const file = e.dataTransfer.files && e.dataTransfer.files[0]; paintUp();
      if (!file || REG_BUSY) { if (upByDrag) closeUp(false); return; }
      if (!canRead()) { closeUp(false); return note('Reader needs internet · reconnect'); }
      upByDrag = false;                             // they chose a file: keep the box open for the question or the error
      takeFile(file);
    });
    f.addEventListener('click', e => {
      const t = e.target.closest('[data-go],[data-legal],[data-top]'); if (!t) return;
      const go = () => {
        if (t.dataset.an && window.sdGoAn) { window.sdGoAn(t.dataset.an); d.defaultView.scrollTo(0, 0); }   // Report / Analysis / Revenue / Attendances / Others: same jump as the Analytics dropdown
        else if (t.dataset.go) {
          show(t.dataset.go); d.defaultView.scrollTo(0, 0);
          if (t.dataset.tab) try { frames.analysis.contentDocument.getElementById(t.dataset.tab === 'revenue' ? 'tabRv' : 'tabAn').click(); } catch (e) {}   // Analysis | Revenue
        }
        else if (t.dataset.top) (isLog ? host : d.defaultView).scrollTo({ top: 0, behavior: 'smooth' });
        else openLegal(t.dataset.legal);
      };
      if (onMain && !t.dataset.top && window.sdProfileLeave) window.sdProfileLeave(go); else go();   // on the Profile page: close it first (js/profile.js asks about unsaved edits)
    });
    // Disconnect register: the box swaps to a confirm panel (Cancel / Disconnect), then a green tick, then the register is cleared from this desk
    const closeConfirm = () => { if (!stBox) return; stBox.classList.remove('asking', 'done'); if (cfMain) cfMain.inert = false; if (cfBox) cfBox.inert = true; };
    FT_CLOSE[name] = () => { if (!stBox) return; if (stBox.classList.contains('asking')) closeConfirm(); closeUp(false); };
    d.addEventListener('pointerdown', e => { if (stBox && !stBox.contains(e.target)) FT_CLOSE[name](); }, true);
    f.addEventListener('click', e => {
      if (!stBox || !cfMain || !cfBox) return;
      if (e.target.closest('[data-unload]')) {
        if (!ROWS || REG_BUSY) return;
        f.querySelector('#ftCN').textContent = ROWS.length.toLocaleString();
        stBox.classList.add('asking'); cfMain.inert = true; cfBox.inert = false;
        setTimeout(() => { const b = f.querySelector('#ftNo'); if (b) b.focus(); }, 60);
      } else if (e.target.closest('[data-cancel]')) {
        closeConfirm(); setTimeout(() => { const b = f.querySelector('#ftOff'); if (b && !b.hidden) b.focus(); }, 60);
      } else if (e.target.closest('[data-confirm]')) {
        if (!ROWS) { closeConfirm(); return; }
        stBox.classList.remove('asking'); stBox.classList.add('done');
        unloadRegister();
        setTimeout(() => { closeConfirm(); const b = f.querySelector('#ftBtn'); if (b) b.focus(); }, 1500);
      }
    });
    f.addEventListener('keydown', e => { if (e.key !== 'Escape' || !stBox) return; if (stBox.classList.contains('asking')) closeConfirm(); else if (stBox.classList.contains('picking')) closeUp(true); });
    d.defaultView.addEventListener('online', () => setFooterStatus(d));
    d.defaultView.addEventListener('offline', () => setFooterStatus(d));
    setFooterStatus(d);
    const mainEl = d.querySelector('#slipFooter .ft-main');
    if (mainEl && d.defaultView.ResizeObserver) { let q = 0; new d.defaultView.ResizeObserver(() => { if (q) return; q = d.defaultView.requestAnimationFrame(() => { q = 0; alignNotes(d); }); }).observe(mainEl); const stEl = d.getElementById('ftStatus'); if (stEl) new d.defaultView.ResizeObserver(() => d.defaultView.requestAnimationFrame(() => alignNotes(d))).observe(stEl); d.defaultView.addEventListener('resize', () => alignNotes(d)); }
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => alignNotes(d));
  } catch (e) {}
}

// Press-in feel: every page frame gets the same button stylesheet as the main page (css/08-press.css)
function addPress(name) {
  try {
    const d = frames[name].contentDocument;
    if (!d || !d.head || d.getElementById('sdPress')) return;
    const l = d.createElement('link'); l.id = 'sdPress'; l.rel = 'stylesheet'; l.href = 'css/08-press.css'; d.head.appendChild(l);
    const b = d.createElement('link'); b.id = 'sdButtons'; b.rel = 'stylesheet'; b.href = 'css/12-buttons.css?v=1'; d.head.appendChild(b);   // counter-pill depth for every button, added last so it wins over the page's own styles
    d.addEventListener('touchstart', function () {}, { passive: true });   // lets :active show on iOS Safari
  } catch (e) {}
}
document.addEventListener('touchstart', function () {}, { passive: true });

Object.keys(frames).forEach(name => {
  frames[name].addEventListener('load', () => { addPress(name); addFooter(name); push(name); queueSyncPanels(); try { if (name === 'registration' && window.ResizeObserver) new ResizeObserver(queueSyncPanels).observe(frames[name].contentDocument.getElementById('regFit')); } catch (e) {} });
  frames[name].srcdoc = DOCS[name].replace('</head>', '<style>*{scrollbar-width:none;-ms-overflow-style:none}*::-webkit-scrollbar{display:none;width:0;height:0}</style></head>');   // hide scrollbars inside every page
});
// The Load button is the only status indicator:
//   empty   -> pulses gold so you know a register must be loaded
//   loading -> dashed outline while the file is read
//   loaded  -> turns green and shows how many candidates are now available
//   error   -> pulses red; load again
const loadBtn = document.getElementById('loadBtn');
const lbMain = loadBtn.querySelector('.lb-main'), lbIco = loadBtn.querySelector('.lb-ico');
function setLoadState(state, o) {
  if (state !== 'loading' && REG_BUSY) { REG_BUSY = ''; updateFooterStatus(); }
  o = o || {};
  if (state === 'loaded') FT_FROM = '';
  loadBtn.dataset.state = state;
  loadBtn.classList.remove('flash');
  if (state !== 'loaded') { loadBtn.setAttribute('aria-expanded', 'false'); const rp = document.getElementById('recPop'); if (rp) rp.hidden = true; }
  if (state === 'empty') {
    lbIco.textContent = '📂'; lbMain.textContent = 'Load register';
    loadBtn.title = 'Load the candidates register (.xlsx / .csv)';
  } else if (state === 'loading') {
    lbIco.innerHTML = '<i class="lb-spin"></i>'; lbMain.innerHTML = 'Loading <span class="lb-word">register </span><span class="lb-pct">0%</span>';
  } else if (state === 'error') {
    lbIco.textContent = '⚠️'; lbMain.textContent = 'Couldn’t read that file — load again';
    loadBtn.title = o.detail || 'Choose a valid .xlsx / .xls / .csv register';
    ftUploadError(o.detail);       // a load that started from the footer's upload area shows the problem there too
  } else if (state === 'loaded') {
    lbIco.textContent = '✓';
    lbMain.innerHTML = '<span class="lb-num">0</span> <span class="lb-word">Record' + (o.count === 1 ? '' : 's') + '</span>';
    loadBtn.title = o.count.toLocaleString() + ' candidate records available from “' + o.sheet + '” at ' + o.at + ' — click for the breakdown';
    const num = lbMain.querySelector('.lb-num'), t0 = performance.now(), dur = 700;
    (function tick(t) {
      const k = Math.min(1, (t - t0) / dur);
      num.textContent = Math.round(o.count * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) requestAnimationFrame(tick); else loadBtn.classList.add('flash');
    })(t0);
  }
}
// Progress line: runs on the compositor (transform), so it keeps moving smoothly even while the
// spreadsheet is being parsed and the page is busy. It eases toward ~92%, then finishes to 100%
// the moment the data is ready, and only then does the button switch to the candidate count.
let PROG = null;
function startProgress(bytes) {
  stopProgress();
  setLoadState('loading');
  const prog = loadBtn.querySelector('.lb-prog'), pct = loadBtn.querySelector('.lb-pct');
  prog.style.transition = ''; prog.style.transform = '';
  const est = Math.min(15000, 1000 + (bytes || 0) / 1024 * 8);
  const anim = prog.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(.92)' }],
    { duration: est, easing: 'cubic-bezier(.12,.55,.25,1)', fill: 'forwards' });
  const cur = () => { try { return new DOMMatrix(getComputedStyle(prog).transform).a || 0; } catch (e) { return 0; } };
  let raf = 0;
  (function tick() { pct.textContent = Math.round(cur() * 100) + '%'; raf = requestAnimationFrame(tick); })();
  PROG = { anim, prog, pct, cur, stop: () => cancelAnimationFrame(raf) };
}
function stopProgress() {
  if (!PROG) return;
  PROG.stop(); PROG.anim.cancel(); PROG.prog.style.transition = ''; PROG.prog.style.transform = ''; PROG = null;
}
function finishProgress(done) {
  if (!PROG) { done(); return; }
  const P = PROG; PROG = null; P.stop();
  const from = P.cur(); P.anim.cancel();
  P.prog.style.transform = 'scaleX(' + from + ')'; void P.prog.offsetWidth;
  P.prog.style.transition = 'transform .35s ease-out'; P.prog.style.transform = 'scaleX(1)';
  const t0 = performance.now();
  (function tick(t) {
    const k = Math.min(1, (t - t0) / 350);
    P.pct.textContent = Math.round((from + (1 - from) * k) * 100) + '%';
    if (k < 1) requestAnimationFrame(tick);
    else setTimeout(() => { P.prog.style.transition = ''; P.prog.style.transform = ''; done(); }, 220);
  })(t0);
}
// ── Register file audit: what was loaded, by whom (the log adds who/when), and whether it differs from last time ──
const REGKEY = 'slipdesk.register.v1';
function _fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function _fmtWhen(ms) { const d = new Date(ms); return d.getFullYear() + '-' + _p2(d.getMonth() + 1) + '-' + _p2(d.getDate()) + ' ' + _p2(d.getHours()) + ':' + _p2(d.getMinutes()); }
function _fnv(u8) { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8) + ('00000000' + u8.length.toString(16)).slice(-8); }
function _fingerprint(buf) {   // short content ID: identical files always give the same ID, any edit changes it
  const u8 = new Uint8Array(buf);
  if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', u8).then(h => Array.from(new Uint8Array(h)).slice(0, 8).map(x => ('0' + x.toString(16)).slice(-2)).join('')).catch(() => _fnv(u8));
  return Promise.resolve(_fnv(u8));
}
function recordRegisterLoad(buf, fname, meta, rows, sheet) {
  meta = meta || {};
  let paid = 0; rows.forEach(r => { if (_isPaidStatus(r[COL.PAY_STATUS])) paid++; });
  const cur = { name: fname, size: meta.size != null ? meta.size : buf.byteLength, mod: meta.mod || null, records: rows.length, paid: paid, sheet: sheet, source: meta.source || 'upload', at: Date.now() };
  _fingerprint(buf).then(id => {
    cur.id = id; REG_FP = cur; if (cur.source === 'restore') return;   // a refresh restore is not a new load, so it is not logged
    let prev = null; try { prev = JSON.parse(localStorage.getItem(REGKEY) || 'null'); } catch (e) {}
    const N = v => Number(v).toLocaleString();
    let type = 'file', status;
    const changes = () => {
      const c = [];
      if (prev.records !== cur.records) c.push(N(prev.records) + ' → ' + N(cur.records) + ' records');
      if (prev.paid !== cur.paid) c.push(N(prev.paid) + ' → ' + N(cur.paid) + ' confirmed');
      return c.join(', ') || 'contents differ';
    };
    if (!prev) status = 'First register on this station';
    else if (prev.id === id) status = prev.name === cur.name ? 'Same as last load, unchanged' : 'Same data as “' + prev.name + '”, renamed';
    else if (prev.name === cur.name) { type = 'filechg'; status = 'Updated since last load: ' + changes(); }
    else { type = 'filechg'; status = 'Different register from “' + prev.name + '”: ' + changes(); }
    try { localStorage.setItem(REGKEY, JSON.stringify(cur)); } catch (e) {}
    logEvent(type, '“' + fname + '” · ' + N(cur.records) + ' records (' + N(cur.paid) + ' confirmed)\n' + status);
  });
}
// ── Keep the loaded register across a page refresh (IndexedDB, this browser only) ──
const IDB_NAME = 'slipdesk', IDB_STORE = 'register';
function idbOpen() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function idbDo(mode, fn) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, mode), q = fn(t.objectStore(IDB_STORE));
    t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  }));
}
const idbSave = rec => idbDo('readwrite', st => st.put(rec, 'current')).catch(() => {});
const idbLoad = () => idbDo('readonly', st => st.get('current')).catch(() => null);
// Sign-out wipes the stored copy; a refresh or an idle lock keeps it
window.clearStoredRegister = () => { idbDo('readwrite', st => st.delete('current')).catch(() => {}); try { sessionStorage.removeItem('sd.schoolPick'); sessionStorage.removeItem('sd.schoolState'); } catch (e) {} };
// Disconnect the register from this desk (the footer's "This station" box): empties both slip pages, Analytics and Print,
// forgets the stored copy so a refresh does not bring it back, and records it in the activity log. The file itself is not touched.
function unloadRegister() {
  if (!ROWS) return;
  logEvent('fileoff', '“' + (REG_NAME || 'register') + '” · ' + ROWS.length.toLocaleString() + ' records cleared from this desk');
  ROWS = null; HDR = []; REG_NAME = ''; REG_FP = null; LOADED_AT = null; window.REG_STATS = null; window.SD_CURRENT = null;
  if (window.clearStoredRegister) window.clearStoredRegister();
  Object.keys(frames).forEach(k => {
    try {
      const w = frames[k].contentWindow, d = frames[k].contentDocument;
      if (typeof w.clearAll === 'function') w.clearAll();
      if (k === 'registration' || k === 'exam') {   // these two start with their search boxes locked until a register is loaded
        if (typeof w.setRows === 'function') w.setRows([]);
        const ids = k === 'registration' ? ['query', 'findBtn'] : ['slipQuery', 'checkBtn'];
        ids.forEach(id => { const el = d.getElementById(id); if (el) el.disabled = true; });
      } else if (typeof w.setRows === 'function') w.setRows();
    } catch (e) {}
  });
  if (window.closeRecPop) window.closeRecPop();
  setLoadState('empty');
  updateFooterStatus();
}
// Called by the sign-in code once someone is signed in (never before)
window.restoreRegister = () => {
  if (ROWS) return;
  idbLoad().then(rec => {
    if (rec && rec.buf && !ROWS) loadWorkbook(rec.buf, rec.name, { size: rec.size, mod: rec.mod, source: 'restore' });
  });
};
function loadWorkbook(buf, fname, meta) {
  try {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const name = wb.SheetNames.indexOf('Applications') > -1 ? 'Applications' : wb.SheetNames[0];
    const all = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    HDR = (all[0] || []).map(h => String(h == null ? '' : h).trim());
    ROWS = all.slice(1).filter(r => r.length > COL.PAY_REF && (r[COL.PAY_REF] || r[COL.EXAM_NUM]));
    REG_NAME = fname || name;
    recordRegisterLoad(buf, REG_NAME, meta, ROWS, name);
    if (!(meta && meta.source === 'restore')) idbSave({ buf: buf, name: REG_NAME, size: (meta && meta.size) || buf.byteLength, mod: (meta && meta.mod) || null });
    LOADED_AT = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    Object.keys(frames).forEach(push);
    updateFooterStatus();
    const info = { count: ROWS.length, sheet: name, at: LOADED_AT };
    finishProgress(() => setLoadState('loaded', info));
  } catch (err) { stopProgress(); setLoadState('error', { detail: err.message }); logEvent('fileerr', '“' + (fname || 'file') + '” could not be read: ' + (err && err.message ? err.message : 'unknown error')); }
}
// Automatic fetch of trial.xlsx next to this page; if it isn't there the button just stays pulsing
fetch('trial.xlsx', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); const lm = Date.parse(r.headers.get('Last-Modified') || ''); window._autoMod = isNaN(lm) ? null : lm; return r.arrayBuffer(); })
  .then(b => { startProgress(b.byteLength); return new Promise(r => setTimeout(r, 60)).then(() => loadWorkbook(b, 'trial.xlsx', { size: b.byteLength, mod: window._autoMod, source: 'auto' })); })
  .catch(() => { stopProgress(); if (!ROWS) setLoadState('empty'); });
function loadRegisterFile(f) {
  if (!f) return;
  REG_BUSY = f.name; updateFooterStatus();
  startProgress(f.size);
  const rd = new FileReader();
  rd.onload = ev => setTimeout(() => loadWorkbook(ev.target.result, f.name, { size: f.size, mod: f.lastModified, source: 'upload' }), 60);
  rd.onerror = () => { REG_BUSY = ''; updateFooterStatus(); stopProgress(); setLoadState('error'); logEvent('fileerr', '“' + f.name + '” could not be read from disk'); };
  rd.readAsArrayBuffer(f);
}
document.getElementById('xlsxFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  loadRegisterFile(f);
  e.target.value = '';
});
// Small read-only hook for the navbar upload panel (js/upload-panel.js); the panel adds pick() to it
window.sdUpload = { count: () => (ROWS && ROWS.length) || 0, busyName: () => REG_BUSY, canRead: () => typeof XLSX !== 'undefined', load: loadRegisterFile };


// ── Records breakdown dropdown ──
// Click the green Records pill to see what the loaded register holds. Loading a different file is inside the panel.
const _MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function _dobKey(v) {   // one comparable key per date of birth, whatever way it was typed (day first, like the register)
  if (v == null || v === '') return '';
  const p2 = n => ('0' + n).slice(-2);
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 1000 && v < 90000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const t = String(v).trim(); if (!t) return '';
  let m;
  if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  if ((m = t.match(/^(\d{1,2})[-\/.\s](\d{1,2})[-\/.\s](\d{4})/))) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  if ((m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?[-\/.\s,]+([A-Za-z]{3,})[-\/.\s,]+(\d{4})/)) && _MON[m[2].slice(0, 3).toLowerCase()]) return m[3] + '-' + p2(_MON[m[2].slice(0, 3).toLowerCase()]) + '-' + p2(m[1]);
  return t.toUpperCase().replace(/\s+/g, '');
}
function _nameToks(r) {   // every name part, any order, letters only: "ADE Bayo" and "Bayo Ade" give the same set
  return Array.from(new Set((String(r[COL.SURNAME] || '') + ' ' + String(r[COL.FIRSTNAME] || '') + ' ' + String(r[COL.OTHERNAME] || ''))
    .toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean))).sort();
}
function _sameName(a, b) {   // same tokens, or one is the other with a middle name left off (at least two parts shared)
  if (a.length > b.length) { const t = a; a = b; b = t; }
  if (a.length < 2) return false;
  for (let i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
  return true;
}
function computeRegStats(rows) {
  const st = { total: rows.length, confirmed: 0, pending: 0, other: 0, nostatus: 0, dupRows: 0, dupPeople: 0, paidTwice: 0, dupGroups: [], noDob: 0, noExam: 0, noPhoto: 0, noPhone: 0 };
  const byDob = Object.create(null), paidAt = new Array(rows.length);
  rows.forEach((r, i) => {
    const raw = String(r[COL.PAY_STATUS] == null ? '' : r[COL.PAY_STATUS]).trim().toUpperCase();
    paidAt[i] = false;
    if (!raw) st.nostatus++;
    else if (_isPaidStatus(raw)) { st.confirmed++; paidAt[i] = true; }
    else if (/PENDING|UNPAID|NOT /.test(raw)) st.pending++;
    else st.other++;
    if (!String(r[COL.EXAM_NUM] || '').trim()) st.noExam++;
    if (!String(r[COL.PHOTO_URL] || '').trim()) st.noPhoto++;
    if (!String(r[COL.PHONE] || '').replace(/\D/g, '')) st.noPhone++;
    const k = _dobKey(r[COL.DOB]);
    if (!k) { st.noDob++; return; }
    (byDob[k] = byDob[k] || []).push(i);
  });
  // Duplicate = same date of birth AND the same name. Only rows sharing a birth date are ever compared.
  Object.keys(byDob).forEach(k => {
    const ids = byDob[k]; if (ids.length < 2) return;
    const toks = ids.map(i => _nameToks(rows[i])), par = ids.map((_, j) => j);
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const big = ids.length > 300;   // a placeholder birth date shared by hundreds of rows: exact names only, to stay quick
    const seen = Object.create(null);
    for (let a = 0; a < ids.length; a++) {
      const key = toks[a].join(' ');
      if (key && seen[key] != null) par[find(a)] = find(seen[key]); else if (key) seen[key] = a;
      if (big) continue;
      for (let b = a + 1; b < ids.length; b++) if (find(a) !== find(b) && _sameName(toks[a], toks[b])) par[find(b)] = find(a);
    }
    const groups = Object.create(null);
    ids.forEach((i, j) => { const g = find(j); (groups[g] = groups[g] || []).push(i); });
    Object.keys(groups).forEach(g => {
      const idxs = groups[g]; if (idxs.length < 2) return;
      const r0 = rows[idxs[0]], proper = x => String(x || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      const nm = [proper(r0[COL.SURNAME]), proper(r0[COL.FIRSTNAME]), proper(r0[COL.OTHERNAME])].filter(Boolean).join(' ');
      const paidN = idxs.filter(i => paidAt[i]).length;
      st.dupRows += idxs.length - 1; st.dupPeople++; if (paidN > 1) st.paidTwice++;
      st.dupGroups.push({ idxs: idxs, name: nm, dob: k, paid: paidN, q: [proper(r0[COL.SURNAME]), proper(r0[COL.FIRSTNAME])].filter(Boolean).join(' ') });
    });
  });
  st.dupGroups.sort((x, y) => y.idxs.length - x.idxs.length || x.name.localeCompare(y.name));
  // Extra checks that need no matching birth date: same phone + same name, same payment ref + same phone, same payment ref on different rows
  const proper2 = x => String(x || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const phoneOf = r => { const d = String(r[COL.PHONE] == null ? '' : r[COL.PHONE]).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
  const refOf = r => String(r[COL.PAY_REF] == null ? '' : r[COL.PAY_REF]).trim().toUpperCase().replace(/\s+/g, '');
  const build = (keyFn, needName, labelFn) => {
    const out = { rows: 0, people: 0, groups: [] }, buckets = Object.create(null);
    rows.forEach((r, i) => { const k = keyFn(r); if (k) (buckets[k] = buckets[k] || []).push(i); });
    Object.keys(buckets).forEach(k => {
      const ids = buckets[k]; if (ids.length < 2) return;
      let parts = [ids];
      if (needName) {
        const toks = ids.map(i => _nameToks(rows[i])), par = ids.map((_, j) => j);
        const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
        for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
          const ka = toks[a].join(' '), kb = toks[b].join(' ');
          if (find(a) !== find(b) && ((ka && ka === kb) || _sameName(toks[a], toks[b]))) par[find(b)] = find(a);
        }
        const gs = Object.create(null); ids.forEach((i, j) => { const g = find(j); (gs[g] = gs[g] || []).push(i); });
        parts = Object.keys(gs).map(g => gs[g]);
      }
      parts.forEach(idxs => {
        if (idxs.length < 2) return;
        const r0 = rows[idxs[0]], paidN = idxs.filter(i => paidAt[i]).length;
        const nm = [proper2(r0[COL.SURNAME]), proper2(r0[COL.FIRSTNAME]), proper2(r0[COL.OTHERNAME])].filter(Boolean).join(' ');
        out.rows += idxs.length - 1; out.people++;
        out.groups.push({ idxs: idxs, name: nm || '(no name)', dob: labelFn(r0), paid: paidN, q: [proper2(r0[COL.SURNAME]), proper2(r0[COL.FIRSTNAME])].filter(Boolean).join(' ') });
      });
    });
    out.groups.sort((x, y) => y.idxs.length - x.idxs.length || x.name.localeCompare(y.name));
    return out;
  };
  st.dupBy = {
    phone: build(r => phoneOf(r), true, r => 'Phone 0' + phoneOf(r)),
    phonedob: build(r => { const p = phoneOf(r), d = _dobKey(r[COL.DOB]); return p && d ? p + '|' + d : ''; }, false, r => 'Phone 0' + phoneOf(r) + ' · ' + _dobKey(r[COL.DOB])),
    refphone: build(r => { const a = refOf(r), b = phoneOf(r); return a && b ? a + '|' + b : ''; }, false, r => 'Ref ' + refOf(r) + ' · 0' + phoneOf(r)),
    ref: build(r => refOf(r), false, r => 'Ref ' + refOf(r))
  };
  return st;
}
// Show every row of one duplicate person in the same name search the officers already use
function searchDuplicate(g) {
  try {
    const cur = document.querySelector('.tab.active') ? document.querySelector('.tab.active').dataset.page : 'registration';
    const onSlip = cur === 'registration' || cur === 'exam';
    if (!onSlip) show(LASTTAB || 'registration');   // from the log or Analysis page, go back to a slip page first
    const page = onSlip ? cur : (LASTTAB || 'registration');
    const fr = frames[page], doc = fr.contentDocument, inp = doc.getElementById(page === 'exam' ? 'slipQuery' : 'query');
    if (!inp || inp.disabled) return;
    inp.value = g.q; fr.contentWindow.focus(); inp.focus();
    inp.dispatchEvent(new fr.contentWindow.Event('input', { bubbles: true }));
  } catch (e) {}
}
const recPop = document.getElementById('recPop');
let _sc = { rows: null, s: null };   // the breakdown is worked out once per loaded register
const _statsOf = rows => (_sc.rows === rows ? _sc.s : (_sc = { rows: rows, s: computeRegStats(rows) }).s);
// How many register rows belong to the same person (same name + birth date), and how many of them are confirmed: feeds the donut in the search panels
window.dupInfo = idx => { try { if (!ROWS) return null; const s = _statsOf(ROWS); if (!s._dm) { s._dm = Object.create(null); s.dupGroups.forEach(g => g.idxs.forEach(i => { s._dm[i] = g; })); } const g = s._dm[idx]; return g ? { n: g.idxs.length, paid: g.paid } : { n: 1 }; } catch (e) { return null; } };
function renderRecPop() { renderBreakdown(document); }
function renderBreakdown(doc) {   // doc = the dropdown's page (this one) or the Analysis page
  if (!ROWS) return;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const s = window.REG_STATS = _statsOf(ROWS), N = v => Number(v).toLocaleString();
  // Duplicates table: People = how many people it concerns, Records = every row those people hold in the register
  const inPop = doc === document;   // the dropdown: its status rows open a summary; on the Analysis page they jump to Records instead
  const rowsOf = gs => gs.reduce((a, g) => a + g.idxs.length, 0);
  const paidG = s.dupGroups.filter(g => g.paid > 1);
  // Total: everyone in any duplicate group, each person and each record counted once
  const par = new Map(), find = x => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  [s.dupGroups, s.dupBy.phone.groups, s.dupBy.phonedob.groups].forEach(gs => gs.forEach(g => g.idxs.forEach(i => { const ra = find(g.idxs[0]), rb = find(i); if (ra !== rb) par.set(rb, ra); })));
  const dupRecords = par.size, dupRoots = new Set(); par.forEach((_, k) => dupRoots.add(find(k)));
  const dupPeopleAll = dupRoots.size;
  const pct = v => s.total ? (v / s.total * 100).toFixed(v / s.total < 0.1 ? 1 : 0).replace(/\.0$/, '') + '%' : '0%';
  const row = (color, label, mean, n, warn, seg, dupKind, tip, stKind) => { const btn = !!(dupKind || stKind) && n > 0; return '<' + (btn ? 'button type="button" aria-expanded="false" ' + (dupKind ? 'data-dup="' + dupKind + '"' : 'data-st="' + stKind + '"') : 'div') + ' class="rp-tr' + (btn ? ' rp-rowbtn' : '') + (n === 0 ? ' zero' : (warn ? ' warn' : '')) + '"' + (seg != null ? ' data-seg="' + seg + '"' : '') + ' title="' + esc(tip || mean) + (btn ? ' (click to list)' : '') + '"><i class="dot" style="background:' + color + '"></i><span class="lbl">' + label + '</span><span class="n">' + N(n) + '</span><span class="pc">' + pct(n) + '</span></' + (btn ? 'button' : 'div') + '>'; };
  const drow = (label, mean, people, n, dupKind) => { const btn = n > 0; return '<' + (btn ? 'button type="button" aria-expanded="false" data-dup="' + dupKind + '"' : 'div') + ' class="rp-tr' + (btn ? ' rp-rowbtn' : '') + (n === 0 ? ' zero' : ' warn') + '" title="' + esc(mean) + (btn ? ' (click to list)' : '') + '"><i class="dot" style="background:#6d1f2e"></i><span class="lbl">' + label + '</span><span class="n pp">' + N(people) + '</span><span class="n">' + N(n) + '</span><span class="pc">' + pct(n) + '</span></' + (btn ? 'button' : 'div') + '>'; };
  const segs = [
    { c: '#2fa355', n: s.confirmed, name: 'Confirmed' },
    { c: '#d9a227', n: s.pending, name: 'Pending' },
    { c: '#d9534f', n: s.other, name: 'Flagged / Failed' },
    { c: '#9c8a8e', n: s.nostatus, name: 'No status' }
  ];
  segs.forEach(g => g.pct = pct(g.n));
  window._rpSegs = segs; window._rpTotal = N(s.total);
  // donut: one ring segment per payment status, a hair of gap between neighbours
  const R = 80, C = 2 * Math.PI * R, live = segs.filter(g => g.n).length;
  let acc = 0;
  const arcs = segs.map((g, i) => {
    if (!g.n || !s.total) return '';
    const len = g.n / s.total * C, gap = (live > 1 && len > 4) ? 2 : 0, d = Math.max(len - gap, 0.6);
    const out = '<circle class="rp-seg" data-seg="' + i + '" cx="100" cy="100" r="' + R + '" fill="none" stroke="' + g.c + '" stroke-width="24" stroke-dasharray="0 ' + C.toFixed(2) + '" data-d="' + d.toFixed(2) + ' ' + (C - d).toFixed(2) + '" stroke-dashoffset="' + (-(acc + gap / 2)).toFixed(2) + '"/>';
    acc += len; return out;
  }).join('');
  const donut = '<div class="rp-donut" id="rpDonut"><svg viewBox="0 0 200 200" role="img" aria-label="Payment status of ' + N(s.total) + ' records"><g transform="rotate(-90 100 100)"><circle class="rp-track" cx="100" cy="100" r="' + R + '" fill="none" stroke-width="24"/>' + arcs + '</g></svg>' +
    '<div class="rp-dc"><b id="rpDcN">' + N(s.total) + '</b><span id="rpDcL">candidate records</span></div></div>';
  doc.getElementById('rpSub').textContent = (REG_NAME || '') + (LOADED_AT ? ' · loaded ' + LOADED_AT : '');
  doc.getElementById('rpBody').innerHTML =
    '<div class="rp-top">' +
      '<div class="rp-c-donut">' + donut + '</div>' +
      '<div class="rp-tbl rp-status-tbl">' +
        '<div class="rp-th"><span></span><span>Payment status</span><span class="r">Records</span><span class="r">Share</span></div>' +
        row('#2fa355', 'Confirmed', 'Exam slip opens', s.confirmed, false, 0, null, null, inPop ? 's:confirmed' : null) +
        row('#d9a227', 'Pending', 'Registration Slip Only', s.pending, false, 1, null, null, inPop ? 's:pending' : null) +
        row('#d9534f', 'Flagged', 'Mismatch or Cancelled', s.other, true, 2, null, 'Mismatch, cancelled, rejected or failed', inPop ? 's:flagged' : null) +
        row('#9c8a8e', 'No status', 'Status is blank', s.nostatus, true, 3, null, 'Payment status is blank', inPop ? 's:none' : null) +
        '<div class="rp-tr rp-total" title="All Candidate Records"><span></span><span class="lbl">Total</span><span class="n">' + N(s.total) + '</span><span class="pc">100%</span></div>' +
      '</div>' +
    '<div class="rp-tbl rp-dup-tbl">' +
      '<div class="rp-th"><span></span><span>Duplicates</span><span class="r">People</span><span class="r">Records</span><span class="r">Share</span></div>' +
      drow('Same Name &amp; DOB', N(s.dupPeople) + ' people registered more than once, ' + N(rowsOf(s.dupGroups)) + ' records between them', s.dupPeople, rowsOf(s.dupGroups), 'all') +
      drow('Same Phone &amp; Name', N(s.dupBy.phone.people) + ' people share a phone number and a name, ' + N(rowsOf(s.dupBy.phone.groups)) + ' records between them', s.dupBy.phone.people, rowsOf(s.dupBy.phone.groups), 'phone') +
      drow('Same Phone &amp; DOB', N(s.dupBy.phonedob.people) + ' people share a phone number and a date of birth, even if the name is spelled differently, ' + N(rowsOf(s.dupBy.phonedob.groups)) + ' records between them', s.dupBy.phonedob.people, rowsOf(s.dupBy.phonedob.groups), 'phonedob') +
      drow('Confirmed Twice', N(s.paidTwice) + ' people have payment confirmed on more than one row, ' + N(rowsOf(paidG)) + ' records between them', s.paidTwice, rowsOf(paidG), 'paid') +
      '<div class="rp-tr rp-total" title="Everyone in any duplicate group, each person and record counted once"><span></span><span class="lbl">Total</span><span class="n pp">' + N(dupPeopleAll) + '</span><span class="n">' + N(dupRecords) + '</span><span class="pc">' + pct(dupRecords) + '</span></div>' +
    '</div>' +
    '</div>' +
    '<div class="rp-dups" id="rpDups" hidden></div>';
  // fills the list under the panel for one of the two duplicate rows ('all' = everyone registered more than once, 'paid' = confirmed on more than one row)
  window._rpDupList = kind => {
    const src = s.dupBy[kind] ? s.dupBy[kind].groups : s.dupGroups, items = []; src.forEach((g, k) => { if (kind !== 'paid' || g.paid > 1) items.push([g, k]); });
    const heads = { paid: 'Confirmed on more than one row', phone: 'Same phone number and name', phonedob: 'Same phone number and date of birth', refphone: 'Same payment ref and phone', ref: 'Same payment ref on several rows' };
    // the groups are summarised here by size; every person and every row is listed on the Analysis page
    const size = x => kind === 'paid' ? x[0].paid : x[0].idxs.length, unit = kind === 'paid' ? 'confirmed' : 'rows';
    const bands = [['2', 2, 2], ['3', 3, 3], ['4–5', 4, 5], ['6+', 6, 1e9]].map(b => ({ l: b[0], n: items.filter(x => size(x) >= b[1] && size(x) <= b[2]).length }));
    const mx = Math.max.apply(null, [1].concat(bands.map(b => b.n)));
    const strip = '<div class="rp-dsz">' + bands.map(b => '<div class="rp-dsz-i' + (b.n ? '' : ' zero') + '"><span class="l">' + b.l + ' ' + unit + '</span><b>' + N(b.n) + '</b><i style="width:' + Math.round(b.n / mx * 100) + '%"></i></div>').join('') + '</div>';
    const top = items.slice().sort((a, b) => size(b) - size(a)).slice(0, 6);
    const who = items.length === 1 ? 'person' : 'people';
    return '<div class="rp-more rp-dhead">' + (heads[kind] || 'Registered more than once') + ' · ' + N(items.length) + ' ' + who + ' · ' + N(rowsOf(items.map(x => x[0]))) + ' records</div>' + strip +
      '<div class="rp-more rp-dsub">Biggest groups</div>' +
      top.map(x => '<button type="button" class="rp-dup" data-k="' + x[1] + '"><span class="dn">' + esc(x[0].name) + '</span><span class="ds">' + esc(x[0].dob) + ' · ' + x[0].idxs.length + ' rows' + (x[0].paid > 1 ? ' · ' + x[0].paid + ' confirmed' : '') + '</span></button>').join('') +
      '<div class="rp-more">Click a name to look it up in the search bar.</div>' +
      '<div class="rp-gowrap"><button type="button" class="rp-goan" data-act="analysis" data-kind="' + kind + '">See all ' + N(items.length) + ' ' + who + ' in Analysis &rsaquo;</button><span>Every row of each group, with filters and a download.</span></div>';
  };
  // the summary a payment-status row opens in the dropdown: what is missing among those candidates, how the status is worded, and a jump to the full list
  window._rpStatusList = kind => {
    const key = kind.slice(2), names = { confirmed: 'Confirmed', pending: 'Pending', flagged: 'Flagged', none: 'No status' };
    let n = 0, phone = 0, noPhone = 0, noExam = 0, noPhoto = 0, dup = 0; const words = Object.create(null);
    ROWS.forEach((r, i) => {
      if (_statusKey(r) !== key) return;
      n++;
      const d = String(r[COL.PHONE] == null ? '' : r[COL.PHONE]).replace(/\D/g, '');
      if (d.length >= 10) phone++; if (!d) noPhone++;
      if (!String(r[COL.EXAM_NUM] || '').trim()) noExam++;
      if (!String(r[COL.PHOTO_URL] || '').trim()) noPhoto++;
      if (par.has(i)) dup++;
      const w = String(r[COL.PAY_STATUS] == null ? '' : r[COL.PAY_STATUS]).trim().toUpperCase() || '(blank)'; words[w] = (words[w] || 0) + 1;
    });
    const cells = key === 'confirmed'
      ? [['No exam number', noExam], ['No photo', noPhoto], ['No phone number', noPhone], ['In a duplicate group', dup]]
      : [['With a phone number', phone], ['No phone number', noPhone], ['No photo', noPhoto], ['In a duplicate group', dup]];
    const strip = '<div class="rp-dsz">' + cells.map(c => '<div class="rp-dsz-i' + (c[1] ? '' : ' zero') + '"><span class="l">' + c[0] + '</span><b>' + N(c[1]) + '</b><i style="width:' + (n ? Math.round(c[1] / n * 100) : 0) + '%"></i></div>').join('') + '</div>';
    const list = Object.keys(words).sort((x, y) => words[y] - words[x]).slice(0, 6);
    const wording = key === 'none' ? '' : '<div class="rp-more rp-dsub">How the status is written in the register</div>' +
      list.map(w => '<div class="rp-sw"><span class="dn">' + esc(w) + '</span><span class="ds">' + N(words[w]) + ' · ' + (n ? (words[w] / n * 100).toFixed(words[w] / n < 0.1 ? 1 : 0).replace(/\.0$/, '') : 0) + '%</span></div>').join('');
    return '<div class="rp-more rp-dhead">' + names[key] + ' · ' + N(n) + ' records</div>' + strip + wording +
      '<div class="rp-gowrap"><button type="button" class="rp-goan" data-act="analysis" data-kind="' + kind + '">See all ' + N(n) + ' in Analysis &rsaquo;</button><span>Search, filter and download the list there.</span></div>';
  };
  // grow the ring in
  const arcEls = doc.querySelectorAll('#rpDonut .rp-seg');
  requestAnimationFrame(() => requestAnimationFrame(() => arcEls.forEach(el => el.setAttribute('stroke-dasharray', el.dataset.d))));
}
// Hover / click behaviour of the breakdown (ring, status rows, duplicate lists). root = the element holding it, doc = its page.
function attachBreakdown(root, doc, afterPick) {
  // Hover a payment-status row or a ring segment: the others fade and the middle shows that figure
  function hot(i) {
    const d = doc.getElementById('rpDonut'); if (!d || !window._rpSegs) return;
    const g = i == null ? null : window._rpSegs[i];
    d.classList.toggle('hov', !!g);
    d.querySelectorAll('.rp-seg').forEach(el => el.classList.toggle('on', g && +el.dataset.seg === i));
    doc.getElementById('rpDcN').textContent = g ? Number(g.n).toLocaleString() : window._rpTotal;
    doc.getElementById('rpDcL').textContent = g ? g.name + ' · ' + g.pct : 'Candidate Records';
  }
  root.addEventListener('mouseover', e => { const t = e.target.closest ? e.target.closest('[data-seg]') : null; hot(t ? +t.dataset.seg : null); });
  root.addEventListener('mouseleave', () => hot(null));
  root.addEventListener('click', e => {
    e.stopPropagation();
    const t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.dataset.act === 'analysis') {   // the dropdown only summarises; the full list lives on the Analysis page
      const f = t.dataset.kind.slice(0, 2) === 's:' ? t.dataset.kind : { all: 'f:dup', phone: 'f:phone', phonedob: 'f:phonedob', refphone: 'f:refphone', ref: 'f:ref', paid: 'f:paid2' }[t.dataset.kind] || 'f:dup';
      if (afterPick) afterPick();
      show('analysis');
      try { frames.analysis.contentWindow.goFocus(f); } catch (e) {}
      return;
    }
    if (t.dataset.dup || t.dataset.st) {
      const kind = t.dataset.dup || t.dataset.st, l = doc.getElementById('rpDups'); if (!l || !window._rpDupList) return;
      const same = !l.hidden && l.dataset.kind === kind;
      root.querySelectorAll('[data-dup],[data-st]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); });
      if (same) { l.hidden = true; return; }
      l.innerHTML = t.dataset.st ? window._rpStatusList(kind) : window._rpDupList(kind); l.dataset.kind = kind; l.scrollTop = 0; l.hidden = false;
      t.classList.add('on'); t.setAttribute('aria-expanded', 'true'); return;
    }
    if (t.classList.contains('rp-dup') && window.REG_STATS) { const dl = doc.getElementById('rpDups'), kd = dl && dl.dataset.kind, arr = (kd && window.REG_STATS.dupBy[kd]) ? window.REG_STATS.dupBy[kd].groups : window.REG_STATS.dupGroups, g = arr[+t.dataset.k]; if (g) { if (afterPick) afterPick(); searchDuplicate(g); } }
  });
}
// Payment status of one register row, in the same four groups the breakdown counts
function _statusKey(r) {
  const raw = String(r[COL.PAY_STATUS] == null ? '' : r[COL.PAY_STATUS]).trim().toUpperCase();
  return !raw ? 'none' : _isPaidStatus(raw) ? 'confirmed' : /PENDING|UNPAID|NOT /.test(raw) ? 'pending' : 'flagged';
}
window.sdAnalysis = {
  render: renderBreakdown, attach: attachBreakdown, hasRows: () => !!ROWS, load: f => loadRegisterFile(f),
  // Everything the Analysis page needs to list and group records (read only)
  data: () => ROWS ? { rows: ROWS, hdr: HDR, stats: _statsOf(ROWS), COL: COL, statusKey: _statusKey, nameOf: _nameOf, dobKey: _dobKey, fileName: REG_NAME } : null,
  lookup: q => searchDuplicate({ q: q }),
  // Open one register row straight on the slip that is ready: confirmed -> Exam Slip, otherwise Registration Slip
  open: (idx, q) => routeTo(idx, q),
  logPrintList: (n, c, what) => logEvent('print', 'Attendance list · ' + Number(n).toLocaleString() + (n === 1 ? ' confirmed candidate' : ' confirmed candidates') + ' · ' + what),
  logDownload: (n, what) => logEvent('recdl', 'Downloaded ' + Number(n).toLocaleString() + (n === 1 ? ' record' : ' records') + ' from Analysis as Excel · ' + what)
};
(function () {
  const btn = document.getElementById('loadBtn'), pop = recPop;
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  window.closeRecPop = close;
  btn.addEventListener('click', e => {
    // "Load a different register" (a label inside the panel) clicks the file input, and that click bubbles up through this button.
    // Cancelling it here is what stopped the file picker from opening, so let clicks that come from the input itself through.
    if (e.target === document.getElementById('xlsxFile')) return;
    if (btn.dataset.state !== 'loaded') return;   // empty / error: the button still opens the file picker
    if (frames.analysis.classList.contains('active')) { e.preventDefault(); e.stopPropagation(); return; }   // Analysis page: no dropdown
    e.preventDefault(); e.stopPropagation();
    if (!pop.hidden) { close(); return; }
    if (window.closeLogPop) window.closeLogPop();   // only one navbar dropdown open at a time
    if (window.closeAnPop) window.closeAnPop();
    if (window.closeUpPop) window.closeUpPop();
    renderRecPop();
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    place();
  });
  // Centre the panel under the pill; if that would run off screen, slide it back in and keep the pointer on the pill
  function place() {
    const b = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = pop.offsetWidth, m = 12;
    const parent = (pop.offsetParent || document.querySelector('nav')).getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const left = Math.max(m, Math.min(cx - w / 2, vw - m - w));
    pop.style.right = 'auto';
    pop.style.left = (left - parent.left) + 'px';
    pop.style.setProperty('--ax', Math.max(24, Math.min(w - 24, cx - left)) + 'px');
    if (window.matchMedia('(max-width:860px)').matches) {
      const nav = document.querySelector('nav').getBoundingClientRect();
      pop.style.top = (b.bottom - nav.top + 14) + 'px';
    } else pop.style.top = '';
  }
  attachBreakdown(pop, document, close);
  document.getElementById('rpLoad').addEventListener('click', () => setTimeout(close, 0));
  window.addEventListener('resize', close);
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  Object.keys(frames).forEach(k => frames[k].addEventListener('load', () => { try { frames[k].contentDocument.addEventListener('click', close); } catch (e) {} }));
})();

// ── Analytics tab: dropdown with quick links to every analytics page ──
(function () {
  const btn = document.getElementById('anBtn'), pop = document.getElementById('anPop');
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  window.closeAnPop = close;
  const TARGETS = { analysis: ['analysis', 'tabAn'], revenue: ['analysis', 'tabRv'], breakdown: ['print', 'tabP1'], attendance: ['print', 'tabP2'], others: ['print', 'tabP3'] };
  const tabOn = (page, id) => { try { const el = frames[page].contentDocument.getElementById(id); return !!(el && el.classList.contains('on')); } catch (e) { return false; } };
  function current() {   // which link matches the page that is open now
    if (frames.analysis.classList.contains('active')) return tabOn('analysis', 'tabRv') ? 'revenue' : 'analysis';
    if (frames.attendance.classList.contains('active') || frames.school.classList.contains('active')) return 'attendance';
    if (frames.print.classList.contains('active')) return tabOn('print', 'tabP2') ? 'attendance' : tabOn('print', 'tabP3') ? 'others' : 'breakdown';
    return '';
  }
  function go(k) {
    const t = TARGETS[k]; if (!t) return;
    show(t[0]);
    try { frames[t[0]].contentDocument.getElementById(t[1]).click(); } catch (e) {}
    try { frames[t[0]].contentWindow.scrollTo(0, 0); } catch (e) {}
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (!pop.hidden) { close(); return; }
    if (window.closeLogPop) window.closeLogPop();   // only one navbar dropdown open at a time
    if (window.closeRecPop) window.closeRecPop();
    if (window.closeUpPop) window.closeUpPop();
    const cur = current();
    pop.querySelectorAll('[data-an]').forEach(b => { b.classList.toggle('on', b.dataset.an === cur); });
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    const nav = document.querySelector('nav').getBoundingClientRect(), bar = document.querySelector('.tabs').getBoundingClientRect(), b = btn.getBoundingClientRect();
    const half = pop.offsetWidth / 2;
    const cx = Math.max(half + 12, Math.min(b.left + b.width / 2, window.innerWidth - half - 12));
    pop.style.left = (cx - nav.left) + 'px';
    pop.style.top = (bar.bottom - nav.top + 12) + 'px';
    const pr = pop.getBoundingClientRect();
    pop.style.setProperty('--ax', Math.max(24, Math.min(pr.width - 24, b.left + b.width / 2 - pr.left)) + 'px');
    const first = pop.querySelector('.on') || pop.querySelector('[data-an]'); if (first) first.focus();
  });
  window.sdOpenSchool = pick => { window.sdSchoolPick = pick; try { sessionStorage.setItem('sd.schoolPick', JSON.stringify(pick)); sessionStorage.removeItem('sd.schoolState'); } catch (e) {} show('school'); };   // a school row on Attendances opens that school's own page
  window.sdBackToSchools = () => { window.sdSchoolPick = null; try { sessionStorage.removeItem('sd.schoolPick'); sessionStorage.removeItem('sd.schoolState'); } catch (e) {} show('print'); try { frames.print.contentWindow.sdBackFromSchool(); } catch (e) {} };   // ...and its Back button returns to the list of schools, zone still chosen
  window.sdSchoolInfo = k => { try { return frames.print.contentWindow.sdSchoolInfo(k); } catch (e) { return null; } };   // the school page reads a centre's figures through the shell
  window.sdSchoolSubjects = (k, st, d) => { try { return frames.print.contentWindow.sdSchoolSubjects(k, st, d); } catch (e) { return null; } };   // the papers of a centre, for the school page's subject list
  window.sdSchoolCounts = (k, c, s) => { try { return frames.print.contentWindow.sdSchoolCounts(k, c, s); } catch (e) { return null; } };   // Officers and Sub-Officers for the staff category and paper chosen on the school page
  window.sdSchoolSheet = (k, c, d, s, g) => { try { return frames.print.contentWindow.sdSchoolSheet(k, c, d, s, g); } catch (e) { return null; } };   // the attendance sheet the school page previews
  window.sdSchoolDownload = (t, done) => { try { return frames.print.contentWindow.sdSchoolDownload(t, done); } catch (e) { if (done) done(); return false; } };   // ...and downloads as PDF or Excel
  window.sdOpenOverall = () => show('attendance');   // the last card on Attendances opens the Overall attendance page; the register stays loaded
  window.sdGoAn = go;   // the tab strip inside the Analysis and Print pages calls this to hop to a tab on the other page
  pop.addEventListener('click', e => { const b = e.target.closest('[data-an]'); if (!b) return; close(); go(b.dataset.an); });
  pop.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...pop.querySelectorAll('[data-an]')], i = items.indexOf(document.activeElement);
    e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  });
  window.addEventListener('resize', close);
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { close(); btn.focus(); } });
  Object.keys(frames).forEach(k => frames[k].addEventListener('load', () => { try { frames[k].contentDocument.addEventListener('click', close); } catch (e) {} }));
})();

addFooter('profile', true); updateFooterStatus();   // the Profile page has its own footer in this document (shown only while Profile is open, see css/11-profile.css)
show(location.hash.slice(1));

// ── Tab switcher: slide the active pill like a drop of water (stretches, then settles) ──
(function () {
  const tabs = document.querySelector('.tabs'); if (!tabs) return;
  const drop = document.createElement('span'); drop.className = 'tab-drop'; drop.setAttribute('aria-hidden', 'true');
  tabs.prepend(drop);
  let cur = null, anim = null, shown = false;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  const put = g => { drop.style.top = g.y + 'px'; drop.style.height = g.h + 'px'; drop.style.width = g.w + 'px'; drop.style.transform = 'translateX(' + g.x + 'px)'; };
  window.moveTabDrop = function (animate) {
    const t = tabs.querySelector('.tab.active');
    if (!t) { drop.style.opacity = '0'; shown = false; return; }   // on the Activity log page no tab is selected
    const g = { x: t.offsetLeft, w: t.offsetWidth, y: t.offsetTop, h: t.offsetHeight };
    if (anim) { anim.cancel(); anim = null; }
    const from = cur;
    put(g); cur = g;
    if (!shown) { drop.style.opacity = '1'; shown = true; return; }
    if (!animate || !from || reduced() || (from.x === g.x && from.w === g.w)) return;
    const x0 = Math.min(from.x, g.x), x1 = Math.max(from.x + from.w, g.x + g.w);
    const dur = 560;
    anim = drop.animate([
      { transform: 'translateX(' + from.x + 'px)', width: from.w + 'px', offset: 0 },
      { transform: 'translateX(' + x0 + 'px)', width: (x1 - x0) + 'px', offset: .42, easing: 'cubic-bezier(.25,1,.35,1)' },
      { transform: 'translateX(' + g.x + 'px)', width: g.w + 'px', offset: 1 }
    ], { duration: dur, easing: 'cubic-bezier(.45,0,.2,1)' });
    anim.onfinish = anim.oncancel = () => { anim = null; };
  };
  moveTabDrop(false);
  if (window.ResizeObserver) new ResizeObserver(() => { if (!anim) { const t = tabs.querySelector('.tab.active'); if (t) { shown = true; put(cur = { x: t.offsetLeft, w: t.offsetWidth, y: t.offsetTop, h: t.offsetHeight }); } } }).observe(tabs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveTabDrop(false));
})();

// ── / , Ctrl+K or Ctrl+Space: jump to the search box of the page you are on.  Ctrl+Shift+L: lock the desk back to the sign-in gate ──
(function () {
  function target() {
    const gate = document.getElementById('gate');
    if (gate && gate.classList.contains('on')) return null;
    if (frames.log.classList.contains('active')) { try { return frames.log.contentDocument.getElementById('lgQ'); } catch (e) { return null; } }
    if (frames.analysis.classList.contains('active') || frames.legal.classList.contains('active')) return null;
    const f = LASTTAB === 'exam' ? frames.exam : frames.registration;
    try { return f.contentDocument.getElementById(LASTTAB === 'exam' ? 'slipQuery' : 'query'); } catch (e) { return null; }
  }
  function onKey(e) {
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.key || '').toLowerCase() === 'l') {   // Ctrl+Shift+L: lock now (works from inside any page, and is ignored on the gate itself)
      const gt = document.getElementById('gate');
      if (gt && gt.classList.contains('on')) return;
      e.preventDefault(); e.stopPropagation();
      try { if (window.sdQuickLock) window.sdQuickLock(); } catch (x) {}
      return;
    }
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey, tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
    const hit = (ctrl && (e.code === 'Space' || e.key === ' ' || (e.key || '').toLowerCase() === 'k')) || (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !typing);   // Ctrl+Space, Ctrl+K, or / (when you are not already typing in a box)
    if (!hit) return;
    const el = target();
    if (!el || el.disabled) return;
    e.preventDefault();
    try { el.ownerDocument.defaultView.focus(); } catch (x) {}
    el.focus({ preventScroll: false });
    try { el.select(); } catch (x) {}
    try { const w = el.ownerDocument.defaultView; if (el.getBoundingClientRect().top < 0) w.scrollTo(0, 0); } catch (x) {}
  }
  document.addEventListener('keydown', onKey, true);
  function hook(fr) {
    const attach = () => { try { fr.contentDocument.addEventListener('keydown', onKey, true); } catch (e) {} };
    fr.addEventListener('load', attach); attach();
  }
  Object.keys(frames).forEach(k => hook(frames[k]));
})();

