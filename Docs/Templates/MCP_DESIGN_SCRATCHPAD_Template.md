## MCP Design Scratchpad Template

Partner document to `MCP_DESIGN_INSTRUCTION_MANUAL.md`. Use this scratchpad to drive a structured design conversation and track actionable steps with checkable items. Copy this file for each new MCP server design and fill it out.

### How to use this template
- Duplicate this file and rename to `<service-name>_MCP_DESIGN_SCRATCHPAD.md`.
- Work top-to-bottom. Each section has:
  - A brief purpose statement
  - Prompts/questions to answer
  - A checklist of actionable next steps
- Keep answers concise. Link deeper specs/code when needed.
- Reference the manual at `Sizzek/Docs/Organization/MCP_DESIGN_INSTRUCTION_MANUAL.md` for detailed guidance.

---

### 0) Project Summary & Objective
Purpose: Align on the user problem, scope, and outcomes.

Prompts:
- What problem does this server solve? Who benefits and how?
- What is the minimal viable capability set?
- What does success look like (measurable)? What is explicitly out of scope?

Checklist:
- [ ] One-paragraph objective defined
- [ ] Primary user(s) identified
- [ ] Success criteria listed (3–5 bullets)
- [ ] Explicit non-goals noted

---

### 1) Constraints & Assumptions
Purpose: Surface boundaries early to prevent churn.

Prompts:
- Technical constraints (APIs, auth, rate limits, data residency)?
- Operational constraints (hosting, ports, env management)?
- Assumptions (client behavior, user IDs, latency expectations)?

Checklist:
- [ ] Constraints documented
- [ ] Assumptions documented
- [ ] Unknowns flagged for follow-up

---

### 2) User Context & Access Model
Purpose: Decide personal vs shared data and access rules.

Prompts:
- Is `MCP_USER_BASED` required? What defines effective user ID?
- Any shared-context scenarios (creator vs collaborators)?
- Read/write rules per user/context?

Checklist:
- [ ] User identification sources defined (request params/meta/env)
- [ ] Effective user resolution rule written
- [ ] Shared-context behavior documented (if applicable)
- [ ] Authorization checks described (if applicable)

---

### 3) Data Model
Purpose: Establish minimal entities and fields.

Prompts:
- What entities are needed? Key fields and IDs?
- What invariants must hold? What’s required vs optional?
- Output formats for agents (JSON shape)?

Checklist:
- [ ] Entities and fields listed
- [ ] IDs and uniqueness rules defined
- [ ] Validation rules captured
- [ ] Response envelope/shape decided

---

### 4) Tool Inventory
Purpose: Define tools, inputs, outputs, and behavior.

Prompts:
- Minimal verb_noun tools to deliver value?
- Input schemas (types, enums, required)?
- Output format: text (JSON string) vs human text?
- Error conditions and messages? Idempotency requirements?

Checklist (repeat per tool):
- [ ] Name, description
- [ ] `inputSchema` defined with examples
- [ ] Validation and error messages drafted
- [ ] Idempotency and side effects documented
- [ ] Success response examples

---

### 5) Storage Design (mcp-data)
Purpose: Choose backend and configure unified storage.

Prompts:
- JSON vs MongoDB? Why?
- Default data shape? Metadata (updatedAt, counters)?
- Backups (JSON)? Migration from legacy needed?

Checklist:
- [ ] `MCP_STORAGE_TYPE` decision recorded
- [ ] Default data structure written
- [ ] Operation locks plan (per-user) noted
- [ ] Backup policy (JSON) defined
- [ ] Migration plan (if any) drafted

Env loading notes (unified loader to adopt in implementation):
- Support `ENV_PATH` to explicitly point to the `.env` file
- Otherwise search `.env.local`, `.env`, and `.env.production` (when `NODE_ENV=production`) in project root and one level up
- Normalize Mongo vars so either `MONGODB_URI` or `MONGO_URI` works (set both if only one provided)
- Mask secrets in startup logs and print which env file was used

---

### 6) Web UI Plan (if needed)
Purpose: Decide on `get_web_ui` and UI schema.

