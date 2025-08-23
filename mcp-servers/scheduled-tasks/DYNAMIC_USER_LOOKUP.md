# Dynamic User Lookup for Scheduled Tasks

## Overview

The Scheduled Tasks MCP Server now includes **dynamic user lookup** functionality that automatically finds the user ID for the agent "sizzek" (or any configured agent) from the LibreChat MongoDB database. This eliminates the need for a hardcoded `LIBRECHAT_CONVERSATION_ID` environment variable.

## Problem Solved

**Before**: The system required a hardcoded conversation ID in the environment:
```bash
LIBRECHAT_CONVERSATION_ID=f89f1702-bf86-4bb0-9ac7-3328414bd112
```

This was problematic because:
- It tied the system to a specific conversation
- It required manual lookup and configuration
- It broke when conversations were deleted or changed
- It didn't scale for multiple agents or users

**After**: The system dynamically looks up the user ID for the agent from MongoDB:
```bash
LIBRECHAT_AGENT_NAME=sizzek
```

This provides:
- ✅ Automatic user ID resolution
- ✅ No hardcoded conversation dependencies  
- ✅ Scalable for multiple agents
- ✅ Robust against conversation changes

## How It Works

### 1. User Lookup Service

The new `UserLookupService` connects to the LibreChat MongoDB database and uses multiple strategies to find the user ID for an agent:

**Strategy 1**: Look for user with matching agent name in metadata
```javascript
{ 'metadata.agentName': 'sizzek' }
```

**Strategy 2**: Look for user with matching name/username
```javascript
{ $or: [{ name: 'sizzek' }, { username: 'sizzek' }] }
```

**Strategy 3**: Look for user with phone number matching the agent pattern
```javascript
{ phoneNumber: { $regex: 'sizzek', $options: 'i' } }
```

**Strategy 4**: Look for user with "sizzek" in the email
```javascript
{ email: { $regex: 'sizzek', $options: 'i' } }
```

### 2. LibreChat Client Integration

The `LibreChatClient` has been updated to:
- Use the `UserLookupService` to dynamically resolve user IDs
- Cache the user ID for performance
- Fall back to hardcoded conversation ID if user lookup fails
- Support both external message API and conversation API endpoints

### 3. Automatic Initialization

The system automatically:
- Initializes the user lookup service if MongoDB connection is available
- Connects to the LibreChat database using the same connection string
- Handles connection errors gracefully
- Cleans up connections on shutdown

## Configuration

### Required Environment Variables

```bash
# LibreChat Integration
LIBRECHAT_ENDPOINT=http://localhost:3080
LIBRECHAT_API_KEY=your-librechat-api-key

# Agent Configuration (NEW - Required for dynamic lookup)
LIBRECHAT_AGENT_NAME=sizzek
LIBRECHAT_AGENT_ID=default  
LIBRECHAT_AGENT_MODEL=gpt-4o

# MongoDB Connection (Required for user lookup)
MONGO_URI=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
```

### Optional Environment Variables

```bash
# MongoDB Configuration
MCP_MONGODB_TIMEOUT=10000
MCP_MONGODB_RETRIES=3

# Fallback (deprecated but still supported)
LIBRECHAT_CONVERSATION_ID=your-conversation-id
```

### LibreChat YAML Configuration

```yaml
mcpServers:
  scheduled-tasks:
    command: "node"
    args: ["/path/to/scheduled-tasks/dist/index.js"]
    env:
      LIBRECHAT_ENDPOINT: "http://localhost:3080"
      LIBRECHAT_API_KEY: "your-api-key-here"
      LIBRECHAT_AGENT_NAME: "sizzek"
      LIBRECHAT_AGENT_ID: "default"
      LIBRECHAT_AGENT_MODEL: "gpt-4o"
      MONGO_URI: "mongodb://localhost:27017/LibreChat"
      MONGODB_DATABASE: "LibreChat"
      MCP_STORAGE_TYPE: "mongodb"
      MCP_USER_BASED: "true"
```

## Message Flow

### 1. Task Execution Trigger

When a scheduled task executes:

1. **User ID Lookup**: The system queries MongoDB to find the user ID for "sizzek"
2. **Caching**: The user ID is cached for subsequent use
3. **Message Preparation**: The task message is formatted with context
4. **API Selection**: The system chooses between external message API or conversation API
5. **Message Delivery**: The message is sent to LibreChat

### 2. API Endpoints

**External Message API** (preferred when user ID is available):
```
POST /api/external-message
{
  "role": "external",
  "content": "[Scheduled Task: Task Name]: Description\n\nMessage",
  "from": "scheduled-task",
  "userId": "673c7c9a885e42080d8f7a9b",
  "metadata": { ... }
}
```

**Conversation API** (fallback when conversation ID is available):
```
POST /api/messages/{conversationId}
{
  "role": "external", 
  "content": "[Scheduled Task: Task Name]: Description\n\nMessage",
  "from": "scheduled-task",
  "conversationId": "f89f1702-bf86-4bb0-9ac7-3328414bd112",
  "metadata": { ... }
}
```

