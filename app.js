'use strict';
/* ============================================================================
   SMART CAMPUS ACCESS CONTROL — demo server (zero dependencies)
   ----------------------------------------------------------------------------
   This is NOT a mock-up. Every check below is implemented for real:

     RBAC ............ access-matrix lookup (Slide 8) + default deny
     Mutex ........... a real async lock: only one thread touches the
                       shared policy database at a time
     Semaphore ....... counting slots on doors and resource pools
     Priority sched .. queue order P0 (highest) .. P3, FCFS inside a priority,
                       with aging so nobody starves
     Banker's Alg .... real safety-sequence check before granting a bounded
                       resource that has known maximum claims

   Run:   node app.js      then open  http://localhost:3000
   ========================================================================== */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

/* ============================ 1. POLICY DATA ============================= */

// Roles are the "domains of protection" — each is a set of rights.
const ROLES = {
  student: { label: 'Student',        priority: 2, blurb: 'Undergraduates & graduate researchers' },
  faculty: { label: 'Faculty',        priority: 0, blurb: 'Professors who teach and grade' },
  admin:   { label: 'Admin Staff',    priority: 0, blurb: 'Accounts, HR, admissions, exam cell' },
  itadmin: { label: 'IT Admin',       priority: 1, blurb: 'System & network administrators' },
  guest:   { label: 'Guest',          priority: 3, blurb: 'Visitors and event attendees' },
};

// Objects. capacity === null  ->  unlimited (no queueing).
// banker: true  ->  Banker's Algorithm guards this pool.
// `icon` names a symbol from the SVG sprite in index.html (no emoji anywhere).
const RESOURCES = {
  classroom:   { label: 'Classroom',        kind: 'door',   capacity: null, tier: 'public',     icon: 'board' },
  library:     { label: 'Library',          kind: 'door',   capacity: null, tier: 'public',     icon: 'book' },
  examroom:    { label: 'Exam Room',        kind: 'door',   capacity: 2,    tier: 'restricted', icon: 'file' },
  serverroom:  { label: 'Server Room',      kind: 'door',   capacity: 1,    tier: 'critical',   icon: 'server' },
  grades:      { label: 'Grades Portal',    kind: 'portal', capacity: 3,    tier: 'high',       icon: 'chart', banker: true },
  payroll:     { label: 'Payroll Portal',   kind: 'portal', capacity: 2,    tier: 'critical',   icon: 'wallet', banker: true },
  lms:         { label: 'LMS',              kind: 'portal', capacity: 4,    tier: 'low',        icon: 'cap', banker: true },
  gpu:         { label: 'GPU Seats',        kind: 'lab',    capacity: 2,    tier: 'restricted', icon: 'chip', banker: true },
  lab:         { label: 'Lab Compute Slots',kind: 'lab',    capacity: 3,    tier: 'restricted', icon: 'flask', banker: true },
  software:    { label: 'Licensed Software',kind: 'lab',    capacity: 4,    tier: 'low',        icon: 'disc', banker: true },
  testconsole: { label: 'Admin Test Console',kind:'lab',    capacity: 1,    tier: 'critical',   icon: 'terminal', banker: true },
};

// THE ACCESS MATRIX (Slide 8).  rows = roles (domains),  columns = objects.
// null  ->  no right at all  =>  denied by default.
const MATRIX = {
  student: {
    classroom:{r:'enter'}, library:{r:'enter'}, examroom:null, serverroom:null,
    grades:{r:'read',own:true}, payroll:null, lms:{r:'read'},
    gpu:{r:'enter'}, lab:{r:'enter'}, software:{r:'enter'}, testconsole:null,
  },
  faculty: {
    classroom:{r:'enter'}, library:{r:'enter'}, examroom:{r:'enter'}, serverroom:null,
    grades:{r:'write'}, payroll:{r:'read',own:true}, lms:{r:'write'},
    gpu:{r:'enter'}, lab:{r:'enter'}, software:{r:'enter'}, testconsole:null,
  },
  admin: {
    classroom:{r:'enter'}, library:{r:'enter'}, examroom:{r:'enter'}, serverroom:null,
    grades:{r:'read'}, payroll:{r:'manage'}, lms:{r:'read'},
    gpu:null, lab:null, software:{r:'enter'}, testconsole:null,
  },
  itadmin: {
    classroom:{r:'enter'}, library:{r:'enter'}, examroom:null, serverroom:{r:'enter'},
    grades:{r:'config'}, payroll:{r:'config'}, lms:{r:'config'},
    gpu:{r:'enter'}, lab:{r:'enter'}, software:{r:'enter'}, testconsole:{r:'enter'},
  },
  guest: {
    classroom:{r:'enter',note:'Escorted'}, library:{r:'enter',note:'Limited'}, examroom:null, serverroom:null,
    grades:null, payroll:null, lms:null,
    gpu:null, lab:null, software:null, testconsole:null,
  },
};

