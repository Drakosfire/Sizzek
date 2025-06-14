# Scheduled Tasks MCP Server - Design Plan

## Executive Summary

We're building a TypeScript MCP server that enables AI agents to create, manage, and execute scheduled tasks through conversational interaction. The primary use case is allowing an agent to schedule messages back to itself via LibreChat to trigger specific actions (like sending SMS messages).

**Core Value Proposition**: "Hey agent, schedule a text to my phone every morning at 8am" → Agent creates a cron task → Task triggers daily → Agent sends SMS

---

## Table of Contents

1. [First Principles: Why Cron Task Management is Hard](#first-principles-why-cron-task-management-is-hard)
2. [Core Challenges We Must Solve](#core-challenges-we-must-solve)
3. [System Architecture Design](#system-architecture-design)
4. [Task Lifecycle Management](#task-lifecycle-management)
5. [Data Model Design](#data-model-design)
6. [Cron Expression Handling](#cron-expression-handling)
7. [Persistence Strategy](#persistence-strategy)
8. [Concurrency and Thread Safety](#concurrency-and-thread-safety)
9. [Error Handling Philosophy](#error-handling-philosophy)
10. [MCP Protocol Integration](#mcp-protocol-integration)
11. [LibreChat Integration Architecture](#librechat-integration-architecture)
12. [Security Considerations](#security-considerations)
13. [Testing Strategy](#testing-strategy)
14. [Performance and Scalability](#performance-and-scalability)

---

## First Principles: Why We Simplified Away From Cron

### The Cron Complexity Problem
Traditional cron expressions like `0 8 * * 1-5` are powerful but create unnecessary complexity:
- Cryptic syntax that's hard for AI agents to generate correctly
- Edge cases with timezone handling and DST transitions
- Complex validation logic for impossible dates (Feb 31st, etc.)
- Over-engineering for 90% of real use cases

### Our Simplified Approach
Instead of cron expressions, we use human-friendly scheduling types:

```typescript
// Much clearer than "0 8 * * 1-5"
{
  type: 'daily',
  time: '08:00',
  weekdaysOnly: true
}

// Much clearer than "*/15 * * * *"
{
  type: 'interval', 
  every: 15,
  unit: 'minutes'
}
```

### Real Complexities We Still Handle:

#### 1. **Task State Management**
- Tasks exist in multiple states (scheduled, running, completed, failed)
- State transitions must be atomic and consistent
- Failed tasks need retry logic or manual intervention

#### 2. **Persistence and Data Integrity**
- In-memory: Fast but lost on restart
- File-based: Persistent but needs atomic writes
- Backup and recovery from corruption

#### 3. **Concurrency Control**
- Multiple tasks executing simultaneously
- Preventing overlapping executions of the same task
- Thread safety when modifying task collections

#### 4. **LibreChat Integration**
- HTTP client with proper authentication
- Retry logic with exponential backoff
- Error handling and status reporting

---

## Core Challenges We Must Solve

### Challenge 1: Task Identity and Uniqueness
**Problem**: How do we identify tasks across restarts and modifications?
**Solution**: UUID-based task IDs that persist across all operations
**Learning**: Simple incremental IDs break when tasks are deleted/recreated

### Challenge 2: Schedule Validation and Parsing
**Problem**: Users will input invalid schedule configurations
**Solution**: Simple validation with clear error messages and suggestions
**Learning**: Validating "08:00" time format is much easier than cron expressions

### Challenge 3: Task Execution Overlap
**Problem**: What happens if a task is still running when its next execution time arrives?
**Solutions**: 
- Skip (default for most cases)
- Queue (for critical tasks)
- Terminate previous (for singleton tasks)
**Learning**: One size doesn't fit all - this should be configurable per task

### Challenge 4: Graceful Degradation
**Problem**: System restarts, network failures, LibreChat unavailable
**Solution**: Task state persistence, retry mechanisms, graceful failure modes
**Learning**: Tasks should fail gracefully and log enough info for debugging

### Challenge 5: Agent Integration Complexity
**Problem**: Converting natural language scheduling requests to structured data
**Solution**: Clear tool schemas with examples and validation
**Learning**: The agent needs good examples to generate proper parameters

---

## System Architecture Design

### High-Level Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LibreChat     │    │   MCP Server     │    │   Task Engine   │
│   (Agent Host)  │◄──►│  (Tool Provider) │◄──►│  (Scheduler)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        ▲                        │                        │
        │                        ▼                        ▼
        │               ┌──────────────────┐    ┌─────────────────┐
        └───────────────┤   HTTP Client    │    │   Task Store    │
                        │  (LibreChat API) │    │   (JSON File)   │
                        └──────────────────┘    └─────────────────┘
```

### Component Responsibilities

#### 1. **MCP Server Layer**
- Handles MCP protocol communication
- Validates and routes tool calls
- Manages client connections
- Provides tool schemas and capabilities

#### 2. **Task Engine**
- Parses and validates cron expressions
- Manages task lifecycle (create, schedule, execute, complete)
- Handles concurrent execution
- Manages task state persistence

#### 3. **HTTP Client**
- Makes requests back to LibreChat
- Handles authentication and error responses
- Implements retry logic with exponential backoff

#### 4. **Task Store**
- Persists task definitions and state
- Handles concurrent read/write operations
- Manages backup and recovery

### Data Flow
1. **Agent Request**: User tells agent to schedule something
2. **Tool Call**: Agent calls MCP tool with structured parameters
3. **Task Creation**: MCP server validates and creates task
4. **Scheduling**: Task engine adds to cron scheduler
5. **Execution**: When time arrives, task executes HTTP call to LibreChat
6. **Agent Trigger**: LibreChat processes request and triggers agent
7. **Action**: Agent performs the actual work (send SMS, etc.)

---

## Task Lifecycle Management

### State Diagram
```
    [CREATE]
        │
        ▼
   ┌─────────┐    enable    ┌───────────┐    trigger    ┌─────────┐
   │ PENDING │─────────────▶│ SCHEDULED │──────────────▶│ RUNNING │
   └─────────┘              └───────────┘               └─────────┘
        │                          ▲                          │
        │                          │                          ▼
        │                    ┌─────────┐                ┌───────────┐
        │                    │ PAUSED  │                │ COMPLETED │
        │                    └─────────┘                └───────────┘
        │                          ▲                          │
        │                          │                          │
        │        disable           │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
                              ┌─────────┐
                              │ FAILED  │
                              └─────────┘
```

### State Definitions

#### **PENDING**
- Task is created but not yet scheduled
- Validation passed, waiting for enable command
- Can be modified without affecting running schedules

#### **SCHEDULED** 
- Task is actively scheduled in cron engine
- Will execute at next scheduled time
- Cannot be modified (must disable first)

#### **RUNNING**
- Task is currently executing
- HTTP request in flight to LibreChat
- Timeout monitoring active

#### **COMPLETED**
- Task execution finished successfully
- For recurring tasks, automatically transitions back to SCHEDULED
- For one-time tasks, remains in this final state

#### **FAILED**
- Task execution failed (network error, timeout, etc.)
- Requires manual intervention or retry
- Failure reason logged for debugging

#### **PAUSED**
- Task temporarily disabled but schedule preserved
- Can be resumed without losing schedule position
- Useful for maintenance windows

### Transition Rules
- PENDING → SCHEDULED: Only when explicitly enabled
- SCHEDULED → RUNNING: Only when cron trigger fires
- RUNNING → COMPLETED/FAILED: Based on execution result
- Any State → PAUSED: Via disable command
- PAUSED → SCHEDULED: Via enable command
- FAILED → SCHEDULED: Via retry command

---

## Data Model Design

### Core Task Model
```typescript
interface Task {
  // Identity
  id: string;                    // UUID v4
  name: string;                  // Human-readable name
  description?: string;          // Optional description
  
  // Simplified Scheduling
  schedule: Schedule;            // Our user-friendly schedule types
  
  // Execution
  message: string;               // Message to send to LibreChat
  enabled: boolean;              // Whether task is active
  
  // State
  status: TaskStatus;            // Current lifecycle state
  lastRun?: Date;               // When last executed
  nextRun?: Date;               // When next execution scheduled
  
  // Metadata
  createdAt: Date;              // When task was created
  updatedAt: Date;              // When task was last modified
  
  // Execution History
  totalRuns: number;            // How many times executed
  successfulRuns: number;       // How many succeeded
  failedRuns: number;           // How many failed
  lastError?: string;           // Last error message
}

// Simple scheduling system - much easier than cron!
type Schedule = 
  | OneTimeSchedule 
  | IntervalSchedule 
  | DailySchedule 
  | WeeklySchedule 
  | MonthlySchedule;

interface OneTimeSchedule {
  type: 'once';
  datetime: Date; // Exact date and time
}

interface IntervalSchedule {
  type: 'interval';
  every: number; // Number of units
  unit: 'minutes' | 'hours' | 'days';
  startTime?: string; // Optional start time like "09:00"
}

interface DailySchedule {
  type: 'daily';
  time: string; // "HH:MM" format like "08:00"
  weekdaysOnly?: boolean; // Skip weekends
}

interface WeeklySchedule {
  type: 'weekly';
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  time: string; // "HH:MM" format
}

interface MonthlySchedule {
  type: 'monthly';
  dayOfMonth: number; // 1-31
  time: string; // "HH:MM" format
}

enum TaskStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled', 
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused'
}
```

### Execution Result Model
```typescript
interface TaskExecution {
  id: string;                   // Execution UUID
  taskId: string;              // Reference to task
  startTime: Date;             // When execution started
  endTime?: Date;              // When execution finished
  status: 'running' | 'success' | 'failed';
  duration?: number;           // Execution time in milliseconds
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: any;
  };
}
```

---

## Cron Expression Handling

### Why Cron is Complex

#### Standard vs Extended Formats
- **Standard (5 fields)**: `min hour day month dow`
- **Extended (6 fields)**: `sec min hour day month dow`
- **Our choice**: Extended for precision, with seconds optional

#### Expression Validation Challenges
```typescript
// Valid expressions that look wrong:
"0 0 29 2 *"     // Feb 29th - only runs on leap years
"0 0 31 4 *"     // April 31st - never runs (April has 30 days)
"0 2 * * 0"      // 2 AM every Sunday - but what about DST transitions?

// Invalid expressions that look right:
"0 0 25 13 *"    // Month 13 doesn't exist
"0 60 * * *"     // Minute 60 doesn't exist
"0 0 * * 8"      // Day of week 8 doesn't exist
```

#### Timezone Complexity
```typescript
// Same cron expression, different results:
"0 2 * * *" in "America/New_York" 
  // Skips when DST starts (spring forward)
  // Runs twice when DST ends (fall back)

"0 2 * * *" in "UTC"
  // Consistent, but not user-friendly
```

### Our Cron Strategy

#### 1. **Expression Validation Pipeline**
```typescript
class CronValidator {
  validate(expression: string): ValidationResult {
    // 1. Syntax validation (field count, character validity)
    // 2. Range validation (0-59 for minutes, etc.)
    // 3. Logical validation (Feb 31st detection)
    // 4. Timezone compatibility check
    // 5. Future execution preview (next 5 runs)
  }
}
```

#### 2. **Smart Defaults and Suggestions**
```typescript
// User input: "every 5 minutes"
// Suggestion: "*/5 * * * *" or "0 */5 * * * *"

// User input: "daily at 2am"  
// Suggestion: "0 2 * * *"
// Warning: "Consider timezone implications for DST"
```

#### 3. **Expression Preview**
```typescript
interface CronPreview {
  expression: string;
  nextExecutions: Date[];      // Next 5 execution times
  warnings: string[];          // DST warnings, rare dates, etc.
  description: string;         // Human-readable description
}
```

---

## Persistence Strategy

### File-Based Storage Design

#### Why JSON Files?
- **Simplicity**: No external dependencies
- **Portability**: Human-readable, easy to backup
- **Debugging**: Can manually inspect and edit
- **Performance**: Good enough for 1000s of tasks

#### File Structure
```
scheduled-tasks/
├── data/
│   ├── tasks.json           # All task definitions
│   ├── executions.json      # Execution history (rolling)
│   └── config.json          # Server configuration
├── backups/
│   ├── tasks-2024-01-01.json
│   └── tasks-2024-01-02.json
└── logs/
    ├── app.log
    └── errors.log
```

#### Atomic Operations Strategy
```typescript
class TaskStore {
  // Problem: What if process crashes during write?
  // Solution: Atomic write with temp files
  
  async saveTask(task: Task): Promise<void> {
    const tempFile = `${this.taskFile}.tmp`;
    const backupFile = `${this.taskFile}.backup`;
    
    // 1. Write to temp file
    await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2));
    
    // 2. Create backup of current file
    if (await fs.exists(this.taskFile)) {
      await fs.copyFile(this.taskFile, backupFile);
    }
    
    // 3. Atomic rename (OS guarantees atomicity)
    await fs.rename(tempFile, this.taskFile);
    
    // 4. Clean up backup (optional)
    await fs.unlink(backupFile);
  }
}
```

#### Corruption Recovery
```typescript
class TaskStore {
  async loadTasks(): Promise<Task[]> {
    try {
      return await this.loadFromFile(this.taskFile);
    } catch (error) {
      console.warn('Primary task file corrupted, trying backup...');
      try {
        return await this.loadFromFile(`${this.taskFile}.backup`);
      } catch (backupError) {
        console.error('Both primary and backup files corrupted');
        return this.initializeEmptyTaskStore();
      }
    }
  }
}
```

---

## Concurrency and Thread Safety

### The JavaScript Advantage
JavaScript's single-threaded event loop eliminates many traditional concurrency issues, but we still have challenges:

#### Race Conditions We Must Handle

#### 1. **Multiple Task Modifications**
```typescript
// Problem: Two rapid API calls modifying same task
// Solution: Operation queuing per task

class TaskManager {
  private taskOperations = new Map<string, Promise<void>>();
  
  async modifyTask(taskId: string, operation: () => Promise<void>) {
    // Chain operations for same task to prevent races
    const currentOp = this.taskOperations.get(taskId) || Promise.resolve();
    const newOp = currentOp.then(operation);
    this.taskOperations.set(taskId, newOp);
    
    try {
      await newOp;
    } finally {
      // Clean up completed operations
      if (this.taskOperations.get(taskId) === newOp) {
        this.taskOperations.delete(taskId);
      }
    }
  }
}
```

#### 2. **File System Concurrency**
```typescript
// Problem: Reading while writing to task file
// Solution: Reader-writer coordination

class TaskStore {
  private writePromise: Promise<void> | null = null;
  
  async read(): Promise<Task[]> {
    // Wait for any pending writes to complete
    if (this.writePromise) {
      await this.writePromise;
    }
    return this.loadTasks();
  }
  
  async write(tasks: Task[]): Promise<void> {
    // Serialize all writes
    this.writePromise = this.performWrite(tasks);
    await this.writePromise;
    this.writePromise = null;
  }
}
```

#### 3. **Task Execution Overlap**
```typescript
// Problem: Same task triggered multiple times before completion
// Solution: Execution state tracking

class TaskExecutor {
  private runningTasks = new Set<string>();
  
  async executeTask(task: Task): Promise<void> {
    if (this.runningTasks.has(task.id)) {
      console.warn(`Task ${task.id} already running, skipping`);
      return;
    }
    
    this.runningTasks.add(task.id);
    try {
      await this.performExecution(task);
    } finally {
      this.runningTasks.delete(task.id);
    }
  }
}
```

---

## Error Handling Philosophy

### Error Categories and Response Strategies

#### 1. **Validation Errors** (User Input)
- **Strategy**: Fail fast with helpful messages
- **Recovery**: User corrects input and retries
- **Examples**: Invalid cron expression, missing required fields

```typescript
class ValidationError extends Error {
  constructor(
    message: string, 
    public field: string,
    public suggestion?: string
  ) {
    super(message);
  }
}

// Usage:
throw new ValidationError(
  'Invalid minute value: 60', 
  'schedule',
  'Minutes must be 0-59. Did you mean "0 0 * * *" for hourly?'
);
```

#### 2. **Transient Errors** (Network, API)
- **Strategy**: Retry with exponential backoff
- **Recovery**: Log and continue, alert if persistent
- **Examples**: LibreChat API timeout, network connectivity

```typescript
class RetryableError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
  }
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt === maxRetries) {
        throw error;
      }
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

#### 3. **System Errors** (File corruption, out of memory)
- **Strategy**: Graceful degradation, preserve data
- **Recovery**: Alert administrator, continue with reduced functionality
- **Examples**: Disk full, permissions denied

#### 4. **Logic Errors** (Programming bugs)
- **Strategy**: Fail safe, log extensively
- **Recovery**: Disable affected functionality, alert developer
- **Examples**: Null pointer, infinite loops

---

## MCP Protocol Integration

### Tool Design Philosophy

#### 1. **Natural Language to Structure**
The agent needs to convert natural language into structured tool calls:

```
User: "Remind me to exercise every day at 6am"
Agent Thinking: 
  - "every day" = "0 6 * * *"
  - "remind" = send message back to agent
  - "exercise" = content of reminder

Tool Call: create_scheduled_task({
  name: "Daily Exercise Reminder",
  schedule: "0 6 * * *", 
  message: "Time for your daily exercise! 💪",
  description: "Daily exercise reminder at 6am"
})
```

#### 2. **Tool Schema Design**
```typescript
const tools = [
  {
    name: "create_scheduled_task",
    description: "Create a new scheduled task that will send a message back to the agent",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A descriptive name for the task",
          examples: ["Daily reminder", "Weekly report", "Birthday alert"]
        },
        schedule: {
          type: "string", 
          description: "Cron expression for when to run (6 fields: sec min hour day month dow)",
          examples: [
            "0 8 * * *" // Daily at 8am
            "0 0 * * 1" // Weekly on Monday  
            "*/15 * * * *" // Every 15 minutes
          ]
        },
        message: {
          type: "string",
          description: "Message to send back to the agent when task triggers",
          examples: [
            "Time for your daily standup meeting!",
            "Send weekly report to stakeholders", 
            "Wish John happy birthday today"
          ]
        },
        enabled: {
          type: "boolean",
          description: "Whether the task should be active immediately",
          default: true
        }
      },
      required: ["name", "schedule", "message"]
    }
  }
];
```

#### 3. **Response Standardization**
```typescript
interface ToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    taskId?: string;
    nextRun?: string;
    warnings?: string[];
  };
}
```

---

## LibreChat Integration Architecture

### Authentication Strategy
```typescript
interface LibreChatConfig {
  endpoint: string;           // "http://localhost:3080"
  apiKey: string;            // Bearer token
  conversationId: string;    // Where to send scheduled messages
  agentId?: string;          // Specific agent to trigger
  model?: string;            // Model to use for responses
}
```

### Message Triggering Flow
```typescript
class LibreChatClient {
  async triggerAgent(task: Task): Promise<void> {
    const payload = {
      message: task.action.payload.message,
      metadata: {
        source: 'scheduled-task',
        taskId: task.id,
        taskName: task.name,
        triggeredAt: new Date().toISOString()
      }
    };
    
    const response = await fetch(`${this.config.endpoint}/api/ask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new RetryableError(`LibreChat API error: ${response.status}`);
    }
  }
}
```

### Conversation Context Management
```typescript
// Problem: How does the agent know this is a scheduled task?
// Solution: Structured metadata in the message

const scheduledMessage = {
  content: task.action.payload.message,
  context: {
    type: 'scheduled_trigger',
    task: {
      id: task.id,
      name: task.name,
      schedule: task.schedule
    },
    capabilities: [
      'send_sms',        // Agent can send SMS
      'send_email',      // Agent can send email  
      'create_calendar_event' // Agent can create events
    ]
  }
};
```

---

## Security Considerations

### Input Validation
```typescript
class SecurityValidator {
  validateSchedule(schedule: string): void {
    // Prevent resource exhaustion
    if (schedule.includes('*') && schedule.split(' ').filter(f => f === '*').length > 3) {
      throw new ValidationError('Too many wildcards - would execute too frequently');
    }
    
    // Prevent sub-minute execution without explicit approval
    const fields = schedule.split(' ');
    if (fields.length === 6 && fields[0] !== '0') {
      throw new ValidationError('Sub-minute scheduling not allowed for security');
    }
  }
  
  validateMessage(message: string): void {
    // Prevent injection attacks
    if (message.includes('<script>') || message.includes('javascript:')) {
      throw new ValidationError('Message contains potentially unsafe content');
    }
    
    // Rate limiting
    if (message.length > 10000) {
      throw new ValidationError('Message too long - maximum 10000 characters');
    }
  }
}
```

### Resource Protection
```typescript
class ResourceLimiter {
  private maxTasks = 1000;
  private maxConcurrentExecutions = 10;
  private executionTimeout = 30000; // 30 seconds
  
  validateTaskCreation(currentTaskCount: number): void {
    if (currentTaskCount >= this.maxTasks) {
      throw new ValidationError(`Maximum ${this.maxTasks} tasks allowed`);
    }
  }
}
```

---

## Testing Strategy

### Testing Pyramid

#### 1. **Unit Tests** (70% of tests)
- Individual function validation
- Cron expression parsing
- Task state transitions
- Error handling paths

#### 2. **Integration Tests** (20% of tests)  
- MCP protocol compliance
- File system operations
- HTTP client behavior
- End-to-end task lifecycle

#### 3. **E2E Tests** (10% of tests)
- Full agent interaction flows
- LibreChat integration
- System recovery scenarios

### Time-Based Testing Challenges
```typescript
// Problem: How do you test "runs at 2am tomorrow"?
// Solution: Time abstraction and mocking

interface TimeProvider {
  now(): Date;
  nextCronExecution(expression: string): Date;
}

class RealTimeProvider implements TimeProvider {
  now(): Date { return new Date(); }
  nextCronExecution(expression: string): Date {
    return cronParser.parseExpression(expression).next().toDate();
  }
}

class MockTimeProvider implements TimeProvider {
  constructor(private mockTime: Date) {}
  
  now(): Date { return this.mockTime; }
  setTime(time: Date): void { this.mockTime = time; }
  
  nextCronExecution(expression: string): Date {
    // Use mock time as baseline
    return cronParser.parseExpression(expression, { currentDate: this.mockTime }).next().toDate();
  }
}
```

---

## Performance and Scalability

### Performance Targets
- **Task Creation**: < 100ms for validation and persistence
- **Task Execution**: < 5 seconds total (including LibreChat API call)
- **Memory Usage**: < 100MB for 1000 active tasks
- **File Operations**: < 50ms for task store read/write

### Scalability Considerations

#### Task Limits
- **Maximum Tasks**: 10,000 per instance
- **Concurrent Executions**: 50 simultaneous 
- **Execution History**: 30 days rolling window
- **File Size Limits**: 10MB task store, 100MB execution history

#### Future Scaling Paths
1. **Database Migration**: SQLite → PostgreSQL for larger deployments
2. **Horizontal Scaling**: Multiple instances with shared database
3. **Queue System**: Redis/RabbitMQ for reliable task execution
4. **Monitoring**: Prometheus metrics for production observability

---

## Success Metrics

### Functional Success
- ✅ Agent can create tasks via natural language
- ✅ Tasks execute reliably on schedule
- ✅ Failed tasks are retried appropriately
- ✅ System survives restarts without data loss
- ✅ LibreChat integration works seamlessly

### Performance Success  
- ✅ < 1 second response time for tool calls
- ✅ < 10MB memory usage for typical workloads
- ✅ 99.9% task execution reliability
- ✅ Zero data corruption events

### User Experience Success
- ✅ Agent understands natural scheduling language
- ✅ Clear error messages when things go wrong  
- ✅ Easy to debug failed tasks
- ✅ Intuitive task management commands

---

## Critical Implementation Notes: ES Modules

### ⚠️ MANDATORY Configuration for Node.js Compatibility

When implementing this MCP server, you **MUST** configure it as an ES module. This is not optional - it's required for proper operation.

#### Required package.json Configuration:
```json
{
  "name": "@sizzek/scheduled-tasks-mcp",
  "type": "module",
  "main": "dist/index.js"
}
```

#### Required tsconfig.json Configuration:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node"
  }
}
```

#### Import Statement Requirements:
```typescript
// ✅ CORRECT - All local imports MUST include .js extensions
import { TaskManager } from './core/task-manager.js';
import { Task } from '../types/index.js';

```

#### Why This Matters:
- **ES Modules are stricter**: Unlike CommonJS, they require explicit file extensions
- **MCP SDK compatibility**: The @modelcontextprotocol/sdk uses ES modules
- **Runtime errors**: Missing extensions cause `ERR_MODULE_NOT_FOUND` at runtime
- **Directory imports fail**: Must specify `index.js` explicitly

**This is the #1 cause of implementation failures.** Get this right first, before writing any code.

---

## Next Steps

This design plan provides the foundation for implementation. The key insight is that cron task management is complex because it sits at the intersection of time, state, persistence, and reliability - each bringing their own challenges.

By building from first principles, we'll understand not just *how* to build a task scheduler, but *why* certain design decisions are necessary. This knowledge will be invaluable when debugging issues or extending functionality.

The implementation plan will take these designs and provide concrete steps, files, and code to bring this vision to life. 