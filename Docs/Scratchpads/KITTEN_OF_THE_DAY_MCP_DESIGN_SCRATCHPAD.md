## Kitten of the Day — MCP Design Scratchpad

Partner document to `Sizzek/Docs/Architecture/MCP_DESIGN_INSTRUCTION_MANUAL.md`. Filled from `Docs/Templates/MCP_DESIGN_SCRATCHPAD_Template.md`.

---

### 0) Project Summary & Objective
Purpose: Align on the user problem, scope, and outcomes.

- Objective: Provide delightful kitten images on demand and automatically once per day (or at a configured schedule/randomized window). Ensure images are unseen by the requesting user until supply is exhausted. Maintain our own curated database via scheduled scraping from allowed sources.
- Primary users: Agents (chat assistants) who fetch and deliver images to users; developers/operators curating sources.
- Success criteria:
  - Daily delivery succeeds ≥99% of days when at least 1 unseen image exists
  - Duplicate rate (same/similar image) ≤1% per user over 30 days
  - On-demand tool returns within 1s from local store (no live crawl on hot path)
  - Clear fallback when no unseen images remain
- Non-goals:
  - General web crawler outside allowlist
  - Complex human moderation at MVP (basic safety/filters only)
  - Binary image hosting at MVP (store URLs/metadata first; optional caching later)

Checklist:
- [x] One-paragraph objective defined
- [x] Primary user(s) identified
- [x] Success criteria listed
- [x] Explicit non-goals noted

---

### 1) Constraints & Assumptions
Purpose: Surface boundaries early to prevent churn.

- Technical constraints:
  - Storage via `mcp-data` (JSON by default; Mongo optional)
  - Scraping respects robots.txt; rate-limited; allowlisted domains only
  - Prefer storing metadata and source URLs; optional binary caching (future: R2)
  - Hashing for dedupe: start with URL + filename heuristics; optional pHash later
- Operational constraints:
  - Node.js MCP server via stdio; no background daemons beyond in-process scheduler
  - Config via `.env`; secrets not logged
  - Ports for Web UI dynamic range; single process per server
- Assumptions:
  - User ID available via request meta or env fallback
  - Agents can render image URLs or base64 content
  - Daily delivery can be implemented internally or by reusing the scheduled-tasks pattern

Checklist:
- [x] Constraints documented
- [x] Assumptions documented
- [x] Unknowns flagged for follow-up (content licensing; best pHash lib; image caching policy)

---

### 2) User Context & Access Model
Purpose: Decide personal vs shared data and access rules.

- `MCP_USER_BASED=true` default. Per-user seen-history and preferences; shared global catalog of kittens and sources
- Effective user resolution: `request.params.userId || request.meta.userId || process.env.MCP_USER_ID || 'default'`
- Shared-context: Sources and global catalog are shared; only seen-history and schedules are per-user
- Authorization: Only local process; no cross-user read/write beyond shared catalog

Checklist:
- [x] User identification sources defined
- [x] Effective user resolution rule written
- [x] Shared-context behavior documented
- [x] Authorization checks described

---

### 3) Data Model
Purpose: Establish minimal entities and fields.

- Entities:
  - Kitten
    - id (string, uuid)
    - url (string)
    - sourceId (string)
    - contentHash (string | undefined) // optional perceptual hash
    - width, height (number | undefined)
    - tags (string[])
    - license (string | undefined)
    - scrapedAt (ISO string)
    - status: 'valid' | 'broken' | 'pending'
  - Source
    - id (string, uuid)
    - type: 'rss' | 'site' | 'api'
    - url (string)
    - cssSelector (string | undefined) // for site
    - enabled (boolean)
    - lastCrawlAt (ISO string | undefined)
    - notes (string | undefined)
    - domain (string)
  - UserState (per user)
    - seenKittenIds (string[])
    - preferences: { delivery: 'daily' | 'random_daily' | 'off', time?: 'HH:MM', windowMins?: number }
  - Delivery (history)
    - id (string, uuid)
    - userId (string)
    - kittenId (string)
    - scheduledAt (ISO string)
    - deliveredAt (ISO string | undefined)
    - status: 'scheduled' | 'sent' | 'skipped' | 'failed'