// People. maxClaims = the declared MAXIMUM each may hold at one time on a
// bounded pool.  Banker's Algorithm needs this number to reason about safety.
const PERSONAS = [
  { id:'ravi',   name:'Ravi',      role:'student', maxClaims:{ grades:1, lms:2, gpu:1, lab:1, software:2 } },
  { id:'ananya', name:'Ananya',    role:'student', note:'Graduate researcher',
    maxClaims:{ grades:1, lms:2, gpu:2, lab:2, software:2 } },
  { id:'kiran',  name:'Kiran',     role:'student', maxClaims:{ grades:1, lms:2, gpu:1, lab:1, software:2 } },
  { id:'meera',  name:'Dr. Meera', role:'faculty', maxClaims:{ grades:2, lms:2, gpu:1, lab:1, software:1 } },
  { id:'sameer', name:'Prof. Sameer', role:'faculty', maxClaims:{ grades:2, lms:2, gpu:1, lab:1, software:1 } },
  { id:'arjun',  name:'Arjun',     role:'admin',   maxClaims:{ grades:1, payroll:2, lms:1, software:1 } },
  { id:'vikram', name:'Vikram',    role:'itadmin', maxClaims:{ grades:1, payroll:1, lms:2, gpu:2, lab:1, software:2, testconsole:1 } },
  { id:'neha',   name:'Neha',      role:'itadmin', maxClaims:{ grades:1, payroll:1, lms:2, gpu:2, lab:1, software:2, testconsole:1 } },
  { id:'guest1', name:'Guest',     role:'guest',   maxClaims:{ lms:1 } },
];

const ALL_POOLS    = Object.keys(RESOURCES);
const BANKER_POOLS = ALL_POOLS.filter(p => RESOURCES[p].banker);

const personaOf = id => PERSONAS.find(p => p.id === id);

/* ========================= 2. SYNCHRONISATION ============================ */

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A genuine mutual-exclusion lock. Threads line up on `waiters` and only one
// may hold it — exactly the critical section that guards the policy database.
class Mutex {
  constructor() { this._locked = false; this._waiters = []; this.contention = 0; }
  get locked() { return this._locked; }
  get queued() { return this._waiters.length; }
  acquire() {
    return new Promise(resolve => {
      const attempt = () => {
        if (!this._locked) { this._locked = true; resolve(); }
        else { this.contention++; this._waiters.push(attempt); }
      };
      attempt();
    });
  }
  release() {
    const next = this._waiters.shift();
    if (next) next();          // hand the lock straight to the next thread
    else this._locked = false;
  }
}

/* ============================ 3. THE SYSTEM ============================== */

class CampusSystem {
  constructor() {
    this.sessions = [];   // active grants — the ground truth for slot usage
    this.queue    = [];   // requests that were told to WAIT
    this.auditLog = [];   // every attempt, granted or not
    this.mutex    = new Mutex();
    this._sid     = 0;
    this._gid     = 0;
  }

  /* ---- how many units of a pool are in use right now ---- */
  unitsUsed(pool) {
    return this.sessions.filter(s => s.pool === pool)
                        .reduce((n, s) => n + s.units, 0);
  }
  unitsAvailable(pool) {
    const cap = RESOURCES[pool].capacity;
    return cap == null ? Infinity : cap - this.unitsUsed(pool);
  }

