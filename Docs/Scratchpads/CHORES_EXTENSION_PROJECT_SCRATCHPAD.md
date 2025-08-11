# Project Scratchpad: Chores (Recurring Tasks & Household Rotation) — Todoodles Extension

- Title: Chores (Recurring Tasks & Household Rotation) — Todoodles Extension
- Date: 2025-08-10
- Project: Sizzek/mcp-servers/todoodles
- Author: System
- Version: 0.1 (draft)
- Related diary: `ProjectDiary/2025/2025-08-10.md`

---

## 0) Summary & Objectives
- Problem: Users need lightweight, recurring household chores with rotation and reminders. Current `todoodles` lacks recurrence, assignments, streaks, and reminder mechanics.
- Goal: Extend `todoodles` with chore-specific capabilities (recurrence rules, assignments, rotation, next-due computation, reminders via scheduled tasks) without fragmenting storage or UI.
- Primary users: Single users and small households using `todoodles` today; agents orchestrating reminders.
- Success criteria (3–5 bullets):
  - [ ] Create/list/update chores with recurrence and assignee in < 1s
  - [ ] Next-due/overdue computed deterministically and persisted
  - [ ] Optional reminders trigger at correct times (>=99% success)
  - [ ] Rotation assigns next person accurately with fairness (tie-broken deterministically)
- Non-goals: Full workforce scheduling, complex calendar sync (beyond optional hooks), billing/permissions.

Decision: Start as a `todoodles` extension. Split into a dedicated "chores" MCP only if we add multi-tenant households, rich calendar sync, or complex gamification that materially diverges from todo semantics.

## 1) Constraints & Assumptions
- Runtime/Stack: TypeScript/ESM; `@modelcontextprotocol/sdk`; `mcp-data` storage.
- Environment(s): local/dev; optional prod with Mongo.
- Package manager/build: npm; existing scripts from `todoodles`.
- External limits: Reminder frequency capped (e.g., min 15m) to prevent spam.
- Assumptions: Single shared catalog per user; household members identified by names/emails (no SSO at MVP).

## 2) Users & Access Model
- Access model: User-based; optional household context owned by creator.
- AuthN/Z: Same as `todoodles` (local MCP context). No cross-user reads.
- Data ownership/tenancy: Per-user storage with shared household sub-entities inside that user's data.

## 3) Data Model & Interfaces
- Entities and fields:
  - Chore { id: string, title: string, description?: string, tags?: string[], recurrence: RecurrenceRule, assignees: string[], rotation?: { mode: 'round_robin'|'load_balanced', lastAssignee?: string }, points?: number, createdAt: ISO, updatedAt: ISO, lastCompletedAt?: ISO, nextDueAt?: ISO, status: 'active'|'paused' }
  - RecurrenceRule { type: 'daily'|'weekly'|'monthly'|'interval'|'custom', intervalDays?: number, weekdays?: number[], dayOfMonth?: number, time?: 'HH:MM', timezone?: string, startDate?: ISO }
  - ChoreEvent { id: string, choreId: string, when: ISO, action: 'completed'|'skipped'|'reminded', by?: string }
  - Household { id: string, name: string, members: string[], rules?: { skipWeekends?: boolean } }
- Identifiers & versioning: UUID v4; metadata.version bump on breaking changes.
- Contracts (MCP tools/modules):
  - add_chore: Input { title, recurrence, assignees, points?, tags? } -> Output { ok, chore }
  - list_chores: Input { status?, dueBefore?, assignee?, tag? } -> { ok, items, total }
  - complete_chore: Input { choreId, by? } -> { ok, chore, nextDueAt }
  - rotate_chore: Input { choreId } -> { ok, assignee }
  - schedule_chore_reminder: Input { choreId, enabled: boolean } -> { ok }
  - get_web_ui: { } -> URL + HTML (includes chores panel)

## 4) Tooling / API Inventory (for MCP or service APIs)
- add_chore
  - Description: Create a recurring chore with assignment/rotation.
  - InputSchema: object; required: title, recurrence, assignees[>=1]
  - Side effects: Writes chore; computes initial nextDueAt
  - Security: User-scoped
- complete_chore
  - Description: Mark as done; update lastCompletedAt and recompute nextDueAt; rotate if configured
  - InputSchema: object; required: choreId
  - Side effects: Writes event; may rotate assignee
  - Security: User-scoped
- schedule_chore_reminder
  - Description: Toggle reminder job (via scheduled-tasks or internal timer)
  - InputSchema: object; required: choreId, enabled
  - Side effects: Creates/updates a scheduled trigger
  - Security: User-scoped

