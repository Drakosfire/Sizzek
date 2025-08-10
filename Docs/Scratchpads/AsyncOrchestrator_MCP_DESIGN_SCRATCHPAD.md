## AsyncOrchestrator MCP Design Scratchpad

Partner document to `MCP_DESIGN_INSTRUCTION_MANUAL.md`. This MCP server orchestrates async and multithreaded workloads for agents: create, track, await, cancel, and compose tasks with concurrency controls.

---

### 0) Project Summary & Objective
Purpose: Align on the user problem, scope, and outcomes.

Objective (one paragraph):
Provide an MCP server that gives agents reliable primitives to run and manage parallel work. It exposes simple tools to start tasks (HTTP calls, shell commands — opt-in), await/poll their completion, control concurrency, and build pipelines (fan-out/fan-in). It minimizes cognitive load while maximizing throughput and observability for long-running or batch operations.

Primary users:
- Agents and copilots needing parallel execution (e.g., fetching many URLs, transforming files)
- Human operators using an MCP client (Cursor, IDEs) who want durable task tracking during a session

Success criteria:
- Concurrency control per action/type works with predictable limits (no overload)
- 95%+ task completion without orphaned tasks in normal operation
- Overhead per task submit < 200 ms, status fetch < 50 ms p95
- Clear, structured logs and actionable error payloads

Non-goals:
- Cluster/distributed scheduler or cross-host orchestration
- Infinite durability (tasks persist only for the server lifetime by default)
- Arbitrary code execution without explicit opt-in/allowlists

---

### 1) Constraints & Assumptions
Purpose: Surface boundaries early to prevent churn.

Constraints:
- Runtime: Node.js 20+ (TypeScript); uses `async/await`, `AbortController`, and Worker Threads for CPU-bound tasks
- Resource limits: memory- and CPU-aware queueing; default hard caps to prevent runaway
- Shell execution is disabled by default; requires explicit env gate and per-command allowlist
- Networking subject to domain allowlists and timeouts; retries with backoff

Assumptions:
- Clients can poll or call `await_task` with timeouts
- Effective user ID can be resolved from MCP request metadata or environment
- Tasks are idempotent or carry deduplication keys when needed

Unknowns:
- Whether to provide pluggable persistence beyond JSON files (future: LiteFS/SQLite)

---

### 2) User Context & Access Model
Purpose: Decide personal vs shared data and access rules.

User identification sources:
- `request.meta.user_id` | `request.meta.session_id` | `process.env.USER`

Effective user resolution rule:
- Use `request.meta.user_id` if present; else `session_id`; else fallback to host `USER`. Namespace all task data by effective user.

Shared-context behavior:
- Optional shared queues via `context: "shared"` flag; default is per-user isolation

Authorization checks:
- Disallow shell and external domains unless enabled by env and allowlists
- Enforce per-user concurrency quotas and per-domain rate limits

---

### 3) Data Model
Purpose: Establish minimal entities and fields.

Entities:
- Task
  - `taskId` (uuid), `userId`, `type` (http|shell|compute|delay|pipeline)
  - `status` (queued|running|succeeded|failed|canceled)
  - `input` (opaque JSON), `output` (JSON/string), `error` (code,message,stack?)
  - `createdAt`, `startedAt`, `finishedAt`, `progress` (0..1), `attempts`, `tags`[]
  - `timeoutMs`, `priority`, `dedupeKey?`
- Pipeline
  - `pipelineId`, `name`, `steps` (DAG list, supports fan-out/fan-in), `status`, `createdAt`
- ConcurrencyProfile
  - `name`, `maxConcurrency`, `perDomainLimits?`, `queueDepth`

Invariants:
- A task is in exactly one status at a time
- `finishedAt` set only for terminal states
- `progress` monotonic non-decreasing within a run

Response envelope:
```
{ "success": boolean, "data": any, "isError": boolean, "error": {code?: string, message?: string}, "meta": {taskId?: string} }
```

---

### 4) Tool Inventory
Purpose: Define tools, inputs, outputs, and behavior.

