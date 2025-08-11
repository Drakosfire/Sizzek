## Night Thoughts — MCP Design Scratchpad

Partner document to `Sizzek/Docs/Architecture/MCP_DESIGN_INSTRUCTION_MANUAL.md`. Based on `Docs/Templates/MCP_DESIGN_SCRATCHPAD_Template.md`.

---

### 0) Project Summary & Objective
Purpose: Align on the user problem, scope, and outcomes.

- Objective: Capture fleeting night-time ideas (low-friction), then prompt the user at a set morning time to evaluate each idea. If not evaluated by the SLA/TTL, the idea is automatically deleted to reduce clutter and promote intentionality.
- Primary users: Agents acting on behalf of a person; the person receiving a morning review; operators configuring defaults.
- Success criteria:
  - Night capture in ≤ 1 step and ≤ 1 second (local write)
  - Morning review prompt reliably at configured time with ≥ 99% success
  - Auto-delete of unreviewed items with no “zombie” accumulation
  - Clear promotion path for “keep” to persistent system (e.g., tasks/notes)
- Non-goals:
  - Long-term note management (handled elsewhere)
  - Complex multi-user sharing in v1
  - Rich formatting; plain text with optional tags is sufficient

Checklist:
- [x] Objective defined
- [x] Users identified
- [x] Success criteria listed
- [x] Non-goals noted

---

### 1) Constraints & Assumptions
Purpose: Surface boundaries early to prevent churn.

- Technical constraints:
  - Storage via `mcp-data` (JSON default; Mongo optional)
  - Scheduling: in-process simplified scheduler (daily time) or reuse `scheduled-tasks` pattern; persistence of next-run
  - Timezone handling: default to user’s timezone if provided; fallback UTC
  - Minimal integration at MVP; optional push to other MCP servers (e.g., todoodles, memory)
- Operational constraints:
  - One process per server; Web UI via dynamic port range
  - `.env` configured; secrets not logged
- Assumptions:
  - Effective user can be resolved per request
  - Agent can present grouped morning review

Checklist:
- [x] Constraints documented
- [x] Assumptions documented
- [x] Unknowns flagged (best timezone source; persistence target for “kept”)

---

### 2) User Context & Access Model
Purpose: Decide personal vs shared data and access rules.

- `MCP_USER_BASED=true` recommended. Each user’s ideas and settings are isolated.
- Effective user: `request.params.userId || request.meta.userId || process.env.MCP_USER_ID || 'default'`
- Shared artifacts: None required; templates/default settings may be shared.
- Authorization: Local-only; no cross-user reads.

Checklist:
- [x] User identification sources defined
- [x] Effective user rule written
- [x] Shared-context behavior documented
- [x] Authorization checks described

---

### 3) Data Model
Purpose: Establish minimal entities and fields.

- Entities:
  - Thought (Ephemeral)
    - id (string, uuid)
    - text (string)
    - tags (string[])
    - createdAt (ISO string)
    - expiresAt (ISO string) // auto-delete deadline
    - reviewedAt (ISO string | undefined)
    - status: 'active' | 'kept' | 'discarded' | 'expired'
    - source: 'mcp' | 'web-ui' | 'api' (optional)
  - UserState
    - reviewSchedule: { type: 'daily', time: 'HH:MM', timezone?: string, enabled: boolean }
    - defaultTTLHours: number (e.g., 12 or until next morning time)
    - carryOverIfMissed: boolean (default false; if true, keep 1 extra day then purge)
  - PromotionTarget (optional persistent copy)
    - id (string)
    - thoughtId (string)
    - target: 'todoodles' | 'notes' | 'memory' | 'custom'
    - payload: object // mapped fields for target

- Invariants:
  - `expiresAt` must be > `createdAt`
  - Only 'active' thoughts are candidates for review; 'expired' are non-interactable
  - Promotion to persistent store sets status to 'kept' and records `reviewedAt`
  - Auto-delete sets status to 'expired' and removes record from active set

- Response envelope: JSON string inside text content per manual.

Checklist:
- [x] Entities and fields listed
- [x] IDs and uniqueness rules defined
- [x] Validation rules captured
- [x] Response shape decided

---

### 4) Tool Inventory
Purpose: Define tools, inputs, outputs, and behavior.

- capture_night_thought
  - description: Capture an ephemeral thought quickly with optional tags and TTL override.
  - input: { text: string; tags?: string[]; ttlHours?: number; userId?: string }
  - success: { ok: true, thought: { id, expiresAt } }
  - errors: invalid_text, ttl_too_long
  - idempotency: none (distinct ids per call)

