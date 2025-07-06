# Scheduled Tasks MCP Server

A Model Context Protocol (MCP) server that provides scheduled task management capabilities with LibreChat integration and dynamic user lookup.

## Features

- ✅ **Multiple Schedule Types**: Once, scheduled, daily, weekly, monthly, and interval tasks
- ✅ **LibreChat Integration**: Automatically triggers LibreChat agents when tasks execute
- ✅ **Dynamic User Lookup**: Automatically finds the correct user by agent name - no hardcoded IDs needed
- ✅ **Flexible Conversation Management**: Automatically discovers existing conversations or creates new ones
- ✅ **Persistent Storage**: MongoDB with user-based isolation
- ✅ **Web UI**: Built-in web interface for task management
- ✅ **Robust Error Handling**: Comprehensive retry logic and error reporting

## Quick Start

### 1. Environment Setup

```bash
# Copy the environment template
cp env.example .env

# Edit your configuration
nano .env
```

### 2. Essential Configuration

```bash
# LibreChat Integration
LIBRECHAT_ENDPOINT=http://localhost:3080
LIBRECHAT_API_KEY=your-librechat-api-key-here

# Agent Configuration (Required for dynamic user lookup)
LIBRECHAT_AGENT_NAME=sizzek
LIBRECHAT_AGENT_ID=default
LIBRECHAT_AGENT_MODEL=gpt-4o

# MongoDB Connection (Required for user lookup)
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
```

### 3. How It Works

When a scheduled task executes:

1. **Dynamic User Discovery**: The system queries MongoDB to find the user ID for your agent name
2. **Smart Conversation Handling**: Automatically searches for existing conversations or creates new ones
3. **Agent Triggering**: Routes the message through LibreChat's SMS conversation endpoint
4. **Flexible Routing**: The External Client handles all conversation management automatically

No hardcoded conversation IDs needed - the system is fully dynamic and adaptive!

## Configuration Options

### Core Settings

| Variable | Required | Description |
|----------|----------|-------------|
| `LIBRECHAT_ENDPOINT` | Yes | LibreChat server URL |
| `LIBRECHAT_API_KEY` | Yes | API key for LibreChat |
| `LIBRECHAT_AGENT_NAME` | Yes | Agent name for user lookup |
| `LIBRECHAT_AGENT_ID` | Yes | Agent ID for routing |
| `MONGODB_CONNECTION_STRING` | Yes | MongoDB connection string |

### Optional Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_TIMEOUT` | 30000 | Request timeout in milliseconds |
| `RETRY_ATTEMPTS` | 3 | Number of retry attempts |
| `RETRY_DELAY` | 1000 | Base delay between retries |
| `MCP_MONGODB_TIMEOUT` | 10000 | MongoDB connection timeout |
| `MCP_MONGODB_RETRIES` | 3 | MongoDB retry attempts |

### Legacy Configuration (Deprecated)

The old hardcoded conversation ID approach is deprecated but still supported:

```bash
# Legacy - use dynamic discovery instead
LIBRECHAT_CONVERSATION_ID=your-hardcoded-conversation-id
```

## Usage Examples

### Create a Daily Reminder

```javascript
// Create a daily reminder at 9 AM
await server.createDailyTask({
  name: "Daily Standup Reminder",
  time: "09:00",
  message: "Time for the daily standup! Please share your updates.",
  description: "Automated daily standup reminder"
});
```

### Create a One-Time Task

```javascript
// Create a task that runs once after 30 minutes
await server.createOnceTask({
  name: "Follow-up Reminder",
  delayMinutes: 30,
  message: "Don't forget to follow up on that important email!",
  description: "Follow-up reminder"
});
```

### Create a Weekly Report

```javascript
// Create a weekly report every Friday at 5 PM
await server.createWeeklyTask({
  name: "Weekly Report",
  dayOfWeek: 5, // Friday
  time: "17:00",
  message: "Please prepare and share your weekly report.",
  description: "Weekly report generation"
});
```

## Architecture

### Dynamic User Lookup

The system uses MongoDB to dynamically find users by agent name:

1. **Agent Name Resolution**: Looks up user by agent name in metadata
2. **Fallback Strategies**: Falls back to name/username matching
3. **Phone Number Matching**: Supports SMS-based agent patterns
4. **Caching**: Caches user IDs for performance

### Conversation Management

The External Client handles all conversation logic:

1. **Conversation Discovery**: Searches for existing conversations by user and metadata
2. **Smart Creation**: Creates new conversations when none exist
3. **Metadata Preservation**: Maintains conversation context and source information
4. **Agent Routing**: Properly routes to agent endpoints with correct parameters

