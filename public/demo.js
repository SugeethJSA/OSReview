'use strict';
/* ============================================================================
   Smart Campus Access Control — client
   3D door stage · draggable access-matrix cube · particle background
   sound · toasts · install prompt · service worker
   ========================================================================== */

let S = null;
let sel = { persona: 'ravi', resource: 'serverroom', poolPersona: 'ananya' };
let busy = false;
let coverFilter = 'all';

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* Inline SVG icon from the sprite in index.html — replaces emoji everywhere. */
const ic = (name, cls = '') =>
  `<svg class="mi${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

async function api(path, body) {
  const r = await fetch(path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body) } : undefined);
  return r.json();
}
const refresh = async () => { S = await api('/api/state'); paint(); };
const personaOf = id => S.personas.find(p => p.id === id);

/* ============================ MODULE 5 COVERAGE ========================== */
const COVER = [
  { n:1,  t:'Access Matrix', d:'Student reads own grades; guest denied everything sensitive.', where:'Slide 8 is the matrix itself. The app runs a live lookup on every swipe.', badge:'demo' },
  { n:2,  t:'Multithreading', d:'Many swipes and logins handled at the same time.', where:'Each request is its own thread. Fire two swipes together and watch them interleave.', badge:'demo' },
  { n:3,  t:'Mutex', d:'The shared policy database is never read and written at once.', where:'Real lock in the server. Header chip shows FREE / HELD, and the "queued for mutex" step proves contention.', badge:'demo' },
  { n:4,  t:'Counting Semaphore', d:'Capacity is never exceeded.', where:'Exam room = 2, Server room = 1, GPU seats = 2. The counter is visible on Tab 3.', badge:'demo' },
  { n:5,  t:'Priority Scheduling', d:'Urgent requests served first, but nobody starves.', where:'P0 faculty/admin, P1 IT, P2 student, P3 guest, plus aging so a long wait lifts priority.', badge:'demo' },
  { n:6,  t:"Banker's Algorithm", d:'Safe allocation granted; unsafe allocation waits.', where:'Tab 3. Ananya (max 2 GPU) then Vikram (max 2 GPU) on a 2-seat pool = UNSAFE = WAIT.', badge:'demo' },
  { n:7,  t:'Domains of Protection', d:'A domain is a set of <object, rights> pairs.', where:'Each role is a domain. A process runs inside one domain and may only use what that domain allows.', badge:'slide' },
  { n:8,  t:'Capability-Based Systems', d:'Possessing the token IS the permission; must be unforgeable.', where:'The ID card is the capability. Revoked by expiry, blocked list, or changing the card key.', badge:'slide' },
  { n:9,  t:'ACL vs Capability', d:'ACL = column (easy to revoke). Capability = row (fast to check).', where:'Door controller holds the ACL; the card holds the capability. We use both on purpose.', badge:'slide' },
  { n:10, t:'Program Threats', d:'Trojan horse, trap door, logic bomb, buffer overflow, virus.', where:'A fake attendance app stealing passwords = trojan. A portal update with a hidden bypass = trap door.', badge:'qa' },
  { n:11, t:'Network Threats', d:'Sniffing, spoofing, MITM, replay, DoS, port scan, phishing.', where:'Cloned card = spoofing. Recorded card signal = replay. Flooding the LMS = DoS.', badge:'qa' },
  { n:12, t:'Cryptography as a Tool', d:'AES, RSA, SHA-256, digital signature, TLS, challenge-response.', where:'Challenge-response on every swipe means the key never travels and a replayed signal fails.', badge:'slide' },
  { n:13, t:'RAID Structure', d:'Redundancy so a disk failure does not lose data.', where:'Audit log on RAID 1 (mirrored) — losing a disk must never lose the evidence.', badge:'qa' },
  { n:14, t:'Disk Structure & Scheduling', d:'FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK.', where:'Results day writes thousands of grade records at once. The disk head is scheduled with SCAN/LOOK.', badge:'qa' },
  { n:15, t:'Need for Virtualization', d:'Isolation, consolidation, and control.', where:'Grades and Payroll run in separate VMs, so a compromise in the library portal cannot reach payroll.', badge:'slide' },
  { n:16, t:'Hypervisors & VM Architectures', d:'Type 1 (bare metal) vs Type 2 (hosted).', where:'Type 1 hypervisor sits directly on the campus server hardware and hosts each portal VM.', badge:'qa' },
  { n:17, t:'Para vs Full Virtualization', d:'Para needs a modified guest OS (faster). Full runs any unmodified OS (heavier).', where:'Paravirtualized drivers for the high-traffic LMS; full virtualization for legacy payroll software.', badge:'qa' },
  { n:18, t:'OS-Level Virtualization', d:'Containers share the kernel — lightweight isolation.', where:'Each door controller service runs as a container, so one faulty controller cannot take down the others.', badge:'qa' },
];

/* ===================== OS CONCEPTS COVERAGE (Tab 4 top) ====================
   The OS concepts sir expects us to demonstrate, plus the cross-module links
   (Modules 1 / 3 / 4) that earn marks. `src` = where it comes from.        */
const OS_CONCEPTS = [
  // --- the six core concepts (from the priority list) ---
  { t:'Access Matrix', src:'Module 5', status:'live',
    how:'Roles × resources grid on Tab 2. Student reads own grades, Guest is denied everywhere sensitive.' },
  { t:'Multithreading', src:'Module 5', status:'live',
    how:'Every swipe runs as its own thread. Fire several back-to-back and they interleave instead of queueing behind one another.' },
  { t:'Mutex', src:'Module 5', status:'live',
    how:'Real lock on the shared policy database. Header chip flips FREE → HELD, and a swipe can report "queued for the mutex".' },
  { t:'Counting Semaphore', src:'Module 5', status:'live',
    how:'Capacity enforced per pool — Server Room 1, Exam Room 2, GPU 2. Counters visible on Tab 3.' },
  { t:'Priority Scheduling', src:'Module 5', status:'live',
    how:'Queue sorts P0 (faculty/admin) → P3 (guest), FCFS inside a priority, aging so nobody starves.' },
  { t:"Banker's Algorithm", src:'Module 5', status:'live',
    how:'Full safety-sequence search. Ananya + Vikram both claiming 2 GPU seats on a 2-seat pool = UNSAFE = WAIT.' },

  // --- cross-module links: where the extra marks are ---
  { t:'Interrupt handling', src:'Module 1', status:'slides',
    how:'Card tap raises a hardware interrupt — shown as step 1 of every swipe.' },
  { t:'System call & kernel mode', src:'Module 1', status:'slides',
    how:'The controller asks the access service through a system call; the decision runs in kernel mode as the reference monitor.' },
  { t:'Dual-mode protection', src:'Module 1', status:'qa',
    how:'Privileged decision code is unreachable from user mode, so a student process cannot rewrite its own permissions.' },
  { t:'Readers–Writers problem', src:'Module 3', status:'live',
    how:'Many doors read the policy database while an admin writes it. The mutex is the fix — that is why step 3 exists.' },
  { t:'Race condition / TOCTOU', src:'Module 3', status:'live',
    how:'Lock is held across check AND use, so a permission cannot change between the lookup and the door opening.' },
  { t:'Deadlock avoidance', src:'Module 3', status:'live',
    how:'Banker\'s refuses an allocation that would leave no safe sequence — Tab 3, GPU demo.' },
  { t:'File permissions (rwx)', src:'Module 4', status:'qa',
    how:'Digital portals use owner/group/other rights; IT Admin gets config on Grades but never write on marks.' },
  { t:'Complete mediation', src:'Module 5', status:'live',
    how:'No door or portal is reached without passing the check — every attempt lands in the audit log.' },
];

const OS_STATUS = {
  live:  { label: 'DEMONSTRATED', cls: 'demo' },
  slides:{ label: 'ON SLIDES',    cls: 'slide' },
  qa:    { label: 'Q&A',          cls: 'qa' },
};

/* ================================ SOUND ================================= */
const Sound = {
  on: localStorage.getItem('rbac-sound') !== 'off',
  ctx: null,
  beep(freq, dur, type = 'sine', vol = .08, when = 0) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, c.currentTime + when);
      g.gain.linearRampToValueAtTime(vol, c.currentTime + when + .02);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + when + dur);
      o.connect(g); g.connect(c.destination);
      o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + .05);
    } catch (e) { /* audio unavailable */ }
  },
  tick()    { this.beep(880, .06, 'square', .03); },
  grant()   { this.beep(523, .12, 'sine', .09); this.beep(784, .18, 'sine', .09, .1); },
  deny()    { this.beep(220, .22, 'sawtooth', .06); this.beep(160, .28, 'sawtooth', .06, .12); },
  wait()    { this.beep(440, .14, 'triangle', .07); this.beep(440, .14, 'triangle', .07, .16); },
  ui()      { this.beep(660, .04, 'square', .02); },
};

/* Swap the sound button's icon without touching its id/event binding. */
function setSoundIcon(btn) {
  btn.innerHTML = ic(Sound.on ? 'vol' : 'vol-off');
  btn.setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
}

/* ================================ TOAST ================================= */
let toastT;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============================ PARTICLE BG =============================== */
(function particles() {
  const cv = $('#bg'), cx = cv.getContext('2d');
  let W, H, pts = [];
  const N = window.innerWidth < 700 ? 34 : 62;
  function size() {
    W = cv.width = innerWidth * devicePixelRatio;
    H = cv.height = innerHeight * devicePixelRatio;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  }
  size(); addEventListener('resize', size);
  for (let i = 0; i < N; i++) pts.push({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - .5) * .28 * devicePixelRatio,
    vy: (Math.random() - .5) * .28 * devicePixelRatio,
    r: (Math.random() * 1.4 + .5) * devicePixelRatio });
  (function loop() {
    cx.clearRect(0, 0, W, H);
    const LINK = 130 * devicePixelRatio;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }
    cx.lineWidth = devicePixelRatio * .6;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < LINK) {
        cx.strokeStyle = `rgba(79,140,255,${(1 - d / LINK) * .16})`;
        cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
      }
    }
    for (const p of pts) {
      cx.fillStyle = 'rgba(120,180,255,.55)';
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill();
    }
    requestAnimationFrame(loop);
  })();
})();

/* ============================== 3D DOOR ================================= */
const Door = {
  el: null, hint: null,
  init() {
    this.el = $('#door');
    this.hint = $('#stageHint');
    if (!this.el) console.warn('Door element missing');
  },
  reset() {
    if (!this.el) return;
    this.el.className = 'door';
    const plate = $('#doorPlate');
    if (plate) plate.textContent = 'LOCKED';
    const beam = $('#beam');
    if (beam) beam.style.opacity = '';
  },
  setSign(label, tier) {
    const sign = $('#doorSign');
    if (!sign) return;
    sign.textContent = label;
    sign.style.color = tier === 'critical' ? '#ff9c9c'
      : tier === 'restricted' ? '#ffd479' : '#7ef0a8';
  },
  cardTap() {
    const c = $('#swipeCard');
    if (!c) return;
    c.classList.remove('tap'); void c.offsetWidth; c.classList.add('tap');
  },
  grant() {
    if (!this.el) return;
    this.el.className = 'door open';
    const p = $('#doorPlate'); if (p) p.textContent = 'ACCESS GRANTED';
    if (this.hint) this.hint.innerHTML = ic('check') + ' Door unlocked — the reference monitor approved this role for this resource.';
  },
  deny() {
    if (!this.el) return;
    this.el.className = 'door locked shake';
    const p = $('#doorPlate'); if (p) p.textContent = 'ACCESS DENIED';
    if (this.hint) this.hint.innerHTML = ic('x') + ' Door stayed locked — empty cell in the matrix means denied by default.';
    setTimeout(() => { if (this.el) this.el.className = 'door locked'; }, 520);
  },
  wait() {
    if (!this.el) return;
    this.el.className = 'door wait';
    const p = $('#doorPlate'); if (p) p.textContent = 'PLEASE WAIT';
    if (this.hint) this.hint.innerHTML = ic('clock') + ' Authorised, but no slot free — the request sleeps on a condition variable.';
  },
};

/* ============================== CUBE 3D ================================= */
const Cube = {
  rx: -22, ry: 32, dragging: false, lx: 0, ly: 0, auto: true,
  el: null, faces: ['front', 'back', 'right', 'left', 'top', 'bottom'],
  init() {
    this.el = $('#cube3d');
    const stage = $('#cubeWrap');
    if (!this.el || !stage) { console.warn('cube element missing'); return; }
    const down = e => {
      this.dragging = false; this.auto = false;
      const t = e.touches ? e.touches[0] : e;
      this.lx = t.clientX; this.ly = t.clientY;
      e.preventDefault();
    };
    const move = e => {
      if (!this.auto && this.lx === 0) return;
      const t = e.touches ? e.touches[0] : e;
      if (this.lx === 0) { this.lx = t.clientX; this.ly = t.clientY; return; }
      this.ry += (t.clientX - this.lx) * .55;
      this.rx -= (t.clientY - this.ly) * .55;
      this.rx = Math.max(-80, Math.min(80, this.rx));
      this.lx = t.clientX; this.ly = t.clientY;
      this.render();
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { this.lx = 0; this.ly = 0; };
    stage.addEventListener('mousedown', down);
    stage.addEventListener('touchstart', down, { passive: false });
    addEventListener('mousemove', move);
    addEventListener('touchmove', move, { passive: false });
    addEventListener('mouseup', up);
    addEventListener('touchend', up);
    this.render();
    // gentle idle spin until the user grabs it
    const spin = () => {
      if (this.auto) { this.ry += .22; this.render(); }
      requestAnimationFrame(spin);
    };
    spin();
  },
  render() {
    this.el.style.transform = `rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
    this.paint();
  },
  paint() {
    if (!S || !this.el) return;
    const roles = Object.keys(S.roles);
    // faces map to roles (5 roles, 6th face = the resource header)
    this.faces.forEach((f, i) => {
      const face = this.el.querySelector('.' + f);
      if (i >= roles.length) {
        const cell = S.resources[sel.resource];
        face.innerHTML = `<div class="cube-face-title">${ic(cell.icon)} ${esc(cell.label)}</div>
          <div class="cube-face-role" style="font-size:11px;color:var(--dim)">${esc(cell.tier)} tier</div>
          <div class="cube-face-v" style="font-size:15px">${S.pools.includes(sel.resource) && cell.capacity ? cell.capacity + ' slots' : '—'}</div>`;
        return;
      }
      const role = roles[i], cell = S.matrix[role][sel.resource];
      const ok = !!cell;
      const right = ok ? cell.r + (cell.own ? ' own' : '') : 'denied';
      face.innerHTML = `<div class="cube-face-title">${esc(S.roles[role].label)}</div>
        <div class="cube-face-role">P${S.roles[role].priority}</div>
        <div class="cube-face-v ${ok ? 'y' : 'n'}">${ic(ok ? 'check' : 'x')}</div>
        <div class="cube-face-r ${ok ? 'y' : 'n'}">${esc(right)}</div>`;
    });
  },
};

