# Twilio SMS MCP Server - Comprehensive Design Document

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Core Components](#core-components)
- [File Structure](#file-structure)
- [Key Functions & Code Snippets](#key-functions--code-snippets)
- [Data Flow](#data-flow)
- [Integration with LibreChat](#integration-with-librechat)
- [Configuration & Environment](#configuration--environment)
- [API Endpoints](#api-endpoints)
- [Message Handling](#message-handling)
- [Contact Management](#contact-management)
- [Security & Error Handling](#security--error-handling)
- [Development & Testing](#development--testing)
- [Future Enhancements](#future-enhancements)

---

## Overview

The Twilio SMS MCP (Model Context Protocol) Server is a dual-component system that enables bidirectional SMS communication through LibreChat agents. It consists of:

1. **MCP Server Component** - Handles outbound SMS sending via MCP tools
2. **HTTP Server Component** - Handles inbound SMS messages and integrates with LibreChat's external message system

### Purpose
- Enable LibreChat agents to send SMS messages through Twilio
- Process incoming SMS messages and route them to LibreChat agents
- Maintain contact information and conversation context
- Provide seamless SMS chat experience through AI agents

---

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LibreChat     │◄──►│  MCP Server      │◄──►│    Twilio       │
│   Agent         │    │  (Outbound SMS)  │    │    API          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         ▲                                              ▲
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LibreChat     │◄──►│  HTTP Server     │◄──►│   Twilio        │
│   External API  │    │  (Inbound SMS)   │    │   Webhook       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### System Components

1. **MCP Protocol Layer** (`index.ts`)
   - Implements Model Context Protocol for tool invocation
   - Provides `send_sms` and `manage_contact` tools
   - Handles message status polling and validation

2. **HTTP Server Layer** (`sms-server.ts`)
   - Express.js server for webhook endpoints
   - Processes incoming SMS messages
   - Forwards messages to LibreChat external API
   - Handles contact management and conversation threading

3. **Contact Management System** (`contacts.ts`)
   - Persistent contact storage with JSON file backend
   - Agent assignment and conversation mapping
   - Name prompt logic for new contacts

---

## Core Components

### 1. MCP Server (`src/index.ts`)

**Primary Functions:**
- Tool registration and handling
- Twilio API integration for outbound SMS
- Message status polling
- Process management for HTTP server

**Key Features:**
- E.164 phone number validation
- Automatic status checking with polling
- Prevention of message retry loops
- Child process management

### 2. HTTP Server (`src/sms-server.ts`)

**Primary Functions:**
- Webhook endpoint for Twilio
- Message deduplication
- LibreChat API integration
- Contact information processing

**Key Features:**
- Message deduplication with 5-second window
- Phone number normalization
- Conversation ID management
- Agent routing based on metadata

### 3. Contact Manager (`src/contacts.ts`)

**Primary Functions:**
- Contact storage and retrieval
- Conversation title generation
- Name prompt logic
- Agent assignment

**Key Features:**
- JSON file persistence
- Phone number normalization
- Metadata support (notes, tags)
- Conversation threading

---

## File Structure

```
twilio-sms/
├── src/
│   ├── index.ts           # MCP Server (outbound SMS)
│   ├── sms-server.ts      # HTTP Server (inbound SMS)
│   ├── contacts.ts        # Contact management system
│   └── test-client.ts     # MCP testing client
├── dist/                  # Compiled JavaScript output
├── data/                  # Contact storage (runtime)
├── ssl/                   # SSL certificates (optional)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── .env                   # Environment variables
├── .gitignore            
└── README.md
```

---

## Key Functions & Code Snippets

### MCP Tool Registration

```typescript
// src/index.ts - Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "send_sms",
                description: "Send a SINGLE SMS message to a specified phone number. IMPORTANT: This function should ONLY be called ONCE per message.",
                inputSchema: {
                    type: "object",
                    properties: {
                        to: { type: "string", description: "Phone number (E.164 format)" },
                        message: { type: "string", description: "Message content" }
                    },
                    required: ["to", "message"]
                }
            },
            {
                name: "manage_contact",
                description: "Add or update contact information for a phone number",
                // ... schema definition
            }
        ]
    };
});
```

### SMS Message Status Polling

```typescript
// src/index.ts - Status checking with polling
while (attempts < maxAttempts) {
    const statusMessage = getStatusMessage(currentMessage.status);
    const isSuccess = ['sent', 'delivered'].includes(currentMessage.status);
    const isFailure = ['undelivered', 'failed'].includes(currentMessage.status);

    if (isSuccess) {
        return {
            content: [{
                type: "text",
                text: "[FINAL] ✅ Message sent successfully. Do not attempt to resend this message."
            }]
        };
    }

    if (isFailure) {
        return {
            content: [{
                type: "text", 
                text: `[FINAL] ❌ Failed to send message: ${statusMessage}`
            }]
        };
    }

    await wait(pollInterval);
    currentMessage = await checkMessageStatus(message.sid);
    attempts++;
}
```

### Message Deduplication

```typescript
// src/sms-server.ts - Dual-level deduplication system
const recentMessages = new Map<string, number>();
const MESSAGE_DEDUP_WINDOW = 5000; // 5 seconds

// Add Twilio webhook deduplication tracking (longer window for webhook retries)
const webhookMessages = new Map<string, number>();
const WEBHOOK_DEDUP_WINDOW = 60000; // 60 seconds (longer than Twilio retry window)

async function forwardToClient(conversationId: string, message: string, /* ... */) {
    const messageKey = `${conversationId}:${message}`;
    const now = Date.now();
    const lastSent = recentMessages.get(messageKey);
    
    if (lastSent && (now - lastSent) < MESSAGE_DEDUP_WINDOW) {
        console.error('[SMS-SERVER] Duplicate message detected, skipping:', messageKey);
        return { status: 'skipped', reason: 'duplicate' };
    }
    recentMessages.set(messageKey, now);
    // ... continue processing
}
```

### Webhook Duplicate Prevention

```typescript
// src/sms-server.ts - Webhook-level deduplication
app.post('/api/receive-sms', async (req, res) => {
    const { from, body, metadata, messageSid } = req.body as SMSPayload;
    
    // Check for webhook-level duplicates (prevent Twilio retries)
    // Use MessageSid if available (most reliable), otherwise fall back to content-based key
    const webhookKey = messageSid ? `sid:${messageSid}` : `${phoneNumber}:${body}:${conversationId}`;
    const now = Date.now();
    const lastWebhookTime = webhookMessages.get(webhookKey);
    
    if (lastWebhookTime && (now - lastWebhookTime) < WEBHOOK_DEDUP_WINDOW) {
        console.error('[SMS-SERVER] Duplicate webhook detected (Twilio retry), responding success but skipping processing:', webhookKey);
        res.status(200).json({ status: 'success', message: 'Duplicate webhook handled' });
        return;
    }
    
    // Record this webhook to prevent duplicates
    webhookMessages.set(webhookKey, now);

    // CRITICAL: Respond to Twilio immediately with empty TwiML to prevent webhook retries
    // This must happen BEFORE any long-running operations
    // Empty TwiML acknowledges receipt without sending a response SMS
    res.set('Content-Type', 'text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    // Process the message asynchronously after responding to Twilio
    setImmediate(async () => {
        try {
            // ... process message
        } catch (error) {
            console.error('[SMS-SERVER] Error processing message asynchronously:', error);
        }
    });
});
```

### Contact Management

```typescript
// src/contacts.ts - Contact storage and retrieval
public addOrUpdateContact(
    phoneNumber: string,
    updates: Partial<Contact>,
    conversationId: string
): Contact {
    const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
    const existingContact = this.store.contacts.get(normalizedNumber);

    const contact: Contact = {
        phoneNumber: normalizedNumber,
        name: updates.name ?? existingContact?.name ?? null,
        agentId: updates.agentId ?? existingContact?.agentId ?? this.defaultAgentId,
        conversationId: conversationId,
        lastInteraction: new Date().toISOString(),
        metadata: {
            ...existingContact?.metadata,
            ...updates.metadata
        }
    };

    this.store.contacts.set(normalizedNumber, contact);
    this.saveStore(this.store);
    return contact;
}
```

---

## Data Flow

### Outbound SMS Flow

```
1. LibreChat Agent → MCP Tool Request
2. MCP Server → Twilio API
3. Twilio API → SMS Network
4. Status Polling → Message Status
5. Final Status → LibreChat Agent
```

### Inbound SMS Flow

```
1. SMS Network → Twilio
2. Twilio → Webhook (HTTP Server)
3. HTTP Server → Message Processing
4. Contact Management → Agent Assignment
5. LibreChat External API → Agent Processing
6. Agent Response → (Outbound flow)
```

### Contact Management Flow

```
1. New SMS → Phone Number Check
2. Contact Manager → Name Prompt Check
3. If No Name → System Prompt Added
4. Agent Response → Name Collection
5. Name Update → Contact Store
6. Future Messages → Named Contact
```

---

## Integration with LibreChat

### External Message API Integration

The HTTP server integrates with LibreChat's external message system:

```typescript
// src/sms-server.ts - LibreChat API payload
const payload = {
    role: "external",
    content: contentsWithPhoneNumber,
    from: from,
    metadata: {
        endpoint: "agents",
        agent_id: AGENT_ID,
        model: AGENT_MODEL,
        phoneNumber: phoneNumber,
        source: 'sms',
        title: conversationTitle,
        conversationMetadata: {
            title: conversationTitle,
            endpoint: "agents", 
            agent_id: AGENT_ID,
            model: AGENT_MODEL
        }
    }
};
```

### Message Processing Pipeline

1. **Incoming SMS** → HTTP webhook endpoint
2. **Phone Number Validation** → E.164 format check
3. **Contact Resolution** → Name prompt logic
4. **Message Formatting** → Agent-specific payload
5. **LibreChat API** → External message endpoint
6. **Agent Processing** → AI response generation
7. **Response Handling** → (Via MCP tools if SMS response needed)

---

## Configuration & Environment

### Required Environment Variables

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# LibreChat Integration
EXTERNAL_MESSAGE_API_KEY=your_librechat_api_key
LIBRECHAT_AGENT_ID=agent_G5HmZ0jJtfPMXIykL81Nx
LIBRECHAT_AGENT_MODEL=gpt-4.1

# Server Configuration
PORT=3081
SSL_KEY_PATH=/path/to/ssl/private.key (optional)
SSL_CERT_PATH=/path/to/ssl/certificate.crt (optional)
CONTACTS_DATA_DIR=/custom/data/path (optional)
```

### TypeScript Configuration

```json
// tsconfig.json - ES Module configuration
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "esModuleInterop": true,
        "strict": true,
        "outDir": "./dist",
        "rootDir": "./src"
    }
}
```

---

## API Endpoints

### HTTP Server Endpoints

#### POST `/api/receive-sms`
- **Purpose**: Webhook endpoint for incoming SMS from Twilio
- **Authentication**: Bearer token (EXTERNAL_MESSAGE_API_KEY)
- **Payload**:
  ```json
  {
    "from": "+1234567890",
    "body": "Hello from user",
    "metadata": {
      "phoneNumber": "+1234567890",
      "conversationId": "uuid-optional"
    }
  }
  ```

#### POST `/api/manage-contact`
- **Purpose**: Update contact information
- **Authentication**: Bearer token
- **Payload**:
  ```json
  {
    "phoneNumber": "+1234567890", 
    "name": "John Doe",
    "metadata": {
      "notes": "Important client",
      "tags": ["business", "priority"]
    }
  }
  ```

### MCP Tools

#### `send_sms`
- **Purpose**: Send outbound SMS message
- **Parameters**: `to` (phone number), `message` (text content)
- **Response**: Status confirmation with final delivery status

#### `manage_contact`
- **Purpose**: Update contact information via MCP
- **Parameters**: `phoneNumber`, `name`, `notes`, `tags`
- **Response**: Success confirmation

---

## Message Handling

### Phone Number Normalization

```typescript
// src/contacts.ts - Phone number processing
private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-numeric characters
    return phoneNumber.replace(/\D/g, '');
}
```

### Conversation ID Management

```typescript
// src/sms-server.ts - Conversation mapping
const phoneConversationMap = new Map<string, string>();

function getConversationIdForPhone(phoneNumber: string, providedConversationId?: string): string {
    if (providedConversationId) {
        phoneConversationMap.set(phoneNumber, providedConversationId);
        return providedConversationId;
    }

    const existingConversationId = phoneConversationMap.get(phoneNumber);
    if (existingConversationId) {
        return existingConversationId;
    }

    const newConversationId = crypto.randomUUID();
    phoneConversationMap.set(phoneNumber, newConversationId);
    return newConversationId;
}
```

### Message Threading Logic

The system maintains conversation context through:
1. **Phone-to-Conversation Mapping** - Each phone number maps to a conversation ID
2. **Agent Assignment** - Contacts are assigned to specific agents
3. **Name Prompt System** - New contacts trigger name collection
4. **Conversation Titles** - Dynamic titles based on contact names

---

## Contact Management

### Contact Data Structure

```typescript
interface Contact {
    phoneNumber: string;
    name: string | null;
    agentId: string;
    conversationId: string;
    lastInteraction: string;
    metadata?: {
        notes?: string;
        tags?: string[];
        memoryPath?: string;
        todoodlePath?: string;
    }
}
```

### Persistent Storage

- **Format**: JSON file storage
- **Location**: `data/contacts.json` (configurable)
- **Backup**: Automatic backup on corruption
- **Structure**: Map-based storage with array serialization

### Name Prompt Logic

```typescript
// src/contacts.ts - Name prompt determination
public needsNamePrompt(phoneNumber: string): boolean {
    const contact = this.getContact(phoneNumber);
    return !contact?.name;
}

// src/sms-server.ts - System message injection
if (needsNamePrompt) {
    contentsWithPhoneNumber = `[System: This is a new contact (${phoneNumber}). Please ask for their name. When they respond you need to call the /manage-contact endpoint and add their name and phone number. Then you can continue with the conversation.]\n\n${message}`;
}
```

---

## Security & Error Handling

### Authentication

- **API Key Validation**: All endpoints require Bearer token authentication
- **Environment Variables**: Sensitive data stored in environment variables
- **SSL Support**: Optional HTTPS with certificate configuration

### Error Handling

```typescript
// src/index.ts - Comprehensive error handling
if (error.message.includes('Authentication Error')) {
    throw new Error('Twilio authentication failed. Please check your Account SID and Auth Token.');
} else if (error.message.includes('Invalid phone number')) {
    throw new Error('Invalid phone number format. Please use E.164 format (e.g., +1234567890)');
}
```

### Duplicate Message Prevention

The system implements a dual-level deduplication strategy:

1. **Webhook-Level Deduplication** (60-second window)
   - Prevents Twilio webhook retries from causing duplicate processing
   - Uses Twilio MessageSid when available for reliable duplicate detection
   - Falls back to content-based keys for non-Twilio sources
   - Immediate HTTP 200 response to prevent webhook timeouts

2. **Message-Level Deduplication** (5-second window)
   - Prevents duplicate messages from being sent to LibreChat
   - Content-based deduplication within conversation context
   - Shorter window for rapid duplicate detection

### Webhook Timeout Prevention

```typescript
// Critical pattern: Immediate TwiML response, asynchronous processing
// Empty TwiML acknowledges receipt without sending a response SMS
res.set('Content-Type', 'text/xml');
res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

setImmediate(async () => {
    // Long-running processing happens here
    // Twilio has already received success response
});
```

**Root Cause Analysis**: The duplicate message issue was caused by:
1. LibreChat processing taking >15 seconds (Twilio's timeout)
2. Twilio retrying webhooks due to timeout
3. Original 5-second deduplication window being too short for webhook retries
4. Synchronous processing blocking webhook response

**Solution**: Immediate webhook acknowledgment with asynchronous processing prevents Twilio retries while maintaining processing reliability.

### TwiML Response Format

Twilio webhooks expect TwiML (XML) responses, not JSON. The proper response format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

**Key Benefits**:
- **Empty TwiML**: Acknowledges receipt without sending response SMS
- **Immediate response**: Prevents Twilio webhook timeouts and retries
- **No SMS waste**: Doesn't consume SMS credits for acknowledgment
- **Standard compliance**: Follows Twilio's official webhook response pattern

---

## Development & Testing

### Build Process

```bash
# TypeScript compilation
npm run build

# Development with watch
npm run dev

# Testing
npm run test
```

### Test Client

The `test-client.ts` provides MCP server testing:

```typescript
// src/test-client.ts - MCP testing
async function sendSMS(to: string, message: string) {
    const response = await sendToServer({
        jsonrpc: "2.0",
        id: 2,
        method: "call_tool",
        params: {
            name: "send_sms",
            arguments: { to, message }
        }
    });
    return response;
}
```

### Debugging Features

- **Comprehensive Logging**: All operations logged to stderr
- **Environment Validation**: Startup checks for required variables
- **Status Reporting**: Detailed Twilio API response logging
- **Error Context**: Full error details with context

---

## Future Enhancements

### Planned Features

1. **Media Message Support**
   - Image/video message handling
   - File attachment processing
   - Media storage integration

2. **Advanced Contact Management**
   - Contact groups and tagging
   - Conversation history search
   - Contact analytics

3. **Integration Improvements**
   - Real-time message streaming
   - WebSocket support for live updates
   - Database backend option

4. **Security Enhancements**
   - Message encryption at rest
   - Audit logging
   - Rate limiting and abuse prevention

5. **Scalability Features**
   - Redis backend for contact storage
   - Load balancing support
   - Horizontal scaling capabilities

### Architecture Considerations

- **Message Queue Integration**: For high-volume SMS processing
- **CDN Integration**: For media message delivery
- **Analytics Platform**: For usage tracking and insights
- **Multi-tenant Support**: For multiple LibreChat instances

---

## Summary

The Twilio SMS MCP Server provides a robust foundation for SMS integration with LibreChat agents. Its dual-component architecture enables both outbound messaging through MCP tools and inbound message processing through webhooks. The system's contact management, message deduplication, and error handling make it suitable for production use while maintaining simplicity for development and maintenance.

**Key Strengths:**
- Bidirectional SMS communication
- Robust error handling and logging
- Contact management with persistence
- Integration with LibreChat agent system
- Prevention of message loops and duplicates
- Comprehensive testing and debugging tools

**Development Pattern:**
This design document serves as the definitive reference for understanding, maintaining, and extending the Twilio SMS MCP Server. It should be updated with any architectural changes or new features to maintain its value as a comprehensive technical reference. 