### Message Flow

```
Scheduled Task → User Lookup → SMS Conversation Route → External Client → Agent Processing
```

## Web UI

Access the web interface at `http://localhost:3000` (when running locally) to:

- View all scheduled tasks
- Create new tasks with a friendly interface
- Edit existing tasks
- Monitor task execution status
- View task execution history

## Error Handling

The system includes comprehensive error handling:

- **User Lookup Failures**: Graceful fallbacks and detailed error messages
- **Network Issues**: Automatic retries with exponential backoff
- **MongoDB Errors**: Connection retry logic and timeout handling
- **Agent Routing**: Proper error propagation and debugging information

## Migration from Hardcoded IDs

If you're migrating from hardcoded conversation IDs:

1. Set up the required MongoDB connection
2. Configure your agent name
3. Remove the old `LIBRECHAT_CONVERSATION_ID` setting
4. The system will automatically discover your conversations

## Troubleshooting

### Common Issues

1. **No user found for agent name**
   - Verify your agent name matches a user in LibreChat
   - Check MongoDB connection
   - Ensure user exists in the database

2. **Messages not appearing**
   - Verify LibreChat API key is correct
   - Check endpoint URL
   - Monitor LibreChat logs for errors

3. **MongoDB connection issues**
   - Verify connection string format
   - Check MongoDB is running
   - Ensure database exists

### Debug Mode

Enable debug logging:

```bash
MCP_DEBUG=true
LOG_LEVEL=debug
```

This provides detailed information about user lookup, conversation discovery, and message routing.

## License

MIT License - see LICENSE file for details.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- LibreChat instance with API access
- TypeScript knowledge (for development)

### Installation

```bash
# Clone or download the server
cd scheduled-tasks

# Install dependencies
npm install

# Build the server
npm run build

# Configure environment (see Configuration section)
cp .env.example .env
# Edit .env with your LibreChat details

# Start the server
npm start
```

### LibreChat Integration

Add to your LibreChat `librechat.yaml`:

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
      LIBRECHAT_AGENT_MODEL: "gpt-4.1"
      MONGODB_CONNECTION_STRING: "mongodb://localhost:27017/LibreChat"
      MONGODB_DATABASE: "LibreChat"
```

## 💬 Usage Examples

### One-Time Tasks (Most Common)

```
User: "Remind me in 5 minutes to check the oven"
Agent: Creates task with { type: "once", delayMinutes: 5 }

User: "Send me a confirmation message in 30 seconds"  
Agent: Creates task with { type: "once", delayMinutes: 0.5 }

User: "Schedule a follow-up message for 2 hours from now"
Agent: Creates task with { type: "once", delayMinutes: 120 }
```

### Repeating Tasks

```
User: "Send me a reminder every 15 minutes to drink water"
Agent: Creates task with { type: "interval", every: 15, unit: "minutes" }

User: "Remind me every morning at 8am to take vitamins"
Agent: Creates task with { type: "daily", time: "08:00" }

User: "Send me a weekly report every Monday at 9am"
Agent: Creates task with { type: "weekly", dayOfWeek: "monday", time: "09:00" }
```

## 🛠️ Configuration

### Environment Variables

Create a `.env` file:

```bash
# LibreChat Integration (Required)
LIBRECHAT_ENDPOINT=http://localhost:3080
LIBRECHAT_API_KEY=your-api-key-here

# Agent Configuration (Required for dynamic user lookup)
LIBRECHAT_AGENT_NAME=sizzek
LIBRECHAT_AGENT_ID=default
LIBRECHAT_AGENT_MODEL=gpt-4.1

# MongoDB Connection (Required for user lookup)
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat

# Optional Configuration
HTTP_TIMEOUT=30000
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
DATA_DIR=./data
LOG_LEVEL=info
```

### Getting LibreChat API Key

1. Log into your LibreChat instance
2. Go to Settings → API Keys
3. Generate a new API key
4. Copy the key to your `.env` file

## 📋 Available Tools

The MCP server provides these tools to AI agents:

### `create_scheduled_task`
Create a new scheduled task.

**Parameters:**
- `name` (string): Descriptive name for the task
- `description` (string, optional): What the task does
- `schedule` (object): When to run the task
- `message` (string): Message to send when task triggers
- `enabled` (boolean, optional): Whether task is active (default: true)

### `list_scheduled_tasks`
List all scheduled tasks with their status.

### `get_scheduled_task`
Get details of a specific task by ID.

### `enable_scheduled_task` / `