- Invariants and validation:
  - `url` must be HTTP(S) and on allowlist; `sourceId` must exist
  - Dedupe on (`contentHash` if present) else normalized URL key
  - A user should not receive same kitten twice unless `force: true`
  - Response envelope: machine-parseable JSON string

Checklist:
- [x] Entities and fields listed
- [x] IDs and uniqueness rules defined
- [x] Validation rules captured
- [x] Response envelope/shape decided

---

### 4) Tool Inventory
Purpose: Define tools, inputs, outputs, and behavior.

Core tools (agent-facing):
- get_unseen_kitten
  - input: `{ markSeen?: boolean, userId?: string, tags?: string[] }`
  - behavior: returns one unseen kitten for user; optionally mark as seen
  - success: `{ ok: true, kitten: { id, url, tags } }`
  - errors: `no_unseen_available`, `invalid_user`
  - idempotency: with `markSeen=true`, returns new item on retries; with `false`, can repeat
- mark_kitten_seen
  - input: `{ kittenId: string, userId?: string }`
  - success: `{ ok: true }`
  - errors: `unknown_kitten`
- list_kittens
  - input: `{ filter?: { sourceId?: string, tag?: string, status?: string }, limit?: number, offset?: number }`
  - success: `{ ok: true, total, items: [...] }`
- schedule_daily_kitten
  - input: `{ mode: 'daily' | 'random_daily', time?: 'HH:MM', windowMins?: number, userId?: string }`
  - behavior: create/update per-user schedule
  - success: `{ ok: true, schedule: {...} }`
- get_web_ui
  - input: `{ userId?: string }`
  - success: returns URL + HTML as text (see manual pattern)

Operations (operator-facing):
- add_source
  - input: `{ url: string, type?: 'rss'|'site'|'api', cssSelector?: string }`
  - success: `{ ok: true, sourceId }`
  - errors: `disallowed_domain`, `invalid_selector`
- list_sources / update_source / toggle_source
- scrape_sources
  - input: `{ sourceIds?: string[], limitPerSource?: number }`
  - success: `{ ok: true, added: number, duplicates: number, sources: [{ id, added, duplicates }] }`

Checklist:
- [x] Names/descriptions
- [x] Input schemas drafted
- [x] Validation and error messages
- [x] Idempotency/side effects
- [x] Success examples

---

### 5) Storage Design (mcp-data)
Purpose: Choose backend and configure unified storage.

- Backend: `mcp-data` user storage
  - JSON default, Mongo optional via env
- Default data structure:
  ```ts
  interface KittensData {
    kittens: Record<string, Kitten>;
    sources: Record<string, Source>;
    deliveries: Record<string, Delivery>;
    users: Record<string, UserState>;
    metadata: { version: '0.1.0'; updatedAt: string; counts: { kittens: number; sources: number } };
  }
  ```
- Operation locks: per-user locks for seen/selection and schedule mutation; global lock for scrape
- Backups: enable JSON backups via `MCP_BACKUP_ENABLED=true`
- Migration: N/A at MVP

Checklist:
- [x] Storage type decision recorded
- [x] Default data structure written
- [x] Operation locks plan noted
- [x] Backup policy defined
- [x] Migration plan drafted (MVP: none)

---

### 6) Web UI Plan (if needed)
Purpose: Decide on `get_web_ui` and UI schema.

- Include `get_web_ui`: Yes
- Components:
  - Dashboard stats (Total, Unseen per user, Today’s pick)
  - Kittens list (thumb, tags, source, status) with actions: mark seen, copy URL
  - Sources list with actions: toggle, scrape now, edit
  - Schedule panel (daily/random window controls)