- list_night_thoughts
  - input: { status?: 'active'|'kept'|'discarded'|'expired', includeExpired?: boolean, limit?: number, offset?: number, userId?: string }
  - success: { ok: true, total, items: Thought[] }

- evaluate_thought
  - description: Mark a thought as 'keep' or 'discard'. If 'keep', optionally promote to a persistent system.
  - input: { id: string; action: 'keep'|'discard'; target?: 'todoodles'|'notes'|'memory'|'none'; userId?: string }
  - success: { ok: true, status: 'kept'|'discarded', promotion?: { target, id } }
  - errors: not_found, already_final

- schedule_morning_review
  - description: Configure daily review time (e.g., 09:00 local) and behavior.
  - input: { time: 'HH:MM'; timezone?: string; enabled?: boolean; carryOverIfMissed?: boolean; userId?: string }
  - success: { ok: true, schedule: { time, timezone, enabled, carryOverIfMissed } }

- purge_expired_thoughts
  - description: Force-run TTL purge of expired items (admin/agent maintenance).
  - input: { userId?: string }
  - success: { ok: true, purgedCount: number }

- get_web_ui
  - description: Return a Web UI link and HTML dashboard for review and settings.
  - input: { userId?: string }
  - success: text includes URL and HTML

Checklist:
- [x] Names/descriptions
- [x] Input schemas
- [x] Validation/errors
- [x] Idempotency/side effects
- [x] Success responses

---

### 5) Storage Design (mcp-data)
Purpose: Choose backend and configure unified storage.

- Backend: `mcp-data` user storage
  - JSON default with backups; Mongo optional
- Default data structure:
  ```ts
  interface NightThoughtsData {
    thoughts: Record<string, Thought>;
    promotions: Record<string, PromotionTarget>;
    users: Record<string, UserState>;
    metadata: { version: '0.1.0'; updatedAt: string; counts: { thoughts: number } };
  }
  ```
- Locks:
  - Per-user lock for capture/evaluate/purge to prevent races
  - Global or per-user timer management lock for schedule updates
- Backups: `MCP_BACKUP_ENABLED=true` on JSON
- Migration: N/A in v1

Checklist:
- [x] Storage decision recorded
- [x] Default data structure written
- [x] Locks plan noted
- [x] Backups defined
- [x] Migration plan (none)

---

### 6) Web UI Plan (if needed)
Purpose: Decide on `get_web_ui` and UI schema.

- Include `get_web_ui`: Yes
- Components:
  - Review panel: list active thoughts with created/expires, actions Keep/Discard
  - Settings: daily review time, timezone, carry-over toggle, default TTL
  - History: recent kept/discarded (last 7 days)
- Forms: schedule form; capture quick-add; promotion target selection when keeping
- Poll interval: 3000–5000ms; Session TTL: 30 minutes

Checklist:
- [x] Include `get_web_ui`
- [x] UI schema outline
- [x] Form schemas
- [x] Poll/TTL set

---

### 7) External Integrations & Security
Purpose: Validate envs, auth, retries, and safe logging.

- Env vars:
  - `MCP_STORAGE_TYPE=json|mongodb`
  - JSON: `DATA_DIR`, `MCP_BACKUP_ENABLED`
  - Mongo: `MONGODB_CONNECTION_STRING`, `MONGODB_DATABASE`, `MONGODB_COLLECTION`
  - Review defaults: `NIGHT_REVIEW_TIME=09:00`, `NIGHT_DEFAULT_TTL_HOURS=12`
  - Timezone default: `NIGHT_DEFAULT_TZ=UTC`
- Validation: fail-fast on Mongo when selected; validate HH:MM; validate TTL bounds (e.g., 1–36 hours)
- Auth: none beyond local process
- Timeouts/retries: N/A (local ops); consistent error messages

Checklist:
- [x] Env list + validation
- [x] Auth gating plan (N/A)
- [x] Timeout/retry defaults
- [x] Secret redaction policy

---

### 8) Observability & Error Handling
Purpose: Ensure diagnosable behavior.

- Request-scoped logging: tool, user, action, duration, counts (active, purged)
- Error payload: `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`
- Debug: `MCP_DEBUG=true` to log payloads (redact PII if any)

Checklist:
- [x] Logging fields listed
- [x] Error pattern confirmed
- [x] Debug behavior set

---

### 9) Testing Plan (align with MCP Server Testing Guide)
Purpose: Agree on test scope and org.

