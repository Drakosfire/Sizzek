# External Message LLM Integration Plan

curl -X POST \
  'http://localhost:3080/api/messages/5c79d482-9b80-45f6-bbf2-9abe17335e55' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: 90dbc4ff0c10949ba19c5274226a3dacadb80d606ac9d2244038c62f3d4a1df0' \
  -d '{
    "role": "external",
    "content": [
      {
        "type": "text",
        "text": "This is a test external message with structured content"
      }
    ]
  }'

## Overview

This document outlines the implementation plan for integrating external messages into the existing message processing pipeline, ensuring they can trigger agent responses while maintaining security and reliability.

## Current State

- External messages are injected as responses (`role: 'external'`)
- Messages bypass LLM processing
- Messages are saved directly to the database
- Real-time updates via SSE are implemented
- Existing `/api/messages/:conversationId` endpoint can handle both regular and external messages

## Key Learnings

1. **Existing Endpoint Usage**
   - The main message endpoint (`/api/messages/:conversationId`) can handle both regular and external messages
   - No need for a dedicated external endpoint
   - API key validation middleware (`validateExternalMessage`) provides security
   - Conversation endpoint determines which client to use

2. **Security Model**
   - API key authentication via `x-api-key` header
   - Conversation validation through `validateMessageReq`
   - External messages bypass JWT auth but require API key
   - System user (`user: 'system'`) for external messages

## Current Understanding

1. **Conversation Endpoint Discovery**
   - We can get the endpoint from an existing conversation using `getConvo(null, conversationId)`
   - The conversation object contains:
     - `endpoint`: The LLM service (e.g., 'openAI', 'anthropic')
     - `model`: The specific model to use
     - `endpointType`: The type of endpoint

2. **Message Processing Flow**
   - External messages are validated via `validateExternalMessage` middleware
   - Messages are saved to the database
   - Real-time updates via SSE are implemented
   - The `/api/messages/:conversationId` endpoint handles both regular and external messages

## Message Flow Analysis

### 1. Frontend to Backend Flow
- User message originates in `ChatView.tsx`
- Uses Server-Sent Events (SSE) for real-time streaming
- Messages sent to backend API endpoint

### 2. Backend Processing Pipeline
```javascript
// Main processing flow:
1. sendMessage(message, opts)
2. buildMessages(messages, parentMessageId, options)
3. sendCompletion(payload, opts)
4. chatCompletion({ payload, onProgress, abortController })
```

### 3. Key Processing Steps

#### Message Building (buildMessages)
```javascript
async buildMessages(messages, parentMessageId, options) {
    // 1. Get ordered conversation messages
    let orderedMessages = this.constructor.getMessagesForConversation({
        messages,
        parentMessageId,
        summary: this.shouldSummarize,
    });

    // 2. Format messages for API
    const formattedMessages = orderedMessages.map((message) => {
        const formattedMessage = formatMessage({
            message,
            userName: this.options?.name,
            assistantName: this.options?.chatGptLabel,
        });
        // Handle token counting and file attachments
        return formattedMessage;
    });

    // 3. Handle system instructions
    if (promptPrefix) {
        instructions = {
            role: 'system',
            content: promptPrefix,
        };
    }

    // 4. Return formatted payload
    return {
        prompt: payload,
        promptTokens,
        messages,
    };
}
```

#### Completion Sending (sendCompletion)
```javascript
async sendCompletion(payload, opts = {}) {
    // 1. Configure streaming
    if (typeof opts.onProgress === 'function') {
        modelOptions.stream = true;
    }

    // 2. Format payload
    if (this.isChatCompletion) {
        modelOptions.messages = payload;
    } else {
        modelOptions.prompt = payload;
    }

    // 3. Handle streaming or regular completion
    if (modelOptions.stream) {
        // Streaming setup and processing
    } else {
        // Regular completion
        chatCompletion = await openai.chat.completions.create({
            ...modelOptions,
        });
    }
}
```

#### Chat Completion (chatCompletion)
```javascript
async chatCompletion({ payload, onProgress, abortController = null }) {
    // 1. Initialize OpenAI client
    const openai = new OpenAI({
        fetch: createFetch({
            directEndpoint: this.options.directEndpoint,
            reverseProxyUrl: this.options.reverseProxyUrl,
        }),
        apiKey: this.apiKey,
        ...opts,
    });

    // 2. Handle streaming
    if (modelOptions.stream) {
        const stream = await openai.beta.chat.completions.stream(params)
            .on('abort', () => {})
            .on('error', (err) => {})
            .on('finalChatCompletion', async (finalChatCompletion) => {})
            .on('finalMessage', (message) => {});

        // Process stream chunks
        for await (const chunk of stream) {
            this.streamHandler.handle(chunk);
        }
    }

    // 3. Return final response
    return message.content;
}
```

### 4. Critical Implementation Points

1. **Message Formatting**
   - Proper role assignment ('user', 'assistant', 'system')
   - File attachment handling
   - Image URL processing
   - Conversation context maintenance

2. **Streaming Support**
   - Chunk processing
   - Error handling
   - Abort handling
   - Intermediate state management

3. **Configuration Management**
   - Model type handling (chat vs completion)
   - API key management
   - Endpoint configuration
   - Model parameters

