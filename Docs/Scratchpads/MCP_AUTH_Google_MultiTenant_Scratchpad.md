## Project Scratchpad: Google OAuth Multi-Tenant Auth for MCP Servers

- Title: Google OAuth Multi-Tenant Auth for MCP Servers (Calendar, Gmail, etc.)
- Date: 2025-08-11
- Project: `Sizzek/mcp-servers` + `LibreChat` (Sizzek agent)
- Author: Sizzek
- Version: 0.1 (draft)
- Related diary: `ProjectDiary/2025/2025-08-11.md`

---

## 0) Summary & Objectives
- **Problem**: Each Google-based MCP server handles OAuth differently and often requires manual scripts. This creates friction, inconsistency, and makes multi-tenant usage in LibreChat difficult.
- **Goal**: Deliver a standardized, reusable, multi-tenant OAuth layer for all Google MCP servers (Calendar first), with minimal manual steps and compatible with `npx` usage.
- **Primary users**: LibreChat Sizzek agent users; developers operating Google MCP servers; future shared Google MCPs (Gmail, Drive, Tasks).
- **Success criteria**:
  - [ ] One shared auth module that all Google MCP servers use
  - [ ] Automatic local auth flow on first use; no manual script required in normal scenarios
  - [ ] Token storage per-tenant and per-provider; survives restarts; safe refresh
  - [ ] Works in headless and UI environments; provides device-code fallback
  - [ ] Clear docs + easy onboarding in LibreChat multi-tenant context
- **Non-goals**: Google App Verification/branding; enterprise SSO flows.

## 1) Constraints & Assumptions
- **Runtime/Stack**: Node.js LTS, TypeScript 5.x
- **Environment(s)**: dev, prod; supports `npx` and local installs
- **Package manager/build**: npm; esbuild/tsc
- **External limits**: Google OAuth quotas, refresh token expiry in Test mode (7 days)
- **Assumptions**:
  - LibreChat can provide a stable `tenantId` (user/workspace) to the MCP process
  - Local redirect HTTP server can bind to a small port range; device-code fallback when not possible
  - XDG base directory is acceptable for default token storage

## 2) Users & Access Model
- **Access model**: User-based, multi-tenant
- **AuthN/Z**: Per-tenant OAuth 2.0; scope-minimized per product
- **Tenancy**: Tokens isolated by `tenantId` + `provider` (`google`) + `scopesHash` when needed

## 3) Data Model & Interfaces
- **Entities**:
  - `Tenant` { tenantId: string, displayName?: string }
  - `ProviderCredential` { provider: 'google', clientId: string, clientSecret: string, redirectUri?: string }
  - `UserConnection` { tenantId: string, provider: 'google', scopes: string[], subject?: string, createdAt: string, updatedAt: string }
  - `TokenSet` { accessToken: string, refreshToken: string, expiry: number, scope?: string, idToken?: string }

- **Contracts (library APIs)**:
  - `AuthBroker.startAuth(options)` → launches local server or device flow; persists tokens
    - Input: { tenantId, scopes: string[], openBrowser?: boolean }
    - Output: { status: 'ok' | 'pending' | 'error', verification?: { url, user_code }, message?: string }
  - `AuthBroker.getClient(tenantId, scopes)` → `OAuth2Client` with valid tokens (refresh if needed)
  - `TokenStore` interface: `get(tenantId)`, `set(tenantId, tokenSet)`, `revoke(tenantId)`
    - Implementations: `FileTokenStore` (XDG), `RedisTokenStore`
  - `EnvLoader` unified resolver for credentials and config

- **Idempotency**: `getClient` and `startAuth` safe to call repeatedly; no duplicate prompts if valid tokens exist
- **Error shape**: `{ code: string, message: string, details?: any }`

## 4) Tooling / API Inventory (MCP additions)
- **auth/status**
  - Description: Check whether the tenant is authenticated and token validity window
  - InputSchema: { tenantId: string }
  - Side effects: none
  - Security: tenant-scoped
- **auth/link**
  - Description: Initiate auth for tenant; returns either browser URL opened or device-code instructions
  - InputSchema: { tenantId: string, scopes?: string[] }
  - Side effects: creates/updates token set
  - Security: tenant consent required
- **auth/revoke**
  - Description: Revoke and delete stored tokens for a tenant
  - InputSchema: { tenantId: string }
  - Side effects: deletes tokens
  - Security: tenant-scoped

## 5) Storage & Configuration
- **Storage**: Default to XDG base dir per app
  - Tokens: `$XDG_CONFIG_HOME/sizzek-mcp/google/<serverName>/tenants/<tenantId>/tokens.json`
  - Fallback: `~/.config/sizzek-mcp/...`
- **Paths/collections**: Structured directories allow multiple servers (calendar, gmail) to share conventions but keep separate scopes
- **Configuration & env vars**:
  - `GOOGLE_OAUTH_CREDENTIALS` [required]: absolute path to client credentials JSON (supports `npx`)
  - `GOOGLE_OAUTH_CREDENTIALS_JSON` [optional]: inline JSON string (CI/headless)
  - `SIZZEK_TOKEN_ROOT` [optional]: override tokens root directory
  - `GOOGLE_CALENDAR_MCP_TOKEN_PATH` [legacy compat]: if present, use as highest priority for calendar server
  - `ENV_PATH` [optional]: explicit .env path