Prompts:
- Do we need a web UI? Which components (list, forms, actions)?
- Polling interval and session TTL?
- Which actions require forms? Which are inline?

Checklist:
- [ ] Decision on including `get_web_ui`
- [ ] UI schema outline (components, fields, actions)
- [ ] Form schemas identified
- [ ] Poll interval + session TTL set

---

### 7) External Integrations & Security
Purpose: Validate envs, auth, retries, and safe logging.

Prompts:
- Required env vars and validation rules?
- OAuth or token gating before tool execution?
- Timeouts, retries, and circuit breakers?
- Secrets handling and redaction policy?

Checklist:
- [ ] Env var list + validation behavior
- [ ] Auth gating plan (if required)
- [ ] Timeout/retry defaults recorded
- [ ] Secret logging redaction noted
- [ ] “FINAL” response pattern (if applicable) defined

---

### 8) Observability & Error Handling
Purpose: Ensure diagnosable behavior.

Prompts:
- What will we log per request (tool, user, duration, outcome)?
- Error payload shape and client behavior on `isError`?

Checklist:
- [ ] Request-scoped logging fields listed
- [ ] Error response pattern confirmed
- [ ] Debug toggles (`MCP_DEBUG`) behavior set

---

### 9) Testing Plan (align with MCP Server Testing Guide)
Purpose: Agree on test scope and org.

Prompts:
- Unit targets (managers, storage, adapters)?
- Integration targets (tools/list, tools/call, errors)?
- Web UI tests (HTML+URL, action handlers, forms)?
- Concurrency tests and data isolation?

Checklist:
- [ ] Directory layout noted (`tests/{helpers,unit,integration}/`)
- [ ] Test env setup (unique data files, NODE_ENV=test)
- [ ] Server helper readiness + timeouts defined
- [ ] Unit/integration/Web UI/concurrency cases listed
- [ ] Cleanup and exit criteria captured

---

### 10) Release & Ops
Purpose: Smooth rollout and manual validation.

Prompts:
- Versioning policy triggers?
- Manual smoke tests and expected logs?

Checklist:
- [ ] Version bump rules written
- [ ] Smoke test checklist drafted
- [ ] Expected startup and per-call logs listed

---

### 11) Risks, Fallbacks, Open Questions
Purpose: Make risk explicit and define plan B.

Prompts:
- Top risks? What mitigations/fallbacks?
- Open questions blocking implementation?

Checklist:
- [ ] Risks enumerated with mitigations
- [ ] Fallback strategies recorded
- [ ] Open questions assigned to owners

---

### 12) Milestones & Task Breakdown
Purpose: Convert plan to actionable steps.

Phases (example):
- Phase 1: Server skeleton + ListTools + 1 core tool
- Phase 2: Storage + more tools
- Phase 3: Web UI + forms
- Phase 4: External integrations
- Phase 5: Tests + hardening

Checklist (sample; customize):
- [ ] Create repo structure and env template
- [ ] Implement server skeleton (ListTools/CallTool)
- [ ] Implement core manager logic
- [ ] Add `mcp-data` storage (default data, locks)
- [ ] Define tools and validations
- [ ] Implement Web UI manager and `get_web_ui`
- [ ] Add integration with external APIs
- [ ] Add unit/integration/Web UI tests
- [ ] Add graceful shutdown/cleanup
- [ ] Write README and smoke test notes

---

### 13) Validation Checklist (Pre-Merge Smoke Tests)
Purpose: Quick, repeatable sanity checks.

Checklist:
- [ ] `tools/list` returns expected tools
- [ ] Happy-path tool call works with minimal input
- [ ] Error-path returns `isError: true` and helpful message
- [ ] Storage persists and reloads data
- [ ] Web UI tool returns URL and HTML (if present)
- [ ] Logs show startup → request → success/failure → cleanup

---

### 14) Final Sign-off
Purpose: Confirm alignment before implementation/merge.

Checklist:
- [ ] Stakeholder review complete
- [ ] Open questions resolved or ticketed
- [ ] Version and changelog updated (if applicable)


