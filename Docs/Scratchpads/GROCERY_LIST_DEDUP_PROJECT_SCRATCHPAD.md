# Project Scratchpad

- Title: Grocery List Deduplication (Manual + Photo/OCR Ingestion)
- Date: 2025-08-10
- Project: Sizzek/mcp-servers/grocery-list
- Author: Sizzek Team
- Version: 0.1 (draft)
- Related diary: `Docs/ProjectDiary/2025/2025-08-10.md`

---

## 0) Summary & Objectives
- Problem: Duplicate grocery items appear, especially during photo/OCR ingestion or repeated updates, causing clutter and confusion.
- Goal: Enforce robust deduplication on add/update and during OCR ingestion, merging similar items and preventing duplicate listings.
- Primary users: Household shoppers using manual entry and photo-of-list workflow.
- Success criteria (3–5 bullets):
  - [ ] No duplicate visible items after photo import/update
  - [ ] Merging logic preserves correct total quantities and units
  - [ ] p95 add/search/list < 200 ms for 1k items (JSON); < 150 ms (MongoDB indexed)
  - [ ] Idempotent photo re-uploads do not change list (idempotency key)
- Non-goals: Full receipt line-item parsing and budgeting UX (future phases)

## 1) Constraints & Assumptions
- Runtime/Stack: Node.js MCP server (TypeScript/ESM); JSON or MongoDB storage via `mcp-data`
- Environment(s): dev/prod; user-based storage supported
- Build: npm; single package
- External limits: OCR latency/accuracy; MongoDB query performance
- Assumptions: Photo ingestion will produce an array of item strings; unit detection is basic

## 2) Users & Access Model
- Access model: Per-user lists; optional shared context already supported
- AuthN/Z: Delegated to client; server trusts provided user context
- Data ownership: Per-user data isolation

## 3) Data Model & Interfaces
- Entities and fields:
  - GroceryItem { id, name, quantity, unit, category, priority, purchased, purchasedAt?, createdAt, updatedAt, isStaple }
  - Proposed additions (optional fields):
    - source?: 'manual' | 'photo' | 'ocr' | 'import'
    - sourceId?: string  // correlation for photo sessions
    - dedupKeyV1?: string // persisted canonical key for fast matching
- Identifiers & versioning: Numeric id per user; introduce `dedupKeyV1` format `name:unit` after normalization
- Contracts (APIs/tools/modules):
  - add_grocery_item, update_grocery_item, get_grocery_list
  - New: import_grocery_items_from_text (array of strings) [for photo/OCR pipeline]

## 4) Tooling / API Inventory (for MCP or service APIs)
- import_grocery_items_from_text
  - Description: Bulk add items with deduplication and idempotency using `sourceId`
  - InputSchema: { items: string[], sourceId?: string }
  - Side effects: Updates/merges existing items rather than duplicating
  - Security: Same as other tools; user context required

## 5) Storage & Configuration
- Storage: JSON or MongoDB
- Collections: Single document per user (JSON) or per-user collection (MongoDB via factory)
- Configuration & env vars:
  - `GROCERY_DEDUP_ENABLE=true`
  - `GROCERY_DEDUP_FUZZY=true`
  - `GROCERY_DEDUP_THRESHOLD=0.85`  // token/fuzzy threshold
  - `GROCERY_DEDUP_MERGE_STRATEGY=sum` // sum|max|skip
  - `GROCERY_IDEMPOTENCY_WINDOW_MIN=60`

## 6) Web/UI Plan (if applicable)
- Key components: Upload/Photo import → preview match results → merge summary
- Flows: Show proposed merges with quantities; allow undo; highlight conflicts
- State & loading: Optimistic merges; activity toast; idempotent re-upload (same `sourceId`)
- Design constraints: Keep current UI minimal; add non-blocking preview

## 7) Security & Privacy
- Input validation: Trim, sanitize strings; limit bulk size (e.g., max 300 items)
- Secret handling: None added
- PII: None beyond user id context

## 8) Observability & Error Handling
- Structured logs: action, userId, sourceId, itemsProcessed, merges, dedupHits
- Metrics: dedup hit rate, average tokens per item (if fuzzy)
- Errors: Return partial success with list of failed lines; graceful degradation when fuzzy disabled

## 9) Testing Plan
- Proving test (must pass):
  - Given items ["Bananas", "banana 2", "Banana"], result is a single line item with correct total quantity using `sum`
