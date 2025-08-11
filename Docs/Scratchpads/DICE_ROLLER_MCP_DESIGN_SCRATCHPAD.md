## Dice Roller MCP — Design Scratchpad

Partner to `MCP_DESIGN_INSTRUCTION_MANUAL.md`. Lightweight MCP server for robust dice notation, deterministic rolls (optional), and macros. Keep safe, fast, agent-friendly.

---

### 0) Project Summary & Objective
Purpose: Align on the user problem, scope, and outcomes.

- Problem: Agents and users need reliable, expressive dice rolls (e.g., TTRPGs) with clear breakdowns.
- MVP capability: Parse and roll common dice notation; optional seed; verbose breakdown; safe limits.
- Success criteria
  - [ ] `roll_dice` returns total + breakdown for expressions like `4d6kh3+2`
  - [ ] Limits prevent runaway expressions with helpful errors
  - [ ] Seeded rolls reproduce deterministically across runs
  - [ ] Tools list stable; error shape consistent (`isError: true`)
- Non-goals: Full-blown probability engine/UI beyond basic; external auth flows

---

### 1) Constraints & Assumptions
Purpose: Surface boundaries early.

- Runtime: Node.js (TypeScript, ESM), stdio MCP transport
- Storage: Optional (macros/history); core roll stateless
- Limits (env-driven defaults): dice ≤ 200, sides ≤ 1000, terms ≤ 50, explosions ≤ 1000
- RNG: default crypto RNG; optional seedable PRNG
- Latency: typical < 10 ms per roll for common expressions

Checklist
- [ ] Limits documented in env
- [ ] Seed behavior documented
- [ ] Performance guardrails noted

---

### 2) User Context & Access Model
Purpose: Decide personal vs shared data and access rules.

- Personal usage by default; per-user macros when storage enabled
- Effective user ID from request params/meta; fallback to `MCP_USER_ID`
- No special auth; client responsible for gating

Checklist
- [ ] Effective user resolution defined
- [ ] Storage isolation strategy documented (if enabled)

---

### 3) Data Model
Purpose: Minimal entities and fields.

- RollRequest { expression: string, options?: { seed?: string|number, label?: string, verbose?: boolean } }
- RollResult { total: number, breakdown: Array<{ die: string, results: number[], kept?: number[], dropped?: number[], modifiers?: number[] }>, normalizedExpression: string, rng: { type: 'crypto'|'seeded', seed?: string }, timestamp: string }
- Macro { id: string, name: string, expression: string, ownerUserId: string, createdAt: string, updatedAt: string }

Checklist
- [ ] Entities and fields listed
- [ ] IDs and uniqueness rules defined (macro name per user)
- [ ] Validation rules captured (expression grammar, limits)

---

### 4) Tool Inventory
Purpose: Define tools, inputs, outputs, behavior.

- roll_dice
  - Description: Parse and evaluate a dice expression with limits and optional seed
  - InputSchema: { expression: string, seed?: string|number, label?: string, verbose?: boolean }
  - Output: JSON text { total, breakdown, normalizedExpression, rng }
  - Errors: invalid_expression, limits_exceeded
- parse_dice
  - InputSchema: { expression: string }
  - Output: JSON text { normalizedExpression, astSummary, diceCount, sidesMax }
- define_macro (optional phase 2)
  - InputSchema: { name: string, expression: string, overwrite?: boolean }
  - Output: { ok: true, name }
- list_macros (optional)
  - InputSchema: {}
  - Output: [{ name, expression }]
- delete_macro (optional)
  - InputSchema: { name: string }
  - Output: { ok: true }
- roll_macro (optional)
  - InputSchema: { name: string, seed?: string|number, label?: string, verbose?: boolean }
  - Output: same as roll_dice
- simulate_probability (optional later)
  - InputSchema: { expression: string, trials?: number, seed?: string|number }
  - Output: { mean, p50, p90, histogram }
- get_web_ui (optional later)
  - InputSchema: {}
  - Output: URL + HTML in text content

Checklist
- [ ] Names/descriptions added
- [ ] Input schemas with requireds
- [ ] Error conditions and messages
- [ ] Idempotency (N/A for rolls; macro writes idempotent on overwrite)

---

### 5) Storage Design (mcp-data)
Purpose: Backend selection and defaults.

- MVP: no storage required
- Phase 2 (macros): JSON or Mongo via `StorageFactory.createUserStorage`
- Default data: { macros: [], metadata: { version, updatedAt, counts } }
- Operation locks: per-user on writes
- Backups for JSON; simple migration if schema changes

Checklist
- [ ] Storage type decision recorded
- [ ] Default data written (if enabled)
- [ ] Locks and backup policy noted