Core tools:
1) create_task
   - Description: Enqueue a task for asynchronous execution
   - inputSchema:
     - `type`: enum ["http","shell","compute","delay","pipeline"]
     - `params`: object (shape depends on type)
     - `timeoutMs?`: number (default per type)
     - `priority?`: number (0 default)
     - `tags?`: string[]
   - Behavior: validates, enqueues according to concurrency profile; returns `taskId`
   - Errors: validation error 422; unauthorized action 403; queue full 429
   - Idempotency: via optional `dedupeKey`
   - Success example: `{ success: true, data: { taskId }, isError: false }`

2) get_task
   - Description: Fetch single task status/details
   - inputSchema: `{ taskId: string }`
   - Output: task record

3) list_tasks
   - Description: List tasks with filters
   - inputSchema: `{ status?: string|array, tags?: string[], limit?: number, cursor?: string }`
   - Output: `{ tasks: Task[], nextCursor?: string }`

4) cancel_task
   - Description: Attempt to cancel a running or queued task
   - inputSchema: `{ taskId: string, reason?: string }`
   - Output: `{ canceled: boolean }`

5) await_task
   - Description: Block (server-side) until completion or timeout
   - inputSchema: `{ taskId: string, timeoutMs?: number }`
   - Output: final task state or timeout error

6) set_concurrency
   - Description: Adjust max concurrency for a queue/type
   - inputSchema: `{ target: string (type or queue name), maxConcurrency: number }`
   - Output: `{ applied: boolean, profile: ConcurrencyProfile }`

7) run_pipeline
   - Description: Submit a pipeline DAG of steps; supports fan-out/fan-in and per-step mappings
   - inputSchema: `{ name?: string, steps: Step[], timeoutMs?: number }`
   - Output: `{ pipelineTaskId: string }`

Type-specific params:
- http: `{ method: "GET|POST|...", url: string, headers?: object, body?: any, retry?: { attempts: number, backoffMs: number } }`
- shell (opt-in): `{ command: string, args?: string[], cwd?: string, env?: object, allowlisted?: boolean }`
- compute: `{ operation: string, args: any }` (operations are predefined safe functions)
- delay: `{ ms: number }`
- pipeline: `{ steps: Step[] }`

---

### 5) Storage Design (mcp-data)
Purpose: Choose backend and configure unified storage.

Decision:
- `MCP_STORAGE_TYPE=JSON` initially. JSONL per user for append-only events; in-memory index for fast lookups.

Default data structure:
- Directory: `mcp-data/async/{userId}/`
- Files: `tasks.jsonl`, `pipelines.jsonl`, `profiles.json`
- Each task append updates as events; on load, rebuild state

Operation locks:
- Per-user mutex for storage writes; per-task lock for state transitions

Backups:
- Optional periodic snapshots to `snapshots/{timestamp}.json`

Migration plan:
- Future option to switch to SQLite with the same domain models

---

### 6) Web UI Plan (if needed)
Purpose: Decide on `get_web_ui` and UI schema.

Decision:
- Include `get_web_ui` for observability and manual controls

UI schema outline:
- Components: Task list, Task detail (live logs), Controls (cancel, retry), Concurrency settings
- Forms: Create HTTP task, Create Pipeline
- Poll interval: 2000 ms; Session TTL: 30 minutes idle

---

### 7) External Integrations & Security
Purpose: Validate envs, auth, retries, and safe logging.

Env vars:
- `ASYNC_ENABLE_SHELL` (boolean; default false)
- `ASYNC_DOMAIN_ALLOWLIST` (csv of host patterns)
- `ASYNC_MAX_CONCURRENCY_DEFAULT` (number)
- `ASYNC_HTTP_TIMEOUT_MS` (number)
- `ASYNC_LOG_REDACT_KEYS` (csv)

Auth gating:
- If client supports user identity, enforce quotas and allowlists per user

Timeout/retry defaults:
- HTTP: timeout 30s, retries 2, exponential backoff starting 500 ms
- Compute/shell: configurable `timeoutMs`, no retries by default

Secret redaction:
- Redact header values and known secret keys in logs and task outputs

Final response pattern:
- All tools use the standard envelope with `isError` and `error.message`

