# MCP Cron Server - Comprehensive Investigation Report

## Table of Contents
1. [Project Overview](#project-overview)
2. [What is Cron?](#what-is-cron)
3. [What is MCP (Model Context Protocol)?](#what-is-mcp-model-context-protocol)
4. [Project Architecture](#project-architecture)
5. [File Structure Analysis](#file-structure-analysis)
6. [Core Components Deep Dive](#core-components-deep-dive)
7. [Dependencies Analysis](#dependencies-analysis)
8. [Installation and Setup](#installation-and-setup)
9. [API and Tools Reference](#api-and-tools-reference)
10. [Code Examples](#code-examples)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Recommendations](#recommendations)

---

## Project Overview

**MCP Cron** is a Model Context Protocol (MCP) server that provides task scheduling capabilities through a standardized API. It's written in Go and allows AI assistants and other MCP clients to schedule and manage both shell commands and AI-powered tasks using cron expressions.

### Key Features:
- Schedule shell commands using cron expressions
- Schedule AI tasks with prompts that can access other MCP servers
- Manage tasks via MCP protocol (add, remove, enable, disable, list)
- Support for two transport modes: HTTP SSE and stdio
- Task execution with output capture and status tracking
- Integration with OpenAI GPT models for AI tasks

### Project Stats:
- **Language**: Go 1.23.0+
- **License**: AGPL-3.0
- **Main Dependencies**: go-mcp, robfig/cron, openai-go
- **Total Files**: ~25 Go source files + tests
- **Architecture**: Modular, clean separation of concerns

---

## What is Cron?

**Cron** is a time-based job scheduler in Unix-like operating systems. The name comes from "chronos" (Greek for time). Cron allows users to schedule tasks (called "cron jobs") to run automatically at specified times, dates, or intervals.

### Cron Expression Format
This project uses an extended cron format that includes seconds:

```
┌───────────── second (0-59) [Optional]
│ ┌───────────── minute (0-59)
│ │ ┌───────────── hour (0-23)
│ │ │ ┌───────────── day of month (1-31)
│ │ │ │ ┌───────────── month (1-12)
│ │ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │ │
* * * * * *
```

### Common Examples:
- `0 */5 * * * *` - Every 5 minutes (at 0 seconds)
- `0 0 * * * *` - Every hour at the top of the hour
- `0 0 0 * * *` - Every day at midnight
- `0 0 12 * * MON-FRI` - Every weekday at noon
- `30 14 * * * FRI` - Every Friday at 2:30 PM

---

## What is MCP (Model Context Protocol)?

**Model Context Protocol (MCP)** is a standardized protocol that allows AI assistants to securely connect to and interact with external data sources and tools. It was developed to enable AI systems to access information and perform actions beyond their training data.

### Key MCP Concepts:

#### 1. **Servers and Clients**
- **MCP Servers**: Provide tools, resources, and functionality (like this cron server)
- **MCP Clients**: AI assistants that connect to servers (like Claude, Cursor IDE)

#### 2. **Transport Modes**
- **stdio**: Standard input/output for direct process communication
- **SSE (Server-Sent Events)**: HTTP-based transport for web clients

#### 3. **Tools**
- Functions that clients can call to perform actions
- Each tool has a schema defining its parameters and behavior
- Tools return structured responses

#### 4. **Resources**
- Data sources that can be read by clients
- Examples: files, databases, APIs

### Why MCP Matters:
- **Standardization**: Common protocol for AI tool integration
- **Security**: Controlled access to external resources
- **Extensibility**: Easy to add new capabilities
- **Interoperability**: Works across different AI platforms

---

## Project Architecture

The MCP Cron server follows a clean, modular architecture:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Client    │    │   MCP Server     │    │   Scheduler     │
│  (Claude/Cursor)│◄──►│   (HTTP/stdio)   │◄──►│   (Cron Jobs)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                       ┌──────────────┐        ┌─────────────────┐
                       │   Executors  │        │   Task Storage  │
                       │              │        │   (In-Memory)   │
                       │ • Command    │        └─────────────────┘
                       │ • AI Agent   │
                       └──────────────┘
```

### Data Flow:
1. **Client Request**: AI client sends MCP tool call (e.g., "add_task")
2. **Server Processing**: MCP server validates and processes the request
3. **Task Management**: Scheduler adds/updates/removes tasks
4. **Task Execution**: When cron triggers, appropriate executor runs the task
5. **Result Capture**: Execution results are captured and stored
6. **Response**: Client receives confirmation and task details

---

## File Structure Analysis

```
mcp-cron/
├── cmd/
│   └── mcp-cron/
│       └── main.go              # Application entry point (212 lines)
├── internal/
│   ├── agent/                   # AI task execution
│   │   ├── agent_executor.go    # Core AI execution logic
│   │   ├── mcp_tools_loader.go  # MCP configuration loader
│   │   └── run_task.go          # Task runner implementation
│   ├── command/                 # Shell command execution
│   │   └── executor.go          # Command execution logic
│   ├── config/                  # Configuration management
│   │   └── config.go            # Config structures and env loading
│   ├── errors/                  # Error handling
│   │   └── (error definitions)
│   ├── logging/                 # Logging utilities
│   │   └── (logging setup)
│   ├── model/                   # Data models
│   │   └── task.go              # Task and Result structures
│   ├── scheduler/               # Task scheduling
│   │   └── scheduler.go         # Cron scheduling logic
│   ├── server/                  # MCP server implementation
│   │   ├── server.go            # Main server logic
│   │   ├── handlers.go          # Request handlers
│   │   └── tools.go             # Tool definitions
│   └── utils/                   # Utility functions
├── go.mod                       # Go module definition
├── go.sum                       # Dependency checksums
├── README.md                    # Project documentation
└── LICENSE                      # AGPL-3.0 license
```

---

## Core Components Deep Dive

### 1. Main Application (`cmd/mcp-cron/main.go`)

**Purpose**: Application entry point and initialization

**Key Functions**:
- Command-line argument parsing
- Configuration loading from environment and flags
- Component initialization (scheduler, executors, server)
- Graceful shutdown handling

**Configuration Priority**:
1. Default values
2. Environment variables
3. Command-line flags

### 2. Configuration System (`internal/config/`)

**Structure**:
```go
type Config struct {
    Server    ServerConfig    // Address, port, transport mode
    Scheduler SchedulerConfig // Default timeout
    Logging   LoggingConfig   // Level, file path
    AI        AIConfig        // OpenAI key, model, iterations
}
```

**Environment Variables**:
- `MCP_CRON_SERVER_ADDRESS` - Server bind address
- `MCP_CRON_SERVER_PORT` - Server port
- `MCP_CRON_SERVER_TRANSPORT` - Transport mode (sse/stdio)
- `OPENAI_API_KEY` - OpenAI API key for AI tasks
- `MCP_CRON_AI_MODEL` - AI model (default: gpt-4o)

### 3. Task Model (`internal/model/task.go`)

**Task Structure**:
```go
type Task struct {
    ID          string     `json:"id"`
    Name        string     `json:"name"`
    Description string     `json:"description"`
    Command     string     `json:"command,omitempty"`     // For shell tasks
    Prompt      string     `json:"prompt,omitempty"`      // For AI tasks
    Schedule    string     `json:"schedule"`              // Cron expression
    Enabled     bool       `json:"enabled"`
    Type        string     `json:"type"`                  // "shell_command" or "AI"
    LastRun     time.Time  `json:"lastRun,omitempty"`
    NextRun     time.Time  `json:"nextRun,omitempty"`
    Status      TaskStatus `json:"status"`                // pending, running, completed, failed, disabled
    CreatedAt   time.Time  `json:"createdAt,omitempty"`
    UpdatedAt   time.Time  `json:"updatedAt,omitempty"`
}
```

**Task Types**:
- `shell_command`: Executes shell commands
- `AI`: Executes AI prompts with optional MCP tool access

**Task Status Flow**:
```
pending → running → completed/failed
    ↓
disabled (can be re-enabled)
```

### 4. Scheduler (`internal/scheduler/scheduler.go`)

**Core Responsibilities**:
- Manages cron job scheduling using `robfig/cron/v3`
- Thread-safe task storage and management
- Task lifecycle management (add, remove, enable, disable)
- Automatic next run time calculation

**Key Methods**:
- `AddTask()`: Adds and schedules a new task
- `RemoveTask()`: Removes task from scheduler and storage
- `EnableTask()/DisableTask()`: Controls task execution
- `ListTasks()`: Returns all tasks
- `UpdateTask()`: Modifies existing task

**Thread Safety**: Uses `sync.RWMutex` for concurrent access

### 5. MCP Server (`internal/server/server.go`)

**Dual Transport Support**:
- **stdio**: For Claude Desktop integration
- **SSE**: For web-based clients and Cursor IDE

**Logging Strategy**:
- stdio mode: Logs to file to avoid JSON-RPC interference
- SSE mode: Logs to console

**Tool Registration**: Declarative tool definitions with automatic schema generation

### 6. Executors

#### Command Executor (`internal/command/executor.go`)
- Executes shell commands with timeout
- Captures stdout, stderr, and exit codes
- Cross-platform command execution

#### Agent Executor (`internal/agent/`)
- Integrates with OpenAI GPT models
- Loads MCP tool configurations
- Supports iterative tool use for complex tasks
- Configurable maximum iterations to prevent infinite loops

---

## Dependencies Analysis

### Core Dependencies (`go.mod`)

1. **github.com/ThinkInAIXYZ/go-mcp v0.1.14**
   - Purpose: Go SDK for Model Context Protocol
   - Provides: Server implementation, transport layers, protocol handling

2. **github.com/robfig/cron/v3 v3.0.1**
   - Purpose: Cron expression parsing and job scheduling
   - Features: Second-precision scheduling, multiple time zones support

3. **github.com/openai/openai-go v0.1.0-beta.10**
   - Purpose: OpenAI API integration for AI tasks
   - Provides: GPT model access, function calling, streaming support

### Indirect Dependencies:
- `github.com/google/uuid` - UUID generation for task IDs
- `github.com/orcaman/concurrent-map/v2` - Thread-safe maps
- `github.com/tidwall/gjson` - JSON parsing utilities

---

## Installation and Setup

### Prerequisites
You need to install Go first, as it's not currently installed on your system:

```bash
# Option 1: Install via snap (recommended - gets latest version)
sudo snap install go

# Option 2: Install via apt (older version)
sudo apt install golang-go

# Verify installation
go version
```

### Building the Project

```bash
# Clone and build
git clone https://github.com/jolks/mcp-cron.git
cd mcp-cron

# Build the binary
go build -o mcp-cron cmd/mcp-cron/main.go

# Verify build
./mcp-cron --version
```

### Configuration

#### For Cursor IDE (SSE Transport):
Create/edit `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-cron": {
      "url": "http://localhost:8080/sse"
    }
  }
}
```

#### For Claude Desktop (stdio Transport):
Create/edit config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-cron": {
      "command": "/path/to/mcp-cron",
      "args": ["--transport", "stdio"]
    }
  }
}
```

### Environment Setup for AI Features:
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
export MCP_CRON_AI_MODEL="gpt-4o"  # Optional, defaults to gpt-4o
```

---

## API and Tools Reference

The server exposes 8 MCP tools:

### 1. `list_tasks`
**Purpose**: List all scheduled tasks
**Parameters**: None
**Returns**: Array of task objects

### 2. `get_task`
**Purpose**: Get specific task by ID
**Parameters**:
- `id` (string): Task ID
**Returns**: Task object

### 3. `add_task`
**Purpose**: Add new shell command task
**Parameters**:
- `name` (string): Task name
- `schedule` (string): Cron expression
- `command` (string): Shell command to execute
- `description` (string, optional): Task description
- `enabled` (boolean, optional): Whether task is enabled

### 4. `add_ai_task`
**Purpose**: Add new AI task
**Parameters**:
- `name` (string): Task name
- `schedule` (string): Cron expression
- `prompt` (string): AI prompt to execute
- `description` (string, optional): Task description
- `enabled` (boolean, optional): Whether task is enabled

### 5. `update_task`
**Purpose**: Update existing task
**Parameters**:
- `id` (string): Task ID
- Other parameters optional (only provided fields are updated)

### 6. `remove_task`
**Purpose**: Remove task
**Parameters**:
- `id` (string): Task ID

### 7. `enable_task`
**Purpose**: Enable disabled task
**Parameters**:
- `id` (string): Task ID

### 8. `disable_task`
**Purpose**: Disable running task
**Parameters**:
- `id` (string): Task ID

---

## Code Examples

### 1. Shell Command Task
```json
{
  "tool": "add_task",
  "arguments": {
    "name": "System Backup",
    "schedule": "0 0 2 * * *",
    "command": "rsync -avz /home/user/documents/ /backup/documents/",
    "description": "Daily backup at 2 AM",
    "enabled": true
  }
}
```

### 2. AI Task
```json
{
  "tool": "add_ai_task",
  "arguments": {
    "name": "Daily Report",
    "schedule": "0 0 9 * * MON-FRI",
    "prompt": "Generate a daily summary of yesterday's activities and send it via email",
    "description": "Weekday morning reports",
    "enabled": true
  }
}
```

### 3. List All Tasks
```json
{
  "tool": "list_tasks",
  "arguments": {}
}
```

---

## Testing

The project includes comprehensive tests:

### Test Files:
- `internal/scheduler/scheduler_test.go` (571 lines)
- `internal/server/server_test.go` (489 lines)
- `internal/server/server_ai_test.go` (346 lines)
- `internal/config/config_test.go` (232 lines)

### Running Tests:
```bash
# Run all tests
go test ./...

# Run tests with coverage
go test ./... -cover

# Run specific package tests
go test ./internal/scheduler -v
```

### Test Coverage Areas:
- Configuration loading and validation
- Task CRUD operations
- Scheduler functionality
- MCP server request handling
- AI integration (with OpenAI API mocking)
- Error handling scenarios

---

## Deployment

### Local Development:
```bash
# Start with default settings (SSE on localhost:8080)
./mcp-cron

# Start with custom configuration
./mcp-cron --address 0.0.0.0 --port 9090 --log-level debug
```

### Production Considerations:

1. **Logging**: Configure file logging for production
2. **Security**: Restrict network access for stdio mode
3. **API Keys**: Secure OpenAI API key storage
4. **Resource Limits**: Configure appropriate task timeouts
5. **Monitoring**: Monitor task execution and failure rates

### Docker Deployment:
```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o mcp-cron cmd/mcp-cron/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/mcp-cron .
EXPOSE 8080
CMD ["./mcp-cron"]
```

---

## Recommendations

### For Getting Started:

1. **Install Go**: 
   ```bash
   sudo snap install go
   ```

2. **Set up Environment**:
   ```bash
   export OPENAI_API_KEY="your-key"
   export PATH=$PATH:$(go env GOPATH)/bin
   ```

3. **Build and Test**:
   ```bash
   go build -o mcp-cron cmd/mcp-cron/main.go
   ./mcp-cron --version
   ```

4. **Start Simple**:
   - Begin with shell command tasks
   - Test with simple cron expressions
   - Use SSE transport for easier debugging

### For Development:

1. **Code Organization**: The modular structure is excellent - maintain separation of concerns
2. **Error Handling**: Comprehensive error types and handling throughout
3. **Testing**: Good test coverage - maintain as you add features
4. **Documentation**: Keep README.md updated with new features

### For Production Use:

1. **Security**: 
   - Validate all shell commands to prevent injection
   - Secure API key storage
   - Limit network access for sensitive environments

2. **Monitoring**:
   - Add metrics collection for task success/failure rates
   - Monitor resource usage
   - Set up alerting for failed tasks

3. **Scalability**:
   - Consider database storage for large numbers of tasks
   - Implement task result history retention
   - Add clustering support for high availability

### Learning Path:

1. **Start with Cron**: Understand cron expressions and scheduling concepts
2. **Learn Go Basics**: Functions, structs, interfaces, goroutines
3. **Explore MCP**: Understand the protocol and tool concepts
4. **Practice**: Create simple tasks and gradually increase complexity
5. **Extend**: Add new task types or integrate with other services

---

## Conclusion

MCP Cron is a well-architected, production-ready task scheduler that bridges the gap between AI assistants and system automation. Its clean modular design, comprehensive testing, and dual transport support make it an excellent foundation for learning both Go development and MCP integration.

The project demonstrates modern Go practices including:
- Clean architecture with separated concerns
- Comprehensive configuration management
- Thread-safe concurrent operations
- Proper error handling and logging
- Extensive testing coverage

This investigation provides a complete foundation for understanding, using, and extending the MCP Cron server. 