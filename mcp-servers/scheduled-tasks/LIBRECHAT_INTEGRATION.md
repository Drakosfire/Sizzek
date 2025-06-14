# LibreChat Integration Guide

This scheduled tasks MCP server can now trigger LibreChat agents when tasks execute, following the same pattern as the Twilio SMS server.

## Setup

1. **Create Environment File**
   ```bash
   cp .env.example .env
   ```

2. **Configure LibreChat Connection**
   Edit your `.env` file:
   ```bash
   # LibreChat endpoint (adjust port if needed)
   LIBRECHAT_ENDPOINT=http://localhost:3080
   
   # Your LibreChat API key for external messages
   LIBRECHAT_API_KEY=your-api-key-here
   
   # Optional: specific conversation ID to send messages to
   LIBRECHAT_CONVERSATION_ID=your-conversation-id
   ```

3. **Get Your API Key**
   - In LibreChat, go to your settings
   - Generate an API key for external message access
   - Copy it to your `.env` file

## How It Works

When a scheduled task executes, it will:

1. **Send HTTP Request** to LibreChat's `/api/external-message` endpoint
2. **Include Task Data** in the message metadata:
   - Task ID and name
   - Schedule configuration
   - Execution timestamp
3. **Trigger Agent** to respond to the scheduled message
4. **Handle Errors** with automatic retries for network issues

## Example Usage

```javascript
// Create a task that will remind the agent to check metrics
await server.createScheduledTask({
  name: "Daily Metrics Check",
  schedule: { type: "daily", time: "09:00" },
  message: "Please check and report on yesterday's key metrics",
  description: "Automated daily metrics review"
});
```

## Fallback Behavior

If no `LIBRECHAT_API_KEY` is configured, tasks will still execute but only log messages to the console instead of triggering LibreChat.

## Configuration Options

- `HTTP_TIMEOUT`: Request timeout in milliseconds (default: 30000)
- `RETRY_ATTEMPTS`: Number of retry attempts for failed requests (default: 3)
- `RETRY_DELAY`: Base delay between retries in milliseconds (default: 1000)

## Error Handling

The system automatically retries:
- Network connection errors
- HTTP 5xx server errors
- Request timeouts

Non-retryable errors (like 4xx client errors) will fail immediately. 