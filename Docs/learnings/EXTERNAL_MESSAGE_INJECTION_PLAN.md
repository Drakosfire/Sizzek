# External Message Injection Plan for LibreChat

## Overview
This document outlines a comprehensive plan to enable injection of external messages (e.g., SMS, webhook, etc.) into LibreChat conversations. It summarizes the current state of the codebase, key findings from exploration, and provides a step-by-step implementation guide with file locations and code examples.

---

## 1. Current State & Key Findings

### Message Model
- **File:** `packages/data-schemas/src/schema/message.ts`
- **Current fields:** No `role` field exists. Main fields are `sender`, `isCreatedByUser`, `text`, etc.
- **Implication:** To support external messages, a `role` field (e.g., `"user"`, `"assistant"`, `"system"`, `"external"`) should be added to the schema.

### Conversation Model
- **File:** `packages/data-schemas/src/schema/convo.ts`
- **Status:** No changes needed for this feature.

### Message Creation Logic
- **Route File:** `api/server/routes/messages.js`
- **POST Endpoint:** `POST /api/messages/:conversationId`
- **Save Logic:** Uses `saveMessage` from `api/models/Message.js`.
- **Current Limitation:** No support for a `role` field; only user-authenticated messages are handled.

### Message Schema in Backend
- **File:** `api/models/schema/messageSchema.js`
- **Status:** Imports schema from data-schemas package. Will need to propagate any schema changes here.

---

## 2. Implementation Plan

### Step 1: Add `role` Field to Message Schema
- **File:** `packages/data-schemas/src/schema/message.ts`
- **Action:**
  - Add a `role` field to the Mongoose schema and TypeScript interface.
  - **Note:** The `role` field is currently optional for backward compatibility with existing messages. This should be revisited and made required after migrating existing data in the database.
  - Example:
    ```ts
    role: {
      type: String,
      enum: ["user", "assistant", "system", "external"], // Add others as needed
      required: false, // Make required after migration
    },
    ```
  - Update the `IMessage` interface accordingly.

### Step 2: Propagate Schema Change to Backend
- **File:** `api/models/schema/messageSchema.js`
- **Action:**
  - No direct change needed if it imports from the data-schemas package, but ensure the new field is available after updating dependencies.

### Step 3: Update Message Creation Logic
- **File:** `api/models/Message.js`
- **Action:**
  - Ensure the `saveMessage` function can accept and store the `role` field from the request.
  - Update any validation or logic that assumes only user/assistant roles.

### Step 4: Add New API Endpoint for External Messages
- **File:** `api/server/routes/messages.js`
- **Action:**
  - Add a new route (latest working version):
    ```js
    const { v4: uuidv4 } = require('uuid');
    router.post('/:conversationId/external', validateMessageReq, async (req, res) => {
      try {
        const { role, content } = req.body;
        if (role !== 'external') {
          return res.status(400).json({ error: 'Role must be external' });
        }

        // Fetch the last message in the conversation
        const lastMessage = await Message.findOne(
          { conversationId: req.params.conversationId, user: req.user.id },
          {},
          { sort: { createdAt: -1 } }
        );

        const messageId = uuidv4();
        // Ensure content is always an array of objects
        const formattedContent = Array.isArray(content) && content[0]?.type && content[0]?.text
          ? content
          : [{ type: 'text', text: content }];

        const message = {
          ...req.body,
          conversationId: req.params.conversationId,
          role: 'external',
          isCreatedByUser: false,
          text: typeof content === 'string' ? content : (content?.text || ''),
          messageId,
          parentMessageId: lastMessage ? lastMessage.messageId : null,
          content: formattedContent,
        };

        // Debug log
        logger.info('[External Message Injection] Message to be saved:', message);

        const savedMessage = await saveMessage(
          req,
          { ...message, user: req.user.id },
          { context: 'POST /api/messages/:conversationId/external' },
        );

        if (!savedMessage) {
          return res.status(400).json({ error: 'Message not saved' });
        }

        // Only update the conversation's timestamp
        await Conversation.findOneAndUpdate(
          { conversationId: req.params.conversationId, user: req.user.id },
          { $set: { updatedAt: new Date() } },
          { new: true }
        );
        
        res.status(201).json(savedMessage);
      } catch (error) {
        logger.error('Error saving external message:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    ```
  - Accept payloads like:
    ```json
    {
      "role": "external",
      "content": "SMS: Can we meet later?"
    }
    ```
  - **UI Compatibility:**
    - The `content` field must be an array of objects: `[{ "type": "text", "text": "..." }]`.
    - The `parentMessageId` should be set to the last message's `messageId` in the conversation for proper threading.
    - If the message does not appear in the UI, check the structure of the `content` field and ensure `parentMessageId` is set.
  - **Debugging:**
    - The endpoint logs the message object before saving for troubleshooting.
  - **Tested and working as of this revision.**

