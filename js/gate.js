// ── Accounts, sign-in and 5-minute idle auto-lock ──
// Each password is stored only as a SHA-256 hash of   id + ":" + password   (so two people with the same password get different hashes).
// Accounts marked  temp: true  start on a generic temporary password (the hash below). On first sign-in the person is forced to choose their own
// password; the new password's hash is kept ONLY in this browser (localStorage key slipdesk.pw.v1) and replaces the temporary one on this machine.
// Passwords are NOT case-sensitive: the password is lower-cased before it is hashed, so "Welcome-1" and "welcome-1" are the same password.
// To issue a temporary password, hash it in lower case:  printf 'ayinde:welcome-ayinde-1a2b' | sha256sum   and paste the result into that person's  hash:  below.
// (Hashes made earlier from a mixed-case password still work when typed exactly; the first time one is used on a machine, its lower-case form is remembered there too.)
// To reset someone on a machine: clear their id from the slipdesk.pw.v1 entry (or delete the whole entry) and their temporary password works again.
// Set FORCE_PW_CHANGE = true (in the script below) to make the change compulsory; while false, people can "Skip for now" and are asked again at their next sign-in.
// Accounts with hash:null show as "not set up yet" and cannot sign in.
(function () {
  var USERS = [
    { id: 'makinde',   name: 'Makinde Uthman Bibitayo',     title: 'Computer Engineer', admin: true, hash: '4348362e48c26a3feb6fd2683cb939e1919477cce64556333a95ee4c77ea8676',
      avatar: 'assets/avatars/makinde.jpg' },
    { id: 'ayinde',    name: 'Tolulope Ayinde',             title: 'System Analyst', temp: true, hash: '8d8b59b31cf946c0a8bfa121388b307e7243ee80c06fd1564cce1c9422e15a25',
      avatar: 'assets/avatars/ayinde.jpg' },
    { id: 'olawoore',  name: 'David Olawoore',              title: 'System Analyst', temp: true, hash: '1db7035dd5eaf158f59aa87d10905ca54b889c773ec71bd98f9114776e6e3117',
      avatar: 'assets/avatars/olawoore.jpg' },
    { id: 'jegede',    name: 'Jegede Kayode Samuel',        title: 'System Analyst', temp: true, hash: '921f8427395585786c9d0cf69437b8a637f8d59ac9b57478dd95fecc8087293d' },
    { id: 'sangogade', name: 'Sangagade Olabamiji Alaba',    title: 'Programme Officer', temp: true, hash: 'e352ca3802d2ad28ea04bc602be66a9915085f637610f59803e4092249ed8b0a' },
    { id: 'ogunranti', name: 'Nihinlola Esther',             title: 'System Analyst', temp: true, hash: 'ad3b1aaa78d329b2f7ec40d522b403d5e46126714840929505ef9a4607fc6e97',
      avatar: 'assets/avatars/ogunranti.jpg' },
    { id: 'ogunleye',  name: 'Ranti Eunice Ogunleye',       title: 'System Analyst', temp: true, hash: 'bd1d6e31ccf7cce536aa88b991619970783ab738539b34d2f2ce24d5a45ba82b',
      avatar: 'assets/avatars/ogunleye.jpg' }
  ];
  window.SD_USERS = USERS; window.SD_USER = null;
  var IDLE_MS = 5 * 60 * 1000;
  var PALETTE = ['#6d1f2e', '#8b5a2b', '#2f5d50', '#3b4a7a', '#7a3b69', '#5b5b5b', '#9a6b13'];
  var SESSION_KEY = 'slipdesk.session.v1', LASTUSER_KEY = 'slipdesk.lastuser.v1', PW_KEY = 'slipdesk.pw.v1';
  var MIN_PW = 8, changing = null;
  // true = a person on a temporary password cannot get in until they choose their own; false = they may "Skip for now" (asked again next sign-in)
  var FORCE_PW_CHANGE = false;
  // Passwords people have set on THIS machine: { userId: sha256(id + ':' + password) }. They override the built-in temporary hash.
  function localPw() { try { return JSON.parse(localStorage.getItem(PW_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function effHash(u, lp) { return (lp || localPw())[u.id] || u.hash; }
  function needsChange(u) { return !!u.temp && !localPw()[u.id]; }
  // ── Case-insensitive passwords ──
  // New hashes are made from the lower-cased password. A hash made earlier from the exact-case password is still accepted when typed exactly;
  // when that happens, the lower-case form is remembered on this machine (tied to the hash it came from) so any casing works from then on.
  var CI_KEY = 'slipdesk.pwci.v1';
  function lc(v) { return String(v).toLowerCase(); }
  function ciMap() { try { return JSON.parse(localStorage.getItem(CI_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function ciSave(m) { try { localStorage.setItem(CI_KEY, JSON.stringify(m)); } catch (e) {} }
  function pwMatch(u, v, lp, ci) {
    var eh = effHash(u, lp); if (!eh) return Promise.resolve({ ok: false });
    var l = lc(v);
    return Promise.all([sha256(u.id + ':' + l), l === v ? null : sha256(u.id + ':' + v)]).then(function (r) {
      var hl = r[0], hx = r[1] || hl, c = (ci || {})[u.id];
      if (hl === eh || (c && c.f === eh && c.h === hl)) return { ok: true, up: null };
      if (hx === eh) return { ok: true, up: hl };      // old exact-case password: accepted; remember its lower-case form
      return { ok: false };
    });
  }

  var gate = document.getElementById('gate'), box = document.getElementById('gateBox');
  var pw = document.getElementById('gatePw'), go = document.getElementById('gateGo');
  var msg = document.getElementById('gateMsg'), sub = document.getElementById('gateSub');
  var nav = document.querySelector('nav'), main = document.querySelector('main');
  var soAv = document.getElementById('soAv'), soWho = document.getElementById('soWho'), soName = document.getElementById('soName'), soBtn = document.getElementById('signOutBtn');
  var locked = true, idleT = null, fails = 0, lockoutUntil = 0, lockoutT = null, lastBeat = 0, busy = false;
  // Failed-attempt state survives page refreshes (kept in this browser). Pauses grow each round: 30s, 2m, 10m, 30m, then 1h.
  var LOCK_KEY = 'slipdesk.lock.v1', PAUSES = [30, 120, 600, 1800, 3600];
  function readLock() { try { var o = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') || {}; return { fails: +o.fails || 0, round: +o.round || 0, until: +o.until || 0 }; } catch (e) { return { fails: 0, round: 0, until: 0 }; } }
  function saveLock(o) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(o)); } catch (e) {} }
  function fmtWait(sec) { return sec >= 3600 ? Math.round(sec / 3600) + ' hour' : sec >= 60 ? Math.round(sec / 60) + ' minute' + (sec >= 120 ? 's' : '') : sec + ' seconds'; }
  (function () { var o = readLock(); fails = o.fails; lockoutUntil = o.until; })();

  function byId(id) { for (var i = 0; i < USERS.length; i++) if (USERS[i].id === id) return USERS[i]; return null; }
  function words(n) { return String(n).trim().split(/\s+/); }
  function shortName(u) { return words(u.name).slice(0, 2).join(' '); }
  function initials(n) { var w = words(n); return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(); }

  // avatar: the person's photo if they have one, otherwise their initials
  window.sdAvatar = function (u, px) {
    var d = document.createElement('span'); d.className = 'av';
    d.style.width = d.style.height = px + 'px'; d.style.fontSize = Math.round(px * 0.4) + 'px';
    if (u && u.avatar) { var im = new Image(); im.alt = ''; im.src = u.avatar; d.appendChild(im); }
    else { var k = USERS.indexOf(u); d.style.background = PALETTE[(k < 0 ? 0 : k) % PALETTE.length]; d.textContent = u ? initials(u.name) : '?'; }
    return d;
  };

  // ── Profiles: the name, job title, phone, email and photo each person has set on THIS computer (edited on the Profile page, js/profile.js) ──
  // Kept in localStorage key slipdesk.profile.v1 as { userId: { name, title, phone, email, photo } }. The details in USERS above stay as the "original" and come back on Reset.
  var PROFILE_KEY = 'slipdesk.profile.v1';
  USERS.forEach(function (u) { u.orig = { name: u.name, title: u.title || '', avatar: u.avatar || '' }; });
  function readProfiles() { try { var o = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function cleanProfile(u, p) {   // a tidy copy, or null when it is not a usable profile
    if (!u || !p || typeof p !== 'object' || typeof p.name !== 'string') return null;
    var name = p.name.trim().replace(/\s+/g, ' ').slice(0, 60); if (name.length < 2) return null;
    var photo = typeof p.photo === 'string' ? p.photo : '';
    if (!(photo === '' || photo === u.orig.avatar || (photo.length < 400000 && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(photo)))) photo = '';
    return { name: name, title: String(p.title || '').trim().slice(0, 40), phone: String(p.phone || '').trim().slice(0, 20), email: String(p.email || '').trim().slice(0, 80), photo: photo };
  }
  function applyProfile(u, p) {   // p = null puts the original details back
    var o = u.orig, photo = p ? p.photo : o.avatar;
    u.name = p ? p.name : o.name; u.title = p ? p.title : o.title; u.phone = p ? p.phone : ''; u.email = p ? p.email : '';
    if (photo) u.avatar = photo; else delete u.avatar;
    if (window.SD_USER === u) updateChip();
  }
  (function () { var all = readProfiles(); USERS.forEach(function (u) { var p = cleanProfile(u, all[u.id]); if (p) applyProfile(u, p); }); })();
  window.sdProfile = {
    clean: cleanProfile,
    original: function (u) { return { name: u.orig.name, title: u.orig.title, phone: '', email: '', photo: u.orig.avatar }; },
    current: function (u) { return { name: u.name, title: u.title || '', phone: u.phone || '', email: u.email || '', photo: u.avatar || '' }; },
    save: function (u, p) {   // returns the saved profile, or null when it could not be saved
      p = cleanProfile(u, p); if (!p) return null;
      try { var all = readProfiles(); all[u.id] = p; localStorage.setItem(PROFILE_KEY, JSON.stringify(all)); } catch (e) { return null; }
      applyProfile(u, p); return p;
    },
    reset: function (u) { try { var all = readProfiles(); delete all[u.id]; localStorage.setItem(PROFILE_KEY, JSON.stringify(all)); } catch (e) {} applyProfile(u, null); }
  };

  // SHA-256 (WebCrypto, with a compact fallback for non-secure contexts)
  function sha256js(str) {
    var b = unescape(encodeURIComponent(str)), m = [], i, j, l = b.length;
    for (i = 0; i < l; i++) m[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
    m[l >> 2] |= 0x80 << (24 - (l % 4) * 8); m[(((l + 8) >> 6) + 1) * 16 - 1] = l * 8;
    for (i = 0; i < m.length; i++) m[i] |= 0;
    var K = [], H = [], p = 2, n = 0;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    while (n < 64) { for (j = 2; j * j <= p && p % j; j++); if (j * j > p) { if (n < 8) H[n] = frac(Math.pow(p, .5)); K[n++] = frac(Math.pow(p, 1 / 3)); } p++; }
    function rr(x, c) { return (x >>> c) | (x << (32 - c)); }
    for (var o = 0; o < m.length; o += 16) {
      var w = m.slice(o, o + 16), a = H.slice(0), t1, t2;
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      for (i = 0; i < 64; i++) {
        t1 = (a[7] + (rr(a[4], 6) ^ rr(a[4], 11) ^ rr(a[4], 25)) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[i] + w[i]) | 0;
        t2 = ((rr(a[0], 2) ^ rr(a[0], 13) ^ rr(a[0], 22)) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]))) | 0;
        a = [(t1 + t2) | 0, a[0], a[1], a[2], (a[3] + t1) | 0, a[4], a[5], a[6]];
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function sha256(s) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      }).catch(function () { return sha256js(s); });
    }
    return Promise.resolve(sha256js(s));
  }

  // ── session marker: lets the log say so when a window was closed/refreshed without signing out ──
  function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function writeSession(o) {
    try { if (o) localStorage.setItem(SESSION_KEY, JSON.stringify(o)); else localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { if (o) sessionStorage.setItem(SESSION_KEY, JSON.stringify(o)); else sessionStorage.removeItem(SESSION_KEY); } catch (e) {}   // per-tab: survives a refresh, gone when the tab closes
  }
  function readResume() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  var sessStart = 0;
  function beat(force) {
    var u = window.SD_USER; if (!u) return;
    var now = Date.now(); if (!force && now - lastBeat < 10000) return; lastBeat = now;
    writeSession({ uid: u.id, start: sessStart, seen: now });
  }
  window.addEventListener('pagehide', function () { beat(true); });

  // ── lock / sign in ──
  function setInert(on) {
    [nav, main].forEach(function (el) { if (!el) return; if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); } });
  }
  function updateChip() {
    var u = window.SD_USER; soAv.textContent = '';
    if (u) {
      soAv.appendChild(window.sdAvatar(u, 32));
      soName.textContent = words(u.name)[0]; soWho.textContent = u.title || (u.admin ? 'Administrator' : 'Staff');
      soBtn.title = 'Signed in as ' + u.name + (u.title ? ', ' + u.title : '') + (u.admin ? ' (administrator)' : '') + '. Click for your profile or to sign out.';
    }
  }
  function lock(reason) {
    clearTimeout(idleT); locked = true;
    var u = window.SD_USER;
    try { if (window.sdOnLock) window.sdOnLock(); } catch (e) {}   // closes the account menu and the Profile page (js/profile.js)
    if (u) {
      if (typeof window.logEvent === 'function') window.logEvent(reason === 'idle' ? 'lock' : 'signout', reason === 'idle' ? 'Locked automatically after 5 minutes idle' : 'Signed out', u);
      try { localStorage.setItem(LASTUSER_KEY, u.id); } catch (e) {}
    }
    window.SD_USER = null; writeSession(null); updateChip();
    if (reason === 'signout' && window.clearStoredRegister) window.clearStoredRegister();
    try { if (typeof clearBoth === 'function') clearBoth(); } catch (e) {}
    try { var lp = document.getElementById('logPop'); if (lp) lp.hidden = true; var lb = document.getElementById('logBtn'); if (lb) lb.setAttribute('aria-expanded', 'false'); } catch (e) {}
    try { if (typeof renderLog === 'function') renderLog(); } catch (e) {}
    setInert(true); gate.classList.add('on');
    sub.textContent = reason === 'idle' ? 'Locked after 5 minutes of inactivity. Enter your password to continue.' : reason === 'signout' ? 'You have signed out. Enter your password to sign back in.' : 'Enter your password to continue.';
    leaveChange(); pw.value = '';
    msg.textContent = ''; box.classList.remove('welcoming'); busy = false; go.disabled = false;
    setTimeout(function () { pw.focus(); }, 50);
  }
  function signIn(u) {
    window.SD_USER = u; locked = false; fails = 0; saveLock({ fails: 0, round: 0, until: 0 }); sessStart = Date.now(); lastBeat = 0;
    try { localStorage.setItem(LASTUSER_KEY, u.id); } catch (e) {}
    if (typeof window.logEvent === 'function') window.logEvent('signin', 'Signed in', u);
    beat(true); updateChip(); gate.classList.remove('on'); setInert(false);
    try { if (window.restoreRegister) window.restoreRegister(); } catch (e) {}
    pw.value = ''; msg.textContent = '';
    try { if (typeof renderLog === 'function') renderLog(); } catch (e) {}
    resetIdle();
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Working late';
  }
  // ── Welcome remark: today's weather at the station (Open-Meteo, no key, fetched quietly ahead of sign-in) + the day/time.
  //    Change PLACE / LAT / LON if the desk moves. Offline or slow network: it falls back to a time-of-day line.
  var WX = { PLACE: 'Ibadan', LAT: 7.3776, LON: 3.9470, data: null, at: 0, busy: false };
  function loadWeather() {
    if (WX.busy || !navigator.onLine || (WX.data && Date.now() - WX.at < 30 * 60000)) return;
    WX.busy = true;
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + WX.LAT + '&longitude=' + WX.LON + '&current=temperature_2m,weather_code,is_day&timezone=auto', ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.current && typeof j.current.temperature_2m === 'number') { WX.data = { t: Math.round(j.current.temperature_2m), c: j.current.weather_code, d: j.current.is_day }; WX.at = Date.now(); } })
      .catch(function () {})
      .then(function () { clearTimeout(to); WX.busy = false; });
  }
  function wxWord(c, day) {
    if (c === 0 || c === 1) return day ? 'sunny' : 'clear';
    if (c === 2) return 'partly cloudy';
    if (c === 3) return 'overcast';
    if (c === 45 || c === 48) return 'hazy';
    if (c >= 51 && c <= 57) return 'drizzly';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rainy';
    if (c >= 95) return 'stormy';
    return '';
  }
  function pickNext(list, key) {              // rotate through a few lines so two sign-ins in a row never read the same
    var i = 0; try { i = (parseInt(localStorage.getItem(key), 10) + 1) || 0; localStorage.setItem(key, String(i % list.length)); } catch (e) {}
    return list[i % list.length];
  }
  function remark(g) {
    var now = new Date(), day = now.getDay(), h = now.getHours(), late = g === 'Working late', w = WX.data && Date.now() - WX.at < 3 * 3600000 ? WX.data : null;
    var wet = false, line = '';
    if (w) {
      var word = wxWord(w.c, w.d); wet = /rainy|drizzly|stormy/.test(word);
      line = WX.PLACE + ' is ' + w.t + '\u00B0C' + (word ? ' and ' + word : '') + '.';
    }
    var tail = wet ? 'Mind the roads home.' : (w && w.t >= 33) ? 'Stay hydrated.' : late ? 'Thank you for the long hours.' : day === 5 ? 'Almost the weekend.' : day === 1 ? 'A fresh week begins.' : '';
    if (line) return tail ? line + ' ' + tail : line;
    if (tail) return tail;
    var pool = h < 12 ? ['A calm start to the queue.', 'Registers are ready when you are.', 'Plenty of candidates to help today.']
             : h < 17 ? ['Halfway through the day. Keep going.', 'Steady work, one slip at a time.', 'The afternoon queue is yours.']
             : ['Wrapping up the day well.', 'Almost done for today.', 'A good evening to close the queue.'];
    return pickNext(pool, 'sd_welcome_i');
  }
  loadWeather();
  window.addEventListener('online', loadWeather);
  function welcome(u, done) {
    loadWeather();
    var g = greeting(), first = u.name;   // full name, as registered
    var hello = document.getElementById('gateHello'); hello.textContent = '';
    function add(cls, txt) { var d = document.createElement('div'); d.className = cls; if (txt) d.textContent = txt; hello.appendChild(d); return d; }
    hello.appendChild(window.sdAvatar(u, 84));
    var gg = add('gh-g'); var gs1 = document.createElement('span'); gs1.className = 'gh-hi'; gs1.textContent = g; var gs2 = document.createElement('span'); gs2.className = 'gh-name'; gs2.textContent = first; gg.appendChild(gs1); gg.appendChild(gs2);
    var role = [u.title, u.admin ? 'Administrator' : ''].filter(Boolean).join(' \u00B7 ');   // the name is already in the headline, so it is not repeated here
    if (role) add('gh-n', role);
    add('gh-s', remark(g));
    add('gh-bar').appendChild(document.createElement('i'));
    box.classList.add('welcoming');
    setTimeout(function () { done(); box.classList.remove('welcoming'); }, 2000);
  }
  function tryUnlock() {
    if (busy) return;
    if (Date.now() < readLock().until) { startLockout(Math.ceil((readLock().until - Date.now()) / 1000)); return; }
    var v = pw.value; if (!v) { pw.focus(); return; }
    if (changing) { return saveNewPassword(v); }
    busy = true; go.disabled = true;
    var lp = localPw(), ci = ciMap();
    Promise.all(USERS.map(function (u) { return pwMatch(u, v, lp, ci); })).then(function (res) {
      var who = null; res.forEach(function (x, i) { if (x && x.ok && !who) { who = USERS[i]; if (x.up) { ci[who.id] = { f: effHash(who, lp), h: x.up }; ciSave(ci); } } });
      if (who && needsChange(who)) { busy = false; go.disabled = false; fails = 0; saveLock({ fails: 0, round: 0, until: 0 }); enterChange(who); return; }
      if (who) { welcome(who, function () { busy = false; go.disabled = false; signIn(who); }); return; }
      busy = false; go.disabled = false;
      fails++; pw.value = ''; pw.focus();
      box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      var L = readLock(); L.fails = fails;
      if (fails >= 5) {
        var sec = PAUSES[Math.min(L.round, PAUSES.length - 1)];
        window.logEvent && window.logEvent('fail', '5 wrong passwords in a row. Sign-in paused for ' + fmtWait(sec), null);
        L.round++; L.fails = 0; L.until = Date.now() + sec * 1000; saveLock(L); fails = 0; startLockout(sec);
      } else {
        saveLock(L);
        window.logEvent && window.logEvent('fail', 'Wrong password entered (no account matched)', null); msg.className = ''; msg.textContent = 'Incorrect password. ' + (5 - fails) + ' attempt' + (5 - fails > 1 ? 's' : '') + ' left.';
      }
    });
  }
  // ── forced first-time password change (temporary password -> own password, kept on this machine only) ──
  var pw2 = document.getElementById('gatePw2'), row2 = document.getElementById('gateRow2'), skip = document.getElementById('gateSkip');
  // Panel swap (desktop layout only): the dark panel slides across as one stretching "drop", like the tab selector in the navbar
  function gateSwap(box, apply) {
    var grid = box.querySelector('.gate-grid'), info = grid.querySelector('.gate-info:not(.gi-pw)'), pwI = grid.querySelector('.gi-pw'), form = grid.querySelector('.gate-form');
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    var toChanging = !box.classList.contains('changing'), fromP = toChanging ? info : pwI, toP = toChanging ? pwI : info;   // works both ways: sign-in -> choose password, and back
    if (reduced || !fromP.offsetWidth || !grid.animate || window.innerWidth <= 760) { apply(); return; }
    var gr = grid.getBoundingClientRect(), a = fromP.getBoundingClientRect(), f = form.getBoundingClientRect();
    var A = { x: a.left - gr.left, w: a.width }, F = { x: f.left - gr.left };
    var ghost = fromP.cloneNode(true); ghost.classList.add('gi-ghost'); ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = 'display:flex;left:' + A.x + 'px;width:' + A.w + 'px';
    box.classList.add('swapping');
    apply();
    var b = toP.getBoundingClientRect(), f2 = form.getBoundingClientRect();
    var B = { x: b.left - gr.left, w: b.width }, F2 = { x: f2.left - gr.left };
    var drop = document.createElement('span'); drop.className = 'gate-drop'; drop.setAttribute('aria-hidden', 'true');
    drop.style.transform = 'translateX(' + A.x + 'px)'; drop.style.width = A.w + 'px';
    grid.prepend(drop); grid.appendChild(ghost);
    var x0 = Math.min(A.x, B.x), x1 = Math.max(A.x + A.w, B.x + B.w), dur = 560, done = false;
    function end() { if (done) return; done = true; drop.remove(); ghost.remove(); box.classList.remove('swapping'); }
    var dropAnim = drop.animate([
      { transform: 'translateX(' + A.x + 'px)', width: A.w + 'px', offset: 0 },
      { transform: 'translateX(' + x0 + 'px)', width: (x1 - x0) + 'px', offset: .42, easing: 'cubic-bezier(.25,1,.35,1)' },
      { transform: 'translateX(' + B.x + 'px)', width: B.w + 'px', offset: 1 }
    ], { duration: dur, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    dropAnim.onfinish = dropAnim.oncancel = end;
    setTimeout(end, dur + 250);
    form.animate([{ transform: 'translateX(' + (F.x - F2.x) + 'px)' }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.45,0,.2,1)' });
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
    toP.animate([{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: 1 }], { duration: dur, easing: 'ease-out' });
  }
  var savedTemp = null;   // the temporary password typed at sign-in, kept only so Back can put it back; dropped as soon as the change screen is left
  function enterChange(u) {
    savedTemp = pw.value; changing = u; pw.value = ''; pw2.value = ''; row2.style.display = ''; var gb = document.getElementById('gateBox'); if (gb) gateSwap(gb, function () { gb.classList.add('changing'); }); var mp = document.getElementById('giMinPw'); if (mp) mp.textContent = MIN_PW;
    pw.placeholder = 'Enter your new password'; pw.autocomplete = 'new-password'; go.textContent = 'Change password & continue';
    skip.style.display = FORCE_PW_CHANGE ? 'none' : '';
    sub.textContent = '';
    var sep = document.createElement('div'); sep.className = 'gate-sep'; sep.setAttribute('aria-hidden', 'true'); sep.appendChild(document.createElement('i')); sub.appendChild(sep);
    var greet = document.createElement('div'); greet.className = 'gate-greet'; greet.title = 'Welcome, ' + u.name;
    var hi = document.createElement('span'); hi.className = 'gate-hi'; hi.textContent = 'Welcome, '; greet.appendChild(hi);
    var nm = document.createElement('strong'); nm.className = 'gate-name'; nm.textContent = u.name; greet.appendChild(nm); sub.appendChild(greet);
    var ask = document.createElement('div'); ask.className = 'gate-ask'; ask.textContent = (FORCE_PW_CHANGE ? 'Change your password to continue.' : 'Change your password.') + ' It is saved on this computer only.'; sub.appendChild(ask);
    var l1 = document.getElementById('gateLab1'); if (l1) l1.textContent = 'New password';
    msg.className = 'info'; msg.textContent = ''; pw.focus();
  }
  function leaveChange() {
    changing = null; savedTemp = null; skip.style.display = 'none'; var gb2 = document.getElementById('gateBox'); if (gb2) gb2.classList.remove('changing'); row2.style.display = 'none'; pw2.value = ''; pw.placeholder = 'Password'; var l1b = document.getElementById('gateLab1'); if (l1b) l1b.textContent = 'Password'; pw.autocomplete = 'current-password'; go.textContent = 'Sign in';
  }
  // Back: return to the normal sign-in view (panels slide back the way they came)
  var backBtn = document.getElementById('gateBack');
  if (backBtn) backBtn.addEventListener('click', function () {
    if (busy || !changing) return;
    var gbx = document.getElementById('gateBox');
    var tmp = savedTemp;   // leaveChange() drops it, so take it first
    gateSwap(gbx, function () { leaveChange(); });
    pw.value = tmp || ''; pw2.value = ''; msg.className = ''; msg.textContent = '';   // the sign-in box keeps the temporary password; only the new-password boxes are emptied
    sub.textContent = 'Enter your password to continue.';
    pw.focus(); try { pw.setSelectionRange(pw.value.length, pw.value.length); } catch (e) {}
  });
  function saveNewPassword(v) {
    var u = changing, v2 = pw2.value; msg.className = '';
    if (v.length < MIN_PW) { msg.textContent = 'Use at least ' + MIN_PW + ' characters.'; pw.focus(); return; }
    if (v !== v2) { msg.textContent = 'The two passwords do not match.'; pw2.focus(); return; }
    busy = true; go.disabled = true;
    var lp = localPw();
    // Sign-in is by password alone, so it must not equal any other account's password on this machine (or this account's temporary one)
    var ci = ciMap();
    Promise.all(USERS.map(function (x) { return pwMatch(x, v, lp, ci).then(function (r) { return r.ok; }); })
      .concat([pwMatch({ id: u.id, hash: u.hash }, v, {}, {}).then(function (r) { return r.ok; })])).then(function (clash) {
      busy = false; go.disabled = false;
      if (clash.some(Boolean)) { msg.textContent = 'Use a different password. That one is already in use or is the temporary one.'; pw.value = ''; pw2.value = ''; pw.focus(); return; }
      sha256(u.id + ':' + lc(v)).then(function (nh) {
        lp[u.id] = nh; delete ci[u.id]; ciSave(ci);
        try { localStorage.setItem(PW_KEY, JSON.stringify(lp)); } catch (e) { msg.textContent = 'This browser would not save the password, so it cannot be changed here.'; return; }
        window.logEvent && window.logEvent('pwchg', 'Changed to a personal password on first sign-in (kept on this computer)', u);
        leaveChange(); msg.textContent = ''; busy = true; go.disabled = true;
        welcome(u, function () { busy = false; go.disabled = false; signIn(u); });
      });
    });
  }
  // Profile page: check the current password, then keep the new one on this computer (same rules as the first-time change above)
  window.sdChangePassword = function (u, cur, next) {
    if (!u || !cur) return Promise.resolve({ ok: false, error: 'Enter your current password.', field: 'cur' });
    var lp = localPw(), ci = ciMap();
    return pwMatch(u, cur, lp, ci).then(function (r) {
      if (!r.ok) return { ok: false, error: 'Your current password is not correct.', field: 'cur' };
      if (String(next).length < MIN_PW) return { ok: false, error: 'Use at least ' + MIN_PW + ' characters.' };
      return Promise.all(USERS.map(function (x) { return pwMatch(x, next, lp, ci).then(function (q) { return q.ok; }); })
        .concat([pwMatch({ id: u.id, hash: u.hash }, next, {}, {}).then(function (q) { return q.ok; })])).then(function (clash) {
        if (clash.some(Boolean)) return { ok: false, error: 'Use a different password. That one is already in use or is the temporary one.' };
        return sha256(u.id + ':' + lc(next)).then(function (nh) {
          lp[u.id] = nh; delete ci[u.id]; ciSave(ci);
          try { localStorage.setItem(PW_KEY, JSON.stringify(lp)); } catch (e) { return { ok: false, error: 'This browser would not save the password, so it cannot be changed here.' }; }
          window.logEvent && window.logEvent('pwchg', 'Changed password from the Profile page (kept on this computer)', u);
          return { ok: true };
        });
      });
    });
  };
  skip.addEventListener('click', function () {
    var u = changing; if (!u || FORCE_PW_CHANGE || busy) return;
    leaveChange(); msg.textContent = ''; busy = true; go.disabled = true;
    welcome(u, function () { busy = false; go.disabled = false; signIn(u); });
  });
  function startLockout(sec) {
    lockoutUntil = Date.now() + sec * 1000; go.disabled = true; pw.disabled = true;
    clearInterval(lockoutT);
    function tick() {
      var left = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (left <= 0) { clearInterval(lockoutT); go.disabled = false; pw.disabled = false; msg.textContent = ''; pw.focus(); return; }
      msg.className = 'info'; msg.textContent = 'Too many attempts. Try again in ' + (left >= 60 ? Math.floor(left / 60) + 'm ' + ('0' + left % 60).slice(-2) + 's' : left + 's') + '.';
    }
    tick(); lockoutT = setInterval(tick, 500);
  }
  if (lockoutUntil > Date.now()) startLockout(Math.ceil((lockoutUntil - Date.now()) / 1000));
  document.getElementById('gateForm').addEventListener('submit', function (e) { e.preventDefault(); tryUnlock(); });
  var eyes = [document.getElementById('gateEye'), document.getElementById('gateEye2')];
  function setShown(show) { pw.type = show ? 'text' : 'password'; pw2.type = pw.type; eyes.forEach(function (b) { b.setAttribute('aria-pressed', show ? 'true' : 'false'); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }); }
  eyes[0].addEventListener('click', function () { setShown(pw.type === 'password'); pw.focus(); });
  eyes[1].addEventListener('click', function () { setShown(pw.type === 'password'); pw2.focus(); });
  // live checks under the boxes (only while choosing a password)
  (function () {
    var box = document.getElementById('gateBox'), a = document.getElementById('ghLen'), b = document.getElementById('ghMatch');
    function upd() {
      var on = box.classList.contains('changing'), min = parseInt((document.getElementById('giMinPw') || {}).textContent, 10) || 8;
      a.lastChild.textContent = 'At least ' + min + ' characters';
      a.classList.toggle('ok', on && pw.value.length >= min);
      b.classList.toggle('ok', on && pw2.value.length > 0 && pw.value === pw2.value);
    }
    pw.addEventListener('input', upd); pw2.addEventListener('input', upd);
    new MutationObserver(upd).observe(box, { attributes: true, attributeFilter: ['class'] });
  })();
  document.addEventListener('focusin', function (e) { if (locked && !gate.contains(e.target)) pw.focus(); });

  // ── idle tracking (also inside the iframes, which don't bubble events to this page) ──
  function resetIdle() { if (locked) return; clearTimeout(idleT); idleT = setTimeout(function () { lock('idle'); }, IDLE_MS); beat(false); }
  var EVTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'click', 'input'];
  function watch(doc) {
    if (!doc || doc.__gateWatched) return; doc.__gateWatched = true;
    EVTS.forEach(function (ev) { doc.addEventListener(ev, resetIdle, { passive: true, capture: true }); });
  }
  function watchPrint(win) {
    if (!win) return;
    try { if (win.__prW) return; win.__prW = true; win.addEventListener('beforeprint', function () { if (window.logPrint) window.logPrint(); }); } catch (e) {}
  }
  function watchFrames() {
    watch(document); watchPrint(window);
    ['f-registration', 'f-exam', 'f-log', 'f-analysis', 'f-legal', 'f-print'].forEach(function (id) {
      var f = document.getElementById(id); if (!f) return;
      try { watch(f.contentDocument); watchPrint(f.contentWindow); } catch (e) {}
      try { var inner = f.contentDocument && f.contentDocument.getElementById('slipFrame'); if (inner) { watch(inner.contentDocument); watchPrint(inner.contentWindow); } } catch (e) {}
    });
  }
  watchFrames(); setInterval(watchFrames, 1500);
  var lastActive = Date.now();
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastActive = Date.now(); }, true); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !locked && Date.now() - lastActive > IDLE_MS) lock('idle'); });

  // the navbar pill opens the account menu (js/profile.js); its Sign out item calls this
  window.sdSignOut = function () { lock('signout'); };

  // ── start-up ──
  var prev = readSession(), res = readResume(), ru = res && byId(res.uid);
  if (ru && ru.hash && Date.now() - (res.seen || 0) < IDLE_MS) {
    // Refresh inside the idle window: stay signed in, and bring the register back
    window.SD_USER = ru; locked = false; sessStart = res.start || Date.now(); lastBeat = 0;
    if (typeof window.logEvent === 'function') window.logEvent('resume', 'Page refreshed, session continued', ru);
    beat(true); updateChip(); gate.classList.remove('on'); setInert(false);
    try { if (window.restoreRegister) window.restoreRegister(); } catch (e) {}
    try { if (typeof renderLog === 'function') renderLog(); } catch (e) {}
    resetIdle();
  } else {
    if (prev && byId(prev.uid) && typeof window.logEvent === 'function') {
      window.logEvent('session', 'Window closed or refreshed without signing out', byId(prev.uid), new Date(prev.seen || Date.now()));
    }
    writeSession(null);
    lock();   // not signed in, or idle too long: locked
  }
})();
