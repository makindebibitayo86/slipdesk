/* PROFILE PAGE + ACCOUNT MENU. The account pill in the navbar opens a small menu (Profile / Sign out). The Profile page lets the signed-in person
   edit their own name, job title, phone, email and photo, and change their password. Everything stays on this computer: the details are kept in
   localStorage (slipdesk.profile.v1) and the password in slipdesk.pw.v1. Storage and the password check live in js/gate.js (window.sdProfile,
   window.sdChangePassword); this file is only the screen. Styles: css/11-profile.css. Loaded after gate.js and before sync.js. */
(function () {
  var P = window.sdProfile, $ = function (i) { return document.getElementById(i); };
  var page = $('profilePage'), so = $('signOutBtn'), tabs = document.querySelector('.tabs');
  if (!P || !page || !so || !tabs) return;
  var overlay = $('pfOverlay'), sheet = $('pfSheet'), dock = $('pfDock');
  var HINT = 'Your name appears on your pass and in the activity log.';
  var user = null, saved = null, draft = null, prevTab = null, avKey = '', lastFocus = null;

  /* ---------- click-away: any click outside an open menu closes it (shared helper; defined here if no other file has already) ---------- */
  var CA = window.ClickAway || (window.ClickAway = (function () {
    var uis = [];
    document.addEventListener('pointerdown', function (e) {
      uis.forEach(function (u) {
        try { var els = typeof u.els === 'function' ? u.els() : u.els; if (u.isOpen() && !els.some(function (el) { return el && el.contains(e.target); })) u.close(); } catch (_) {}
      });
    }, true);
    return { register: function (u) { uis.push(u); } };
  })());

  /* ---------- helpers ---------- */
  function role() { return user && user.admin ? 'Administrator' : 'Staff'; }
  function initials(n) { var w = n.trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
  function avatar(photo, name, px, fs) {
    var d = document.createElement('span'); d.className = 'av';
    if (px) { d.style.width = d.style.height = px + 'px'; d.style.fontSize = fs + 'px'; }
    if (photo) { var im = new Image(); im.alt = ''; im.src = photo; d.appendChild(im); }
    else { d.style.background = '#6d1f2e'; d.textContent = initials(name || ''); }
    return d;
  }
  function put(id, node) { var b = $(id); b.textContent = ''; b.appendChild(node); }
  function toast(t, bad) {
    var o = document.querySelector('.pf-toast'); if (o) o.remove();
    var e = document.createElement('div'); e.className = 'pf-toast' + (bad ? ' bad' : ''); e.setAttribute('role', 'status'); e.textContent = t;
    document.body.appendChild(e); setTimeout(function () { e.remove(); }, 2600);
  }
  function firstName(n) { return n.trim().split(/\s+/)[0] || 'User'; }
  function copy(o) { return Object.assign({}, o); }

  /* ---------- validation ---------- */
  function check() {
    var e = {};
    if (draft.name.trim().length < 2) e.name = 'Enter your full name.';
    if (draft.phone && !/^[0-9+()\-\s]{7,20}$/.test(draft.phone)) e.phone = 'Phone: use digits, spaces, + or - only.';
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) e.email = 'That email address doesn’t look right.';
    return e;
  }
  function invalid(e) { return !!(e.name || e.phone || e.email); }
  function dirty() { return !!draft && JSON.stringify(draft) !== JSON.stringify(saved); }

  /* ---------- render (everything on the page follows the draft as you type) ---------- */
  function render() {
    var e = check(), d = dirty(), name = draft.name.trim() || 'Your name', title = draft.title.trim() || role();
    $('pfShowName').textContent = name; $('pfShowTitle').textContent = title;
    $('pfDrop').disabled = !draft.photo;
    $('pfRn').classList.toggle('bad', !!e.name); $('pfRp').classList.toggle('bad', !!e.phone); $('pfRe').classList.toggle('bad', !!e.email);
    var msg = e.name || e.phone || e.email, f = $('pfF1'); f.textContent = msg || HINT; f.className = 'pf-gf' + (msg ? ' err' : '');
    $('pfPName').textContent = name; $('pfPTitle').textContent = title;
    $('pfPPhone').textContent = draft.phone.trim() || '—'; $('pfPMail').textContent = draft.email.trim() || '—';
    $('pfPPhone').classList.toggle('nil', !draft.phone.trim()); $('pfPMail').classList.toggle('nil', !draft.email.trim());
    $('pfNName').textContent = firstName(name); $('pfNWho').textContent = title;
    Array.prototype.forEach.call(document.querySelectorAll('.pfLn'), function (n) { n.textContent = name; });
    var k = draft.photo + '|' + initials(name);                       /* repaint the pictures only when they actually change */
    if (k !== avKey) {
      avKey = k;
      put('pfPhoto', avatar(draft.photo, name)); put('pfPAv', avatar(draft.photo, name)); put('pfNAv', avatar(draft.photo, name, 32, 13));
      put('pfL1a', avatar(draft.photo, name, 28, 10.5)); put('pfL2a', avatar(draft.photo, name, 28, 10.5));
    }
    var st = $('pfState'); st.classList.toggle('dirty', d); st.lastChild.textContent = d ? 'Unsaved changes' : 'Saved on this computer';
    var dm = $('pfDockMsg'); dm.textContent = invalid(e) ? 'Fix the highlighted fields' : 'Unsaved changes'; dm.classList.toggle('err', invalid(e));
    $('pfSave').disabled = invalid(e);
    dock.classList.toggle('on', d && !page.hidden);
  }
  function fillFields() { $('pfName').value = draft.name; $('pfJob').value = draft.title; $('pfPhone').value = draft.phone; $('pfMail').value = draft.email; }

  [['pfName', 'name'], ['pfJob', 'title'], ['pfPhone', 'phone'], ['pfMail', 'email']].forEach(function (x) {
    var el = $(x[0]);
    el.addEventListener('input', function () { draft[x[1]] = this.value; render(); });
    el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); if (dirty()) doSave(); } });
  });

  /* ---------- save / discard ---------- */
  function doSave() {
    if (!draft || invalid(check())) return false;
    var q = P.save(user, draft);   // gate.js stores it and updates the navbar pill straight away
    if (!q) { toast('This browser would not save your details.', true); return false; }
    saved = q; draft = copy(q); fillFields(); render(); toast('Saved on this computer'); return true;
  }
  function discard() { draft = copy(saved); fillFields(); render(); }
  $('pfSave').addEventListener('click', doSave);
  $('pfUndo').addEventListener('click', discard);

  /* ---------- photo: centre-cropped to a 256px square and stored as a small JPEG so it never fills the browser's storage ---------- */
  function shrink(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var im = new Image();
      im.onload = function () {
        var m = Math.min(im.width, im.height), c = document.createElement('canvas'); c.width = c.height = 256;
        c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 256, 256);
        cb(c.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = function () { cb(null); }; im.src = r.result;
    };
    r.onerror = function () { cb(null); }; r.readAsDataURL(file);
  }
  function pick() { $('pfFile').click(); }
  $('pfPick').addEventListener('click', pick); $('pfPick2').addEventListener('click', pick);
  $('pfFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Choose a picture (JPG or PNG).', true); return; }
    shrink(f, function (u) { if (!u) { toast('That picture could not be read.', true); return; } draft.photo = u; render(); });
  });
  $('pfDrop').addEventListener('click', function () { draft.photo = ''; render(); });

  /* ---------- sheets (iOS-style alert and modal) ---------- */
  function showSheet(html, wide) {
    lastFocus = document.activeElement; sheet.className = 'pf-sheet' + (wide ? ' wide' : ''); sheet.innerHTML = html;
    sheet.setAttribute('aria-labelledby', 'pfShT'); overlay.hidden = false;
    var f = sheet.querySelector('input,button.b,button'); if (f) f.focus();
  }
  function hideSheet() { overlay.hidden = true; sheet.textContent = ''; if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); lastFocus = null; }
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) hideSheet(); });
  function ask(o) {
    showSheet('<div class="pf-sh-b"><h2 id="pfShT"></h2><p></p></div><div class="pf-acts"></div>', false);
    sheet.querySelector('h2').textContent = o.title; sheet.querySelector('p').textContent = o.text;
    var box = sheet.querySelector('.pf-acts'), first = null;
    o.acts.forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = a.t; if (a.cls) b.className = a.cls;
      b.addEventListener('click', function () { hideSheet(); if (a.fn) a.fn(); }); box.appendChild(b); if (!first && a.cls === 'b') first = b;
    });
    if (first) first.focus();
  }
  /* runs go() once unsaved changes have been dealt with */
  function guard(go) {
    if (!dirty()) { go(); return; }
    var acts = [];
    if (!invalid(check())) acts.push({ t: 'Save', cls: 'b', fn: function () { if (doSave()) go(); } });
    acts.push({ t: 'Discard Changes', cls: 'red', fn: function () { discard(); go(); } });
    acts.push({ t: 'Keep Editing', cls: acts.length ? '' : 'b' });
    ask({ title: 'Unsaved Changes', text: 'Your changes haven’t been saved yet.', acts: acts });
  }
  $('pfReset').addEventListener('click', function () {
    ask({ title: 'Reset to Original?', text: 'Your name, title, contact details and photo go back to the details set by the administrator.', acts: [
      { t: 'Reset', cls: 'red', fn: function () { P.reset(user); saved = P.current(user); draft = copy(saved); fillFields(); render(); toast('Back to your original details'); } },
      { t: 'Cancel', cls: 'b' }] });
  });

  /* ---------- password: checked against the real one, then kept on this computer (the same store the sign-in screen uses) ---------- */
  $('pfPw').addEventListener('click', function () {
    showSheet('<div class="pf-mh"><button type="button" id="pwX">Cancel</button><h2 id="pfShT">Change Password</h2><button type="button" class="b" id="pwOK" disabled>Update</button></div>' +
      '<div class="pf-mb"><div class="pf-gh" style="margin-top:14px">Password</div><div class="pf-group">' +
      '<label class="pf-row"><span class="pf-k">Current</span><input type="password" id="pwC" autocomplete="current-password" placeholder="Required"></label>' +
      '<label class="pf-row"><span class="pf-k">New</span><input type="password" id="pwN" autocomplete="new-password" placeholder="8 or more characters"></label>' +
      '<label class="pf-row"><span class="pf-k">Verify</span><input type="password" id="pwV" autocomplete="new-password" placeholder="Enter it again"></label></div>' +
      '<div class="pf-gf" id="pwF"></div>' +
      '<div class="pf-group" style="margin-top:16px"><div class="pf-row"><span style="flex:1">Show passwords</span><label class="pf-sw"><input type="checkbox" id="pwS" aria-label="Show passwords"><i></i></label></div></div></div>', true);
    var MSG = 'Use at least 8 characters. Your new password is kept on this computer only.', working = false;
    function upd() {
      var c = $('pwC').value, n = $('pwN').value, v = $('pwV').value, m = '', ok = !!(c && n && v);
      if (n && n.length < 8) { m = 'Use at least 8 characters.'; ok = false; }
      else if (n && c && n.toLowerCase() === c.toLowerCase()) { m = 'Choose a password different from the current one.'; ok = false; }
      else if (v && v !== n) { m = 'The two passwords don’t match.'; ok = false; }
      var f = $('pwF'); f.textContent = m || MSG; f.className = 'pf-gf' + (m ? ' err' : ''); $('pwOK').disabled = !ok || working;
    }
    function done() {
      if ($('pwOK').disabled || working) return;
      if (!window.sdChangePassword) { toast('Passwords cannot be changed here.', true); return; }
      working = true; $('pwOK').disabled = true;
      window.sdChangePassword(user, $('pwC').value, $('pwN').value).then(function (r) {
        working = false;
        if (r && r.ok) { hideSheet(); toast('Password updated on this computer'); return; }
        if (!$('pwF')) return;                                   /* the sheet was closed while it was checking */
        var f = $('pwF'); f.textContent = (r && r.error) || 'The password could not be changed.'; f.className = 'pf-gf err';
        $('pwOK').disabled = false; if (r && r.field === 'cur') { $('pwC').focus(); $('pwC').select(); }
      });
    }
    ['pwC', 'pwN', 'pwV'].forEach(function (i) { $(i).addEventListener('input', upd); $(i).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); done(); } }); });
    $('pwS').addEventListener('change', function () { var t = this.checked ? 'text' : 'password'; ['pwC', 'pwN', 'pwV'].forEach(function (i) { $(i).type = t; }); });
    $('pwX').addEventListener('click', hideSheet); $('pwOK').addEventListener('click', done); upd();
  });

  /* ---------- export / import (name, title, contact details and photo; never the password) ---------- */
  $('pfExp').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ app: 'slipdesk', id: user.id, profile: saved }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'slipdesk-profile-' + user.id + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast(dirty() ? 'Exported your saved profile (unsaved edits are not included)' : 'Profile file downloaded');
  });
  $('pfImp').addEventListener('click', function () { $('pfImpFile').click(); });
  $('pfImpFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        if (!o || o.app !== 'slipdesk' || !user || o.id !== user.id) throw 0;
        var q = P.save(user, o.profile); if (!q) throw 0;
        saved = q; draft = copy(q); fillFields(); render(); toast('Profile imported');
      } catch (e) { toast('That isn’t a Slip Desk profile file for this account.', true); }
    };
    r.readAsText(f);
  });

  /* ---------- open / close ---------- */
  function open() {
    user = window.SD_USER; if (!user || !page.hidden) return;
    saved = P.current(user); draft = copy(saved); avKey = '';
    $('pfLogin').textContent = user.id; $('pfPLogin').textContent = user.id; $('pfRole').textContent = role(); $('pfPRole').textContent = role();
    fillFields();
    prevTab = tabs.querySelector('.tab.active');
    tabs.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    if (window.moveTabDrop) window.moveTabDrop(true);
    document.body.classList.add('on-profile'); page.hidden = false; render(); window.scrollTo(0, 0); $('pfShowName').focus({ preventScroll: true });
  }
  function close(restore) {
    if (page.hidden) return;
    page.hidden = true; document.body.classList.remove('on-profile'); dock.classList.remove('on'); draft = null;
    if (restore && prevTab) { prevTab.classList.add('active'); if (window.moveTabDrop) window.moveTabDrop(true); }
  }

  /* ---------- account menu: the pill opens a small dropdown (Profile / Sign out) ---------- */
  var menu = document.createElement('div'), menuIsOpen = false;
  var UIC = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>';
  var OUT = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
  var CK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>';
  menu.className = 'acctmenu'; menu.id = 'acctMenu'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Account');
  menu.innerHTML = '<button type="button" class="am-item prof" role="menuitem"><span class="am-ic">' + UIC + '</span><span class="am-tx"><b>Profile</b><small>Details and password</small></span><span class="am-ck">' + CK + '</span></button>' +
    '<button type="button" class="am-item out" role="menuitem"><span class="am-ic">' + OUT + '</span><span class="am-tx"><b>Sign out</b><small>Lock the desk</small></span></button>';
  document.body.appendChild(menu);
  function items() { return Array.prototype.slice.call(menu.querySelectorAll('.am-item')); }
  function placeMenu() {
    /* centred on the pill and as wide as the pill (never narrower than the rows need); near a screen edge it slides in and the pointer keeps aiming at the pill's centre */
    var r = so.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    var w = Math.max(240, Math.min(300, Math.round(r.width))), cx = r.left + r.width / 2;
    var left = Math.max(12, Math.min(cx - w / 2, vw - w - 12));
    menu.style.width = w + 'px'; menu.style.left = left + 'px'; menu.style.top = (r.bottom + 12) + 'px';
    menu.style.setProperty('--ax', Math.max(22, Math.min(cx - left, w - 22)) + 'px');
  }
  function menuOpen() {
    if (menuIsOpen) return;
    ['closeLogPop', 'closeRecPop', 'closeAnPop', 'closeUpPop'].forEach(function (n) { if (typeof window[n] === 'function') { try { window[n](); } catch (e) {} } });   // only one navbar dropdown open at a time
    menu.querySelector('.prof').classList.toggle('cur', !page.hidden);
    menu.hidden = false; menuIsOpen = true; placeMenu();   // js/sync.js dims the page behind it, like the other navbar dropdowns
    so.setAttribute('aria-expanded', 'true');
    setTimeout(function () { if (menuIsOpen) items()[0].focus({ preventScroll: true }); }, 30);
  }
  function menuClose(back) {
    if (!menuIsOpen) return;
    menuIsOpen = false; menu.hidden = true; so.setAttribute('aria-expanded', 'false');
    if (back) so.focus({ preventScroll: true });
  }
  so.addEventListener('click', function () { menuIsOpen ? menuClose() : menuOpen(); });
  so.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' && !menuIsOpen) { e.preventDefault(); menuOpen(); } });
  menu.querySelector('.prof').addEventListener('click', function () { menuClose(); if (page.hidden) open(); else $('pfShowName').focus({ preventScroll: true }); });
  menu.querySelector('.out').addEventListener('click', function () { menuClose(); guard(function () { if (window.sdSignOut) window.sdSignOut(); }); });
  menu.addEventListener('keydown', function (e) {
    var it = items(), i = it.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); it[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); it[it.length - 1].focus(); }
    else if (e.key === 'Tab') { menuClose(); }
  });
  addEventListener('resize', function () { if (menuIsOpen) placeMenu(); });
  addEventListener('scroll', function () { if (menuIsOpen) placeMenu(); }, { passive: true });
  CA.register({ els: function () { return [menu, so]; }, isOpen: function () { return menuIsOpen; }, close: function () { menuClose(); } });

  $('pfClose').addEventListener('click', function () { guard(function () { close(true); }); });
  /* leaving through a tab: ask first if there are unsaved edits. Analytics and Activity log only open a dropdown, so the page underneath comes back. */
  tabs.addEventListener('click', function (e) {
    if (page.hidden) return; var t = e.target.closest('.tab'); if (!t) return;
    var keep = t.id === 'logBtn' || t.id === 'anBtn';
    if (!dirty()) { close(keep); return; }
    e.stopPropagation(); e.preventDefault(); guard(function () { close(keep); t.click(); });
  }, true);
  window.addEventListener('beforeunload', function (e) { if (!page.hidden && dirty()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function (e) {
    if (menuIsOpen && e.key === 'Escape') { e.preventDefault(); menuClose(true); return; }
    if (!overlay.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); hideSheet(); }
      else if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(sheet.querySelectorAll('input,button'), function (x) { return !x.disabled; });
        if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
      return;
    }
    if (page.hidden) return;
    if (e.key === 'Escape') guard(function () { close(true); });
    else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (dirty()) doSave(); }
  });

  /* the desk locking (signed out, or 5 minutes idle) shuts everything here at once; unsaved edits are dropped rather than left on screen */
  window.sdOnLock = function () {
    menuClose();
    lastFocus = null; overlay.hidden = true; sheet.textContent = '';
    close(true);
  };
})();