### Step 5: (Optional) Trigger LLM/Agent Response
- **File:** (Wherever user message triggers LLM, e.g., controller or service)
- **Action:**
  - After saving the external message, call the same function that triggers the agent/LLM for user messages, if desired.
  - Example:
    ```js
    await handleAgentReply(conversationId);
    ```

### Step 6: Test End-to-End
- **Action:**
  - Start the server.
  - Use `curl` or Postman to POST to the new endpoint:
    ```sh
    curl -X POST http://localhost:3000/api/messages/abc-123/external \
      -H "Content-Type: application/json" \
      -d '{"role": "external", "content": "SMS: Can we meet later?"}'
    ```
  - Confirm:
    - Message appears in the conversation thread.
    - Role is respected and visible in the DB.
    - Frontend updates (real-time or on refresh).
    - Agent replies if optional trigger is enabled.

---

## 3. Optional Enhancements
- Add metadata (e.g., `source: "SMS"`).
- Add authentication for webhook (e.g., Twilio signature).
- UI tag or icon for external messages.
- Support for attachments/media.

---

## 4. Success Criteria
- Message is added into the conversation from the external route.
- UI updates correctly.
- (Optional) Agent responds automatically.

---

## 5. Immediate Next Steps
1. **Add `role` field** to the message schema and update types/interfaces.
2. **Update backend logic** to accept and store the `role` field.
3. **Add the new API endpoint** for external messages.
4. **Test** the full flow with a sample request.

---

## 6. References
- `packages/data-schemas/src/schema/message.ts` (Message schema)
- `api/models/Message.js` (Message save logic)
- `api/server/routes/messages.js` (API routes)
- `api/models/schema/messageSchema.js` (Backend schema import)

---

## 7. Conversation ID Mapping for External Integrations (SMS, Webhooks, etc.)

### Challenge
Reliably associating incoming external messages (e.g., SMS replies) with the correct LibreChat conversation is critical for a seamless user experience. If the mapping is lost (e.g., due to a server crash), you risk losing the thread context.

### Approaches

#### 1. Pass Conversation ID in Outbound SMS
- **How:** Include the conversation ID (or a short code mapped to it) in the SMS body or as metadata.
- **Pros:** Simple, stateless, easy to implement.
- **Cons:** If the message is deleted or the mapping is lost, the thread cannot be recovered. Exposes IDs to users unless a short code is used.

#### 2. Database Mapping Table (Recommended)
- **How:** When sending an SMS, store a mapping in your DB:
  ```js
  {
    phoneNumber: "+12345551212",
    conversationId: "07c1586e-32cf-4b6e-86f2-8e3a892d92a0",
    lastUsed: Date,
    code: "A1B2C3" // optional, for user-friendly mapping
  }
  ```
- **On inbound SMS:** Look up by phone number and/or code. If not found, create a new conversation and mapping.
- **Pros:** Robust, does not expose raw IDs, supports recovery after server restarts.
- **Cons:** Requires backend logic and storage.

#### 3. Use Twilio's Messaging Service Features
- Twilio can pass a `MessageSid` or `ConversationSid` with each webhook. You can store this alongside your conversation ID for lookups.

#### 4. Fallback/Recovery Mechanism
- If mapping is lost, start a new conversation and notify the user, or prompt them to reply with a code to re-link the thread.

#### 5. Security Considerations
- Do not expose raw conversation IDs to users. Use short-lived, random codes for mapping if passing in SMS.

#### 6. Bonus: Multi-User/Group Support
- For group SMS, map multiple phone numbers to a conversation.

#### 7. Resilience
- Periodically clean up old mappings. Log mapping creation and lookups for debugging.

### Summary Table

| Approach                | Robust | User-Friendly | Stateless | Notes                        |
|-------------------------|--------|---------------|----------|------------------------------|
| Pass ID in SMS          | ✗      | ✗             | ✓        | Simple, but fragile          |
| DB Mapping (Recommended)| ✓      | ✓             | ✗        | Most robust, scalable        |
| Twilio ConversationSid  | ✓      | ✓             | ✓        | If using Twilio Conversations|
| Fallback/Recovery       | ✓      | ✓             | ✓        | Good for edge cases          |

**Recommendation:** Implement the DB mapping approach for robustness and scalability. Use short codes for user-facing mapping if needed, and always have a fallback for lost mappings.

---

## 8. Implementation Progress

### Completed Changes

#### 1. API Key Authentication
- Created `validateExternalMessage` middleware for API key validation
- Implemented secure API key checking against `INTERNAL_API_KEY` environment variable
- Removed JWT requirement for external message endpoint

#### 2. Message Service Integration
- Modified `saveMessage` function to handle service requests
- Added support for 'system' user for service-originated messages
- Updated MongoDB queries to handle both user and service requests

