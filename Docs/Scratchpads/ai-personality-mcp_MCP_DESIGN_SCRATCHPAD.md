## AI Personality MCP – Design Scratchpad

Partner document to `MCP_DESIGN_INSTRUCTION_MANUAL.md`. Working space for the AI Personality MCP Server ("persona-mcp"). This follows the template from `MCP_DESIGN_SCRATHPAD_Template.md`.

---

### 0) Project Summary & Objective
Purpose: Align on the user problem, scope, and outcomes.

- Objective: Manage and version AI personality prompts as shareable artifacts, provide a guided edit/publish workflow, and export to target schemas (starting with LibreChat) without hard coupling.
- Primary users: Sizzek (shared default persona), future collaborators; agents that need to fetch/render personas.
- Success criteria:
  - [ ] CRUD for personalities with draft/published states and version history
  - [ ] LibreChat adapter renders a single, validated string for its instruction bucket
  - [ ] Conversational builder flow to iteratively craft personas and write to storage
  - [ ] Shared storage by default; configurable for per-user mode
  - [ ] Predictable error shapes, logs, and tests per manual
- Non-goals (MVP): Direct writes to LibreChat DB; embeddings/RAG; multi-LLM orchestration.

---

### 1) Constraints & Assumptions
Purpose: Surface boundaries early to prevent churn.

- Constraints:
  - Storage via `mcp-data` with JSON (dev) and MongoDB (staging/prod)
  - Must support large prompts but enforce limits and token-aware warnings
  - Adapter pattern for client schemas; LibreChat is first target
  - No secrets in logs; environment validation at startup
- Assumptions:
  - Personas primarily consumed as a single rendered instruction string
  - LibreChat accepts an instruction/system text bucket for agents
  - Shared mode desired now so default Sizzek Persona is globally accessible
- Unknowns:
  - Exact LibreChat field target and max length constraints
  - Desired strictness of validation rules (e.g., mandatory safety rules)

Checklist:
- [x] Constraints documented
- [x] Assumptions documented
- [ ] Unknowns flagged for follow-up

---

### 2) User Context & Access Model
Purpose: Decide personal vs shared data and access rules.

- Shared by default: `MCP_USER_BASED=false` for global personas (default Sizzek Persona shared)
- Effective user resolution (when enabled): `request.params.userId` → `request.meta.userId` → `MCP_USER_ID`
- Ownership/visibility (MVP): Global read; write controlled operationally (later: author/owner metadata with optional guards)

Checklist:
- [x] User identification sources defined
- [x] Effective user resolution rule written
- [x] Shared-context behavior documented (global by default)
- [ ] Authorization checks described (future enhancement)

---

### 3) Data Model
Purpose: Establish minimal entities and fields.

Entity: `Personality`

```
{
  id: string,                  // persona_<uuid>
  name: string,                // e.g., "Sizzek Core Persona"
  slug: string,                // kebab-case unique slug
  status: 'draft'|'published',
  description?: string,
  content: {
    system_instructions: string,
    behavior_guidelines: string[],     // bullets
    style_guidelines: string[],        // bullets
    safety_policies: string[],         // bullets
    tooling_preferences?: object,      // e.g., { use_tools: true }
    prompt_fragments: { key: string, text: string }[]
  },
  targets: [
    { schema: 'librechat@1.x', mapping: 'default', last_export?: { at: number, length: number, warnings?: string[] } }
  ],
  version: number,            // autoincrement on publish
  history: { version: number, at: number, userId?: string, message?: string, diff?: object }[],
  metadata: { createdAt: number, updatedAt: number, ownerUserId?: string, tags?: string[] }
}
```

- IDs and uniqueness: `id` unique; `slug` unique (index). Published versions immutable snapshots in `history`.
- Validation: size limits on rendered output; non-empty `name` and at least one content source (`system_instructions` or `prompt_fragments`).
- Response envelope: tools return machine-parseable JSON in text payload.

Checklist:
- [x] Entities and fields listed
- [x] IDs and uniqueness rules defined
- [x] Validation rules captured (initial)
- [x] Response envelope/shape decided

---

### 4) Tool Inventory
Purpose: Define tools, inputs, outputs, and behavior.

MVP Tools:
- list_personalities
  - filters: status?, tags?, q?, pagination
  - returns summary list
- get_personality
  - id
- create_personality
  - name (required), description?, seed content?, tags?
- update_personality
  - id, set: partial fields, contentOps: [{ op: add|remove|replace, path, value }], clientMutationId?
- delete_personality
  - id, confirm: string (must match slug or "DELETE")
- publish_personality
  - id, message?
- diff_personality_versions
  - id, fromVersion, toVersion
- validate_personality
  - id; returns errors/warnings, size/token estimates
- render_target
  - id, schema: 'librechat@1.x', mapping?: 'default'
- builder_start_session
  - personaId?, name?
- builder_add_requirement
  - sessionId, requirementType: behavior|style|safety|tooling|fragment, text or {key,text}
