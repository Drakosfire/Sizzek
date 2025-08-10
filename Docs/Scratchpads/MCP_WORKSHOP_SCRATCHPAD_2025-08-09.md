# MCP Design Scratchpad — MCP Workshop Server

- Date: 2025-08-09
- Project: DungeonMind
- Author: system
- Version: 0.1 (draft)
- Related diary: `ProjectDiary/2025/2025-08-09.md`

---

## 0) Project Summary & Objectives
- Problem: Users need a guided way to design and scaffold MCP servers (e.g., persona managers) without manual boilerplate.
- Goal: A conversational “Workshop” MCP server that walks through a structured scratchpad, validates inputs, generates a runnable server, smoke-tests it, and can spawn it as a child.
- Outcomes:
  - Finalized design scratchpad per session
  - Generated TypeScript/ESM server project
  - Optional child process running the generated server
  - Minimal Web UI for the wizard
- Non-goals:
  - Full-blown template marketplace (future)
  - Multi-cloud deployment automation

## 1) Constraints & Assumptions
- Runtime: Node.js 20+, TypeScript ESM, `@modelcontextprotocol/sdk`
- Environment: local dev; later containerized
- Package manager: npm (pnpm/yarn optional)
- Rate limits: N/A (local); apply backoff for future remote APIs
- Hosting: local for now; production later

## 2) User Context & Access Model
- Model: `MCP_USER_BASED=true` — per-user sessions and storage files
- Effective user: provided by client; session metadata persisted
- Permissions: local-only; later add role-based constraints if exposing remotely

## 3) Data Model
- WorkshopSession
  - sessionId, userId, createdAt, updatedAt, currentStep
  - answers: Dict<sectionId, Record<string, any>>
  - status: `active | ready_to_generate | generated | child_running`
  - artifacts: { scratchpadPath, projectPath, logs }
- WorkshopStep
  - id, title, prompts[], validationRules, next(session) → id
- GeneratedServerInfo
  - name, version, projectPath, entry, envTemplatePath, spawnPid?
- Response envelope (tool outputs)
  - `{ content: [{ type: 'text'|'json', text?: string, data?: any }], isError?: boolean }`

## 4) Tool Inventory
- start_workshop(name, template?, goal?) → { sessionId, nextPrompt }
- advance_workshop(sessionId, answers) → { nextPrompt | sectionComplete | readyToGenerate }
- finalize_scratchpad(sessionId) → { path, contentPreview }
- scaffold_server(sessionId, outputDir, packageManager?) → { projectPath, scripts, installCommand }
- run_smoke_tests(sessionId) → { passed, summary, logPath }
- launch_child_server(sessionId) → { pid, readyMarkerSeen }
- get_web_ui() → { url, html? }

Input schemas: minimal JSON Schema validation for each as per design.

## 5) Storage Design
- Storage type: JSON file per user with operation-level locks
- Path: `DATA_FILE_PATH=./workshop-data.json` (default)
- Locking: in-process mutex keyed by sessionId; later upgrade to file lock if needed
- TTL: sessions expire after 30 minutes idle (extend on activity)

## 6) Web UI Plan
- Components: Step navigator, current step form, preview pane
- Actions: next/prev/save, finalize, scaffold, test, launch
- Polling: 5s for long tasks (install/tests)
- Delivery: `get_web_ui` tool returns URL + HTML (basic), or opens local server

## 7) Integrations & Security
- Env:
  - `MCP_STORAGE_TYPE=json`
  - `MCP_USER_BASED=true`
  - `DATA_FILE_PATH=./workshop-data.json`
  - `MCP_DEBUG=false`
  - Optional: `WORKSHOP_OUTPUT_ROOT`
- Security controls:
  - Validate `outputDir` is within allowed root
  - Redact envs in logs; structured logs with context
  - Child process allowlist: node entrypoint only; no arbitrary commands

## 8) Observability & Error Handling
- Structured logging: tool name, sessionId, userId, duration, result
- Error shape: `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`
- Debug toggle via `MCP_DEBUG`

## 9) Testing Plan
- Unit: managers (WorkshopManager, ScratchpadFiller, ServerScaffolder)
- Integration: tool list/call, error paths, session isolation
- Web UI: `get_web_ui` returns URL + HTML; form progression works
- Concurrency: advancing steps concurrently does not corrupt state
- Smoke tests for generated server: list-tools, happy path tool, error tool

## 10) Release & Ops
- Versioning: semantic version for Workshop and templates
- Scripts: `dev`, `build`, `test`, `start`
- Health: log startup, ready markers; add `/health` if HTTP UI used

## 11) Risks & Fallbacks
- Risk: Path traversal / env leakage when spawning child servers
  - Mitigation: output root allowlist, env redaction, allowlisted command
- Risk: Session corruption under concurrency
  - Mitigation: per-session locks, schema validation at each step
- Risk: Template scope creep
  - Mitigation: minimal template set; add via catalog later
- Fallbacks: if generation fails, provide template-based server with stubs

## 12) Milestones & Tasks
- M1: Minimal server skeleton with tool inventory
- M2: Session storage, step schemas, scratchpad rendering
- M3: Scaffolder + template for “Personality Manager”
- M4: Smoke tests + child-server launcher
- M5: Basic Web UI and docs

## 13) Validation Checklist
- start/advance/finalize tools function with happy-path inputs
- Scratchpad renders with sections 0–14 and saved answers
- Generated server runs, passes smoke tests
- Child server launches and can be stopped; no path traversal

## 14) Final Sign-off
- Readiness criteria:
  - Wizard covers all sections and validates inputs
  - Server scaffolding works end-to-end locally
  - Logs are structured; errors are user-friendly

---

### Appendix A: Minimal Server Skeleton (note)
TypeScript/ESM, `@modelcontextprotocol/sdk`, stdio transport, tools registered as defined above. Uses `.env` and `MCP_DEBUG` for verbosity.

