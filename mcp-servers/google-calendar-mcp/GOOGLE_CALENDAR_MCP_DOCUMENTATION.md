# Google Calendar MCP Server - Comprehensive Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [Installation & Setup](#installation--setup)
5. [Authentication System](#authentication-system)
6. [Available Tools](#available-tools)
7. [Date/Time Handling](#datetime-handling)
8. [Debugging & Logging](#debugging--logging)
9. [Error Handling](#error-handling)
10. [Troubleshooting](#troubleshooting)
11. [Code Examples](#code-examples)
12. [Development](#development)

## Overview

The Google Calendar MCP (Model Context Protocol) Server is a TypeScript-based server that provides LLMs with standardized access to Google Calendar functionality. It supports event creation, modification, deletion, searching, and calendar management through a well-defined API interface.

### Key Features
- **Multi-Calendar Support**: Simultaneous operations across multiple calendars
- **Event Management**: Full CRUD operations for calendar events
- **Recurring Events**: Advanced modification scopes (single, all, future instances)
- **Authentication**: OAuth 2.0 flow with token management
- **Validation**: Comprehensive input validation using Zod schemas
- **Logging**: Detailed debug logging for troubleshooting

## Architecture

### Core Components

1. **Main Server** (`src/index.ts`): Entry point and MCP request handling
2. **Authentication System** (`src/auth/`): OAuth 2.0 flow and token management
3. **Tool Handlers** (`src/handlers/`): Individual tool implementations
4. **Validation** (`src/schemas/`): Input validation schemas
5. **Integration Tests** (`src/integration/`): End-to-end testing

### Request Flow
```
MCP Client → Server (index.ts) → CallTool Handler → Specific Tool Handler → Google Calendar API
```

## File Structure

```
src/
├── index.ts                    # Main server entry point
├── auth-server.ts             # Standalone auth server
├── auth/
│   ├── client.js              # OAuth2 client initialization
│   ├── server.js              # Auth server implementation
│   └── tokenManager.js        # Token validation and management
├── handlers/
│   ├── callTool.ts            # Tool call dispatcher
│   ├── listTools.ts           # Available tools definitions
│   ├── utils.ts               # Utility functions
│   └── core/
│       ├── BaseToolHandler.ts     # Base class for all handlers
│       ├── CreateEventHandler.ts  # Event creation logic
│       ├── UpdateEventHandler.ts  # Event modification logic
│       ├── DeleteEventHandler.ts  # Event deletion logic
│       ├── ListEventsHandler.ts   # Event listing logic
│       ├── SearchEventsHandler.ts # Event search logic
│       ├── ListCalendarsHandler.ts # Calendar listing
│       ├── ListColorsHandler.ts   # Color management
│       └── FreeBusyEventHandler.ts # Availability queries
└── schemas/
    └── validators.ts          # Zod validation schemas
```

## Installation & Setup

### Prerequisites
- Node.js (Latest LTS)
- TypeScript 5.3+
- Google Cloud Project with Calendar API enabled
- OAuth 2.0 credentials (Desktop Application type)

### Setup Steps

1. **Google Cloud Configuration**
   ```bash
   # 1. Create/select Google Cloud project
   # 2. Enable Google Calendar API
   # 3. Create OAuth 2.0 credentials (Desktop app)
   # 4. Download credentials JSON file
   ```

2. **Installation**
   ```bash
   npm install @cocal/google-calendar-mcp
   # OR for development
   git clone <repository>
   cd google-calendar-mcp
   npm install
   npm run build
   ```

3. **Configuration**
   ```json
   // Claude Desktop config
   {
     "mcpServers": {
       "google-calendar": {
         "command": "npx",
         "args": ["@cocal/google-calendar-mcp"],
         "env": {
           "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json"
         }
       }
     }
   }
   ```

## Authentication System

### Architecture Overview

The authentication system consists of three main components:

#### 1. OAuth2 Client (`src/auth/client.js`)
```typescript
export async function initializeOAuth2Client(): Promise<OAuth2Client>
```
- Initializes Google OAuth2 client
- Loads credentials from file or environment variable
- Sets up redirect URI for auth flow

#### 2. Token Manager (`src/auth/tokenManager.js`)
```typescript
export class TokenManager {
  async validateTokens(): Promise<boolean>
  async refreshTokens(): Promise<boolean>
}
```
- Validates existing tokens
- Handles token refresh automatically
- Manages token expiration

#### 3. Auth Server (`src/auth/server.js`)
```typescript
export class AuthServer {
  async start(openBrowser: boolean = true): Promise<boolean>
  async stop(): Promise<void>
}
```
- Runs temporary HTTP server for OAuth callback
- Handles authorization code exchange
- Opens browser for user consent

### Authentication Flow

1. **Initial Setup**
   ```bash
   npm run auth
   ```

2. **Token Validation Process**
   ```typescript
   // From src/index.ts
   const tokensValid = await tokenManager.validateTokens();
   if (!tokensValid) {
     throw new Error("Authentication required. Please run 'npm run auth' to authenticate.");
   }
   ```

## Available Tools

All tools are defined in `src/handlers/listTools.ts` and implemented in `src/handlers/core/`.

### 1. List Calendars
```typescript
// Handler: ListCalendarsHandler.ts
name: "list-calendars"
description: "List all available calendars"
inputSchema: {} // No parameters required
```

### 2. List Events
```typescript
// Handler: ListEventsHandler.ts
name: "list-events"
description: "List events from one or more calendars"
inputSchema: {
  calendarId: string | string[], // Single ID or array
  timeMin?: string,              // ISO datetime with timezone
  timeMax?: string               // ISO datetime with timezone
}
```

### 3. Search Events
```typescript
// Handler: SearchEventsHandler.ts
name: "search-events"
description: "Search for events by text query"
inputSchema: {
  calendarId: string,
  query: string,
  timeMin?: string,
  timeMax?: string
}
```

### 4. Create Event
```typescript
// Handler: CreateEventHandler.ts
name: "create-event"
description: "Create a new calendar event"
inputSchema: {
  calendarId: string,
  summary: string,
  description?: string,
  start: string,                 // ISO datetime with timezone
  end: string,                   // ISO datetime with timezone
  timeZone: string,              // IANA timezone
  location?: string,
  attendees?: Array<{email: string}>,
  colorId?: string,
  reminders?: ReminderSchema,
  recurrence?: string[]
}
```

### 5. Update Event
```typescript
// Handler: UpdateEventHandler.ts
name: "update-event"
description: "Update an existing event"
inputSchema: {
  calendarId: string,
  eventId: string,
  // ... same optional fields as create-event
  modificationScope: "single" | "all" | "future",
  originalStartTime?: string,
  futureStartDate?: string
}
```

### 6. Delete Event
```typescript
// Handler: DeleteEventHandler.ts
name: "delete-event"
description: "Delete a calendar event"
inputSchema: {
  calendarId: string,
  eventId: string
}
```

### 7. Get Free/Busy
```typescript
// Handler: FreeBusyEventHandler.ts
name: "get-freebusy"
description: "Check availability across calendars"
inputSchema: {
  timeMin: string,
  timeMax: string,
  timeZone?: string,
  items: Array<{id: string}>
}
```

### 8. List Colors
```typescript
// Handler: ListColorsHandler.ts
name: "list-colors"
description: "List available event colors"
inputSchema: {} // No parameters required
```

## Date/Time Handling

### Format Requirements

All date/time values must follow **ISO 8601 format with timezone**:

```typescript
// From src/schemas/validators.ts
const isoDateTimeWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
```

### Valid Examples
```javascript
"2024-06-27T18:00:00-05:00"  // Central Daylight Time
"2024-06-27T18:00:00Z"       // UTC
"2024-06-27T18:00:00+02:00"  // Central European Time
```

### Schema Validation
```typescript
// From CreateEventArgumentsSchema
start: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone"),
end: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone"),
timeZone: z.string(), // IANA timezone name
```

### API Transformation
```typescript
// From CreateEventHandler.ts
const requestBody: calendar_v3.Schema$Event = {
  start: { dateTime: args.start, timeZone: args.timeZone },
  end: { dateTime: args.end, timeZone: args.timeZone },
  // ...
};
```

## Debugging & Logging

### Enhanced Logging System

Comprehensive logging has been added throughout the codebase for debugging purposes:

#### 1. Main Server Logging (`src/index.ts`)
```typescript
console.log('[MCP Server] Received CallToolRequest:', {
  toolName: request.params.name,
  argumentsKeys: Object.keys(request.params.arguments || {}),
  timestamp: new Date().toISOString()
});

console.log('[MCP Server] Validating authentication tokens...');
const tokensValid = await tokenManager.validateTokens();
console.log('[MCP Server] Token validation result:', tokensValid);
```

#### 2. Tool Call Logging (`src/handlers/callTool.ts`)
```typescript
export async function handleCallTool(request, oauth2Client) {
  const startTime = Date.now();
  console.log(`[CallTool] Received tool call: ${name}`);
  console.log(`[CallTool] Tool arguments:`, JSON.stringify(args, null, 2));
  
  try {
    const result = await handler.runTool(args, oauth2Client);
    const duration = Date.now() - startTime;
    console.log(`[CallTool] Tool '${name}' completed successfully in ${duration}ms`);
    return result;
  } catch (error) {
    console.error(`[CallTool] Error executing tool '${name}':`, error);
    throw error;
  }
}
```

#### 3. Event Creation Logging (`src/handlers/core/CreateEventHandler.ts`)
```typescript
async runTool(args: any, oauth2Client: OAuth2Client) {
  console.log('[CreateEventHandler] Starting event creation with args:', JSON.stringify(args, null, 2));
  
  try {
    const validArgs = CreateEventArgumentsSchema.parse(args);
    console.log('[CreateEventHandler] Arguments validated successfully:', JSON.stringify(validArgs, null, 2));
    
    const event = await this.createEvent(oauth2Client, validArgs);
    
    console.log('[CreateEventHandler] Event created successfully:', {
      id: event.id,
      summary: event.summary,
      htmlLink: event.htmlLink,
      status: event.status
    });
    
    return { /* ... */ };
  } catch (error) {
    console.error('[CreateEventHandler] Error during event creation:', error);
    throw error;
  }
}
```

#### 4. API Call Logging
```typescript
console.log('[CreateEventHandler] Making API call to calendar.events.insert...');
const response = await calendar.events.insert({
  calendarId: args.calendarId,
  requestBody: requestBody,
});

console.log('[CreateEventHandler] API call completed. Response status:', response.status);
console.log('[CreateEventHandler] API response data:', JSON.stringify(response.data, null, 2));
```

#### 5. Authentication Logging (`src/handlers/core/BaseToolHandler.ts`)
```typescript
protected getCalendar(auth: OAuth2Client): calendar_v3.Calendar {
  console.log('[BaseToolHandler] Creating Google Calendar client');
  
  console.log('[BaseToolHandler] OAuth2Client credentials present:', {
    hasAccessToken: !!auth.credentials.access_token,
    hasRefreshToken: !!auth.credentials.refresh_token,
    tokenExpiry: auth.credentials.expiry_date ? new Date(auth.credentials.expiry_date).toISOString() : 'none',
    scopes: auth.credentials.scope
  });
  
  return google.calendar({ version: 'v3', auth });
}
```

### Debug Test Script

A debug test script (`debug-test.js`) is available for testing:

```javascript
#!/usr/bin/env node
import { spawn } from 'child_process';

const server = spawn('node', ['build/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send test requests and capture output
const createEvent = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "create-event",
    arguments: {
      calendarId: "primary",
      summary: "Debug Test Event",
      start: "2024-12-20T10:00:00-05:00",
      end: "2024-12-20T11:00:00-05:00",
      timeZone: "America/Chicago"
    }
  }
};
```

## Error Handling

### Error Hierarchy

#### 1. Validation Errors
```typescript
// From schemas/validators.ts
CreateEventArgumentsSchema.parse(args); // Throws ZodError if invalid
```

#### 2. Authentication Errors
```typescript
// From BaseToolHandler.ts
protected handleGoogleApiError(error: unknown): void {
  if (error instanceof GaxiosError) {
    if (error.response?.data?.error === 'invalid_grant') {
      throw new Error('Authentication token is invalid or expired. Please re-run the authentication process.');
    }
  }
}
```

#### 3. API Errors
```typescript
console.error('[BaseToolHandler] GaxiosError details:', {
  status: error.status,
  statusText: error.response?.statusText,
  data: error.response?.data,
  headers: error.response?.headers
});
```

### Common Error Scenarios

1. **Token Expiration**: Automatic refresh or re-authentication required
2. **Invalid Date Format**: Timezone missing from datetime string
3. **Calendar Access**: Insufficient permissions or calendar not found
4. **Rate Limiting**: Google API quota exceeded
5. **Network Issues**: Connection problems or API unavailable

## Troubleshooting

### Common Issues

#### 1. Events Not Appearing in Calendar

**Symptoms**: Tool reports success but events don't show up

**Debug Steps**:
1. Check authentication status in logs
2. Verify calendar ID is correct
3. Check API response data
4. Confirm timezone settings

**Solution**: Use enhanced logging to trace the complete flow:
```bash
# Look for these log entries:
[CreateEventHandler] API response data: {...}
[CreateEventHandler] Event created successfully: {...}
```

#### 2. Authentication Failures

**Symptoms**: "Authentication required" errors

**Debug Steps**:
1. Check token expiry: `[BaseToolHandler] OAuth2Client credentials present`
2. Verify credentials file path
3. Check Google Cloud Console settings

**Solution**:
```bash
npm run auth  # Re-authenticate
```

#### 3. Date/Time Validation Errors

**Symptoms**: Zod validation failures

**Common Issues**:
- Missing timezone: `2024-01-01T10:00:00` ❌
- Correct format: `2024-01-01T10:00:00Z` ✅

#### 4. Permission Errors

**Symptoms**: 403 Forbidden or access denied

**Solution**: Check OAuth scopes in Google Cloud Console:
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

### Debug Commands

```bash
# Build and test
npm run build
npm run test

# Authentication
npm run auth

# Manual testing
node debug-test.js

# Check logs in Claude Desktop
# macOS: ~/Library/Logs/Claude/mcp-server-google-calendar.log
```

## Code Examples

### Creating an Event with Full Options

```typescript
const eventData = {
  calendarId: "primary",
  summary: "Team Meeting",
  description: "Weekly team sync",
  start: "2024-06-27T14:00:00-05:00",
  end: "2024-06-27T15:00:00-05:00",
  timeZone: "America/Chicago",
  location: "Conference Room A",
  attendees: [
    { email: "john@example.com" },
    { email: "jane@example.com" }
  ],
  reminders: {
    useDefault: false,
    overrides: [
      { method: "popup", minutes: 15 },
      { method: "email", minutes: 60 }
    ]
  },
  recurrence: ["RRULE:FREQ=WEEKLY;COUNT=5"]
};
```

### Multi-Calendar Event Listing

```typescript
const listRequest = {
  calendarId: ["primary", "work@company.com", "personal@gmail.com"],
  timeMin: "2024-06-01T00:00:00Z",
  timeMax: "2024-06-30T23:59:59Z"
};
```

### Recurring Event Modification

```typescript
const updateRequest = {
  calendarId: "primary",
  eventId: "event123",
  summary: "Updated Meeting Title",
  modificationScope: "future",
  futureStartDate: "2024-07-01T14:00:00-05:00"
};
```

## Development

### Building and Testing

```bash
# Development setup
npm install
npm run typecheck
npm run build

# Testing
npm test
npm run test:watch
npm run coverage

# Running locally
npm run start
```

### Adding New Tools

1. **Create Handler** (`src/handlers/core/NewToolHandler.ts`):
```typescript
export class NewToolHandler extends BaseToolHandler {
  async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    // Implementation
  }
}
```

2. **Add to Tool Map** (`src/handlers/callTool.ts`):
```typescript
const handlerMap = {
  // ...
  "new-tool": new NewToolHandler(),
};
```

3. **Define Schema** (`src/schemas/validators.ts`):
```typescript
export const NewToolArgumentsSchema = z.object({
  // Schema definition
});
```

4. **Add Tool Definition** (`src/handlers/listTools.ts`):
```typescript
{
  name: "new-tool",
  description: "Description of the new tool",
  inputSchema: {
    // JSON Schema
  }
}
```

### Best Practices

1. **Always validate inputs** using Zod schemas
2. **Add comprehensive logging** for debugging
3. **Handle errors gracefully** with specific error messages
4. **Test with real Google Calendar API** using integration tests
5. **Follow ISO 8601 datetime format** with timezone
6. **Use proper OAuth scopes** for required permissions

---

This documentation covers the complete Google Calendar MCP server implementation. For additional support, check the test files and integration examples in the `src/integration/` directory. 