  /* ---- build the process table Banker's needs (alloc per persona) ---- */
  buildProcesses(extra) {
    const map = {};
    for (const s of this.sessions) {
      const p = personaOf(s.personaId);
      map[s.personaId] = map[s.personaId] ||
        { id: s.personaId, name: p.name, alloc: {}, max: p.maxClaims };
      map[s.personaId].alloc[s.pool] = (map[s.personaId].alloc[s.pool] || 0) + s.units;
    }
    if (extra) {
      const p = personaOf(extra.personaId);
      map[extra.personaId] = map[extra.personaId] ||
        { id: extra.personaId, name: p.name, alloc: {}, max: p.maxClaims };
      map[extra.personaId].alloc[extra.pool] =
        (map[extra.personaId].alloc[extra.pool] || 0) + extra.units;
    }
    return Object.values(map);
  }

  /* ---- the real Banker's safety algorithm ---- */
  safetySequence(processes, available) {
    const work = {};
    for (const pool of ALL_POOLS) work[pool] = available[pool] || 0;
    const finish = {};
    processes.forEach(p => finish[p.id] = false);
    const order = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (const p of processes) {
        if (finish[p.id]) continue;
        const canFinish = ALL_POOLS.every(pool =>
          ((p.max[pool] || 0) - (p.alloc[pool] || 0)) <= (work[pool] || 0));
        if (canFinish) {
          for (const pool of ALL_POOLS) work[pool] += (p.alloc[pool] || 0);
          finish[p.id] = true;
          order.push(p.name);
          progress = true;
        }
      }
    }
    return Object.values(finish).every(Boolean) ? order : null;  // null = unsafe
  }

  /* ---- would granting 1 more unit to this persona keep us safe? ---- */
  bankerCheck(persona, pool) {
    const max = persona.maxClaims[pool] || 0;
    if (max === 0)
      return { grant:false, kind:'noclaim',
               reason:`${persona.name} has no declared maximum claim on ${RESOURCES[pool].label}.` };

    const held = this.sessions
      .filter(s => s.personaId === persona.id && s.pool === pool)
      .reduce((n, s) => n + s.units, 0);

    if (held + 1 > max)
      return { grant:false, kind:'atmax',
               reason:`Already holding the declared maximum of ${max}.` };

    if (this.unitsAvailable(pool) < 1)
      return { grant:false, kind:'full',
               reason:`All ${RESOURCES[pool].capacity} slots are busy.` };

    const available = {};
    for (const p of ALL_POOLS) available[p] = this.unitsAvailable(p);
    available[pool] -= 1;

    const seq = this.safetySequence(
      this.buildProcesses({ personaId: persona.id, pool, units: 1 }), available);

    if (!seq)
      return { grant:false, kind:'unsafe',
               reason:'Granting this would put the system in an UNSAFE state — deadlock could follow later.' };
    return { grant:true, kind:'banker', seq };
  }

  /* ---- decide. 1 = RBAC, 2 = capacity, 3 = safety ---- */
  evaluate(personaId, resourceId, emergency) {
    const persona = personaOf(personaId);
    const cell    = MATRIX[persona.role][resourceId];

    if (emergency) return { grant:true, kind:'emergency' };

    // 1. RBAC — default deny
    if (!cell) return { grant:false, kind:'denyrbac',
      reason:`${ROLES[persona.role].label} is not in ${RESOURCES[resourceId].label}'s column — denied by default.` };

    const res = RESOURCES[resourceId];
    if (res.capacity == null) return { grant:true, kind:'unlimited', right:cell };

    // 2 & 3. bounded pool
    if (res.banker) {
      const r = this.bankerCheck(persona, resourceId);
      return Object.assign({ right:cell }, r);
    }
    // plain counting semaphore
    if (this.unitsAvailable(resourceId) < 1)
      return { grant:false, kind:'full', right:cell,
               reason:`Only ${res.capacity} people allowed inside at once — semaphore is 0.` };
    return { grant:true, kind:'semaphore', right:cell };
  }

  /* ---- actually take the slot ---- */
  commit(personaId, pool, units) {
    const existing = this.sessions.find(s => s.personaId === personaId && s.pool === pool);
    if (existing) existing.units += units;
    else this.sessions.push({ id: ++this._sid, personaId, pool, units, at: Date.now() });
  }

  /* ---- write to the audit log ---- */
  record(personaId, pool, outcome, reason) {
    this.auditLog.unshift({
      id: ++this._gid, at: Date.now(), personaId, role: personaOf(personaId).role,
      pool, outcome, reason,
    });
    if (this.auditLog.length > 60) this.auditLog.pop();
  }

  /* ---- effective priority with aging (no starvation) ---- */
  effPriority(w) {
    return Math.max(0, personaOf(w.personaId).role === 'emergency' ? 0
      : ROLES[personaOf(w.personaId).role].priority - Math.floor(w.cycles / 2));
  }

  /* ---- when a slot frees up, wake the queue in priority order ---- */
  wakeQueue() {
    if (!this.queue.length) return [];
    this.queue.forEach(w => w.cycles++);
    this.queue.sort((a, b) => this.effPriority(a) - this.effPriority(b) || a.at - b.at);
    const stillWaiting = [];
    const woken = [];
    for (const w of this.queue) {
      const verdict = this.evaluate(w.personaId, w.resourceId, false);
      if (verdict.grant) {
        this.commit(w.personaId, w.resourceId, 1);
        this.record(w.personaId, w.resourceId, 'GRANT',
          `Woke from queue — slot released (waited ${Math.round((Date.now() - w.at) / 100) / 10}s)`);
        woken.push(w);
      } else stillWaiting.push(w);
    }
    this.queue = stillWaiting;
    return woken;
  }

  release(sessionId) {
    const i = this.sessions.findIndex(s => s.id === sessionId);
    if (i < 0) return { ok:false };
    const [s] = this.sessions.splice(i, 1);
    const persona = personaOf(s.personaId);
    this.record(s.personaId, s.pool, 'EXIT', `${persona.name} released the slot`);
    const woken = this.wakeQueue();
    return { ok:true, session:s, woken };
  }

  reset() {
    this.sessions = []; this.queue = []; this.auditLog = [];
    this.mutex = new Mutex(); this._sid = 0; this._gid = 0;
  }

  /* ---- everything the browser needs ---- */
  snapshot() {
    return {
      roles: ROLES, resources: RESOURCES, matrix: MATRIX,
      personas: PERSONAS, pools: ALL_POOLS, bankerPools: BANKER_POOLS,
      sessions: this.sessions.map(s => ({ ...s, persona: personaOf(s.personaId).name })),
      queue: this.queue.map(w => ({
        ...w, persona: personaOf(w.personaId).name,
        role: personaOf(w.personaId).role,
        label: RESOURCES[w.resourceId].label,
        eff: this.effPriority(w),
      })),
      log: this.auditLog.map(e => ({
        ...e, persona: personaOf(e.personaId).name,
        label: RESOURCES[e.pool].label,
        roleLabel: e.role === 'emergency' ? 'EMERGENCY' : ROLES[e.role].label,
      })),
      mutex: { locked: this.mutex.locked, waiting: this.mutex.queued, contention: this.mutex.contention },
      used: Object.fromEntries(ALL_POOLS.map(p => [p, this.unitsUsed(p)])),
      available: Object.fromEntries(ALL_POOLS.map(p => [p,
        this.unitsAvailable(p) === Infinity ? null : this.unitsAvailable(p)])),
    };
  }
}

