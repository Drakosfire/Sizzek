# LibreChat: External Message Injection & Real-Time UI Update – Implementation Guide

# Updated May 27 2025 

## Overview

This document details the actual code and architectural changes made to enable:
- **External message injection** (e.g., via SMS/webhook)
- **Real-time UI updates** using Server-Sent Events (SSE)
- **Secure authentication** for both API and SSE endpoints

All information here reflects what is currently implemented in the codebase.

---

## Current Progress & Challenges

### Working Components
1. **DungeonMind SMS Router**
   - Successfully receives and validates Twilio webhooks
   - Forwards messages to SMS server with proper authentication
   - Handles Twilio signature validation

2. **SMS Server (MCP)**
   - Successfully receives messages from DungeonMind
   - Can forward messages to LibreChat when conversation ID is provided
   - Implements proper API key authentication

3. **LibreChat Integration**
   - Successfully receives external messages
   - Creates new conversations when needed
   - Handles message threading
   - Fixed infinite loop in LLM processing
   - Properly handles string and object message formats
   - Defaults to OpenAI endpoint for LLM processing

### Current Challenges

1. **Conversation ID Generation** ✅
   - Implemented UUID format validation
   - Added proper conversation creation flow
   - Handles both new and existing conversations

2. **Message Validation & Processing** ✅
   - Fixed conversation ID validation
   - Implemented proper message object handling
   - Resolved LLM endpoint initialization
   - Added proper request object handling for save operations

3. **SSE Connection Issues**
   - SSE setup not being established on page load/refresh
   - Need to investigate why conversation creation logging isn't firing
   - May need to modify how we handle streaming responses

### Important: Client Rebuild Requirements

After pulling from the main branch or making changes to the client code, it is **CRITICAL** to rebuild the client to ensure proper functionality of the SSE streaming. If you experience issues with the streaming not working:

1. **Check if client needs rebuilding:**
   ```bash
   # In the LibreChat directory
   npm run client:build
   ```

2. **Common symptoms requiring rebuild:**
   - SSE connection not establishing
   - Real-time updates not working
   - Streaming responses not appearing
   - Token not triggering connection upon login/auth

3. **Best practices:**
   - Always rebuild after pulling from main
   - Rebuild after any client-side changes
   - If streaming isn't working, rebuilding should be the first troubleshooting step

### Integration Flow
   Current flow that works:
   ```
   Curl -> DungeonMind -> SMS Server -> LibreChat (with known conversation ID)
   ```
   
   Flow that needs fixing:
   ```
   SMS -> DungeonMind -> SMS Server -> LibreChat (needs conversation ID)
   ```

### Next Steps

1. **Conversation Management** ✅
   - Implemented robust conversation ID generation/mapping
   - Added conversation metadata for SMS threads
   - Added logging for conversation creation/management

2. **SSE Implementation**
   - Fix SSE connection establishment
   - Add proper error handling for streaming responses
   - Implement reconnection logic

3. **Testing & Validation**
   - Add comprehensive tests for conversation ID generation
   - Test SSE reconnection scenarios
   - Validate message threading across restarts

---

## 1. API Endpoint for External Message Injection

**File:** `api/server/routes/messages.js`

- **Endpoint:**  
  `POST /api/messages/:conversationId`
- **Purpose:**  
  Allows external systems (e.g., Twilio, webhooks) to inject messages into a conversation.
- **Security:**  
  Uses a custom middleware (`validateExternalMessage`) to require an internal API key for authentication.
- **Payload:**  
  Accepts a message with `role: "external"`, `content`, and optional `metadata`.
- **Threading:**  
  Sets `parentMessageId` to the last message in the conversation for proper threading.
- **Conversation Creation:**
  Automatically creates new conversations if they don't exist.

