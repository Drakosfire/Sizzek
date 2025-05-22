# LibreChat: External Message Injection & Real-Time UI Update – Implementation Guide

## Overview

This document details the actual code and architectural changes made to enable:
- **External message injection** (e.g., via SMS/webhook)
- **Real-time UI updates** using Server-Sent Events (SSE)
- **Secure authentication** for both API and SSE endpoints

All information here reflects what is currently implemented in the codebase.

---

## 1. API Endpoint for External Message Injection

**File:** `api/server/routes/messages.js`

- **Endpoint:**  
  `POST /api/messages/:conversationId/external`
- **Purpose:**  
  Allows external systems (e.g., Twilio, webhooks) to inject messages into a conversation.
- **Security:**  
  Uses a custom middleware (`validateExternalMessage`) to require an internal API key for authentication.
- **Payload:**  
  Accepts a message with `role: "external"`, `content`, and optional `metadata`.
- **Threading:**  
  Sets `parentMessageId` to the last message in the conversation for proper threading.
- **Broadcast:**  
  After saving, broadcasts a `newMessage` event to the conversation owner via SSE.

**Example:**
```js
router.post('/:conversationId/external', validateExternalMessage, async (req, res) => {
  // ...
  // Save message, set parentMessageId, etc.
  broadcastToUsers(allowedUserIds, 'newMessage', {
    conversationId: savedMessage.conversationId,
    message: savedMessage,
  });
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
curl -X POST http://localhost:3080/api/messages/<CONVERSATION_ID>/external \
  -H "Content-Type: application/json" \
  -H "x-API-Key: <YOUR_INTERNAL_API_KEY>" \
  -d '{"role": "external", "content": "SMS: Hello!", "metadata": {"source": "sms"}}'
```

**Listen for SSE events:**
```bash
curl -v http://localhost:3080/api/messages/stream?token=<ACCESS_TOKEN>
```

---

## 7. Next Steps

- Set up a Twilio webhook to forward SMS to your `/external` endpoint.
- Use Tailscale or similar to securely expose your webhook if needed.
- Enjoy end-to-end SMS-to-UI integration! 