## MCP Design Instruction Manual

A practical, opinionated guide for designing, implementing, and testing Model Context Protocol (MCP) servers in this repo. This manual codifies patterns proven in `grocery-list`, `todoodles`, `scheduled-tasks`, `movies`, `memory`, `twilio-sms`, and `google-calendar-mcp`, and aligns with the MCP Server Testing Guide (`MCP_SERVER_TESTING_GUIDE.md`).

### Who this is for
- Designers defining capabilities and workflows
- Developers implementing servers and tests
- Agents (automations) orchestrating conversations and tool usage

---

### 1) Server Blueprint (required)
- Identity
  - name: short, kebab-case (e.g., `grocery-list`)
  - version: semver string, bump on breaking API or storage changes
- Transport
  - stdio via `@modelcontextprotocol/sdk` with graceful shutdown on SIGINT/SIGTERM
- Environment
  - `.env` loaded with explicit path; validate required vars; never log secrets
  - Core envs: `MCP_STORAGE_TYPE`, `MCP_USER_BASED`, `MCP_USER_ID`, backend creds if any
- Logging
  - Timestamped, service-tagged logs; debug gated by `MCP_DEBUG`
- Handlers
  - `ListTools`: complete tool catalog with accurate `inputSchema`
  - `CallTool`: validate inputs, extract user context, execute, return structured content; set `isError: true` on failures
- Cleanup
  - Close storage connections; stop child servers if any (e.g., SMS)

Minimal skeleton (TypeScript/ESM):

```ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function log(level: 'INFO'|'DEBUG'|'WARN'|'ERROR', msg: string, data?: any) {
  const ts = new Date().toISOString();
  console.error(`[${ts}][${level}][my-mcp] ${msg}`);
  if (data && process.env.MCP_DEBUG === 'true') console.error(JSON.stringify(data, null, 2));
}

const server = new Server({ name: 'my-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'do_something',
      description: 'Perform the primary action',
      inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }
    },
    { name: 'get_web_ui', description: 'Return a Web UI link', inputSchema: { type: 'object', properties: {} } }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const tool = request.params?.name;
  const args = request.params?.arguments || {};
  try {
    switch (tool) {
      case 'do_something': {
        if (!args.value) throw new Error('value is required');
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, value: args.value }) }] };
      }
      case 'get_web_ui':
        return { content: [{ type: 'text', text: 'http://localhost:3000\n<!DOCTYPE html>...' }] };
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('INFO', 'Server started');
}

const cleanup = async () => { log('INFO', 'Shutting down'); process.exit(0); };
process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup);
main().catch((e) => { log('ERROR', 'Startup failed', e); process.exit(1); });
```

---

### 2) Tool Design Checklist
- Naming: concise verb_noun; single responsibility
- Description: agent-friendly, clear constraints and side effects
- Input schema: complete types, enums, examples, required fields
- Validation: explicit error messages; guard rails for retries/idempotency
- Responses: machine-parseable text (often JSON string); include identifiers and status
- Error shape: `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`
- Idempotency: required for external actions (e.g., SMS send directives with “FINAL”)

---

### 3) User Context & Access
- Effective user resolution
  - Preferred: extract from request params/meta; fallback to `MCP_USER_ID`
  - Support shared contexts when relevant (creator vs effective user)
- Isolation policy
  - `MCP_USER_BASED=true` → per-user storage; else shared
- Authorization hooks
  - Validate access for shared artifacts (e.g., scheduled tasks visibility)

Reference pattern:
```ts
function extractUserId(request: any): string | undefined {
  return request.params?.userId || request.meta?.userId || process.env.MCP_USER_ID;
}
```

---

### 4) Storage Contract (mcp-data)
- Use `StorageFactory.createUserStorage` (JSON/Mongo) with default data
- Config via env: storage type, file paths, Mongo URI/db/collection, timeouts, encryption key
- Metadata maintained on each write (updatedAt, counters)
- Operation locks to prevent race conditions on per-user operations
- Backups for JSON storage; migrations for legacy formats (optional)

Config example (env):
```env
MCP_STORAGE_TYPE=json
MCP_USER_BASED=true
MCP_USER_ID=${USER_ID}
# JSON
DATA_FILE_PATH=./data.json
# Mongo
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=my_collection
```

---

### 5) Web UI Integration
- Always expose `get_web_ui` tool when UI is needed
- Implement a dedicated `*WebUIManager` using `mcp-web-ui`
- Provide a clear schema: components, fields, actions (inline, bulk, global), polling, session TTL
- Action handlers accept flexible formats and return informative results; support form schemas when data is missing