#### 3. External Message Endpoint
- Implemented `/api/messages/:conversationId/external` endpoint
- Added support for structured content format
- Implemented proper message threading with `parentMessageId`

### Working Example
```bash
curl -X POST http://localhost:3080/api/messages/07c1586e-32cf-4b6e-86f2-8e3a892d92a0/external \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: 90dbc4ff0c10949ba19c5274226a3dacadb80d606ac9d2244038c62f3d4a1df0" \
  -d '{
    "role": "external",
    "content": "SMS: Hello from the external service!",
    "metadata": {
      "source": "sms",
      "phoneNumber": "+1234567890"
    }
  }'
```

### Next Steps
1. **Schema Updates**
   - Add `role` field to message schema (pending)
   - Update TypeScript interfaces (pending)

2. **UI Enhancements**
   - Add visual indicators for external messages
   - Support for displaying metadata (source, phone number)

3. **Testing**
   - Add unit tests for external message endpoint
   - Add integration tests for API key validation
   - Test conversation mapping with various external sources

4. **Documentation**
   - Add API documentation for external message endpoint
   - Document API key setup and security considerations

### Security Considerations
- API key is stored in environment variables
- No user authentication required for external messages
- Messages are marked with 'system' user for service requests
- Conversation ownership is maintained through API key validation

### Known Limitations
- Currently requires manual conversation ID mapping
- No automatic conversation creation for new external sources
- Limited metadata support in UI

## Addendum: Experiments That Didn't Work

### WebSocket Implementation Plan (Superseded by SSE)

*Note: The following WebSocket plan was explored as an alternative to SSE for real-time UI updates. Ultimately, SSE was chosen and works reliably after proper nginx configuration. The WebSocket approach is preserved here for reference, but is not used in the working solution.*

## 9. WebSocket Implementation Plan for UI Updates

### Overview
Implement a dedicated WebSocket connection for real-time UI updates when external messages are received. This approach separates concerns and provides a reliable way to refresh the UI without affecting the existing SSE system.

### Implementation Steps

#### 1. WebSocket Server Setup
- Create new WebSocket server endpoint in `api/server/websocket.js`
- Implement connection handling and message broadcasting
- Add authentication using the same JWT tokens
- Structure:
  ```js
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ noServer: true });
  
  // Store active connections by conversation ID
  const connections = new Map();
  
  wss.on('connection', (ws, req) => {
    const { conversationId } = req.params;
    if (!connections.has(conversationId)) {
      connections.set(conversationId, new Set());
    }
    connections.get(conversationId).add(ws);
    
    ws.on('close', () => {
      connections.get(conversationId).delete(ws);
    });
  });
  ```

#### 2. Client-Side WebSocket Integration
- Create new hook `useWebSocket.ts` for managing WebSocket connection
- Connect to WebSocket when conversation is loaded
- Handle reconnection logic
- Structure:
  ```typescript
  const useWebSocket = (conversationId: string) => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    
    useEffect(() => {
      const socket = new WebSocket(`ws://localhost:3080/ws/${conversationId}`);
      socket.onmessage = (event) => {
        // Trigger UI refresh
        refreshMessages();
      };
      setWs(socket);
      
      return () => socket.close();
    }, [conversationId]);
  };
  ```

#### 3. External Message Endpoint Integration
- Modify external message endpoint to broadcast updates
- Send WebSocket message after successful message save
- Structure:
  ```js
  // In external message endpoint
  const savedMessage = await saveMessage(req, message);
  
  // Broadcast to all clients viewing this conversation
  const connections = wss.getConnections(conversationId);
  connections.forEach(client => {
    client.send(JSON.stringify({
      type: 'message',
      data: { conversationId }
    }));
  });
  ```

#### 4. UI Refresh Mechanism
- Implement `refreshMessages` function in chat component
- Fetch latest messages when WebSocket notification received
- Update conversation timestamp
- Structure:
  ```typescript
  const refreshMessages = async () => {
    const messages = await getMessages(conversationId);
    setMessages(messages);
    updateConversationTimestamp();
  };
  ```

### Benefits
1. **Decoupled Architecture**
   - Separate from existing SSE system
   - Dedicated to UI updates only
   - Easier to maintain and debug

2. **Efficient Updates**
   - Only refreshes when needed
   - No polling overhead
   - Real-time updates

3. **Scalable Solution**
   - Can handle multiple conversations
   - Easy to add more update types
   - Low resource usage

### Security Considerations
1. **Authentication**
   - Use JWT tokens for WebSocket connections
   - Validate tokens on connection
   - Maintain user session security

2. **Connection Management**
   - Clean up stale connections
   - Handle reconnection gracefully
   - Monitor connection health

### Testing Plan
1. **Unit Tests**
   - WebSocket server functionality
   - Client connection handling
   - Message broadcasting

2. **Integration Tests**
   - End-to-end message flow
   - UI update verification
   - Connection recovery

3. **Load Testing**
   - Multiple concurrent connections
   - Message broadcast performance
   - Memory usage monitoring

### Next Steps
1. Implement WebSocket server
2. Create client-side WebSocket hook
3. Integrate with external message endpoint
4. Add UI refresh mechanism
5. Implement security measures
6. Add comprehensive testing
7. Monitor performance in production

*This WebSocket implementation was explored but not adopted, as SSE with proper nginx configuration proved to be simpler and more reliable for this use case.*

---

## 10. Example CURL Commands for Testing

### Test: Inject External Message
```bash
curl -X POST http://localhost:3080/api/messages/<CONVERSATION_ID>`/external \
  -H "Content-Type: application/json" \
  -H "x-API-Key: <YOUR_INTERNAL_API_KEY>" \
  -d '{
    "role": "external",
    "content": "SMS: Hello from the external service!",
    "metadata": {
      "source": "sms",
      "phoneNumber": "+1234567890"
    }
  }'