---

### 6) Web UI Plan (optional)
Purpose: Decide on UI.

- Minimal console: expression input, result with breakdown, macro CRUD
- Session TTL 30 min; poll 5s if history shown (optional)

Checklist
- [ ] Decision on `get_web_ui`
- [ ] UI schema outline documented

---

### 7) External Integrations & Security
Purpose: Validate envs and safe logging.

- Required envs (with defaults):
  - DICE_MAX_DICE=200
  - DICE_MAX_SIDES=1000
  - DICE_MAX_TERMS=50
  - DICE_MAX_EXPLOSIONS=1000
  - DICE_ENABLE_ADVANCED=true
  - MCP_STORAGE_TYPE=json|mongodb (if macros)
  - MCP_USER_BASED=true|false
  - MCP_DEBUG=false
- No secrets; never log seeds or user expressions at DEBUG unless user consented
- Timeouts not needed (local compute); guard CPU by limits

Checklist
- [ ] Env list + validation behavior
- [ ] Debug redaction policy

---

### 8) Observability & Error Handling
Purpose: Ensure diagnosable behavior.

- Log per request: tool, userId, duration, expression hash, normalized, diceCount, result total (if allowed)
- Error shape: `{ content: [{ type: 'text', text: 'Error: <message>' }], isError: true }`
- `MCP_DEBUG=true` enables AST and breakdown logging (redacted seeds)

Checklist
- [ ] Request-scoped fields listed
- [ ] Error response pattern confirmed

---

### 9) Testing Plan
Purpose: Test scope and org.

- Unit
  - Parser: valid/invalid expressions; normalization
  - Limits: dice/sides/terms/explosions rejections
  - RNG: seeded determinism; crypto RNG smoke
  - Operators: explode, keep/drop, reroll, parentheses precedence
- Integration
  - tools/list catalog
  - roll_dice happy/error; parse_dice
  - Macro CRUD (phase 2)
- Concurrency
  - Parallel rolls produce correct results; no shared-state mutation
- Web UI (optional)
  - URL/HTML returned; form actions for macros

Checklist
- [ ] Directory layout noted
- [ ] Server helper readiness + timeouts
- [ ] Unit/integration cases listed

---

### 10) Release & Ops
Purpose: Smooth rollout.

- Versioning: bump on tool schema/storage changes
- Smoke tests: list-tools; roll `4d6kh3+2`; limits enforced; seeded reproducibility
- Logs: startup env echo (masked), init complete, per-call info, cleanup

Checklist
- [ ] Version bump rules
- [ ] Smoke test checklist
- [ ] Expected logs listed

---

### 11) Risks, Fallbacks, Open Questions
Purpose: Make risk explicit.

- Risks
  - Runaway expressions → strict tokenizer and hard caps
  - Ambiguous notation → normalize and clear error messages
  - RNG fairness/determinism tradeoff → default crypto; seed optional
- Fallbacks
  - Disable advanced ops via `DICE_ENABLE_ADVANCED=false`
  - Cap explosions and ignore excess rolls
- Open questions
  - Do we store roll history? (default no)
  - Do we need advantage/disadvantage shorthand (d20a/d20d) in MVP?

Checklist
- [ ] Risks with mitigations
- [ ] Fallback strategies
- [ ] Open questions assigned

---

### 12) Milestones & Task Breakdown
Purpose: Convert plan to steps.

- Phase 1: Parser + Roller + Core Tools
  - [ ] Grammar/tokenizer + normalization
  - [ ] Limits enforcement
  - [ ] Crypto RNG + seeded PRNG
  - [ ] Implement explode/keep/drop/reroll/parentheses
  - [ ] roll_dice + parse_dice tools; logging; errors
- Phase 2: Macros + Optional UI
  - [ ] Storage wiring (JSON/Mongo) and per-user macros
  - [ ] define/list/delete/roll_macro
  - [ ] get_web_ui minimal console (optional)
- Phase 3: Probability Simulation (Optional)
  - [ ] simulate_probability tool with trials and basic histogram

---

### 13) Validation Checklist (Pre-Merge)
Purpose: Quick sanity checks.

- [ ] tools/list shows expected tools (phase-appropriate)
- [ ] roll_dice("4d6kh3+2") returns total + breakdown; normalized matches
- [ ] Limits enforced with clear errors
- [ ] Seeded rolls reproduce across runs
- [ ] Web UI (if present) returns working URL+HTML

---

### 14) Final Sign-off
Purpose: Confirm alignment before implementation.

- [ ] Stakeholder review complete
- [ ] Open questions resolved or ticketed
- [ ] Version/changelog updated (if applicable)