---

### 8) Observability & Error Handling
Purpose: Ensure diagnosable behavior.

Request-scoped logging fields:
- `requestId`, `userId`, `tool`, `durationMs`, `success`, `taskId?`, `type?`, `status?`

Error response pattern:
- `isError: true`, `error: { code, message }`, `data` may include partial state when safe

Debug toggles:
- `MCP_DEBUG=true` increases verbosity and includes task state transitions

Metrics (future):
- Counters for tasks by status; histograms for queue wait and run durations

---

### 9) Testing Plan (align with MCP Server Testing Guide)
Purpose: Agree on test scope and org.

Directory layout:
- `tests/unit/` managers, validators, storage
- `tests/integration/` tools/list, tools/call, await/cancel
- `tests/webui/` HTML route, actions, form submit

Environment:
- `NODE_ENV=test`, unique `mcp-data` temp dir per run

Cases:
- Unit: TaskManager state transitions, backoff, timeouts, redaction
- Integration: create → await; create many → concurrency limit honored; cancel running; pipeline fan-out/fan-in
- Web UI: renders list; cancel button works; live updates poll
- Concurrency: 100 parallel HTTP GETs across 5 domains; verify rate limits

Cleanup:
- Ensure graceful shutdown waits for running tasks to settle or cancel

---

### 10) Release & Ops
Purpose: Smooth rollout and manual validation.

Versioning policy:
- Minor bump for new tool or params; patch for bug fixes; major for breaking schema changes

Smoke tests:
- Start server; `tools/list` shows 7 tools
- Create sample HTTP task to `https://example.com`; await success
- Submit 20 tasks; verify only N run concurrently (N=default)
- Cancel one running task; verify status and logs

Expected logs:
- Startup with profiles, allowlists; per-request structured logs; shutdown summary

---

### 11) Risks, Fallbacks, Open Questions
Purpose: Make risk explicit and define plan B.

Risks & mitigations:
- Zombie processes (shell): use `AbortController` and OS signals; hard kill after grace
- Memory growth from outputs: cap output size; store truncated previews with full output on disk if enabled
- Domain abuse: strict allowlist + per-domain concurrency
- Head-of-line blocking: separate queues per type/domain

Open questions:
- Provide plugin interface for custom compute operations?
- Add SQLite persistence behind a flag from v1.1?

---

### 12) Milestones & Task Breakdown
Purpose: Convert plan to actionable steps.

Phases:
- Phase 1: Server skeleton + ListTools + create_task/http + get/list/cancel/await
- Phase 2: Concurrency manager + per-domain limits + delay/compute tasks
- Phase 3: Pipelines + fan-out/fan-in + backpressure metrics
- Phase 4: Web UI + forms + live logs
- Phase 5: Tests + hardening + docs

Checklist:
- [ ] Create repo structure and env template
- [ ] Implement server skeleton (ListTools/CallTool)
- [ ] Implement TaskManager and storage
- [ ] Add HTTP task type (GET/POST) with retries and timeouts
- [ ] Implement list/get/cancel/await tools
- [ ] Add concurrency controls and set_concurrency
- [ ] Add delay/compute and pipeline execution
- [ ] Implement Web UI and `get_web_ui`
- [ ] Add unit/integration/Web UI tests
- [ ] Graceful shutdown/cleanup
- [ ] README and smoke test notes

---

### 13) Validation Checklist (Pre-Merge Smoke Tests)
Purpose: Quick, repeatable sanity checks.

Checklist:
- [ ] `tools/list` returns expected tools
- [ ] `create_task` (HTTP) happy-path works and returns `taskId`
- [ ] `await_task` yields final state with `output`
- [ ] `cancel_task` transitions to canceled when running
- [ ] `list_tasks` filters by status and tags
- [ ] Concurrency limit respected under load
- [ ] Logs show startup → request → success/failure → cleanup

---

### 14) Final Sign-off
Purpose: Confirm alignment before implementation/merge.

- Stakeholders: Design approved by maintainer; security reviewed for shell/HTTP allowlists
- Version: v0.1.0 once Phase 1 completes


