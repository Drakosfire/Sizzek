## Todoodles MCP — Polish Scratchpad (Hierarchy + Smart Search + Web UI)

Scope: Add hierarchical sub-todoodles and dependency management, improve search (normalization, filters, quick-add parsing), and enhance Web UI for productivity. Targets concrete UX and data integrity improvements, maintaining compatibility with existing tools.

---

### 0) Objectives
- Introduce sub-todoodles (hierarchical tasks) with dependency links and blocked-state awareness.
- Improve search robustness (punctuation/diacritics/whitespace) and add structured filters (priority/category/due/status).
- Add quick-add natural language parsing (e.g., "Write draft due Fri #docs p:high").
- Enhance Web UI: tree view with checkboxes, blocker indicators, drag-and-drop ordering.

Success criteria
- [ ] Can create sub-todoodles under a parent and see proper tree rendering in Web UI
- [ ] Completion is blocked when dependencies are incomplete, unless forced with override
- [ ] Search supports queries like: `status:overdue priority:high category:docs "write draft"`
- [ ] Quick-add parses due date, priority, and category with >95% accuracy on common patterns
- [ ] p95 for list/search < 200ms for 1k items (JSON) and < 150ms (MongoDB indexed)

---

### 1) Current State & Gaps
- Data model: flat `items: TodoodleItem[]` with fields `{ id, text, createdAt, completed, completedAt?, timeToComplete?, category?, priority, dueDate? }` in `src/index.ts`.
- Storage: user-aware JSON or MongoDB via `mcp-data`; encryption optional; operation locks guard concurrent writes.
- Tools: add/update/complete/delete/get/search/by-category/by-priority/get-due/get-categories/get-stats/get_web_ui.
- Search: simple `includes` on `text` or `category` (case-insensitive); no priority/date/status filtering; no fuzzy/diacritics normalization.
- No native hierarchy (`parentId`) or dependencies; no blocked-state; deletion is non-cascading; no ordering.
- Web UI: available via `get_web_ui`, but no explicit tree rendering or dependency indicators.

---

### 2) Design: Hierarchical Todoodles & Dependencies
Core idea: extend schema minimally to support parent/child relationships and dependency enforcement.

- Schema additions (non-breaking; optional fields):
  - `parentId?: string` — parent task ID (for hierarchy)
  - `dependsOnIds?: string[]` — list of blocking task IDs
  - `orderIndex?: number` — sibling ordering (drag-and-drop)
  - `tags?: string[]` — lightweight labels beyond `category`
  - Derived/computed (not persisted): `isBlocked: boolean` (true if any `dependsOnIds` incomplete)

- Completion rules
  - Default: disallow completing a task if any `dependsOnIds` are incomplete; return helpful error with list of blockers
  - Override: `force=true` flag to allow manual completion
  - Auto-complete parent when all descendants are complete (configurable)

- Deletion rules
  - Soft-check: refuse delete if node has children unless `cascade=true`
  - Cascade delete updates `parentId` of children or removes subtree per chosen strategy (default: delete subtree)

- New/updated tools
  - `add_sub_todoodle(parentId, text, category?, priority?, dueDate?)`
  - `add_dependency(taskId, dependsOnId)` / `remove_dependency(taskId, dependsOnId)`
  - `get_subtree(rootId)` — returns nested structure for Web UI
  - `reorder_siblings(parentId, orderedIds[])`
  - Update existing: `complete_todoodle(id, force?)`, `delete_todoodle(id, cascade?)`

Implementation notes
- Backward compatible: existing clients ignore new fields
- MongoDB: add indexes on `{ userId, parentId }` and `{ userId, dueDate }` (if applicable in storage layer)
- JSON: preserve existing format; optional fields omitted when undefined

---

### 3) Design: Smart Search, Filters, Quick-Add
- Normalization pipeline (title/text/category/query):
  - lowercase → Unicode NFKD (remove diacritics) → strip punctuation → collapse whitespace
- Structured filters (query grammar):
  - `priority:(low|medium|high|urgent)`
  - `category:<name>` or `tag:<tag>`
  - `status:(complete|incomplete|overdue|due)`
  - `due<=YYYY-MM-DD`, `due>=YYYY-MM-DD`
  - free-text terms matched against `text`, `category`, `tags`
- Ranking: token overlap + substring boost; optional Levenshtein (gated by length)

- Quick-add parsing
  - Patterns: `p:high`, `#docs` or `category:docs`, `due:2025-08-10`, `due:Fri`, `+tag`
  - Implement `parseQuickAdd(input)` → `{ text, category?, priority?, dueDate?, tags? }`

