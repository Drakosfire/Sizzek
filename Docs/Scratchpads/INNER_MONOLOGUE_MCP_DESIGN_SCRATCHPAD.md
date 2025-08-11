## Inner Monologue ("Echo Thoughts") — MCP Design Scratchpad

Partner to `Sizzek/Docs/Architecture/MCP_DESIGN_INSTRUCTION_MANUAL.md`. Based on `Docs/Templates/MCP_DESIGN_SCRATCHPAD_Template.md`.

---

### 0) Project Summary & Objective

- **Objective**: Give the agent an inner monologue loop that periodically generates a thought, then reviews and optionally keeps it for long‑term memory. On a later cycle, the agent may surface selected thoughts to the user.
- **Primary users**: Agents acting autonomously for a person; the person optionally notified.
- **Success criteria**:
  - Randomized interval loop reliably executes (≥ 99% across 24h)
  - Thoughts are persisted with clear lifecycle states and metadata
  - Review cycles correctly promote/discard thoughts without duplication
  - Optional user notification gated behind an explicit decision rule
- **Non‑goals (MVP)**: Complex RAG; multi‑persona orchestration; embeddings; cross‑tool summarization.

---

### 1) Constraints & Assumptions

- **Constraints**
  - Compose existing `scheduled-tasks` MCP for timers and LibreChat trigger
  - Persist via `memory` MCP (graph) or a minimal `thoughts` store using `mcp-data`
  - Only “thinking” and “memory” tools available during loop execution
  - No secrets logged; predictable error shapes
- **Assumptions**
  - Effective user can be derived (LibreChat passes `USER_ID`)
  - Persona/system prompt is accessible to the agent at trigger time
  - Random jitter in minutes is acceptable for cadence variability
- **Unknowns**
  - Exact schedule granularity needed (interval vs self‑rescheduling once)
  - Preferred long‑term store: memory graph vs dedicated `thoughts` dataset

---

### 2) User Context & Access Model

- `MCP_USER_BASED=true` for per‑user data isolation
- Effective user resolution: request params → meta → `MCP_USER_ID`
- Shared context: N/A in MVP; could allow operator review later

---

### 3) Data Model

Option A — Memory Graph (reuse `memory` MCP):
- Entity: `Thought_<ISO_TIMESTAMP>_<rand>`
- Observations: `text`, `stage`, `scores`, `tags`, `source=inner_monologue`, `iteration`
- Relations: `reviewed_by -> AgentName`, `about -> UserName`, `supersedes -> ThoughtId?`

Option B — Dedicated `thoughts` dataset (via `mcp-data`):
- Thought
  - `id`, `userId`, `text`, `createdAt`, `updatedAt`
  - `stage: drafted | reviewed1 | reviewed2 | reviewed3 | kept | discarded`
  - `scores: {novelty, utility, alignment}` (0–1)
  - `tags: string[]`, `references: {type, id}[]`
  - `source: 'inner_monologue'`, `scheduledTaskId?: string`

Response envelope for tools: `{ content: [{ type: 'text', text: JSON.stringify({...}) }], isError?: true }`

---

### 4) Tool Inventory

Reuse existing servers; define minimal new tools if Option B is chosen.

- Scheduled‑Tasks (existing)
  - `create_interval_task` (preferred) or self‑rescheduling `create_once_task`
  - Message content: triggers agent to run “thought loop” with limited tools

- Memory (existing, Option A)
  - `create_entities`, `add_observations`, `create_relations`

- Thoughts (new, Option B; minimal)
  - `save_thought(text, tags?) → {id, stage:'drafted'}`
  - `mark_review(id, stage, scores?, decision?) → {id, stage}`
  - `list_thoughts(filter?) → {items}`

Error cases: invalid stage transition; missing id; duplicate saves (idempotency key).

---

### 5) Storage Design

- Start with Option A (reuse Memory Graph) for fast iteration
- Consider Option B if we need stricter lifecycle/query semantics
- `mcp-data` config via env; JSON in dev, Mongo in prod
- Per‑user storage isolation; operation locks for write ops

---

### 6) Web UI Plan (optional)

- Simple list with filters by `stage`, quick actions: keep/discard
- `get_web_ui` via `mcp-web-ui` with session TTL 30m, poll 5s

---

### 7) External Integrations & Security

- LibreChat integration is handled by `scheduled-tasks` for triggers
- Mask credentials; validate required env at startup
- Timeouts/retries on any HTTP calls (already in `scheduled-tasks`)

---

### 8) Observability & Error Handling

- Log per call: tool, user/effective user, duration, outcome
- Predictable error payloads with `isError: true`
- Debug gated by `MCP_DEBUG`

---

### 9) Testing Plan

- Integration: schedule fires → agent stores draft thought → review cycle promotes/filters
- Concurrency: overlapping triggers do not corrupt storage
- Web UI (if enabled): `get_web_ui` returns URL+HTML; actions work
- Cleanup: processes exit cleanly; files close; timers cleared

---

### 10) Release & Ops

- Version bump when changing tool schemas or storage shape
- Smoke tests: list tools; create thought; review thought; optional notify

---

### 11) Risks, Fallbacks, Open Questions

- Risk: Interval tool naming/availability — fallback to self‑rescheduling `once`
- Risk: Memory graph queries for lifecycle states may be awkward — fallback to Option B
- Open: Where to surface thoughts best — chat vs Web UI vs both

---

### 12) Milestones & Tasks

- Phase 1: Wire scheduler → agent loop (draft thought only)
- Phase 2: Add review stages and persistence
- Phase 3: Optional Web UI + batch triage
- Phase 4: “Notify user” decision on stage 3

---

### 13) Prompts & Loop Spec

System (persona‑aware, tool‑limited):
"You are running an inner monologue loop. Only use memory/thought tools. Steps: (1) Generate one brief thought. (2) Save it as stage='drafted'. Respond with JSON only."

Draft step (agent output example):
```json
{
  "thought": "Idea: rotate deep‑work theme weekly to sustain novelty.",
  "tags": ["productivity", "routine"],
  "idempotency_key": "<uuid>"
}
```

Review step prompt:
"Review prior drafted thought. Score novelty, utility, alignment in [0,1]. Decide next stage: reviewed1|reviewed2|reviewed3|kept|discarded. If 'kept' and stage=='reviewed3', you MAY also summarize to the user in this chat. Respond JSON only."

Later batch evaluation:
"List all drafted/reviewed thoughts and decide keep/discard with one‑line justification each. Update storage accordingly."

---

### 14) Example Orchestration (Conceptual)

- Bootstrap: create randomized interval task (e.g., 7–23 minutes jitter). Message instructs agent to run the draft step.
- On trigger: agent generates a thought and saves it → schedules a once task +X minutes for review step.
- On review cycles: promote stage each time; at stage 3, optionally post a summary message to the user (chat reply) and mark `kept`.

If interval API is unavailable, the agent includes in its own response an instruction to schedule the next `once` task with random delay.