const sys = new CampusSystem();

/* ======================= 4. THE SWIPE ORCHESTRATION ====================== */
// Narrates the decision as visible steps while genuinely holding the mutex.

async function runSwipe(personaId, resourceId, emergency) {
  const persona = personaOf(personaId);
  const res     = RESOURCES[resourceId];
  const steps   = [];
  // Server sleeps briefly (real mutex contention still happens); the browser
  // replays the recorded `ms` values at a readable pace while the speaker talks.
  const push    = async (o) => { steps.push(o); await sleep(Math.round((o.ms || 350) * 0.2)); return o; };

  await push({ key:'swipe', title:'Card tapped on the reader',
    plain:`${persona.name} taps their campus ID at the ${res.label}`,
    os:'Hardware interrupt raised → driver hands request to the kernel', ms:420 });

  await push({ key:'crypto', title:'Challenge–response verified',
    plain:'The card proves it holds the secret key without ever sending the key',
    os:'Authentication — a recorded signal cannot be replayed', ms:460 });

  // --- mutual exclusion: only one thread may consult the policy database ---
  const contended = sys.mutex.locked;
  await sys.mutex.acquire();
  await push({ key:'mutex', title:'Policy database lock acquired',
    plain: contended
      ? `Another request was inside the critical section — this thread queued for the mutex`
      : 'No contention, the lock was free',
    os:'Mutex / critical section — prevents a race condition on the policy data', ms:400 });

  let verdict;
  try {
    await push({ key:'rbac', title:'RBAC lookup in the access matrix',
      plain:`Reading the "${ROLES[persona.role].label}" row and the "${res.label}" column`,
      os:'Authorization — complete mediation on every single request', ms:420 });

    verdict = sys.evaluate(personaId, resourceId, emergency);

    if (!verdict.grant && verdict.kind === 'denyrbac') {
      steps.push({ key:'deny', title:'DENIED', status:'fail',
        plain: verdict.reason,
        os:'Default deny · least privilege — an empty cell means no access' });
      sys.record(personaId, resourceId, 'DENY', verdict.reason);
      return { steps, outcome:'DENY', reason: verdict.reason, state: sys.snapshot() };
    }

    // Permission exists — now check capacity and (for bounded pools) safety.
    if (verdict.kind !== 'unlimited') {
      await push({ key:'queue', title:'Queued by priority',
        plain:`Priority P${ROLES[persona.role].priority} for this role; first-come-first-served inside the same priority, with aging`,
        os:'Priority scheduling + FCFS — urgent requests go first, nobody starves', ms:380 });

      if (sys.mutex.queued || contended)
        await push({ key:'threads', title:'Concurrent requests handled by threads',
          plain:'Other swipes are being served in parallel by other threads',
          os:'Multithreading — each request is its own thread', ms:300 });
    }

    if (verdict.kind === 'full') {
      steps.push({ key:'wait', title:'WAIT', status:'warn',
        plain: verdict.reason,
        os:'Counting semaphore = 0 — the request sleeps on a condition variable' });
      sys.queue.push({ personaId, resourceId, at: Date.now(), cycles: 0 });
      sys.record(personaId, resourceId, 'WAIT', verdict.reason);
      return { steps, outcome:'WAIT', reason: verdict.reason, state: sys.snapshot() };
    }

    if (verdict.kind === 'atmax' || verdict.kind === 'noclaim') {
      steps.push({ key:'wait', title:'WAIT', status:'warn',
        plain: verdict.reason,
        os:'Banker\'s Algorithm — a process may never exceed its declared maximum' });
      sys.queue.push({ personaId, resourceId, at: Date.now(), cycles: 0 });
      sys.record(personaId, resourceId, 'WAIT', verdict.reason);
      return { steps, outcome:'WAIT', reason: verdict.reason, state: sys.snapshot() };
    }

    if (verdict.kind === 'unsafe') {
      await push({ key:'banker', title:'Banker\'s safety test failed',
        plain:'No safe sequence exists if this grant is made — some user could later be stuck forever',
        os:'Deadlock avoidance — refuse now rather than risk deadlock later', ms:520 });
      steps.push({ key:'wait', title:'WAIT', status:'warn',
        plain: verdict.reason, os:'Unsafe state ⇒ do not allocate' });
      sys.queue.push({ personaId, resourceId, at: Date.now(), cycles: 0 });
      sys.record(personaId, resourceId, 'WAIT', verdict.reason);
      return { steps, outcome:'WAIT', reason: verdict.reason, state: sys.snapshot() };
    }

    if (verdict.kind === 'banker') {
      await push({ key:'banker', title:'Banker\'s safety test passed',
        plain:`A safe sequence exists: ${verdict.seq.join(' → ')} — everyone can still finish`,
        os:'Safe state ⇒ allocation cannot lead to deadlock', ms:520 });
    }

    if (verdict.kind === 'semaphore' || verdict.kind === 'unlimited') {
      if (verdict.kind === 'semaphore')
        await push({ key:'sem', title:'Slot taken from the semaphore',
          plain:`${sys.unitsAvailable(resourceId)} of ${res.capacity} slots still free`,
          os:'Counting semaphore decremented — capacity is enforced', ms:360 });
    }

    sys.commit(personaId, resourceId, 1);
    const rightLabel = emergency ? 'break-glass override'
      : (verdict.right ? verdict.right.r + (verdict.right.note ? ` (${verdict.right.note})` : '') : 'enter');
    steps.push({ key:'grant', title:'GRANTED', status:'ok',
      plain: emergency
        ? 'Emergency override used — allowed immediately, but everything about it is recorded'
        : `${persona.name} may use the ${res.label}. Right held: ${rightLabel}`,
      os: emergency ? 'Break-glass access — always logged and reviewed afterwards'
                    : 'Access granted · full audit trail written' });
    sys.record(personaId, resourceId, 'GRANT',
      emergency ? 'Emergency break-glass override' : `Right: ${rightLabel}`);
    return { steps, outcome:'GRANT', reason: emergency ? 'Emergency override' : `Right: ${rightLabel}`,
             state: sys.snapshot() };
  } finally {
    sys.mutex.release();
  }
}