/* ================================ PAINT ================================= */
function paint() {
  if (!S) return;
  const m = $('#mutexChip');
  m.querySelector('.dot').className = 'dot' + (S.mutex.locked ? ' red' : '');
  $('#mutexText').textContent = 'MUTEX ' + (S.mutex.locked ? 'HELD' : 'FREE');
  $('#queueText').textContent = 'QUEUE ' + S.queue.length;
  if (S.mutex.locked) { m.classList.add('hit'); } else { m.classList.remove('hit'); }

  paintPersona(); paintResource(); paintComparePicker(); paintLog();
  paintCompare(); paintPools(); paintPoolPersona(); paintQueue();
  paintSessions(); paintCover(); paintStats(); Cube.paint();
  if (!busy) updateDoorForSelection();
}

const rolePri = r => S.roles[r].priority;

function updateDoorForSelection() {
  const r = S.resources[sel.resource];
  Door.reset();
  Door.setSign(r.label, r.tier);
}

function paintPersona() {
  $('#personaPicker').innerHTML = S.personas.map(p => `
    <button data-p="${p.id}" class="${sel.persona === p.id ? 'sel' : ''}">
      <span class="who">${p.name}<span class="pri">P${rolePri(p.role)}</span></span>
      <span class="rl">${S.roles[p.role].label}</span>
    </button>`).join('');
  $('#poolPersona').innerHTML = S.personas.map(p => `
    <button data-pp="${p.id}" class="${sel.poolPersona === p.id ? 'sel' : ''}">
      <span class="who">${p.name}<span class="pri">P${rolePri(p.role)}</span></span>
    </button>`).join('');
}

