# Project Scratchpad

- Title: Scheduled Tasks — Missed-Run Detection & Catch-up Execution
- Date: 2025-08-10
- Project: Sizzek/mcp-servers/scheduled-tasks
- Author: Sizzek Team
- Version: 0.1 (draft)
- Related diary: `Docs/ProjectDiary/2025/2025-08-10.md`

---

## 0) Summary & Objectives
- Problem: If the server is paused, delayed, or the event loop is blocked, some tasks that should have run may not execute on time. We need a reliable way to detect and fire missed tasks at the current time.
- Goal: Add an on-demand tool and optional heartbeat that scan for overdue tasks and either execute them immediately (coalesce) or backfill a limited number of runs for recurring schedules.
- Primary users: Owners of tasks and shared contexts (LibreChat-driven automations).
- Success criteria:
  - [ ] On-demand call executes eligible missed tasks within a configurable lookback window
  - [ ] One-time tasks missed are executed once and then cleaned up
  - [ ] Recurring tasks: coalesce mode executes one immediate catch-up; backfill mode runs up to N missed occurrences
  - [ ] Guardrails prevent task storms; logs/metrics reflect catch-up actions
- Non-goals: Full cron-like historical replay beyond configured caps

## 1) Constraints & Assumptions
- Runtime: Node.js (TypeScript/ESM), stdio MCP transport
- Storage: Uses existing unified storage via `TaskStorageManager`
- Existing behavior: On init, one-time overdue tasks are executed; recurring tasks are rescheduled (no catch-up)
- Assumption: Schedules are Interval/Daily/Weekly/Monthly/Scheduled/Once; time is system UTC

## 2) Users & Access Model
- Access model: Respect existing user access (`validateUserAccess`) for any catch-up execution
- Scope: By default, operate on tasks accessible to the effective user; admin mode optional later
- AuthN/Z: Inherit from existing server model; no new auth

## 3) Data Model & Interfaces
- Entities: `Task` unchanged; optionally add transient fields
- Proposed optional fields:
  - `missedRuns?: number` (counter)
  - `lastCatchupAt?: string` (ISO timestamp)
- Identifiers & versioning: No breaking schema; fields optional

## 4) Tooling / API Inventory
- catch_up_missed_tasks
  - Description: Scan for tasks that should have run in a lookback window and execute them now
  - InputSchema: { lookbackMinutes?: number (default 60), mode?: 'coalesce'|'backfill', maxBackfillPerTask?: number (default 1), maxTotalExecutions?: number (default 20), statuses?: ('scheduled'|'pending'|'failed')[] }
  - Output (text JSON): { executedTaskIds: string[], skippedTaskIds: string[], stats: { totalConsidered, totalExecuted, coalesced, backfilled } }
  - Errors: invalid_input, limit_exceeded
- Optional: enable_catchup_heartbeat / disable_catchup_heartbeat
  - Description: Toggle periodic catch-up job
  - InputSchema: { intervalMinutes?: number, lookbackMinutes?: number, mode?: 'coalesce'|'backfill', maxBackfillPerTask?: number, maxTotalExecutions?: number }

## 5) Storage & Configuration
- Storage: No schema migration required; optional fields are additive
- Configuration & env vars:
  - `ST_CATCHUP_ENABLE=true`
  - `ST_CATCHUP_LOOKBACK_MIN=60`
  - `ST_CATCHUP_MODE=coalesce`  # coalesce|backfill
  - `ST_CATCHUP_MAX_BACKFILL=1`
  - `ST_CATCHUP_MAX_TOTAL_EXECUTIONS=20`
  - `ST_CATCHUP_HEARTBEAT_MIN=0`  # 0 disables

## 6) Web/UI Plan (optional)
- Web UI: Add a button "Catch up missed tasks" with parameters; show summary
- State: Non-blocking, show progress indicator; paged results if large

## 7) Security & Privacy
- Respect task ownership and shared contexts
- Log only IDs/names; avoid sensitive message content
- Rate-limit heartbeat; cap executions per run

