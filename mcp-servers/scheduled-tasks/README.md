# Scheduled Tasks MCP Server

A TypeScript MCP (Model Context Protocol) server that enables AI agents to create, manage, and execute scheduled tasks through conversational interaction. Perfect for scheduling reminders, periodic notifications, and automated actions via LibreChat.

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
      LIBRECHAT_CONVERSATION_ID: "optional-default-conversation-id"
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

# Optional Configuration
LIBRECHAT_CONVERSATION_ID=default-conversation-id
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

### `enable_scheduled_task` / `disable_scheduled_task`
Enable or disable a task without deleting it.

### `delete_scheduled_task`
Permanently delete a task.

## 📅 Schedule Types

### One-Time Tasks (`type: "once"`)
Execute once after a delay from current server time.

```json
{
  "type": "once",
  "delayMinutes": 1.5
}
```

- `delayMinutes`: Number (minimum 0.1 = 6 seconds)
- Supports decimals: 0.5 = 30 seconds, 1.5 = 90 seconds

### Interval Tasks (`type: "interval"`)
Repeat every X minutes/hours/days.

```json
{
  "type": "interval", 
  "every": 15,
  "unit": "minutes",
  "startTime": "09:00"
}
```

- `every`: Positive integer
- `unit`: "minutes", "hours", or "days"  
- `startTime`: Optional HH:MM format

### Daily Tasks (`type: "daily"`)
Run every day at a specific time.

```json
{
  "type": "daily",
  "time": "08:00",
  "weekdaysOnly": true
}
```

- `time`: HH:MM format (24-hour)
- `weekdaysOnly`: Optional, runs Monday-Friday only

### Weekly Tasks (`type: "weekly"`)
Run on a specific day and time each week.

```json
{
  "type": "weekly",
  "dayOfWeek": "monday", 
  "time": "09:00"
}
```

- `dayOfWeek`: "monday", "tuesday", etc.
- `time`: HH:MM format (24-hour)

### Monthly Tasks (`type: "monthly"`)
Run on a specific day of the month.

```json
{
  "type": "monthly",
  "dayOfMonth": 15,
  "time": "10:00"  
}
```

- `dayOfMonth`: 1-31
- `time`: HH:MM format (24-hour)

## 🔧 Development

### Project Structure

```
src/
├── index.ts                 # MCP server entry point
├── types/
│   └── index.ts            # TypeScript interfaces
├── core/
│   ├── task-manager.ts     # Task scheduling engine
│   ├── task-store.ts       # Data persistence
│   └── schedule-validator.ts # Schedule validation
└── http/
    └── librechat-client.ts # LibreChat API client
```

### Building

```bash
# Development build with watch
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🐛 Troubleshooting

### Common Issues

#### "Cannot find module" errors
**Cause**: Missing ES module configuration
**Solution**: Ensure `package.json` has `"type": "module"` and all local imports use `.js` extensions

#### "API key required" errors  
**Cause**: Wrong authentication headers
**Solution**: Verify `LIBRECHAT_API_KEY` is set and valid

#### "Unknown schedule type" errors
**Cause**: Agent using wrong schedule format
**Solution**: Check the tool schema examples - use `"once"` for one-time tasks

#### Tasks not executing
**Cause**: LibreChat endpoint unreachable
**Solution**: Verify `LIBRECHAT_ENDPOINT` and network connectivity

### Debug Mode

Enable detailed logging:

```bash
LOG_LEVEL=debug npm start
```

### Log Files

Logs are written to:
- Console (always)
- `./logs/scheduled-tasks.log` (if LOG_LEVEL=debug)

## 📊 Monitoring

### Health Check

The server provides basic health monitoring:

```bash
# Check if server is responding
curl http://localhost:3000/health
```

### Task Status

Monitor task execution through the logs or by listing tasks:

```
Agent: "Show me all my scheduled tasks"
# Returns list with status, next execution time, etc.
```

## 🔒 Security

### Rate Limiting
- Maximum 1000 tasks per instance
- Maximum 50 concurrent executions
- 30-second timeout per task execution

### Input Validation
- Schedule parameters validated for safety
- Message content sanitized
- Resource usage monitored

### API Security
- API keys required for LibreChat integration
- No external network access except to configured LibreChat endpoint

## 🚀 Production Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  scheduled-tasks:
    build: .
    environment:
      - LIBRECHAT_ENDPOINT=${LIBRECHAT_ENDPOINT}
      - LIBRECHAT_API_KEY=${LIBRECHAT_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### Performance Tuning

For high-volume usage:
- Increase `HTTP_TIMEOUT` for slow LibreChat responses
- Adjust `RETRY_ATTEMPTS` based on network reliability
- Monitor memory usage and task limits

## 📚 Advanced Usage

### Task Templates

Common patterns for quick setup:

```javascript
// Morning routine
{
  name: "Morning Vitamins",
  schedule: { type: "daily", time: "08:00" },
  message: "Time to take your vitamins! 💊"
}

// Work break reminders  
{
  name: "Break Reminder",
  schedule: { type: "interval", every: 25, unit: "minutes" },
  message: "Take a 5-minute break! 🧘‍♀️"
}

// Weekly planning
{
  name: "Weekly Review", 
  schedule: { type: "weekly", dayOfWeek: "sunday", time: "18:00" },
  message: "Time for your weekly planning session 📋"
}
```

### Integration with Other MCP Servers

Combine with other MCP servers for powerful workflows:

```
User: "Every morning at 8am, send me the weather and remind me to check my calendar"
# Creates scheduled task that triggers agent
# Agent uses weather MCP + calendar MCP to fulfill request
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Maintain ES module compatibility
- Add comprehensive tests
- Update documentation
- Use semantic commit messages

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: GitHub Issues for bugs and feature requests
- **Documentation**: See `SCHEDULED_TASKS_MCP_DESIGN_PLAN.md` for architecture details
- **Implementation**: See `SCHEDULED_TASKS__MCP_IMPLEMENTATION_PLAN.md` for development guide

## 🎯 Roadmap

### Planned Features
- [ ] Web dashboard for task management
- [ ] Task templates and presets  
- [ ] Conditional task execution
- [ ] Multiple LibreChat agent support
- [ ] Advanced timezone handling
- [ ] Database backend option
- [ ] Prometheus metrics integration

### Version History
- **v1.0.0**: Initial release with core scheduling functionality
- **v1.1.0**: Simplified datetime handling and improved LibreChat integration
- **v1.2.0**: Enhanced tool schema clarity and validation improvements

---

**Made with ❤️ for the LibreChat community** 