function paintResource() {
  const role = personaOf(sel.persona).role;
  $('#resourcePicker').innerHTML = Object.entries(S.resources).map(([k, r]) => {
    const allowed = !!S.matrix[role][k];
    return `<button data-r="${k}" class="${sel.resource === k ? 'sel' : ''}">
      <span class="dot3 ${allowed ? 'y' : 'n'}"></span>
      <span class="ico">${ic(r.icon)}</span><span class="lbl">${r.label}</span>
      <span class="tier">${r.tier}</span></button>`;
  }).join('');
}

function paintComparePicker() {
  $('#comparePicker').innerHTML = Object.entries(S.resources).map(([k, r]) => `
    <button data-c="${k}" class="${sel.resource === k ? 'sel' : ''}">
      <span class="ico">${ic(r.icon)}</span><span class="lbl">${r.label}</span>
      <span class="tier">${r.tier}</span></button>`).join('');
}

function paintCompare() {
  const res = S.resources[sel.resource];
  $('#compareGrid').innerHTML = Object.keys(S.roles).map(role => {
    const cell = S.matrix[role][sel.resource];
    if (!cell) return `<div class="rcard no">
      <div class="nm">${S.roles[role].label}</div><div class="rl">P${S.roles[role].priority}</div>
      <div class="verdict">${ic('x')}</div><div class="right">DENIED</div>
      <div class="why">Empty cell in the matrix — denied by default</div></div>`;
    const right = cell.r + (cell.own ? ' (own only)' : '') + (cell.note ? ' — ' + cell.note : '');
    return `<div class="rcard yes">
      <div class="nm">${S.roles[role].label}</div><div class="rl">P${S.roles[role].priority}</div>
      <div class="verdict">${ic('check')}</div><div class="right">${esc(right.toUpperCase())}</div>
      <div class="why">Least privilege: exactly ${esc(res.label.toLowerCase())} and nothing more</div></div>`;
  }).join('');
}