## 6) Web/UI Plan (LibreChat integration)
- Minimal UI: show account link status per tenant; button triggers `auth/link`
- Display device-code instructions when headless; clipboard helper
- Status view: token expiry and scope list

## 7) Security & Privacy
- Least-privilege scopes (`calendar.events` vs full `calendar` when possible)
- Never log secrets; redact tokens and client secrets
- File permissions 600; optional encrypt-at-rest (passphrase or OS keychain in future)
- Separate tokens per tenant; no cross-tenant access paths

## 8) Observability & Error Handling
- Structured logs: { tenantId, provider, flow: 'local-server' | 'device-code', action, outcome }
- Metrics (future): auth attempts, successes, refreshes, failures
- Error strategy: retry token refresh; clear guidance for re-auth when refresh invalid

## 9) Testing Plan
- **Proving test (must pass)**: With no tokens, starting the Calendar MCP auto-initiates auth; after completion, subsequent starts require no interaction for the same tenant.
- Unit: `TokenStore` (file/redis), `EnvLoader`, `AuthBroker` flow switching, refresh handling
- Integration: Full local-server flow, device-code fallback, `npx` path behavior
- E2E: LibreChat triggers `auth/link`; tokens saved; create event tool works for tenant

## 10) Performance & SLAs
- Low latency requirements; refresh occurs proactively before expiry

## 11) Risks & Mitigations
- Refresh token expiry in Test mode → Document and optionally detect/test-mode to warn
- Port conflicts for local auth server → Port range with fallback + device-code
- Headless environments → Device-code flow default
- Multi-tenant mapping errors → Require explicit `tenantId`; log and validate storage boundaries

## 12) Milestones & Tasks
- M1: Shared auth library skeleton (`@sizzek/google-auth`)
  - [ ] Define `TokenStore`, `EnvLoader`, `AuthBroker`
  - [ ] FileTokenStore (XDG) with 600 perms
  - [ ] Local server + device-code flows
- M2: Integrate into `google-calendar-mcp`
  - [ ] Replace bespoke auth init with shared library calls
  - [ ] Add MCP tools: `auth/status`, `auth/link`, `auth/revoke`
  - [ ] Update README to multi-tenant flow
- M3: Extend to Gmail MCP
  - [ ] Reuse library; validate scope handling and storage isolation
- M4: LibreChat UI wiring
  - [ ] Agent surfaces link/status per tenant
  - [ ] Device-code UX in chat if headless

## 13) Validation Checklist (Acceptance)
- [ ] Calendar MCP starts with no manual `auth` step in typical desktop
- [ ] Device-code works in headless or port-blocked scenarios
- [ ] Tokens stored per-tenant and auto-refresh without prompts
- [ ] Works when started via `npx` and via local `node build/index.js`
- [ ] Clear error messages and docs

## 14) Release & Ops
- Scripts/commands: `npx <server> start`, `tools/auth/link`, `tools/auth/status`
- Health: log marker when tokens validated; optional self-check tool
- Rollout: calendar first; then gmail; keep backward compat env vars initially

---

### Optional: MCP-Specific Addendum
- Response envelope:
```json
{ "content": [{ "type": "text", "text": "..." }], "isError": false }
```
- Minimal tool definition stubs:
```json
{
  "name": "auth/status",
  "description": "Check auth status for a tenant",
  "inputSchema": { "type": "object", "properties": { "tenantId": { "type": "string" } }, "required": ["tenantId"] }
}
```
```json
{
  "name": "auth/link",
  "description": "Initiate auth for a tenant (browser or device-code)",
  "inputSchema": { "type": "object", "properties": { "tenantId": { "type": "string" }, "scopes": { "type": "array", "items": { "type": "string" } } }, "required": ["tenantId"] }
}
```
```json
{
  "name": "auth/revoke",
  "description": "Revoke tenant tokens",
  "inputSchema": { "type": "object", "properties": { "tenantId": { "type": "string" } }, "required": ["tenantId"] }
}
```

### Optional: Frontend/UI Constraints
- Minimal, tenant-scoped actions; do not expose tokens; copyable device-code

### Notes from Workflow Rules
- Define proving test before implementing; log metrics in auth flows

### Env loading notes (unified loader to adopt in implementation):
- Priority for credentials:
  1) `GOOGLE_OAUTH_CREDENTIALS_JSON` (inline JSON)
  2) `GOOGLE_OAUTH_CREDENTIALS` (absolute path)
  3) Legacy `gcp-oauth.keys.json` in CWD (local installs only; not reliable for `npx`)
- Token path resolution:
  1) `SIZZEK_TOKEN_ROOT`
  2) `GOOGLE_CALENDAR_MCP_TOKEN_PATH` (server-specific override)
  3) `$XDG_CONFIG_HOME/sizzek-mcp/google/<serverName>/tenants/<tenantId>/tokens.json`
  4) `~/.config/sizzek-mcp/google/<serverName>/tenants/<tenantId>/tokens.json`
- Port strategy: try 3000-3004; then device-code fallback
- Headless detection: no `DISPLAY` or `open` failure → device-code by default


