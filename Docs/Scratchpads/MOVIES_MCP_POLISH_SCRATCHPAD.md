## Movies MCP — Polish Scratchpad (Search + Web/Wikipedia Integration)

Scope: Improve search robustness (punctuation/diacritics/fuzzy), add optional hybrid/semantic ranking, and introduce Wikipedia-based enrichment tools. Targets concrete fixes for titles like "Mad Max: Fury Road" (colon) and "Kong: Skull Island".

---

### 0) Objectives
- Make movie search resilient to punctuation (colons), whitespace, and diacritics.
- Support token-based/fuzzy matching with clear scoring, preserving fast local behavior.
- Add optional hybrid/semantic search mode for better ranking.
- Integrate Wikipedia lookup to fetch summaries/links and optionally enrich stored movies.

Success criteria
- [ ] Query "Mad Max Fury Road" matches stored "Mad Max: Fury Road" in top 1
- [ ] Query "Kong Skull Island" matches stored "Kong: Skull Island" in top 1
- [ ] Diacritics tolerance: "Amelie" finds "Amélie"
- [ ] Wikipedia tool returns summary URL + text within < 2s (p95) or helpful error

---

### 1) Current State & Gaps
- Lexical filtering in `McpDataMovieStorage.getMovies`: `title.toLowerCase().includes(query)` only
- No punctuation/diacritics normalization → queries without `:` fail to match
- No fuzzy scoring → brittle ordering
- No external info fetch; suggestions rely on local tags/ratings only

---

### 2) Design: Flexible Search (Lexical++)
Core idea: Normalize, tokenize, and score.