function paintLog() {
  $('#logBody').innerHTML = S.log.length ? S.log.map(e => `
    <tr><td>${new Date(e.at).toLocaleTimeString()}</td><td>${esc(e.persona)}</td>
    <td>${esc(e.roleLabel)}</td><td>${esc(e.label)}</td>
    <td><span class="tag ${e.outcome}">${e.outcome === 'EXIT' ? ic('exit') : ''}${e.outcome}</span></td>
    <td style="color:var(--dim)">${esc(e.reason || '')}</td></tr>`).join('')
    : `<tr><td colspan="6" class="empty">No attempts yet — swipe a card on tab 1.</td></tr>`;
}

function paintStats() {
  const c = o => S.log.filter(e => e.outcome === o).length;
  $('#stats').innerHTML = `
    <span class="stat g">GRANT <b>${c('GRANT')}</b></span>
    <span class="stat w">WAIT <b>${c('WAIT')}</b></span>
    <span class="stat d">DENY <b>${c('DENY')}</b></span>
    <span class="stat c">MUTEX waits <b>${S.mutex.contention}</b></span>`;
}

/* ------------------------------ Tab 3 ---------------------------------- */
function paintPools() {
  const pools = S.pools.filter(p => S.resources[p].capacity != null);
  $('#poolGrid').innerHTML = pools.map(p => {
    const r = S.resources[p], used = S.used[p], cap = r.capacity;
    const holders = S.sessions.filter(s => s.pool === p);
    return `<div class="pool ${used >= cap ? 'full' : ''}">
      <div class="top"><span class="nm">${ic(r.icon)} ${esc(r.label)}</span>
        <span class="cnt">${used}/${cap}</span></div>
      <div class="bar">${Array.from({length: cap}, (_, i) =>
        `<i class="${i < used ? 'on' + (used >= cap ? ' full' : '') : ''}"></i>`).join('')}</div>
      <div class="holders">${holders.length ? holders.map(h => esc(h.persona)).join(', ') : 'free'}</div>
      ${r.banker ? `<span class="banker">${ic('bank')} Banker&rsquo;s guarded</span>` : `<span class="banker">${ic('sliders')} Semaphore only</span>`}
    </div>`;
  }).join('');

  const p = personaOf(sel.poolPersona);
  $('#poolRequest').innerHTML = pools.map(k => {
    const cell = S.matrix[p.role][k], max = p.maxClaims[k] || 0;
    const dis = !cell || max === 0;
    return `<button class="btn" data-req="${k}" ${dis ? 'disabled' : ''}>
      ${ic(S.resources[k].icon)} ${esc(S.resources[k].label)}
      <span class="sub">${!cell ? 'RBAC would deny' : max === 0 ? 'no declared claim' : 'max claim ' + max}</span>
    </button>`;
  }).join('');
}