## 8) Observability & Error Handling
- Structured logs: { userId, lookback, mode, considered, executed, per-task outcomes }
- Metrics: catch-up run count, executed, skipped, backfilled
- Errors: Partial success allowed; return per-task results

## 9) Testing Plan
- Proving test:
  - Given a one-time task with nextRun 10 minutes ago and enabled, catch-up executes it once and removes it
- Unit tests:
  - Window calculation; coalesce vs backfill selection; caps enforced
  - Access filtering; status filtering (scheduled/pending/failed)
- Integration tests:
  - Mix of once + recurring overdue tasks → coalesce executes once each; backfill runs up to N per task
  - Heartbeat (if enabled) triggers on interval without duplication

## 10) Performance & SLAs
- Catch-up scan over 1k tasks completes < 300 ms; execution count capped
- Heartbeat minimum interval ≥ 1 minute

## 11) Risks & Mitigations
- Task storm (too many backfills) → strict caps and defaults; mode default coalesce
- Double execution race → use existing `runningTasks` guard; idempotent checks
- Time drift → use server time consistently; allow tolerance (± few seconds)

## 12) Milestones & Tasks
- M1: On-demand catch-up
  - [ ] Add `catchUpMissedTasks` method in `TaskManager`
  - [ ] Implement coalesce/backfill logic with caps
  - [ ] Expose `catch_up_missed_tasks` tool in `index.ts`
  - [ ] Logs/metrics
- M2: Optional heartbeat
  - [ ] Add lightweight scheduler to invoke catch-up periodically
  - [ ] Env gating and interval controls
- M3: UX & Quality
  - [ ] Web UI action + summary
  - [ ] Tests and documentation

## 13) Validation Checklist (Acceptance)
- [ ] One-time missed task executes on catch-up and is cleaned up
- [ ] Recurring overdue tasks execute once in coalesce mode
- [ ] Backfill mode runs up to N occurrences per task within window
- [ ] Caps (`maxTotalExecutions`, `maxBackfillPerTask`) respected
- [ ] Access rules enforced; logs/metrics captured

## 14) Release & Ops
- Commands: npm build/start
- Health checks: existing server logs
- Rollout: default `ST_CATCHUP_ENABLE=true`, heartbeat disabled by default (`ST_CATCHUP_HEARTBEAT_MIN=0`)

---

### File-Level Edits
- `mcp-servers/scheduled-tasks/src/core/task-manager.ts`
  - Add `catchUpMissedTasks(options)` implementing scan + coalesce/backfill
  - Helper: `computeMissedOccurrences(task, lookbackStart, now)` for recurring schedules
  - Respect `runningTasks`; update `lastRun/nextRun` accordingly
- `mcp-servers/scheduled-tasks/src/index.ts`
  - Add tool `catch_up_missed_tasks`; parse inputs; pass effective user context
  - Optional: heartbeat toggles
- `mcp-servers/scheduled-tasks/src/types/index.ts`
  - Add optional `missedRuns?: number`, `lastCatchupAt?: string`
- `mcp-servers/scheduled-tasks/src/web-ui/ScheduleListComponent.js`
  - Add action button with form; display summary result

### Env & Config
```env
ST_CATCHUP_ENABLE=true
ST_CATCHUP_LOOKBACK_MIN=60
ST_CATCHUP_MODE=coalesce
ST_CATCHUP_MAX_BACKFILL=1
ST_CATCHUP_MAX_TOTAL_EXECUTIONS=20
ST_CATCHUP_HEARTBEAT_MIN=0
```

### Dependency-Ordered Checklist
- [ ] Types/Schema
  - [ ] Optional fields (`missedRuns`, `lastCatchupAt`)
- [ ] Core Logic
  - [ ] Implement `catchUpMissedTasks` with coalesce/backfill and caps
  - [ ] Add occurrence computation for recurring schedules
- [ ] Tool Surface
  - [ ] Expose `catch_up_missed_tasks` in `index.ts` with validation
- [ ] Optional Heartbeat
  - [ ] Implement gated periodic invocation
- [ ] Web UI (optional)
  - [ ] Add action + form + summary display
- [ ] Tests
  - [ ] Proving + unit + integration