Implementation notes
- Add `src/utils/search-utils.ts` and `src/utils/quick-add.ts`
- Update `search_todoodles` to use scorer and filter extraction
- Keep existing behavior when query has no grammar tokens

---

### 4) Web UI Enhancements
- Tree view with expand/collapse; checkbox for parent auto-updates based on children
- Blocker indicators: show dependencies and which are incomplete; tooltip with blocker IDs/titles
- Drag-and-drop to reorder siblings; persist `orderIndex`
- Quick-add input with live parse preview; validation errors inline
- Filters panel for `priority/category/status/due`

---

### 5) File-Level Edits
- `mcp-servers/todoodles/src/index.ts`
  - Extend `TodoodleItem` interface; wire new tools; enforce blocked completion; cascade delete option
  - Replace search with normalized/tokenized filter + structured filters
- `mcp-servers/todoodles/src/utils/search-utils.ts`
  - `normalizeString`, `tokenize`, `extractFilters`, `scoreTodo`
- `mcp-servers/todoodles/src/utils/quick-add.ts`
  - `parseQuickAdd(input: string)` with date parsing helpers
- `mcp-servers/todoodles/src/types.ts`
  - Shared types for filters and parsed input
- `mcp-servers/todoodles/src/web-ui-integration.js`
  - Add endpoints/handlers for subtree fetch, reorder, quick-add

---

### 6) Env & Config
```env
# Feature flags
TODOODLES_ENABLE_HIERARCHY=true
TODOODLES_BLOCK_ON_DEPENDENCIES=true
TODOODLES_ALLOW_FORCE_COMPLETE=true

# Search
TODOODLES_SEARCH_MODE=lexical
TODOODLES_ENABLE_FUZZY=false

# Web UI
MCP_WEB_UI_BASE_URL=localhost
```

---

### 7) Tests
- Unit
  - `scoreTodo` ranks correctly with filters and free text
  - `parseQuickAdd` handles `p:`, `#`, `due:` formats and diacritics
  - `isBlocked` computed from dependencies
- Integration
  - `add_sub_todoodle` creates child; `get_subtree` returns nested structure
  - `add_dependency` blocks completion; `force` overrides; `cascade` delete behavior
  - Search queries with filters return expected IDs first
- Web UI
  - Tree rendering and reorder persists `orderIndex`
  - Quick-add input populates fields and creates item

---

### 8) Risks & Mitigations
- Performance on large lists → indexes (MongoDB), prefilter then rank, pagination
- Backward compatibility → new fields optional; default behavior unchanged
- User confusion on blocked tasks → clear UI indicators and error messages

---

### 9) Acceptance Checklist
- [ ] Sub-todoodles persist and render as a tree; parent completion reflects children
- [ ] Dependencies enforce blocked completion with useful error or `force` override
- [ ] Search supports filters and normalization; existing simple queries still work
- [ ] Quick-add correctly parses priority/category/due/tags
- [ ] Web UI supports subtree fetch, reorder, and blocker indicators

---

### 10) Dependency-Ordered Implementation Checklist
- [ ] Schema & Types
  - [ ] Update `TodoodleItem` to include `parentId`, `dependsOnIds`, `orderIndex`, `tags`
  - [ ] Add shared filter/parse types in `types.ts`
- [ ] Storage & Indexing
  - [ ] Ensure JSON persistence of new fields (omit undefined)
  - [ ] Plan MongoDB indexes (userId+parentId, userId+dueDate)
- [ ] Core Operations
  - [ ] Implement `isBlocked` computation
  - [ ] Add `add_sub_todoodle(parentId, ...)`
  - [ ] Add `add_dependency`/`remove_dependency`
  - [ ] Update `complete_todoodle(id, force?)` to enforce blocking
  - [ ] Update `delete_todoodle(id, cascade?)`
  - [ ] Add `get_subtree(rootId)` and `reorder_siblings(parentId, orderedIds[])`
- [ ] Search & Quick-Add
  - [ ] `utils/search-utils.ts` with normalize/tokenize/extractFilters/score
  - [ ] Replace `search_todoodles` implementation
  - [ ] `utils/quick-add.ts` and wire `add_todoodle` with parsed fields
- [ ] Web UI
  - [ ] Tree view + expand/collapse + reorder
  - [ ] Blocker indicators and completion behavior
  - [ ] Quick-add with parse preview
- [ ] Tests
  - [ ] Unit and integration coverage for hierarchy/dependencies/search/quick-add
- [ ] Docs & Config
  - [ ] Update `env.example` with new flags
  - [ ] Update README/tool descriptions; list-tools shows new tools