function paintQueue() {
  const q = [...S.queue].sort((a, b) => a.eff - b.eff);
  $('#queueList').innerHTML = q.length ? q.map((w, i) => `
    <div class="qrow"><span class="pos">${i + 1}</span>
      <span class="who">${esc(w.persona)}</span><span class="arrow">→</span>${esc(w.label)}
      <span class="meta"><span class="pri-tag ${w.eff <= 1 ? 'hi' : ''}">P${w.eff}</span>
      waited ${Math.round((Date.now() - w.at) / 1000)}s${w.cycles ? ' · aged ×' + w.cycles : ''}</span></div>`).join('')
    : `<div class="empty">Nobody is waiting.</div>`;
}

function paintSessions() {
  $('#sessionList').innerHTML = S.sessions.length ? S.sessions.map(s => `
    <div class="qrow"><span class="who">${esc(s.persona)}</span><span class="arrow">→</span>
      ${ic(S.resources[s.pool].icon)} ${esc(S.resources[s.pool].label)}
      <span class="meta">${s.units > 1 ? s.units + ' units · ' : ''}${S.resources[s.pool].banker ? 'Banker\u2019s' : 'semaphore'}
      <button class="btn sm" data-rel="${s.id}">Release</button></span></div>`).join('')
    : `<div class="empty">No active sessions.</div>`;
}