## Error Handling

### Graceful Degradation

The system is designed to be robust:

1. **User Lookup Failure**: Falls back to hardcoded conversation ID if available
2. **MongoDB Connection Error**: Warns but doesn't prevent server startup
3. **Cache Invalidation**: Can refresh user ID cache if needed
4. **Retry Logic**: Built-in retry mechanism for database queries

### Logging

The system provides comprehensive logging:

```
🔍 Looking up user ID for agent: sizzek
✅ Found user by name/username: 673c7c9a885e42080d8f7a9b
✅ Cached user ID for agent sizzek: 673c7c9a885e42080d8f7a9b
📤 Sending scheduled task trigger to LibreChat: ...
```

### Error Messages

Common error scenarios and solutions:

**No user found for agent**:
```
⚠️  No user found for agent name: sizzek
```
*Solution*: Ensure the agent user exists in LibreChat database

**MongoDB connection failed**:
```
❌ Failed to connect to MongoDB for user lookup
```
*Solution*: Check MongoDB connection string and ensure database is accessible

**Unable to determine user ID**:
```
Unable to determine user ID for scheduled task. Please check agent configuration.
```
*Solution*: Verify agent configuration and user lookup setup

## Migration Guide

### From Hardcoded Conversation ID

If you're currently using a hardcoded conversation ID:

1. **Keep existing configuration** (system will still work as fallback)
2. **Add new environment variables**:
   ```bash
   LIBRECHAT_AGENT_NAME=sizzek
   MONGO_URI=mongodb://localhost:27017/LibreChat
   MONGODB_DATABASE=LibreChat
   ```
3. **Test the new system**: Monitor logs to ensure user lookup is working
4. **Remove hardcoded conversation ID** once confident in the new system

### Testing User Lookup

To verify the user lookup is working:

1. **Check logs** during task execution for user lookup messages
2. **Create a test task**: 
   ```
   "Remind me in 1 minute to test the user lookup system"
   ```
3. **Monitor LibreChat**: Ensure the message appears in the agent's conversation

## Architecture

### Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   TaskManager   │────│ LibreChatClient  │────│UserLookupService│
│                 │    │                  │    │                 │
│ - Creates tasks │    │ - Sends messages │    │ - Queries MongoDB│
│ - Schedules     │    │ - Caches user ID │    │ - Finds user ID │
│ - Executes      │    │ - Handles errors │    │ - Retry logic   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Task Storage   │    │  LibreChat API   │    │ LibreChat DB    │
│   (MongoDB)     │    │   (HTTP/REST)    │    │   (MongoDB)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Sequence Diagram

```
TaskManager -> UserLookupService: lookupUserIdByAgentName("sizzek")
UserLookupService -> MongoDB: find({ name: "sizzek" })
MongoDB -> UserLookupService: { _id: "673c7c9a885e42080d8f7a9b" }
UserLookupService -> TaskManager: "673c7c9a885e42080d8f7a9b"
TaskManager -> LibreChatClient: triggerTask(task)
LibreChatClient -> LibreChat API: POST /api/external-message
LibreChat API -> LibreChatClient: 200 OK
```

## Benefits

### Technical Benefits

- **Decoupling**: No tight coupling to specific conversation IDs
- **Scalability**: Can support multiple agents and users
- **Reliability**: Robust error handling and fallback mechanisms
- **Maintainability**: Easier to manage and configure

### Operational Benefits

- **Setup Simplification**: No manual conversation ID lookup required
- **Dynamic Resolution**: Automatically adapts to user changes
- **Better Logging**: Clear visibility into user lookup process
- **Future-Proof**: Ready for multi-agent scenarios

## Future Enhancements

### Planned Features

- **Multi-Agent Support**: Support for multiple agents with different user mappings
- **User Group Support**: Support for sending messages to user groups
- **Advanced Caching**: Redis-based caching for distributed deployments
- **Webhook Integration**: Real-time user updates via webhooks

### Configuration Extensions

```bash
# Future: Multi-agent configuration
LIBRECHAT_AGENT_MAPPINGS='{"sizzek":"673c7c9a885e42080d8f7a9b","admin":"674d8e1f22ab4e123456789"}'

# Future: User group support  
LIBRECHAT_USER_GROUPS='{"devs":["user1","user2"],"admins":["admin1"]}'
```

## Troubleshooting

### Common Issues

1. **User lookup returns null**
   - Check agent name configuration
   - Verify user exists in LibreChat database
   - Check MongoDB connection

2. **MongoDB connection timeout**
   - Verify MongoDB is running and accessible
   - Check connection string format
   - Increase timeout value

3. **Messages not appearing in LibreChat**
   - Verify API key is correct
   - Check LibreChat endpoint URL
   - Monitor LibreChat logs for errors

### Debug Mode

Enable debug logging for troubleshooting:

```bash
MCP_DEBUG=true
LOG_LEVEL=debug
```

This will provide detailed logs of the user lookup process and message sending. 