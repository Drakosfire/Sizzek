# LibreChat Client Architecture and API Interactions

## Client Types and Their Uses

LibreChat employs different client classes for different types of operations:

1. **ChatGPTClient**
   - Primary client for regular model interactions
   - Used for standard chat completions
   - Handles streaming and non-streaming responses
   - Located in `api/app/clients/ChatGPTClient.js`

2. **OpenAIClient**
   - Used for chat history/thread title generation
   - Optimized for shorter, specific completions
   - Typically used with `gpt-3.5-turbo` model

3. **BaseClient**
   - Used by Agent functionality
   - Handles token counting and conversation management
   - Provides base functionality for other clients

## API Endpoint Configuration

### LlamaCpp Server Integration
- Regular endpoints must end with `/completions`
- Agent endpoints should NOT include `/completions`
- Example configurations:
  ```yaml
  # Regular endpoint
  endpoints:
    llamacpp:
      url: "http://host.docker.internal:8001/completions"

  # Agent endpoint
  endpoints:
    llamacpp_agent:
      url: "http://host.docker.internal:8001"
  ```

### Request Flow
1. Client selection based on operation type:
   - Regular chat → ChatGPTClient
   - Title generation → OpenAIClient
   - Agent operations → BaseClient

2. Each client maintains its own:
   - Token counting logic
   - Conversation state management
   - Stream handling

## Debugging Notes
- Token counting is tracked in BaseClient (`tokenCountMap`)
- Stream configuration is handled in request options
- API errors (404s, etc.) often indicate endpoint misconfiguration
- Each client type logs with its own prefix for easy identification:
  - `[ChatGPTClient]`
  - `[BaseClient]`
  - `[OpenAIClient]`

## Future Considerations
- Client selection logic could be centralized
- Endpoint configuration could be standardized across clients
- Error handling could be unified for better debugging 