```
- Replace `<CONVERSATION_ID>` with the actual conversation ID.
- Replace `<YOUR_INTERNAL_API_KEY>` with your configured internal API key.

### Test: Listen for Real-Time Updates (SSE Stream)
```bash
curl -v -H "Cookie: <YOUR_AUTH_COOKIE>" http://localhost:3080/api/messages/stream
```
- Replace `<YOUR_AUTH_COOKIE>` with a valid session or JWT cookie for an authenticated user.
- You should see `event: newMessage` blocks in the response when new messages are injected.

---

## 11. Current Progress & Next Steps (May 2025)

### Current Status
- **External messages are successfully injected into the database** via the `/api/messages/:conversationId/external` endpoint.
- **The SSE stream endpoint (`/api/messages/stream`) is active and working** when tested with a valid access token in the `Authorization` header (using curl).
- **The frontend is now successfully establishing SSE connections** using the access token from the auth context.
- **End-to-end real-time updates are working after disabling nginx proxy buffering for the SSE endpoint.**

### Implementation Details
1. **Frontend SSE Authentication**
   - Using access token from auth context instead of cookies
   - Token is passed as a query parameter: `/api/messages/stream?token=${token}`
   - Implementation in `ChatView.tsx`:
   ```typescript
   const { token } = useAuthContext();
   
   React.useEffect(() => {
     if (!conversationId || !token) return;
     
     const sse = new EventSource(`/api/messages/stream?token=${token}`);
     
     sse.addEventListener('newMessage', (event) => {
       const data = JSON.parse(event.data);
       if (data.conversationId === conversationId) {
         queryClient.invalidateQueries(['messages', conversationId]);
       }
     });

     sse.addEventListener('error', (error) => {
       console.error('SSE Error:', error);
       sse.close();
     });

     return () => sse.close();
   }, [conversationId, queryClient, token]);
   ```

2. **Backend Authentication**
   - Using existing `requireJwtAuth` middleware
   - Middleware automatically handles token verification from query parameters
   - No changes needed to server code

### Next Steps
1. **Test end-to-end UI update:**
   - Inject an external message and confirm the frontend receives the event
   - Verify UI refreshes to display the new message
2. **Document findings and update implementation plan:**
   - Record the solution for SSE authentication
   - Note any frontend or backend code changes required
3. **(Optional) Add automated tests:**
   - Add integration tests for SSE event delivery
   - Test UI refresh on external message injection

### Summary Table
| Area                | Status         | Next Step                                  |
|---------------------|---------------|---------------------------------------------|
| Message Injection   | ✅ Working    | None                                        |
| SSE Endpoint        | ✅ Working    | Test with UI refresh                        |
| Frontend SSE        | ✅ Working    | Add error handling & reconnection logic     |
| UI Refresh          | ⏳ Testing    | Verify end-to-end flow                      |

---

## Troubleshooting

- **Test with curl:** You should see `event: ...` and `data: ...` lines when an event is broadcast.

---

## Next Steps

1. **Set up a Twilio webhook at dungeon-mind.net**
   - Configure Twilio to send incoming SMS messages to your webhook endpoint (e.g., `https://dungeon-mind.net/api/twilio/webhook`).
   - Parse incoming messages and inject them into LibreChat using the external message endpoint.

2. **Set up a Tailscale tunnel to the Tailscale network**
   - Use Tailscale to securely expose your webhook endpoint to Twilio or other external services, even if your server is behind NAT or a firewall.
   - This enables secure, private connectivity for development and production.

---

Once these are complete, you will have **end-to-end SMS integration**:
- SMS → Twilio → Webhook → LibreChat external message → Real-time UI update

--- 