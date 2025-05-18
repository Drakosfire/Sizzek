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
  - Add a new route:
    ```js
    router.post('/:conversationId/external', async (req, res) => {
      try {
        const { role, content } = req.body;
        if (role !== 'external') {
          return res.status(400).json({ error: 'Role must be external' });
        }
        // Validate conversationId, generate messageId, etc.
        const savedMessage = await saveMessage(req, {
          ...req.body,
          conversationId: req.params.conversationId,
          role: 'external',
          // other fields as needed
        }, { context: 'POST /api/messages/:conversationId/external' });
        // Optionally emit to frontend via Socket.IO
        res.status(201).json(savedMessage);
      } catch (error) {
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

*This plan was generated after a detailed exploration of the LibreChat codebase and is intended to be a ready-to-implement guide for external message injection.* 