**Example:**
```js
router.post('/:conversationId', validateMessageReq, async (req, res) => {
  // ...
  // Create conversation if needed
  if (!conversation) {
    logger.info(`[Message] Creating new conversation for conversationId: ${req.params.conversationId}`);
    // ... create conversation logic
  }
  // ...
});
```

---

## 2. Message Model & Save Logic

**File:** `api/models/Message.js`

- **Schema:**  
  Updated to support a `role` field (e.g., `"user"`, `"assistant"`, `"system"`, `"external"`).
- **saveMessage:**  
  - Accepts and stores the `role` field.
  - Handles both user and system (external) messages.
  - Ensures correct user association for message ownership and SSE delivery.

**Example:**
```js
async function saveMessage(req, params, metadata) {
  // ...
  const update = {
    ...params,
    user: req.user.id,
    messageId: params.newMessageId || params.messageId,
  };
  // ...
  const message = await Message.findOneAndUpdate(
    { messageId: params.messageId, user: req.user.id },
    update,
    { upsert: true, new: true },
  );
  return message.toObject();
}
```

---

## 3. Real-Time UI Updates with SSE

### Backend

**Files:**
- `api/server/routes/messages.js` (SSE route)
- `api/server/sseClients.js` (SSE client registry and broadcasting)

- **SSE Route:**  
  `GET /api/messages/stream?token=...`
- **Authentication:**  
  Uses JWT access token (passed as a query param) and `requireJwtAuth` middleware.
- **Client Registry:**  
  Tracks connected clients by userId.
- **Broadcasting:**  
  When a new message is injected, calls `broadcastToUsers` to send a `newMessage` event to the correct user(s).

**Example:**
```js
router.get('/stream', requireJwtAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  addClient(req.user.id, res);
  req.on('close', () => removeClient(req.user.id, res));
});
```

**SSE Client Management:**
```js
function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}
function broadcastToUser(userId, event, data) {
  if (!clients.has(userId)) return;
  for (const res of clients.get(userId)) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush();
  }
}
```

### Frontend

**File:** `client/src/components/Chat/ChatView.tsx`

- **SSE Subscription:**
  Uses the access token from React context to open an SSE connection:
  ```js
  const sse = new EventSource(`/api/messages/stream?token=${token}`);
  ```
- **Event Handling:**
  Listens for `newMessage` events. When received, invalidates the React Query cache for the current conversation, triggering a UI refresh.
  ```js
  sse.addEventListener('newMessage', (event) => {
    const data = JSON.parse(event.data);
    if (data.conversationId === conversationId) {
      queryClient.invalidateQueries(['messages', conversationId]);
    }
  });
  ```

---

## 4. JWT Authentication Strategy

**File:** `api/strategies/jwtStrategy.js`

- **Custom Extractor:**
  Extracts JWT from:
  - `Authorization` header (Bearer)
  - `token` query parameter (for SSE)
  - (Optionally) cookies
- **Strategy:**
  Validates the token and attaches the user object to the request for downstream use.

**Example:**
```js
const customJwtExtractor = (req) => {
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }
  return token;
};
```

---

## 5. End-to-End Flow

1. **External system** (e.g., Twilio) sends a message to `/api/messages/:conversationId/external` with the API key.
2. **Backend** saves the message, sets threading, and broadcasts a `newMessage` event to the conversation owner.
3. **Frontend** receives the event via SSE and refreshes the UI to show the new message in real time.

---

## 6. Example CURL Commands