## 5) Storage & Configuration
- Storage: `mcp-data` user storage alongside `todoodles` data under a new `chores` namespace.
- Paths/buckets/collections: JSON baseDir `DATA_DIR` or Mongo collection `user_todoodles` extended with `chores` map.
- Configuration & env vars:
  - `MCP_STORAGE_TYPE`: json|mongodb [required] (default: json)
  - `MONGODB_CONNECTION_STRING`: Mongo URI [optional]
  - `MONGODB_DATABASE`: DB name [optional]
  - `MONGODB_COLLECTION`: collection name [optional] (default: user_todoodles)
  - `MCP_BACKUP_ENABLED`: JSON backups [optional] (default: false)
  - `CHORES_REMINDER_INTEGRATION`: 'internal'|'scheduled-tasks' [optional] (default: 'internal')

## 6) Web/UI Plan (if applicable)
- Key screens/components: Chores list with due/assignee; quick add; rotation controls; schedule toggle; history.
- Flows: CRUD, complete, rotate, enable reminders.
- State & loading: Poll every 5s; session TTL 30m; optimistic complete.
- Design constraints: Reuse `todoodles` Web UI patterns/components.

## 7) Security & Privacy
- Permissions & least privilege: User-scoped ops only; no cross-user.
- Input validation & sanitization: Title length caps; recurrence bounds; timezone whitelist/validation.
- Secret handling: No secrets logged.
- Data residency/PII: Assignee names/emails treated as user data; no external sharing.

## 8) Observability & Error Handling
- Structured logs: tool, user, choreId, duration, result, nextDueAt.
- Metrics: counts of chores, completed/day, overdue, reminder success.
- Error strategy: Clear messages; retries for reminder scheduling; deterministic rotation.

## 9) Testing Plan
- Proving test (must pass): Completing a weekly chore recomputes nextDueAt to next scheduled day and rotates assignee correctly.
- Unit tests: recurrence computation, rotation fairness, nextDue calculation, validation.
- Integration tests: add/list/complete/rotate; reminder toggle; web UI flows.
- E2E/UI tests: Create->Complete->Rotate->List overdue; reminder fires.
- AI tests: Prompt rendering for add/complete; response JSON validation.

## 10) Performance & SLAs
- Latency targets: p50 < 50ms; p95 < 150ms for local JSON.
- Throughput/limits: N/A (single-user scale); cap reminders to 1/min per user.
- Resource constraints: Minimal memory; periodic compaction optional.

## 11) Risks & Mitigations
- Risk: Recurrence edge cases (DST, monthly 31st) -> Mitigation: use same schedule helpers as `scheduled-tasks`; unit tests for edges.
- Risk: Rotation fairness disputes -> Mitigation: deterministic round-robin; expose lastCompletedAt.
- Risk: Reminder drift/downtime -> Mitigation: on-start catch-up; optional `scheduled-tasks` integration.

## 12) Milestones & Tasks
- M1: Data model + core tools
  - [ ] Extend storage with `chores` namespace
  - [ ] add_chore / list_chores / complete_chore
  - [ ] nextDue computation + rotation
- M2: Reminders + UI
  - [ ] schedule_chore_reminder (internal timer)
  - [ ] Web UI chores panel
  - [ ] Tests (unit/integration/UI)
- M3: Hardening & optional integrations
  - [ ] `scheduled-tasks` adapter
  - [ ] Mongo support + migration notes

## 13) Validation Checklist (Acceptance)
- [ ] Creating a weekly chore computes correct nextDueAt
- [ ] Completing rotates assignee deterministically
- [ ] Reminder triggers at configured time window reliably
- [ ] Web UI reflects due/overdue and rotation state

## 14) Release & Ops
- Scripts/commands: reuse `todoodles` dev/start/test; add `CHORES_REMINDER_INTEGRATION` env.
- Health checks: startup log markers and tool list sanity.
- Rollout plan & rollback: Feature-flag chores UI/tools; can disable without data loss.

---

### Optional: MCP-Specific Addendum
- Response envelope:
  ```json
  { "content": [{ "type": "text", "text": "{\"ok\":true}" }], "isError": false }
  ```
- Minimal tool definition stub:
  ```json
  {
    "name": "add_chore",
    "description": "Create a recurring chore",
    "inputSchema": { "type": "object", "properties": { "title": {"type":"string"} }, "required": ["title"] }
  }
  ```

### Build vs. Separate MCP Decision
- Start as Todoodles extension: shared UI, storage, and patterns; lowest integration cost.
- Split to separate MCP if/when: household multi-tenancy across users, calendar/SMS deep integrations, gamification/leaderboards, or if tool catalog diverges substantially.