/* ----------------------------- Tab 4 ----------------------------------- */
function paintCoverFilters() {
  const kinds = [['all', 'All 18 topics'], ['demo', 'Live in app'], ['slide', 'On slides'], ['qa', 'Q&A only']];
  $('#coverFilters').innerHTML = kinds.map(([k, l]) =>
    `<button data-f="${k}" class="${coverFilter === k ? 'on' : ''}">${l}</button>`).join('');
}
function paintCover() {
  paintCoverFilters();
  paintOsCoverage();
  const list = COVER.filter(c => coverFilter === 'all' || c.badge === coverFilter);
  $('#coverGrid').innerHTML = list.map((c, i) => `
    <div class="cov" style="animation-delay:${i * 26}ms">
      <div class="hd">
        <div><div class="n">TOPIC ${c.n}</div><div class="t">${esc(c.t)}</div></div>
        <span class="badge ${c.badge}">${c.badge === 'demo' ? 'LIVE' : c.badge === 'slide' ? 'SLIDES' : 'Q&A'}</span>
      </div>
      <div class="d">${esc(c.d)}</div>
      <div class="w"><b>Where:</b> ${esc(c.where)}</div>
    </div>`).join('');
}

/* OS-concept coverage strip: what we demonstrate, and which module it is from. */
function paintOsCoverage() {
  const host = $('#osGrid');
  if (!host) return;
  const live = OS_CONCEPTS.filter(c => c.status === 'live').length;
  const meter = $('#osMeter');
  if (meter) meter.innerHTML =
    `<span class="os-metric"><b>${live}</b>/${OS_CONCEPTS.length} demonstrated live</span>`;

  host.innerHTML = OS_CONCEPTS.map((c, i) => {
    const st = OS_STATUS[c.status];
    const isCore = c.src === 'Module 5' && c.status === 'live' && i < 6;
    return `<div class="os ${isCore ? 'core' : ''}" style="animation-delay:${i * 24}ms">
      <div class="os-hd">
        <span class="os-t">${esc(c.t)}</span>
        <span class="badge ${st.cls}">${st.label}</span>
      </div>
      <div class="os-src">${esc(c.src)}</div>
      <div class="os-how">${esc(c.how)}</div>
    </div>`;
  }).join('');
}