- Directory: `tests/{helpers,unit,integration}/`
- Env: unique data file/dir; `NODE_ENV=test`; `MCP_USER_BASED=false`
- Unit:
  - TTL calculation to next review window
  - Evaluate transitions and idempotency
  - Purge logic
- Integration:
  - `tools/list` contains expected tools
  - `capture_night_thought` → shows up in list
  - `schedule_morning_review` persists and informs next run
  - `purge_expired_thoughts` removes expired
- Web UI:
  - `get_web_ui` returns URL + HTML with night thoughts references
  - Handle actions keep/discard/settings
- Concurrency:
  - Parallel capture and purge do not corrupt state
- Cleanup/exit: graceful shutdown

Checklist:
- [x] Layout noted
- [x] Test env setup
- [x] Helper readiness
- [x] Unit/integration/Web UI/concurrency listed
- [x] Cleanup criteria

---

### 10) Release & Ops
Purpose: Smooth rollout and manual validation.

- Versioning: bump on tool schema/storage changes
- Smoke tests:
  - list-tools
  - capture_night_thought → list shows item
  - schedule_morning_review → verify next run computed
  - get_web_ui → returns HTML + URL
  - purge_expired_thoughts → removes as expected
- Expected logs: startup env echo (masked), storage init, capture/evaluate events, purge counts, schedule updates

Checklist:
- [x] Version bump rules
- [x] Smoke tests
- [x] Expected logs

---

### 11) Risks, Fallbacks, Open Questions
Purpose: Make risk explicit and define plan B.

- Risks:
  - Timezone/DST errors → Mitigation: store TZ explicitly; use library; unit tests for edge dates
  - Missed review due to downtime → Mitigation: on startup, check for missed windows and trigger review notification; carry-over option
  - Idea hoarding if review disabled → Mitigation: hard TTL cap; periodic purge warnings
- Fallbacks:
  - If scheduler off, agent can query `list_night_thoughts` and drive manual review
  - If promotion target unavailable, keep local note with `status='kept'`
- Open questions:
  - Preferred promotion target (todoodles/notes/memory)?
  - Default review time per user vs global?

Checklist:
- [x] Risks and mitigations
- [x] Fallbacks
- [x] Open questions

---

### 12) Milestones & Task Breakdown
Purpose: Convert plan to actionable steps.

- Phase 1: Server skeleton + ListTools/CallTool; capture/list/evaluate core
- Phase 2: Storage via `mcp-data`; TTL/purge mechanics
- Phase 3: Review schedule (compute next run; simple timer); Web UI MVP
- Phase 4: Promotion pathways; tests; observability
- Phase 5: Hardening; optional Mongo; DST/timezone robustness

Checklist:
- [ ] Repo structure and env template
- [ ] Server skeleton
- [ ] Core manager (capture/evaluate/list)
- [ ] mcp-data storage + locks
- [ ] Web UI manager + `get_web_ui`
- [ ] Scheduler + purge
- [ ] Tests (unit/integration/Web UI)
- [ ] Cleanup/shutdown
- [ ] README + smoke notes

---

### 13) Validation Checklist (Pre-Merge Smoke Tests)
Purpose: Quick, repeatable sanity checks.

- [ ] `tools/list` returns expected tools
- [ ] `capture_night_thought` works
- [ ] `evaluate_thought` keep/discard updates state
- [ ] `purge_expired_thoughts` purges correctly
- [ ] `get_web_ui` returns URL and HTML
- [ ] Logs show startup → request → success/failure → cleanup

---

### 14) Final Sign-off
Purpose: Confirm alignment before implementation/merge.

- [ ] Stakeholder review complete
- [ ] Open questions resolved/ticketed
- [ ] Version and changelog updated (if applicable)

---

### Appendix A) Examples and Env

- Example capture success:
```json
{ "ok": true, "thought": { "id": "t_001", "expiresAt": "2025-08-11T09:00:00Z" } }
```

- Example evaluate keep:
```json
{ "ok": true, "status": "kept", "promotion": { "target": "todoodles", "id": "todo_123" } }
```

- Env template:
```env
MCP_STORAGE_TYPE=json
MCP_USER_BASED=true
MCP_DEBUG=false
DATA_DIR=./data

# Mongo (optional)
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=night_thoughts

# Review defaults
NIGHT_REVIEW_TIME=09:00
NIGHT_DEFAULT_TZ=UTC
NIGHT_DEFAULT_TTL_HOURS=12

# Web UI
MCP_WEB_UI_BASE_URL=localhost
MCP_WEB_UI_CSS_PATH=./static
```