- Unit tests: normalization, key generation, merge rules, idempotency key behavior
- Integration tests: bulk import merges; re-upload with same `sourceId` is idempotent; manual add dedups
- E2E/UI tests (optional): preview shows correct merges; undo restores prior state

## 10) Performance & SLAs
- p95 < 200 ms for add/search/list at 1k items (JSON); < 150 ms with MongoDB indexes
- Bulk import 200 lines p95 < 1.5 s

## 11) Risks & Mitigations
- Over-merge (false positives) → conservative threshold, preview UI, undo
- Under-merge (false negatives) → aliases/synonyms map; iterative improvements
- Unit conflicts → unit normalization map; fallback to separate lines when incompatible
- Race conditions → existing `withLock` used for all write paths

## 12) Milestones & Tasks
- M1: Core dedup (manual + bulk text)
  - [ ] Normalization + keygen utilities
  - [ ] Merge engine (sum|max|skip) with unit normalization
  - [ ] Wire into add/update paths
- M2: Photo/OCR ingestion + idempotency
  - [ ] New import tool and pipeline
  - [ ] `sourceId` and idempotency cache
  - [ ] Preview + logs/metrics
- M3: Quality & UX
  - [ ] Synonyms/aliases map
  - [ ] Conflict resolution prompts (optional)

## 13) Validation Checklist (Acceptance)
- [ ] No visible duplicates after photo import/update
- [ ] Quantities merge per strategy; units normalized where possible
- [ ] Re-upload of same photo/text (same `sourceId`) performs no changes
- [ ] Latency targets met for bulk import and list

## 14) Release & Ops
- Commands: npm build/start
- Health checks: existing server start logs
- Rollout: feature flags default on; can disable fuzzy quickly

---

### Optional: MCP-Specific Addendum
- Response envelope:
```json
{ "content": [{ "type": "text", "text": "..." }], "isError": false }
```
- Minimal tool definition stub:
```json
{
  "name": "import_grocery_items_from_text",
  "description": "Bulk-import grocery items with deduplication and idempotency",
  "inputSchema": { "type": "object", "properties": { "items": {"type": "array", "items": {"type": "string"}}, "sourceId": {"type": "string"} }, "required": ["items"] }
}
```

### File-Level Edits
- `mcp-servers/grocery-list/src/index.ts`
  - Add `normalizeName`, `normalizeUnit`, `generateDedupKey(name, unit)` utilities (or import from `utils/dedup-utils.ts`)
  - On `addGroceryItem` and `updateGroceryItem`, dedup by key: if existing pending item with same dedup key exists → merge per strategy
  - Add `import_grocery_items_from_text` tool: parse lines → normalize → merge; support `sourceId` idempotency (cache last processed hash per `sourceId` for window)
- `mcp-servers/grocery-list/src/types/index.ts`
  - Optional fields: `source?`, `sourceId?`, `dedupKeyV1?`
- `mcp-servers/grocery-list/src/utils/dedup-utils.ts`
  - `normalizeString`, `singularize`, `normalizeUnit`, `generateDedupKey`, `fuzzyEquals(a,b,threshold)`
- `mcp-servers/grocery-list/src/web-ui/GroceryListComponent.js`
  - Optional preview/merge summary UI (non-blocking)

### Env & Config
```env
GROCERY_DEDUP_ENABLE=true
GROCERY_DEDUP_FUZZY=true
GROCERY_DEDUP_THRESHOLD=0.85
GROCERY_DEDUP_MERGE_STRATEGY=sum
GROCERY_IDEMPOTENCY_WINDOW_MIN=60
```

### Tests (Details)
- Unit
  - normalize: "Bananas"→"banana"; punctuation/diacritics handled
  - merge sum/max behavior; incompatible units → no merge
  - idempotency: same `sourceId`+payload hash → skipped
- Integration
  - Manual add duplicates collapse
  - Bulk import merges lines; re-import no-op

### Dependency-Ordered Checklist
- [ ] Utilities
  - [ ] Implement `dedup-utils.ts` (normalize, unit map, keygen, fuzzy)
- [ ] Types/Schema
  - [ ] Add optional `source`, `sourceId`, `dedupKeyV1`
- [ ] Core Paths
  - [ ] Wire dedup into `addGroceryItem`
  - [ ] Wire dedup into `updateGroceryItem`
  - [ ] Implement `import_grocery_items_from_text` with idempotency cache
- [ ] UI (optional)
  - [ ] Add preview merge summary for imports
- [ ] Tests
  - [ ] Unit + integration covering manual + import dedup and idempotency