- builder_generate_draft
  - sessionId → updates persona draft content
- builder_finalize
  - sessionId, personaId → persist draft, set status=draft (not publish)
- get_web_ui
  - returns URL + HTML for Web UI

Checklist (repeat per tool):
- [x] Name, description
- [x] inputSchema outline
- [x] Validation and error messages pattern
- [x] Idempotency and side effects documented (where relevant)
- [ ] Success response examples (to add in docs)

---

### 5) Storage Design (mcp-data)
Purpose: Choose backend and configure unified storage.

- Backend: `mcp-data` JSON (dev), Mongo (staging/prod)
- Collections/keys:
  - `personalities` (primary)
  - `builder_sessions` (ephemeral)
- Metadata and indexes (Mongo): `slug` (unique), `status`, `updatedAt`, `metadata.tags`
- Operation locks: per-personality write lock for update/publish
- Backups: optional JSON snapshots on publish

Checklist:
- [x] `MCP_STORAGE_TYPE` decision recorded
- [x] Default data structure written
- [x] Operation locks plan noted
- [x] Backup policy (JSON) defined (optional)
- [ ] Migration plan (legacy→unified) (N/A for MVP)

---

### 6) Web UI Plan (if needed)
Purpose: Decide on `get_web_ui` and UI schema.

- Provide `get_web_ui` via `mcp-web-ui`
- Components:
  - List with filters
  - Detail editor for content/fragments
  - Version history + diff view
  - Render preview (LibreChat)
- Actions: create, update, publish, render
- Session TTL: 30 min; Poll: 5s

Checklist:
- [x] Decision on including `get_web_ui`
- [x] UI schema outline
- [x] Form schemas identified (editor for fragments/settings)
- [x] Poll interval + session TTL set

---

### 7) External Integrations & Security
Purpose: Validate envs, auth, retries, and safe logging.

- No direct LibreChat DB writes (adapter-only rendering)
- Env vars (startup validation; exit with message if missing):
  - `MCP_STORAGE_TYPE`, `MCP_USER_BASED`, `MCP_USER_ID`
  - JSON: `DATA_FILE_PATH`
  - Mongo: `MONGODB_CONNECTION_STRING`, `MONGODB_DATABASE`, `MONGODB_COLLECTION`
  - UI: `MCP_WEB_UI_BASE_URL`
  - Debug: `MCP_DEBUG`
- Timeouts/retries: not needed MVP; add sane defaults in HTTP clients if introduced
- Logging: redact secrets; debug gated by `MCP_DEBUG`
- “FINAL” directive: not applicable (no side-effectful external sends)

LibreChat external edit path (planned):
- External messages API (no JWT) with API key header and MCP edit guard
  - Headers:
    - `x-api-key: $EXTERNAL_MESSAGE_API_KEY`
    - `x-agent-edit-key: $EXTERNAL_AGENT_EDIT_SECRET` (new admin edit secret)
  - Payload markers in `metadata`:
    - `endpoint: 'agents'`, `agent_id: 'agent_...'`
    - `mcpAgentEdit: true`, optional `mcpPackageId: 'com.dungeonmind.mcp'`
    - `op: 'agent.update'`, `update: { instructions: '...' }`
- Env integration (in LibreChat):
  - Require both envs to enable the edit path: `EXTERNAL_MESSAGE_API_KEY`, `EXTERNAL_AGENT_EDIT_SECRET`
  - Optional allowlist: `MCP_ALLOWED_PACKAGES` to restrict `mcpPackageId`
- Safety:
  - Short-circuit before general external processing; call model-layer `updateAgent` (preserves versioning)
  - Audit log: agent_id, caller (phone/user), source, op
  - Rate-limit external route; redact secrets in logs

Checklist:
- [x] Env var list + validation behavior
- [x] Auth gating plan (N/A MVP; future: writer roles)
- [x] Timeout/retry defaults recorded (N/A MVP)
- [x] Secret logging redaction noted
- [x] “FINAL” response pattern evaluated

---

### 8) Observability & Error Handling
Purpose: Ensure diagnosable behavior.

- Request logs: tool name, userId/effective user, personaId, duration, success, version
- Error shape: `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`
- Debug toggle: `MCP_DEBUG=true` prints structured details

Checklist:
- [x] Request-scoped logging fields listed
- [x] Error response pattern confirmed
- [x] Debug toggles behavior set

---

### 9) Testing Plan (align with MCP Server Testing Guide)
Purpose: Agree on test scope and org.

- Directory: `tests/{helpers,unit,integration}/`, `tests/run-all-tests.js`
- Env: unique data per run; `NODE_ENV=test`; `MCP_USER_BASED=false` default
- Unit: manager logic (merge/contentOps/validation), adapter rendering
- Integration: list-tools, CRUD happy/error, publish/version, render_target
- Web UI: `get_web_ui` returns URL + HTML; basic action handlers
- Concurrency: concurrent updates publish locks verified
- Cleanup: sessions expire; server exits cleanly