- Normalization pipeline (both title and query):
  - Lowercase
  - Unicode NFKD, remove diacritics
  - Remove punctuation (,:;.!?"'()[]{}-_) and collapse whitespace
  - Strip common stopwords optionally (configurable)
- Token-based matching:
  - Compute set overlap between query tokens and title tokens
  - Score = weighted sum of metrics:
    - tokenOverlap = |Q∩T|/|Q|
    - substringBoost if normalized includes normalizedQuery
    - year/director/tag boosts if provided filters match
  - Threshold: include results if tokenOverlap ≥ 0.5 or substringBoost true
- Fuzzy allowance:
  - Optional Levenshtein on joined normalized strings with max distance <= 2 when tokens≥2
  - Guard with length to avoid false positives

Implementation notes
- Add `normalizeString` and `tokenize` utils (pure functions) in `src/utils/search-utils.ts`
- Replace `includes` check in `McpDataMovieStorage.getMovies` with scorer that returns ranked list
- Keep existing filters (year/director/tags) and apply ranking after filtering
- Add field `aliases?: string[]` to movies (optional) used during matching (e.g., colon-free titles)

---

### 3) Design: Hybrid/Semantic (Optional)
- Hybrid strategy: lexical score + (optional) semantic score
  - `MOVIES_SEARCH_MODE=lexical|hybrid|semantic`
  - Default `lexical`; `hybrid` combines: finalScore = 0.6*lexical + 0.4*semantic
- Semantic embedding options:
  - Option A (local): `@xenova/transformers` with a small model (e.g., bge-small) for titles+tags; cache per movie in storage under `embeddings.titleV1`
  - Option B (external): Call configured embedding API (env-based); store vectors
- Gating/env:
  - `MOVIES_ENABLE_SEMANTIC=false`
  - `MOVIES_SEMANTIC_MODEL=bge-small-en-v1.5`
  - `MOVIES_EMBEDDING_DIM=384`
  - On first enable, compute embeddings lazily on read; background warm-up safe

Risks & mitigations
- Performance: keep top-K lexical first; compute semantic only for candidates (e.g., top 50)
- Determinism: stable lexical tie-break; cap semantic impact unless explicitly requested

---

### 4) Wikipedia Integration
Add new tools:

- find_movie_wikipedia
  - Description: Search Wikipedia for a movie and return best-matching page(s)
  - Input: { query: string, year?: number }
  - Output (text JSON): { ok: true, results: [{ title, url, description }] }
  - Errors: network_error, no_results
  - Impl: Wikipedia REST search API `GET /v1/search/title?q=...&limit=5`; rank by exact/year heuristics

- get_movie_wikipedia_summary
  - Description: Get summary for a specific page title
  - Input: { title: string }
  - Output: { ok: true, title, url, extract, thumbnailUrl? }
  - Impl: `GET /v1/page/summary/{encodedTitle}`

- enrich_movie_from_wikipedia
  - Description: Attach Wikipedia info to a stored movie by id or title
  - Input: { movieId?: string, title?: string, preferYear?: number }
  - Output: { ok: true, movieId, fieldsUpdated: string[] }
  - Behavior: Upsert fields: `synopsis`, `wikipediaUrl`, `thumbnailUrl`, `aliases[]`; idempotent updates

Implementation details
- Timeout/retries: `MOVIES_HTTP_TIMEOUT_MS=8000`, 2 retries with backoff
- Rate limit: `MOVIES_RATE_LIMIT_PER_MIN=30`
- If a Wikipedia MCP is available in the client environment, we optionally return a hint in human-readable text; server still works standalone with REST

---

### 5) Web UI Enhancements (Optional)
- Add an action in movie UI: "Enrich via Wikipedia"
- Show Wikipedia link and summary snippet in details panel

---

### 6) File-Level Edits
- `src/utils/search-utils.ts`
  - `normalizeString(input: string): string`
  - `tokenize(input: string): string[]`
  - `scoreMovieTitle(query: string, movie: Movie, boosts?: {year?: number; director?: string; tags?: string[]}): number`
- `src/storage/McpDataMovieStorage.ts`
  - Replace simple `includes` with ranker; return results sorted by score; keep `limit`
- `src/tools/movie-tools.ts`
  - Add tools: `find_movie_wikipedia`, `get_movie_wikipedia_summary`, `enrich_movie_from_wikipedia`
  - Update `search_movies` description to reflect flexible search
- `src/movie-manager.ts`
  - Add methods: `searchMoviesAdvanced`, `enrichMovieFromWikipedia`
- `src/web-ui/movie-ui-factory.ts`
  - Add UI action for enrichment and wire handler

---

### 7) Env & Config
```env
# Search
MOVIES_SEARCH_MODE=lexical
MOVIES_ENABLE_SEMANTIC=false
MOVIES_SEMANTIC_MODEL=bge-small-en-v1.5
MOVIES_EMBEDDING_DIM=384

# Wikipedia
MOVIES_HTTP_TIMEOUT_MS=8000
MOVIES_RATE_LIMIT_PER_MIN=30
```

---

### 8) Tests
- Unit
  - normalizeString/tokenize (punctuation, diacritics)
  - scorer ranks colon-less queries correctly
- Integration
  - `search_movies` with queries: "Mad Max Fury Road", "Kong Skull Island", "Amelie" → expected IDs first
  - Wikipedia tools (mock HTTP): handles results and summaries; timeouts → `isError: true`
- Web UI
  - Enrich action triggers handler and updates fields

---

### 9) Risks & Mitigations
- Performance regressions → guard with candidate prefilter, limits
- External API failures → retries, helpful error payloads, and fallbacks
- Behavioral changes for existing clients → behind env flags; keep lexical default

---

### 10) Acceptance Checklist
- [ ] Colon/diacritics queries return correct top result
- [ ] Wikipedia search and summary tools function with mock + live (manual)
- [ ] No breaking changes to existing tools; list-tools shows new tools
- [ ] Logs show tool name, user, duration, and success/failure per manual

---

### 11) Watch Status Categories (Watched / Want to Watch)

Design
- Add optional field `watchStatus?: 'watched' | 'want_to_watch'` to movie entities; default undefined (no status).
- Filtering: support `status:watched` and `status:want_to_watch` in search; add dedicated list/get tool.
- Mutations: tool to set/unset watch status for a movie by id; idempotent.
- Backward compatible: existing clients unaffected when field is absent.

File-Level Edits
- `src/storage/McpDataMovieStorage.ts`
  - Persist `watchStatus` field; include in projections and filters
- `src/tools/movie-tools.ts`
  - New tool: `set_movie_watch_status` (id, status|'none')
  - New tool: `get_movies_by_watch_status` (status)
  - Update `search_movies` to parse `status:` filter
- `src/utils/search-utils.ts`
  - Extend filter extraction to include `status:(watched|want_to_watch)`
- `src/movie-manager.ts`
  - Add `setWatchStatus(id, status)` and `getMoviesByWatchStatus(status)`
- `src/web-ui/movie-ui-factory.ts`
  - Optional: toggle for watch status; quick filter chips

Tests
- Unit
  - Filter parse: `status:watched` and `status:want_to_watch`
  - Idempotent `set_movie_watch_status` no-ops when unchanged
- Integration
  - Set status → list by status returns expected IDs
  - Search with `status:` + text terms narrows correctly

Acceptance
- [ ] Can set `watched` and `want_to_watch` per movie and retrieve via dedicated tool
- [ ] Search respects `status:` filter without breaking existing queries
- [ ] No schema breaks; movies without status behave unchanged

Dependency-Ordered Checklist
- [ ] Schema & Storage
  - [ ] Add `watchStatus` field to movie model and persist in storage
- [ ] Manager & Tools
  - [ ] Implement `set_movie_watch_status(id, status|'none')`
  - [ ] Implement `get_movies_by_watch_status(status)`
- [ ] Search
  - [ ] Extend filter extraction and apply status filter pre-ranking
- [ ] Web UI (optional)
  - [ ] Add status toggle and quick filters
- [ ] Tests
  - [ ] Unit + integration for set/get/search with status