/* ============================ 5. HTTP SERVER ============================= */

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
               '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon',
               '.json':'application/json', '.webmanifest':'application/manifest+json' };

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/api/state')
      return json(res, 200, sys.snapshot());

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const log = sys.auditLog;
      const count = o => log.filter(e => e.outcome === o).length;
      return json(res, 200, {
        grant: count('GRANT'), wait: count('WAIT'), deny: count('DENY'), exit: count('EXIT'),
        total: log.length, queue: sys.queue.length, sessions: sys.sessions.length,
        contention: sys.mutex.contention,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/log.csv') {
      const rows = [['Time','Person','Role','Resource','Result','Reason']];
      for (const e of sys.auditLog)
        rows.push([ new Date(e.at).toISOString(), personaOf(e.personaId).name,
          e.role === 'emergency' ? 'EMERGENCY' : ROLES[e.role].label,
          RESOURCES[e.pool].label, e.outcome, (e.reason || '').replace(/"/g, "'") ]);
      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="campus-audit-log.csv"' });
      return res.end(csv);
    }

    if (req.method === 'POST' && url.pathname === '/api/swipe') {
      const b = await readBody(req);
      const out = await runSwipe(b.personaId, b.resourceId, !!b.emergency);
      return json(res, 200, out);
    }

    if (req.method === 'POST' && url.pathname === '/api/release') {
      const b = await readBody(req);
      const r = sys.release(b.sessionId);
      return json(res, r.ok ? 200 : 404, { ...r, state: sys.snapshot() });
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      sys.reset();
      return json(res, 200, { ok:true, state: sys.snapshot() });
    }

    // static files
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(__dirname, 'public', file);
    if (!full.startsWith(path.join(__dirname, 'public')))
      { res.writeHead(403); return res.end('Forbidden'); }

    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type':'text/plain' }); return res.end('Not found'); }
      // Always revalidate — stale JS/CSS during a demo is misery.
      const isHTML = path.extname(full) === '.html';
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
        'Cache-Control': isHTML ? 'no-store' : 'no-cache, must-revalidate',
      });
      res.end(buf);
    });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e && e.message || e) });
  }
});

const os = require('os');

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const lan = [];
  for (const name of Object.keys(nets))
    for (const n of nets[name] || [])
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address);

  console.log('\n  Smart Campus Access Control — live demo');
  console.log('  On THIS computer:   http://localhost:' + PORT);
  if (lan.length)
    console.log('  On SAME network:    ' + lan.map(ip => 'http://' + ip + ':' + PORT).join('\n                       '));
  console.log('\n  Press F11 in the browser for fullscreen during the demo.\n');
});