/* ================================ SWIPE ================================= */
const ICONS = { swipe:'card', crypto:'key', mutex:'lock', rbac:'grid', queue:'list',
  threads:'threads', banker:'bank', sem:'sliders', grant:'check', wait:'clock', deny:'x' };

async function doSwipe() {
  if (busy || !S) return;
  busy = true;
  const btn = $('#swipeBtn'); btn.disabled = true;
  btn.querySelector('.lbl').textContent = 'Processing…';
  $('#outcome').className = 'outcome hidden';
  $('#steps').innerHTML = '';
  Door.reset(); Door.cardTap(); Sound.tick();

  try {
    const out = await api('/api/swipe', {
      personaId: sel.persona, resourceId: sel.resource,
      emergency: $('#emergencyToggle').checked });

    for (const st of out.steps) {
      const div = document.createElement('div');
      div.className = 'step ' + (st.status || '');
      div.innerHTML = `<div class="ico">${ic(ICONS[st.key] || 'list')}</div><div>
        <b>${esc(st.title)}</b><small>${esc(st.plain)}</small>
        ${st.os ? `<span class="os">${esc(st.os)}</span>` : ''}</div>`;
      $('#steps').appendChild(div);
      Sound.tick();
      await new Promise(r => setTimeout(r, Math.min(st.ms || 300, 460)));
    }

    const cls = out.outcome === 'GRANT' ? 'ok' : out.outcome === 'WAIT' ? 'warn' : 'fail';
    const oc = $('#outcome');
    oc.className = 'outcome ' + cls;
    oc.innerHTML = `<b>${out.outcome}</b> — ${esc(out.reason || '')}${
      out.outcome === 'WAIT' ? '<small>The request sleeps on a condition variable and wakes when a slot is released.</small>'
      : out.outcome === 'DENY' ? '<small>Denied by default. The attempt is still written to the audit log.</small>'
      : '<small>Slot granted and recorded in the audit trail.</small>'}`;

    if (out.outcome === 'GRANT') { Door.grant(); Sound.grant(); }
    else if (out.outcome === 'WAIT') { Door.wait(); Sound.wait(); }
    else { Door.deny(); Sound.deny(); }
    toast(`${personaOf(sel.persona).name} → ${S.resources[sel.resource].label}: ${out.outcome}`,
      out.outcome === 'GRANT' ? 'ok' : out.outcome === 'WAIT' ? 'warn' : 'bad');

    S = out.state; paint();
  } catch (e) {
    toast('Server error: ' + e.message, 'bad');
  } finally {
    busy = false; btn.disabled = false;
    btn.querySelector('.lbl').textContent = 'Swipe Card';
  }
}

