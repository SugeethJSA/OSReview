# Smart Campus Access Control — Live Demo

Group 10 · BACSE106 · Module 5: Security, Protection & Virtualization

## Run it

```
node app.js
```

Open **http://localhost:3000** and press **F11** for fullscreen.
No `npm install` — this uses only Node's built-in modules. Works offline.

---

## 5-minute demo script

### Tab 1 — Live Simulation (the money slide)

**Show RBAC + default deny (Access Matrix):**
1. Pick **Ravi (Student)** → **Server Room** → Swipe
2. Watch it die at step 3. Result: **DENY**
3. Say: *"The access matrix has an empty cell where Student meets Server Room. Empty cell = denied by default. Least privilege."*

**Show a successful grant with audit trail:**
1. Pick **Ravi (Student)** → **Grades Portal** → Swipe
2. Result: **GRANT**, right held = `read (own only)`
3. Say: *"Students read their own grades and nothing else. Every attempt — allowed or not — lands in the audit log below."*

**Show concurrency + the mutex (fire several at once):**
1. Rapidly click Swipe 3–4 times with different people
2. Point at the **MUTEX** chip in the header flipping to `HELD`
3. Say: *"Each request is its own thread. They all need the shared policy database, so a mutex lets exactly one in at a time — that's what stops a race condition."*

**Show break-glass (Slide 7):**
1. Tick **Emergency override** → pick anyone → **Server Room** → Swipe
2. Result: **GRANT** but flagged as override
3. Say: *"Emergency access is allowed immediately — but it's loudly logged and reviewed afterwards. Every exception has an expiry and a record."*

---

### Tab 2 — Role Comparison (Slide 8, alive)

1. Click **Server Room** → only IT Admin is allowed; everyone else denied
2. Click **Payroll Portal** → only Admin Staff is allowed
3. Click **Grades Portal** → Student `read (own only)`, Faculty `write`, IT Admin `config` (not write!)
4. Say: *"Read across a row, that's a capability list. Read down a column, that's an ACL. And notice IT Admin can CONFIGURE the grades system but cannot WRITE marks — that's separation of duties."*

---

### Tab 3 — Resource Queue (Semaphore + Priority + Banker's)

**Counting semaphore:**
1. Pick **Vikram** → **Server Room** → slot taken (1/1)
2. Pick **Neha** (also IT Admin) → **WAIT**
3. Say: *"Both are authorised — RBAC said yes. But the semaphore is 0, so she sleeps on a condition variable. Authorised does not mean immediate."*
4. **Release** Vikram's session → Neha wakes automatically

**Banker's Algorithm (the star):**
1. Pick **Ananya** → **GPU Seats** → GRANT (1 of 2 used)
2. Pick **Vikram** → **GPU Seats** → **WAIT**, reason: *unsafe state*
3. Say: *"One seat is still free, so a dumb system would say yes. Banker's refuses — because Vikram's max claim is 2 and Ananya's is 2, granting would leave no order in which both can finish. Refusing now beats deadlock later."*
4. **Release** Ananya → Vikram wakes up

**Priority scheduling:**
1. Fill something so a queue builds with mixed roles
2. Show **P0 faculty/admin** sorting above **P3 guest**
3. Point at the **aged x2** tag: *"FCFS inside a priority, plus aging, so a low-priority guest is never starved forever."*

---

### Tab 4 — Module 5 Coverage

Use this during Q&A. Every syllabus line is mapped to where it lives in the project:

| Badge | Meaning |
|-------|---------|
| **LIVE** | Driven by this app in real time |
| **SLIDES** | Designed into the system, explained on the slides |
| **Q&A** | Defended verbally if asked |

---

## What's actually implemented (not mocked)

| Concept | How it's real |
|---------|---------------|
| Access matrix | 5 roles × 11 resources, empty cell = deny |
| Mutex | Genuine async lock with a waiter queue; contention counter |
| Counting semaphore | Capacity enforced; overflow goes to sleep |
| Priority scheduling | P0–P3 sort + FCFS tiebreak + aging |
| Banker's Algorithm | Full safety-sequence search over all pools; refuses unsafe grants |
| Audit log | Every attempt recorded with reason |

## Suggested talking point for "why both ACL and capability?"

> The door controller holds the **ACL** — that's the column, easy to revoke. The ID card holds the **capability** — that's the row, fast to check. Each covers the other's weakness, so we deliberately use both.