Minimum pattern:
```ts
export class MyWebUIManager {
  private webUI: MCPWebUI<MyItem>;
  constructor(private manager: any) {
    this.webUI = new MCPWebUI<MyItem>({
      dataSource: this.getDataSource.bind(this),
      schema: this.createSchema(),
      onUpdate: this.handleUIUpdate.bind(this),
      sessionTimeout: 30 * 60 * 1000,
      pollInterval: 5000,
      baseUrl: process.env.MCP_WEB_UI_BASE_URL || 'localhost'
    });
  }
  getMCPToolDefinition() { return this.webUI.getMCPToolDefinition(); }
  async handleGetWebUI(userId: string) { return this.webUI.handleGetWebUI(userId); }
}
```

---

### 6) External Integrations & Security
- Validate required envs at startup; exit with clear instructions if missing
- Never log secrets; mask credentials in debug logs
- Implement retry policies and timeouts for HTTP/API calls
- For side-effectful actions, ensure single-execution semantics and “FINAL” guidance to agents
- If OAuth or user consent is required (e.g., Google), gate tool execution behind token validation

---

### 7) Observability & Error Handling
- Request-scoped logging: tool name, user/effective user, duration, result
- Explicit success/failure logs; avoid noisy verbose logs unless `MCP_DEBUG=true`
- Predictable error payloads so clients can branch on `isError`

---

### 8) Testing Requirements (aligns with MCP Server Testing Guide)
- Directory layout: `tests/{helpers,unit,integration}/` and `tests/run-all-tests.js`
- Test environment setup
  - Unique data files per run; `NODE_ENV=test`; `MCP_USER_BASED=false` by default
- Server helper
  - Spawn server; detect readiness; JSON-RPC send/receive with strict timeouts; proper cleanup
- Coverage
  - Unit: manager/storage logic
  - Integration: tools list, tool calls, error cases
  - Web UI: `get_web_ui` returns URL + HTML; action handlers (forms, toggles, bulk)
  - Concurrency: parallel tool calls do not corrupt data
- Exit behavior
  - Tests must exit with correct codes; ensure resource cleanup

---

### 9) Release & Ops
- Versioning: bump on breaking tool schema or storage shape
- Migration notes: document legacy→unified storage migrations
- Manual smoke tests: list-tools, happy-path tool, error-path, web UI retrieval
- Logs to expect: startup env echo (masked), init complete, per-call info, cleanup

---

### 10) Conversation/Agent Steps (Design-time prompts)
Use these prompts when scoping a new MCP server:
- Objective
  - What user problem does this tool solve? Success criteria? Constraints?
- Data model
  - What entities/fields/IDs are needed? Minimal viable schema?
- User context
  - Personal vs shared? Who can read/write? What is the effective user ID?
- Tools
  - Minimal set of verbs; input schemas; outputs; idempotency; retries; rate limits
- Storage
  - JSON vs Mongo? Default data? Backups? Migration from legacy?
- Web UI
  - Do we need UI? Which components/actions? Forms? Polling TTL?
- Integrations
  - External APIs? Auth flows? Required envs? Timeouts and retries?
- Testing
  - Unit + integration + E2E; concurrency; error-paths; cleanup and exit behavior
- Rollout
  - Env template; manual validation checklist; logging readiness

Quick agent checklist:
- Ask clarifying questions before coding
- Echo assumptions back to the user
- Propose an initial tool list and schemas for confirmation
- Suggest test cases alongside the design
- Call out risky areas and fallback strategies

---

### 11) Templates & Snippets

Env example (copy and adapt):
```env
MCP_STORAGE_TYPE=json
MCP_USER_BASED=true
MCP_USER_ID=${USER_ID}
MCP_DEBUG=false
DATA_FILE_PATH=./data.json
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=my_collection
MCP_WEB_UI_BASE_URL=localhost
```

Tool definition snippet:
```ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'create_item', description: 'Create an item', inputSchema: {
      type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    { name: 'get_web_ui', description: 'Open Web UI', inputSchema: { type: 'object', properties: {} } }
  ]
}));
```

Test helper expectations:
```md
- Start server with unique test env
- Wait for readiness (stderr/stdout markers)
- tools/list → validate tool catalog
- tools/call → happy-path + error-path
- Assert process exits and files cleaned up
```

---

### 12) Cross-Server Alignment
When in doubt, mirror patterns from:
- `grocery-list`: comprehensive manager + Web UI + tests
- `todoodles`: user-aware storage, operation locks, Web UI
- `scheduled-tasks`: shared-context user model, LibreChat integration, detailed tool schemas
- `movies`: modular tools, mcp-data storage adapter, Web UI factory
- `memory`: graph storage via `mcp-data` paginated graph
- `twilio-sms`: external API, strict env validation, “FINAL” responses
- `google-calendar-mcp`: modular auth layer gating tool execution

This manual complements and does not replace `MCP_DESIGN INSTRUCTION_MANUAL.md`. Keep both in sync as patterns evolve.