- Forms: add source, edit source, schedule settings
- Poll interval: 5000ms; Session TTL: 30 minutes

Checklist:
- [x] Decision on including `get_web_ui`
- [x] UI schema outline
- [x] Form schemas identified
- [x] Poll + TTL set

---

### 7) External Integrations & Security
Purpose: Validate envs, auth, retries, and safe logging.

- Required env vars:
  - `MCP_STORAGE_TYPE=json|mongodb`
  - `MCP_USER_BASED=true`
  - JSON: `DATA_DIR` (optional)
  - Mongo: `MONGO_URI`, `MONGODB_DATABASE`, `MONGODB_COLLECTION`
  - Scraping: `KITTEN_ALLOWED_DOMAINS`, `KITTEN_USER_AGENT`, `KITTEN_MAX_CONCURRENCY=2`, `KITTEN_REQUEST_TIMEOUT_MS=8000`, `KITTEN_MAX_DOWNLOAD_MB=5`, `KITTEN_DOWNLOAD_IMAGES=false`
- Validation behavior: fail-fast on missing Mongo vars if selected; warn on empty allowlist; never log secrets
- Timeouts/retries: 2 retries with exponential backoff for scraping; circuit-break per source
- “FINAL” responses: N/A (read-only operations mostly); if integrating push delivery beyond MCP, include explicit FINAL guidance

Checklist:
- [x] Env var list + validation
- [x] Auth gating plan (none for local scraping)
- [x] Timeout/retry defaults
- [x] Secret redaction
- [x] FINAL response policy (N/A)

---

### 8) Observability & Error Handling
Purpose: Ensure diagnosable behavior.

- Per-request logging: tool name, user/effective user, args summary, duration, result, counts
- Error payload: `{ content: [{ type: 'text', text: 'Error: <message>' }], isError: true }`
- Debug toggles: `MCP_DEBUG=true` enables verbose; mask URLs if needed

Checklist:
- [x] Request-scoped logging fields listed
- [x] Error response pattern confirmed
- [x] Debug toggles behavior set

---

### 9) Testing Plan (align with MCP Server Testing Guide)
Purpose: Agree on test scope and org.

- Directory: `tests/{helpers,unit,integration}/`, `tests/run-all-tests.js`
- Test env: unique data dir per run; `NODE_ENV=test`; `MCP_USER_BASED=false` by default
- Unit:
  - Selection logic (unseen pick, mark seen)
  - Dedupe hashing and URL normalization
  - Scheduler next-run computation (daily vs random window)
- Integration:
  - tools/list includes expected tools
  - get_unseen_kitten happy-path + no-unseen error
  - schedule_daily_kitten applies and persists
  - scrape_sources dedupes correctly
- Web UI:
  - `get_web_ui` returns URL + HTML and references kittens/sources
  - Action handlers: mark seen, toggle source, scrape now
- Concurrency:
  - Parallel get_unseen_kitten calls do not double-assign the same kitten when markSeen=true
- Cleanup/exit: server shuts down; files cleaned up

Checklist:
- [x] Layout noted
- [x] Test env setup
- [x] Helper readiness/timeouts
- [x] Unit/integration/Web UI/concurrency cases listed
- [x] Cleanup and exit criteria

---

### 10) Release & Ops
Purpose: Smooth rollout and manual validation.

- Versioning: bump on tool schema changes or storage shape changes
- Smoke tests:
  - list-tools
  - get_unseen_kitten (should return JSON with URL)
  - schedule_daily_kitten then wait/force trigger and verify delivery log
  - get_web_ui returns HTML + URL
- Expected logs: startup env echo (masked), storage init, source count, scrape added/dupes, selection success/failure, schedule tick

Checklist:
- [x] Version bump rules
- [x] Smoke test checklist
- [x] Expected logs listed

---

### 11) Risks, Fallbacks, Open Questions
Purpose: Make risk explicit and define plan B.