4. **Error Handling**
   - API call errors
   - Rate limiting
   - Timeouts
   - Meaningful error messages

## Current Implementation Status

### What We've Built
1. **External Client Structure**
   - Created `ExternalClient` class extending `BaseClient`
   - Implemented message processing with proper endpoint handling
   - Added support for both `endpoint` and `endpointType`
   - Integrated agent support with proper promise handling

2. **Key Components**
   ```javascript
   // ExternalClient initialization
   const clientOptions = {
     req,
     res,
     user: conversation.user,
     endpoint: conversation.endpoint,
     endpointType: conversation.endpointType || conversation.endpoint,
     model: conversation.model,
     agent_id: conversation.agent_id
   };
   ```

3. **Agent Integration**
   ```javascript
   // Agent handling in processWithLLM
   if (this.endpoint === 'agents') {
     const agent = await loadAgent({
       req: this.req,
       agent_id: this.options.agent_id,
       endpoint: this.endpoint,
       model_parameters: this.options.model_parameters
     });
     
     endpointOption = {
       ...endpointOption,
       agent: Promise.resolve(agent),  // Critical: Must be a Promise
       agent_id: this.options.agent_id
     };
   }
   ```

## Current Challenges

1. **Agent Promise Handling**
   - Error: "No agent promise provided"
   - Root cause: Agent must be passed as a Promise in endpointOption
   - Solution: Ensure agent is wrapped in Promise.resolve()

2. **Endpoint Type Management**
   - Need to handle both `endpoint` and `endpointType`
   - `endpointType` determines which client to initialize
   - Fallback to `endpoint` if `endpointType` not available

## Updated Implementation Plan

### Phase 1: Message Processing Integration

1. **Client Initialization**
   ```javascript
   const initializeClient = async ({ req, res, endpointOption }) => {
     const { conversation } = req;
     const clientOptions = {
       req,
       res,
       user: conversation.user,
       endpoint: conversation.endpoint,
       endpointType: conversation.endpointType || conversation.endpoint,
       model: conversation.model,
       agent_id: conversation.agent_id
     };
     
     // Special handling for agents endpoint
     if (conversation.endpoint === 'agents') {
       clientOptions.agent_id = conversation.agent_id;
       clientOptions.model_parameters = conversation.model_parameters;
     }
     
     return new ExternalClient(null, clientOptions);
   };
   ```

2. **Message Processing Flow**
   ```javascript
   async processWithLLM(message, opts = {}) {
     // Use endpointType for client initialization
     const { initializeClient } = require(`~/server/services/Endpoints/${this.endpointType}/initialize`);
     
     let endpointOption = {
       endpoint: this.endpoint,
       endpointType: this.endpointType,
       modelOptions: { model: this.model }
     };
     
     // Agent handling
     if (this.endpoint === 'agents') {
       const agent = await loadAgent({...});
       endpointOption = {
         ...endpointOption,
         agent: Promise.resolve(agent),  // Must be a Promise
         agent_id: this.options.agent_id
       };
     }
     
     const { client } = await initializeLLMClient({...});
     return client.sendMessage(message.text, {...});
   }
   ```

### Phase 2: Error Handling & Recovery

1. **Agent-Specific Errors**
   - Handle missing agent_id
   - Handle failed agent loading
   - Ensure agent promise is properly wrapped
   - Validate agent configuration

2. **Endpoint Type Errors**
   - Handle missing endpointType
   - Validate endpoint configuration
   - Provide meaningful error messages

### Phase 3: Testing Strategy

1. **Agent Integration Tests**
   ```javascript
   describe('Agent Integration', () => {
     test('processes message with agent', async () => {
       const conversation = {
         endpoint: 'agents',
         endpointType: 'openAI',
         agent_id: 'test-agent-id'
       };
       const message = { role: 'external', content: 'Test message' };
       const response = await processMessage(conversation, message);
       expect(response.agent).toBeDefined();
     });
   });
   ```

2. **Endpoint Type Tests**
   ```javascript
   describe('Endpoint Type Handling', () => {
     test('uses endpointType for client initialization', async () => {
       const conversation = {
         endpoint: 'openAI',
         endpointType: 'assistants'
       };
       const message = { role: 'external', content: 'Test message' };
       const response = await processMessage(conversation, message);
       expect(response.endpointType).toBe('assistants');
     });
   });
   ```

## Next Steps

1. **Immediate Fixes**
   - Fix agent promise handling in ExternalClient
   - Ensure proper endpoint type propagation
   - Add comprehensive error handling

2. **Testing**
   - Test agent integration
   - Test endpoint type handling
   - Test error scenarios

3. **Documentation**
   - Update API documentation
   - Document agent requirements
   - Document endpoint type handling

## Security Considerations

1. **Agent Access Control**
   - Validate agent permissions
   - Ensure agent_id is properly scoped
   - Implement agent access logging

2. **Endpoint Type Security**
   - Validate endpoint type permissions
   - Ensure proper endpoint type mapping
   - Log endpoint type changes

## Notes

- Agent promise handling is critical for proper integration
- Endpoint type management is essential for correct client initialization
- Comprehensive error handling needed for both agent and endpoint type issues
- Regular testing required for agent integration
- Monitor agent performance and errors

## Testing Strategy

### 1. Unit Tests
```