**Inject external message:**
```bash
# Test 1
curl -X POST http://localhost:3080/api/messages/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -H "x-API-Key: 90dbc4ff0c10949ba19c5274226a3dacadb80d606ac9d2244038c62f3d4a1df0" \
  -d '{"role": "external", "content": "SMS: Hello!", "metadata": {"source": "sms"}}'

# Test 2
curl -X POST http://localhost:3080/api/messages/6ba7b810-9dad-11d1-80b4-00c04fd430c8 \
  -H "Content-Type: application/json" \
  -H "x-API-Key: 90dbc4ff0c10949ba19c5274226a3dacadb80d606ac9d2244038c62f3d4a1df0" \
  -d '{"role": "external", "content": "SMS: Hello!", "metadata": {"source": "sms"}}'

# Test 3
curl -X POST http://localhost:3080/api/messages/7c9e6679-7425-40de-944b-e07fc1f90ae7 \
  -H "Content-Type: application/json" \
  -H "x-API-Key: 90dbc4ff0c10949ba19c5274226a3dacadb80d606ac9d2244038c62f3d4a1df0" \
  -d '{"role": "external", "content": "SMS: Hello!", "metadata": {"source": "sms"}}'
```

**Listen for SSE events:**
```bash
curl -v http://localhost:3080/api/messages/stream?token=<ACCESS_TOKEN>
```

---

## 7. Next Steps

- Implement robust conversation ID generation/mapping
- Fix SSE connection establishment
- Add comprehensive testing for the full SMS integration flow
- Consider adding conversation metadata for better SMS thread management 

## 8. Architectural Decisions & Implementation Progress

### Current Implementation Approach
1. **Leveraging Existing Architecture**
   - Using LibreChat's existing conversation and message handling
   - External messages are treated as a special case within the existing flow
   - Maintaining compatibility with existing validation and processing

2. **Progress Made**
   - Successfully handling external message injection
   - Fixed conversation initialization and validation
   - Resolved module loading for LLM processing
   - Implemented proper message threading

3. **Current Challenges**
   - MeiliSearch integration for message indexing
   - SSE connection establishment
   - Conversation ID management for SMS threads

### Next Implementation Phase

1. **Conversation Management** ✅
   - [x] Implement SMS-specific conversation metadata
     - Phone number mapping
     - Thread identification
     - Last message timestamp
   - [ ] Add conversation cleanup/archival for inactive threads
   - [ ] Implement conversation search by phone number

2. **Message Processing** ✅
   - [x] Fix MeiliSearch integration
     - Added proper error handling
     - Implemented fallback for indexing errors
     - Added logging for debugging
   - [x] Enhance message threading
   - [x] Add support for message grouping
   - [x] Implement proper conversation branching

3. **Real-time Updates**
   - [ ] Fix SSE connection issues
     - Investigate connection establishment
     - Add reconnection logic
     - Implement proper error handling
   - [ ] Add message delivery status
     - Track message state
     - Implement delivery confirmation
     - Add error reporting

4. **Testing & Validation**
   - [ ] Add comprehensive test suite
     - Unit tests for external message handling
     - Integration tests for SMS flow
     - Load testing for concurrent messages
   - [ ] Implement monitoring
     - Add performance metrics
     - Track error rates
     - Monitor resource usage

### Design Considerations

1. **Conversation ID Strategy**
   - Current: Using UUID format for compatibility
   - Future: Consider implementing a more descriptive ID format
     - Include phone number prefix
     - Add timestamp component
     - Maintain backward compatibility

2. **Message Flow**
   - External messages → LibreChat → LLM Processing → Response
   - Each step needs proper error handling and recovery
   - Consider implementing message queues for reliability

3. **Security & Authentication**
   - API key validation for external messages
   - JWT for SSE connections
   - Rate limiting and abuse prevention

4. **Performance & Scalability**
   - Message batching for efficiency
   - Connection pooling for SSE
   - Caching for frequently accessed data

### Implementation Checklist

1. **Immediate Tasks** ✅
   - [x] Fix MeiliSearch integration
   - [ ] Implement proper SSE connection handling
   - [x] Add comprehensive logging
   - [x] Test conversation ID generation

2. **Short-term Goals**
   - [x] Implement SMS-specific metadata
   - [ ] Add message delivery tracking
   - [x] Enhance error handling
   - [ ] Add monitoring