LibreChat adapter/integration tests (cross-repo reference):
- Integration: "External agent edit via messages API updates agent.instructions when MCP markers and secrets are valid; rejects without edit secret"
  - Test file (LibreChat): `api/server/routes/__tests__/external_agent_edit.spec.js`
  - Preconditions: `EXTERNAL_MESSAGE_API_KEY`, `EXTERNAL_AGENT_EDIT_SECRET` set in env
  - Request: POST `/api/messages/:conversationId` with headers above and `metadata` including `{ endpoint:'agents', agent_id, mcpAgentEdit:true, op:'agent.update', update:{instructions} }`
  - Expected: 200/202 and `{ updated: true }`; `updateAgent({...})` called with new instructions; 401/403 when edit secret missing

Checklist:
- [x] Directory layout noted
- [x] Test env setup
- [x] Server helper readiness + timeouts defined
- [x] Unit/integration/Web UI/concurrency cases listed
- [x] Cleanup and exit criteria captured

---

### 10) Release & Ops
Purpose: Smooth rollout and manual validation.

- Versioning: bump on storage shape changes or tool schema changes
- Smoke tests:
  - tools/list includes expected tools
  - create → update → validate → publish → render flow
  - error-paths: invalid contentOps, size limit exceeded
  - UI returns URL + HTML
- Expected logs:
  - Startup env echo (masked), init complete
  - Per-call info with entity/version
  - Cleanup on exit

Checklist:
- [x] Version bump rules written
- [x] Smoke test checklist drafted
- [x] Expected startup and per-call logs listed

---

### 11) Risks, Fallbacks, Open Questions
Purpose: Make risk explicit and define plan B.

- Risks
  - Adapter drift vs LibreChat schema
  - Prompt bloat / exceeding target length
  - Concurrent writes on publish
  - External edit path misuse if secrets leak
- Mitigations
  - Versioned adapter tag `librechat@1.x`, tests
  - Token/length warnings; hard cap with override flag
  - Per-entity locks; retry-on-conflict
  - Two-gate auth (`x-api-key` + `x-agent-edit-key`); optional `mcpPackageId` allowlist; detailed audit logs
- Open questions
  - Which LibreChat field exactly (system vs instructions)?
  - Strict max length requirement?
  - Builder: accept freeform inputs and normalize? Auto-suggest safety/style defaults?
  - Labels/aliases for versions (e.g., "current")?

Checklist:
- [x] Risks enumerated with mitigations
- [x] Fallback strategies recorded
- [ ] Open questions assigned

---

### 12) Milestones & Task Breakdown
Purpose: Convert plan to actionable steps.

Phases:
- Phase 1: Server skeleton + ListTools + 1 core CRUD tool
- Phase 2: Storage + remaining CRUD + publish/version
- Phase 3: Adapter (LibreChat) + render previews
- Phase 4: Builder flow + sessions
- Phase 5: Web UI + forms + diffs
- Phase 6: Tests + hardening

Checklist (initial):
- [ ] Create repo structure and env template
- [ ] Implement server skeleton (ListTools/CallTool)
- [ ] Implement PersonalityManager (validation, merges, locks)
- [ ] Add `mcp-data` storage (default data, indexes)
- [ ] Define tools and validations
- [ ] Implement LibreChat adapter and `render_target`
- [ ] Implement builder session flow
- [ ] Add integration and unit tests
- [ ] Add graceful shutdown/cleanup
- [ ] Write README and smoke test notes

LibreChat integration tasks (persona → agent instructions):
- [ ] Add failing test `api/server/routes/__tests__/external_agent_edit.spec.js` (done in LibreChat)
- [ ] Implement guarded external handler in LibreChat (`routes/messages.js` + `validateExternalMessage`) to process `op: 'agent.update'`
- [ ] Env: set `EXTERNAL_AGENT_EDIT_SECRET` and document in `.env.example`
- [ ] Audit logging and basic rate limiting for the external edit path
- [ ] E2E smoke: send MCP-rendered persona to LibreChat agent via external path and verify version bump

---

### 13) Validation Checklist (Pre-Merge Smoke Tests)
Purpose: Quick, repeatable sanity checks.

- [ ] `tools/list` returns expected tools
- [ ] Happy-path tool call works with minimal input
- [ ] Error-path returns `isError: true` with helpful message
- [ ] Storage persists and reloads data
- [ ] Web UI tool returns URL and HTML (if present)
- [ ] Logs show startup → request → success/failure → cleanup

---

### 14) Final Sign-off
Purpose: Confirm alignment before implementation/merge.

- [ ] Stakeholder review complete
- [ ] Open questions resolved or ticketed
- [ ] Version and changelog updated (if applicable)

---

### Appendix: Env Template (draft)

```
MCP_STORAGE_TYPE=json
MCP_USER_BASED=false
DATA_FILE_PATH=./data/personas.json
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=personas
MCP_WEB_UI_BASE_URL=localhost
MCP_DEBUG=false
```