- Risks:
  - Copyright/licensing uncertainties per source → Mitigation: allowlist domains, store license metadata, optional internal-only use
  - NSFW/unsafe content slip-through → Mitigation: basic tag filtering, manual curation, source vetting
  - Broken links/404s → Mitigation: periodic link validation job; mark `status='broken'`
  - Duplicate near-identicals → Mitigation: add pHash in phase 2/3; stricter dedupe
  - Scheduling drift in long-running process → Mitigation: reuse reliability patterns from `scheduled-tasks`
- Fallbacks:
  - If scraping fails: seed from curated static list, or optional TheCatAPI integration behind flag
  - If scheduler disabled: agent can call on-demand daily
- Open questions:
  - Preferred set of initial domains/sources?
  - Cache binaries locally/R2 at MVP or later?
  - Delivery channel beyond MCP (e.g., SMS/LibreChat) in scope for v1?

Checklist:
- [x] Risks enumerated with mitigations
- [x] Fallback strategies recorded
- [x] Open questions listed

---

### 12) Milestones & Task Breakdown
Purpose: Convert plan to actionable steps.

- Phase 1: Server skeleton + ListTools + `get_unseen_kitten` from seeded data; `get_web_ui` minimal
- Phase 2: `mcp-data` storage + seen-history + sources CRUD
- Phase 3: Scraper (RSS/Site minimal) with allowlist + dedupe; scrape_sources tool
- Phase 4: Scheduler for daily/random delivery; per-user preferences
- Phase 5: Web UI polish + tests + observability + optional pHash

Checklist:
- [ ] Create repo structure and env template
- [ ] Implement server skeleton (ListTools/CallTool)
- [ ] Implement core manager logic (selection/seen)
- [ ] Add `mcp-data` storage (default data, locks)
- [ ] Define tools and validations
- [ ] Implement Web UI manager and `get_web_ui`
- [ ] Add scraping with allowlist and rate limits
- [ ] Add scheduler (reuse simplified schedule pattern)
- [ ] Add unit/integration/Web UI tests
- [ ] Add graceful shutdown/cleanup
- [ ] Write README and smoke test notes

---

### 13) Validation Checklist (Pre-Merge Smoke Tests)
Purpose: Quick, repeatable sanity checks.

- [ ] `tools/list` returns expected tools
- [ ] `get_unseen_kitten` returns JSON with valid URL
- [ ] Error-path when no unseen (`isError: true` + guidance)
- [ ] Storage persists and reloads seen-history
- [ ] Web UI tool returns URL and HTML (if present)
- [ ] Logs show startup → request → success/failure → cleanup

---

### 14) Final Sign-off
Purpose: Confirm alignment before implementation/merge.

- [ ] Stakeholder review complete
- [ ] Open questions resolved or ticketed
- [ ] Version and changelog updated (if applicable)

---

### Appendix A) Example Responses and Env

- Example success (get_unseen_kitten):
```json
{ "ok": true, "kitten": { "id": "k_123", "url": "https://example.com/cute.jpg", "tags": ["cute","playful"] } }
```

- Example error when no unseen:
```json
{ "ok": false, "error": "no_unseen_available", "hint": "Add sources or run scrape_sources" }
```

- Env (copy and adapt):
```env
MCP_STORAGE_TYPE=json
MCP_USER_BASED=true
MCP_DEBUG=false
DATA_DIR=./data

# Mongo (optional)
MONGO_URI=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=kittens

# Scraping
KITTEN_ALLOWED_DOMAINS=reddit.com,staticflickr.com,imgur.com
KITTEN_USER_AGENT=KittenBot/1.0 (+contact@example.com)
KITTEN_MAX_CONCURRENCY=2
KITTEN_REQUEST_TIMEOUT_MS=8000
KITTEN_MAX_DOWNLOAD_MB=5
KITTEN_DOWNLOAD_IMAGES=false

# Web UI
MCP_WEB_UI_BASE_URL=localhost
MCP_WEB_UI_CSS_PATH=./static
```