3. **Long-term Objectives**
   - [ ] Implement message queuing
   - [ ] Add conversation archival
   - [ ] Enhance search capabilities
   - [ ] Optimize performance

   Staging for make file.
   /media/drakosfire/Shared/Projects/LibreChat$ npm run backend:dev
   /media/drakosfire/Shared/Projects/Sizzek OLLAMA_HOST=172.17.0.1 ollama serve

## 9. Implementation Plan for Conversation UI Updates

### A. Backend Changes

1. **File:** `api/server/routes/messages.js`
   - Add conversation creation logic for external messages without conversation ID
   - Return new conversation ID in response
   - Add validation for conversation ID format
   ```javascript
   // Example structure
   if (!conversationId) {
     // Create new conversation
     const newConversation = await createConversation({
       title: 'External Message',
       endpoint: 'external',
       // ... other required fields
     });
     conversationId = newConversation.conversationId;
   }
   ```

2. **File:** `api/server/sseClients.js`
   - Add new event type for conversation creation
   - Implement broadcasting for new conversations
   ```javascript
   // Example structure
   function broadcastNewConversation(userId, conversation) {
     broadcastToUser(userId, 'newConversation', conversation);
   }
   ```

### B. Frontend Changes

1. **File:** `client/src/components/Chat/ChatView.tsx`
   - Add handler for new conversation events
   - Update SSE event listener to handle conversation creation
   ```typescript
   sse.addEventListener('newConversation', (event) => {
     const data = JSON.parse(event.data);
     queryClient.invalidateQueries([QueryKeys.conversations]);
   });
   ```

2. **File:** `client/src/hooks/useNewConvo.ts`
   - Add method to handle external conversation creation
   - Implement navigation to new conversation
   ```typescript
   const handleExternalConversation = (conversation) => {
     setConversation(conversation);
     navigate(`/c/${conversation.conversationId}`, { 
       state: { focusChat: true } 
     });
   };
   ```

3. **File:** `client/src/store/families.ts`
   - Ensure conversation state management handles external conversations
   - Add validation for conversation ID format
   ```typescript
   // Update conversationByIndex atom
   const conversationByIndex = atomFamily<TConversation | null, string | number>({
     key: 'conversationByIndex',
     default: null,
     effects: [
       ({ onSet, node }) => {
         onSet(async (newValue) => {
           // Add validation for external conversations
           if (newValue?.endpoint === 'external') {
             // Handle external conversation specific logic
           }
         });
       },
     ],
   });
   ```

### C. Testing Plan

1. **Test Cases to Implement:**
   - External message without conversation ID
   - External message with existing conversation ID
   - Invalid conversation ID format
   - SSE connection handling
   - UI updates for new conversations
   - Navigation to new conversations

2. **Files to Create/Update:**
   - `api/server/__tests__/messages.test.js`
   - `client/src/__tests__/components/Chat/ChatView.test.tsx`
   - `client/src/__tests__/hooks/useNewConvo.test.ts`

### D. Implementation Order

1. **Phase 1: Backend Foundation**
   - Implement conversation creation logic
   - Add SSE event broadcasting
   - Add validation and error handling

2. **Phase 2: Frontend State Management**
   - Update Recoil atoms and selectors
   - Implement conversation handling hooks
   - Add SSE event listeners

3. **Phase 3: UI Updates**
   - Implement navigation logic
   - Add loading states
   - Handle error cases

4. **Phase 4: Testing & Validation**
   - Write unit tests
   - Add integration tests
   - Perform end-to-end testing

### E. Success Criteria

1. **Functionality**
   - External messages create new conversations when needed
   - UI updates in real-time for new conversations
   - Proper navigation to new conversations
   - Error handling for invalid cases

2. **Performance**
   - SSE connection maintains stability
   - UI updates are smooth and responsive
   - No unnecessary re-renders

3. **User Experience**
   - Clear loading states
   - Proper error messages
   - Smooth navigation
   - Real-time updates