/* ============================== EVENTS ================================== */
document.addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.dataset.tab) {
    $$('.tab').forEach(b => b.classList.toggle('active', b === t));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
    Sound.ui(); return;
  }
  if (t.dataset.f)  { coverFilter = t.dataset.f; paintCover(); Sound.ui(); return; }
  if (t.dataset.p)  { sel.persona = t.dataset.p; Sound.ui(); paint(); return; }
  if (t.dataset.r)  { sel.resource = t.dataset.r; Sound.ui(); paint(); return; }
  if (t.dataset.c)  { sel.resource = t.dataset.c; Sound.ui(); paint(); return; }
  if (t.dataset.pp) { sel.poolPersona = t.dataset.pp; Sound.ui(); paint(); return; }
  if (t.id === 'swipeBtn') return doSwipe();

  if (t.id === 'resetBtn') {
    await api('/api/reset', {});
    await refresh();
    Door.reset();
    $('#steps').innerHTML = `<div class="step idle"><div class="ico">⏳</div>
      <div><b>Reset — waiting for a swipe</b></div></div>`;
    $('#outcome').className = 'outcome hidden';
    $('#poolOutcome').className = 'outcome hidden';
    toast('System reset'); Sound.ui(); return;
  }
  if (t.id === 'soundBtn') {
    Sound.on = !Sound.on;
    localStorage.setItem('rbac-sound', Sound.on ? 'on' : 'off');
    setSoundIcon(t);
    if (Sound.on) Sound.ui();
    toast('Sound ' + (Sound.on ? 'on' : 'off')); return;
  }

  if (t.dataset.req) {
    if (busy) return; busy = true; t.disabled = true;
    const out = await api('/api/swipe', { personaId: sel.poolPersona, resourceId: t.dataset.req, emergency:false });
    S = out.state; paint(); busy = false; t.disabled = false;
    const oc = $('#poolOutcome');
    const cls = out.outcome === 'GRANT' ? 'ok' : out.outcome === 'WAIT' ? 'warn' : 'fail';
    oc.className = 'outcome ' + cls;
    oc.innerHTML = `<b>${out.outcome}</b> — ${esc(out.reason || '')}`;
    if (out.outcome === 'GRANT') Sound.grant();
    else if (out.outcome === 'WAIT') Sound.wait();
    else Sound.deny();
    toast(`${personaOf(sel.poolPersona).name}: ${out.outcome}`,
      out.outcome === 'GRANT' ? 'ok' : out.outcome === 'WAIT' ? 'warn' : 'bad');
    return;
  }
  if (t.dataset.rel) {
    await api('/api/release', { sessionId: Number(t.dataset.rel) });
    await refresh(); Sound.ui();
    toast('Slot released — queue re-checked'); return;
  }
});

/* keyboard shortcuts */
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  const tabs = ['sim', 'compare', 'queue', 'cover'];
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabs[n - 1]));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabs[n - 1]));
    Sound.ui();
  }
  if (e.key === 's' || e.key === 'S') {
    const sim = $('#tab-sim');
    if (sim.classList.contains('active')) doSwipe();
  }
});

setInterval(() => { if (S && !busy) paintQueue(); }, 1000);

/* ============================ PWA + BOOT =============================== */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let deferredPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const b = $('#installBtn'); b.hidden = false;
  b.onclick = async () => {
    b.hidden = true; deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    toast(outcome === 'accepted' ? 'Installing app…' : 'Install dismissed');
    deferredPrompt = null;
  };
});

(async function boot() {
  try {
    // Init the 3D components FIRST — paint() touches them.
    Door.init();
    Cube.init();
    await refresh();
    $('#soundBtn') && setSoundIcon($('#soundBtn'));
    $('#steps').innerHTML = `<div class="step idle"><div class="ico">⏳</div>
      <div><b>Waiting for a swipe</b><small>Every request passes through all seven stages.</small></div></div>`;
    const q = new URLSearchParams(location.search).get('tab');
    if (q) {
      $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === q));
      $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + q));
    }
  } catch (e) {
    console.error('boot error:', e);
    toast('Startup problem: ' + e.message, 'bad');
    // try once more after a beat — a transient fetch failure shouldn't lock the app
    setTimeout(() => refresh().catch(() => {}), 900);
  } finally {
    // ALWAYS dismiss the boot screen, whatever happened above.
    setTimeout(() => $('#boot').classList.add('gone'), 700);
  }
})();
