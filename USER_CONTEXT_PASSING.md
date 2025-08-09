# User Context Passing Implementation Guide

## Executive Summary

This document outlines the implementation of **metadata-based user context passing** to enable scheduled tasks to operate with the correct user context when triggering MCP servers. The solution allows tasks created by User A to maintain User A's context even when executed by the agent, enabling proper data isolation and sharing capabilities.

**Core Problem**: Scheduled tasks currently execute with the agent's user context, causing MCP servers to load the wrong user's data.

**Solution**: Pass the original task creator's user ID through metadata, allowing LibreChat to route MCP server calls with the correct user context.

**Scope**: LibreChat core, Scheduled Tasks MCP server, Grocery List MCP server.

---

## Architecture Overview

### Current Flow (Broken)
```
User A creates task → Scheduled execution → Agent user context → MCP servers load agent data ❌
```

### Target Flow (Fixed)
```
User A creates task → Scheduled execution → Agent triggers with User A metadata → LibreChat extracts User A context → MCP servers load User A data ✅
```

### Key Components

1. **Task Model Enhancement**: Store creator user ID and sharing information
2. **LibreChat Client Update**: Pass original user context in metadata
3. **LibreChat MCP Manager**: Extract and use original user context
4. **MCP Server Updates**: Handle shared/original user context

---

## Implementation Plan

### Phase 1: Core Infrastructure
- Update Task model to store creator context
- Modify task creation to capture user ID
- Update LibreChat client to pass metadata

### Phase 2: LibreChat Integration
- Modify MCP manager to extract user context
- Update connection patching for context passing
- Handle backward compatibility

### Phase 3: MCP Server Updates
- Update user context extraction
- Implement sharing logic
- Add tenant isolation support

### Phase 4: Testing & Validation
- Integration tests
- User context validation
- Sharing scenarios

---

## Detailed Implementation

## 1. Scheduled Tasks MCP Server Changes

### 1.1 Update Task Model

**File**: `mcp-servers/scheduled-tasks/src/types/index.ts`

**Current**:
```typescript
export interface Task {
    id: string;
    name: string;
    description: string | undefined;
    schedule: Schedule;
    message: string;
    enabled: boolean;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    lastRun: Date | undefined;
    nextRun: Date | undefined;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastError: string | undefined;
}
```

**Target**:
```typescript
export interface Task {
    id: string;
    name: string;
    description: string | undefined;
    schedule: Schedule;
    message: string;
    enabled: boolean;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    lastRun: Date | undefined;
    nextRun: Date | undefined;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastError: string | undefined;
    
    // NEW: User context and sharing
    creatorUserId: string;              // Who created this task
    tenantId?: string;                  // Multi-tenant isolation (future)
    sharedWith: string[];               // Array of user IDs who can access this task
    contextType: 'user' | 'shared';    // Type of context (extensible for groups later)
}

export interface CreateTaskRequest {
    name: string;
    description?: string;
    schedule: Schedule;
    message: string;
    enabled?: boolean;
    
    // NEW: Context information
    creatorUserId?: string;             // Will be extracted from request
    sharedWith?: string[];              // Optional sharing
}
```

### 1.2 Update Task Creation Logic

**File**: `mcp-servers/scheduled-tasks/src/core/task-manager.ts`

**Current**:
```typescript
async createTask(request: CreateTaskRequest): Promise<Task> {
    const task: Task = {
        id: uuidv4(),
        name: request.name,
        description: request.description,
        schedule: request.schedule,
        message: request.message,
        enabled: request.enabled ?? true,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: undefined,
        nextRun: undefined,
        lastError: undefined
    };
    // ... rest of method
}
```

**Target**:
```typescript
async createTask(request: CreateTaskRequest, userContext?: UserContext): Promise<Task> {
    // Validate that we have creator context
    const creatorUserId = userContext?.userId || request.creatorUserId;
    if (!creatorUserId) {
        throw new Error('Creator user ID is required for task creation');
    }

    const task: Task = {
        id: uuidv4(),
        name: request.name,
        description: request.description,
        schedule: request.schedule,
        message: request.message,
        enabled: request.enabled ?? true,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: undefined,
        nextRun: undefined,
        lastError: undefined,
        
        // NEW: User context
        creatorUserId,
        tenantId: userContext?.tenantId,
        sharedWith: request.sharedWith || [],
        contextType: (request.sharedWith && request.sharedWith.length > 0) ? 'shared' : 'user'
    };
    
    // ... rest of method
}
```

### 1.3 Add User Context Extraction

**File**: `mcp-servers/scheduled-tasks/src/utils/user-context.ts` (NEW)

```typescript
export interface UserContext {
    userId: string;
    tenantId?: string;
    originalUserId?: string;        // For shared contexts
    sharedWith?: string[];          // Who has access
    isSharedContext: boolean;       // Whether this is a shared operation
    effectiveUserId: string;        // The user ID to use for data operations
}

export function extractUserContext(request: any): UserContext {
    // Extract user ID from LibreChat MCP request
    const userId = request.params?.userId;
    const originalUserId = request.params?.originalUserId;
    const sharedWith = request.params?.sharedWith || [];
    const tenantId = request.params?.tenantId;
    
    // Determine effective user ID for data operations
    const effectiveUserId = originalUserId || userId;
    const isSharedContext = !!originalUserId;
    
    if (!effectiveUserId) {
        throw new Error('No user context available in request');
    }
    
    return {
        userId: userId || 'unknown',
        tenantId,
        originalUserId,
        sharedWith,
        isSharedContext,
        effectiveUserId
    };
}

export function validateUserAccess(task: Task, userContext: UserContext): boolean {
    // User is the creator
    if (task.creatorUserId === userContext.userId) {
        return true;
    }
    
    // User is in the shared list
    if (task.sharedWith.includes(userContext.userId)) {
        return true;
    }
    
    // Original user (from shared context) is the creator
    if (userContext.originalUserId === task.creatorUserId) {
        return true;
    }
    
    return false;
}
```

### 1.4 Update MCP Server Request Handler

**File**: `mcp-servers/scheduled-tasks/src/index.ts`

**Current**:
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;

    switch (name) {
        case "create_once_task":
            const task = await taskManager.createTask({
                name: args.name,
                description: args.description || undefined,
                schedule: { type: "once", delayMinutes: args.delayMinutes },
                message: args.message,
                enabled: args.enabled !== undefined ? args.enabled : undefined
            });
            // ... return response
    }
});
```

**Target**:
```typescript
import { extractUserContext, validateUserAccess } from './utils/user-context.js';

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    
    // Extract user context from LibreChat
    const userContext = extractUserContext(request);
    
    console.log(`[${name}] Request from user: ${userContext.userId}, effective: ${userContext.effectiveUserId}, shared: ${userContext.isSharedContext}`);

    switch (name) {
        case "create_once_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: { type: "once", delayMinutes: args.delayMinutes },
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined,
                    sharedWith: args.sharedWith || []
                }, userContext);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [{
                        type: "text",
                        text: `✅ Created scheduled task: "${task.name}"\n` +
                              `ID: ${task.id}\n` +
                              `Creator: ${task.creatorUserId}\n` +
                              `Shared with: ${task.sharedWith.join(', ') || 'None'}\n` +
                              `Context: ${task.contextType}\n` +
                              `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                              `Status: ${task.status}\n` +
                              `Integration: ${librechatStatus}`
                    }]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "list_scheduled_tasks":
            try {
                const allTasks = await taskManager.getAllTasks();
                
                // Filter tasks based on user access
                const accessibleTasks = allTasks.filter(task => 
                    validateUserAccess(task, userContext)
                );

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(accessibleTasks.map(task => ({
                            id: task.id,
                            name: task.name,
                            status: task.status,
                            schedule: task.schedule,
                            createdBy: task.creatorUserId,
                            sharedWith: task.sharedWith,
                            contextType: task.contextType,
                            nextRun: task.nextRun?.toISOString(),
                            enabled: task.enabled
                        })), null, 2)
                    }]
                };
            } catch (error) {
                console.error('Error listing scheduled tasks:', error);
                throw new Error(`Failed to list scheduled tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        // ... other cases with similar user context validation
    }
});
```

### 1.5 Update LibreChat Client to Pass Context

**File**: `mcp-servers/scheduled-tasks/src/http/librechat-client.ts`

**Current**:
```typescript
async triggerTask(task: Task): Promise<void> {
    const request: TriggerRequest = {
        message: task.message,
        description: task.description || task.name,
        metadata: {
            source: 'scheduled',
            taskId: task.id,
            taskName: task.name,
            schedule: task.schedule,
            triggeredAt: new Date().toISOString(),
            userId: user._id.toString(),
            agentName: this.config.agentName,
            endpoint: 'agents',
            agent_id: process.env.LIBRECHAT_AGENT_ID || 'default',
            model: process.env.LIBRECHAT_AGENT_MODEL || 'gpt-4o'
        }
    };
    // ... rest of method
}
```

**Target**:
```typescript
async triggerTask(task: Task): Promise<void> {
    // Get the agent user (who will appear to send the message)
    const agentUser = await this.getUser();
    if (!agentUser) {
        throw new Error('Unable to find agent user. Please check agent configuration.');
    }
    if (!agentUser.phoneNumber) {
        throw new Error(`Agent user ${agentUser._id} does not have a phone number. Cannot send scheduled message.`);
    }

    const request: TriggerRequest = {
        message: task.message,
        description: task.description || task.name,
        metadata: {
            source: 'scheduled',
            taskId: task.id,
            taskName: task.name,
            schedule: task.schedule,
            triggeredAt: new Date().toISOString(),
            userId: agentUser._id.toString(),
            agentName: this.config.agentName,
            endpoint: 'agents',
            agent_id: process.env.LIBRECHAT_AGENT_ID || 'default',
            model: process.env.LIBRECHAT_AGENT_MODEL || 'gpt-4o',
            
            // NEW: Original user context for MCP servers
            originalUserId: task.creatorUserId,
            sharedWith: task.sharedWith,
            contextType: task.contextType,
            tenantId: task.tenantId,
            
            // Instructions for the agent about context
            additional_instructions: `SHARED CONTEXT: This scheduled task was created by user ${task.creatorUserId}. ` +
                                   `${task.sharedWith.length > 0 ? `It is shared with: ${task.sharedWith.join(', ')}. ` : ''}` +
                                   `When using MCP tools, operate in the creator's context for data consistency.`
        }
    };

    await this.sendWithRetry(() => this.sendTriggerRequest(request, agentUser.phoneNumber));
}
```

---

## 2. LibreChat Core Changes

### 2.1 Update External Message Metadata Processing

**File**: `LibreChat/api/server/middleware/validateExternalMessage.js`

**Current**:
```javascript
// Enhanced request context for downstream processing
req.isServiceRequest = true;
req.user = user;
req.phoneNumber = phoneNumber;
req.smsUserContext = {
    isNewUser: user.createdAt > new Date(Date.now() - 60000),
    lastActivity: user.metadata?.lastSMS,
    totalMessages: user.metadata?.messageCount || 1,
    userPreferences: user.metadata?.preferences || {},
    usePlaceholderConversationId: conversationIdFromUrl ? isPlaceholderConversationId(conversationIdFromUrl) : false
};
```

**Target**:
```javascript
// Enhanced request context for downstream processing
req.isServiceRequest = true;
req.user = user;
req.phoneNumber = phoneNumber;
req.smsUserContext = {
    isNewUser: user.createdAt > new Date(Date.now() - 60000),
    lastActivity: user.metadata?.lastSMS,
    totalMessages: user.metadata?.messageCount || 1,
    userPreferences: user.metadata?.preferences || {},
    usePlaceholderConversationId: conversationIdFromUrl ? isPlaceholderConversationId(conversationIdFromUrl) : false
};

// NEW: Extract user context from scheduled task metadata
if (req.body.metadata) {
    req.scheduledTaskContext = {
        isScheduledTask: req.body.metadata.source === 'scheduled',
        originalUserId: req.body.metadata.originalUserId,
        sharedWith: req.body.metadata.sharedWith || [],
        contextType: req.body.metadata.contextType || 'user',
        tenantId: req.body.metadata.tenantId,
        taskId: req.body.metadata.taskId,
        taskName: req.body.metadata.taskName
    };
    
    logger.debug('[validateExternalMessage] Extracted scheduled task context:', req.scheduledTaskContext);
}
```

### 2.2 Update MCP Manager to Use Original User Context

**File**: `LibreChat/packages/mcp/src/manager.ts`

**Current**:
```typescript
async callTool({
    serverName,
    toolName,
    provider,
    toolArguments,
    options,
}: {
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: CallToolOptions;
}): Promise<t.FormattedToolResponse> {
    const { userId, ...callOptions } = options ?? {};
    
    const requestParams = {
        name: toolName,
        arguments: {
            ...toolArguments,
        },
        ...(userId && { userId }), // Add userId to params if available
    };

    const result = await connection.client.callTool(requestParams);
    // ... rest of method
}
```

**Target**:
```typescript
async callTool({
    serverName,
    toolName,
    provider,
    toolArguments,
    options,
}: {
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: CallToolOptions & {
        scheduledTaskContext?: {
            originalUserId?: string;
            sharedWith?: string[];
            contextType?: string;
            tenantId?: string;
        };
    };
}): Promise<t.FormattedToolResponse> {
    const { userId, scheduledTaskContext, ...callOptions } = options ?? {};
    
    // Determine the effective user ID for MCP server operations
    const effectiveUserId = scheduledTaskContext?.originalUserId || userId;
    
    const requestParams = {
        name: toolName,
        arguments: {
            ...toolArguments,
        },
        // Pass user context to MCP server
        ...(effectiveUserId && { userId: effectiveUserId }),
        
        // NEW: Pass scheduled task context if available
        ...(scheduledTaskContext?.originalUserId && { 
            originalUserId: scheduledTaskContext.originalUserId 
        }),
        ...(scheduledTaskContext?.sharedWith && { 
            sharedWith: scheduledTaskContext.sharedWith 
        }),
        ...(scheduledTaskContext?.contextType && { 
            contextType: scheduledTaskContext.contextType 
        }),
        ...(scheduledTaskContext?.tenantId && { 
            tenantId: scheduledTaskContext.tenantId 
        }),
    };

    logger.debug(`${logPrefix} Calling tool with context:`, {
        toolName,
        currentUserId: userId,
        effectiveUserId,
        isScheduledTask: !!scheduledTaskContext?.originalUserId,
        contextType: scheduledTaskContext?.contextType,
        sharedWith: scheduledTaskContext?.sharedWith?.length || 0
    });

    const result = await connection.client.callTool(requestParams);
    // ... rest of method
}
```

### 2.3 Update MCP Service Layer

**File**: `LibreChat/api/server/services/MCP.js`

**Current**:
```javascript
const result = await mcpManager.callTool({
    user: userForMCP,
    serverName,
    toolName,
    provider,
    toolArguments,
    options: {
        userId: finalUserId,
        signal: derivedSignal,
    },
    customUserVars,
    // ... other parameters
});
```

**Target**:
```javascript
// Extract scheduled task context from request
const scheduledTaskContext = req.scheduledTaskContext;

const result = await mcpManager.callTool({
    user: userForMCP,
    serverName,
    toolName,
    provider,
    toolArguments,
    options: {
        userId: finalUserId,
        signal: derivedSignal,
        
        // NEW: Pass scheduled task context
        scheduledTaskContext: scheduledTaskContext ? {
            originalUserId: scheduledTaskContext.originalUserId,
            sharedWith: scheduledTaskContext.sharedWith,
            contextType: scheduledTaskContext.contextType,
            tenantId: scheduledTaskContext.tenantId
        } : undefined,
    },
    customUserVars,
    // ... other parameters
});

logger.debug(`[MCP.js][${serverName}][${toolName}] Context passed:`, {
    currentUser: finalUserId,
    originalUser: scheduledTaskContext?.originalUserId,
    isScheduledTask: !!scheduledTaskContext?.originalUserId,
    contextType: scheduledTaskContext?.contextType
});
```

### 2.4 Update API Manager

**File**: `LibreChat/packages/api/src/mcp/manager.ts`

**Current**:
```typescript
const finalParams = {
    name: toolName,
    arguments: toolArguments,
    ...(userId && { userId }), // Add userId to params if available
};

const result = await connection.client.callTool(finalParams);
```

**Target**:
```typescript
// Extract scheduled task context from options
const scheduledTaskContext = options?.scheduledTaskContext;

const finalParams = {
    name: toolName,
    arguments: toolArguments,
    ...(userId && { userId }),
    
    // NEW: Pass scheduled task context to MCP server
    ...(scheduledTaskContext?.originalUserId && { 
        originalUserId: scheduledTaskContext.originalUserId 
    }),
    ...(scheduledTaskContext?.sharedWith && { 
        sharedWith: scheduledTaskContext.sharedWith 
    }),
    ...(scheduledTaskContext?.contextType && { 
        contextType: scheduledTaskContext.contextType 
    }),
    ...(scheduledTaskContext?.tenantId && { 
        tenantId: scheduledTaskContext.tenantId 
    }),
};

logger.debug(`${logPrefix} Calling tool with enhanced context:`, {
    toolName,
    currentUserId: userId,
    effectiveUserId: scheduledTaskContext?.originalUserId || userId,
    isScheduledTask: !!scheduledTaskContext?.originalUserId,
    contextType: scheduledTaskContext?.contextType || 'user',
    sharedWithCount: scheduledTaskContext?.sharedWith?.length || 0
});

const result = await connection.client.callTool(finalParams);
```

---

## 3. Grocery List MCP Server Changes

### 3.1 Update User Context Extraction

**File**: `mcp-servers/grocery-list/src/index.ts`

**Current**:
```typescript
function extractUserId(request: any): string | undefined {
    // Single source of truth: request.params.userId
    if (request.params?.userId && typeof request.params.userId === 'string' && request.params.userId.trim() !== '') {
        log('DEBUG', `Found user ID from request.params.userId: ${request.params.userId}`);
        return request.params.userId.trim();
    }
    // Optional: fallback for dev/testing
    if (process.env.MCP_USER_ID) {
        log('DEBUG', `Falling back to MCP_USER_ID env: ${process.env.MCP_USER_ID}`);
        return process.env.MCP_USER_ID;
    }
    log('DEBUG', 'No user ID found, using default. Request object:', JSON.stringify(request, null, 2));
    return undefined;
}
```

**Target**:
```typescript
interface UserContext {
    userId: string;
    originalUserId?: string;
    sharedWith: string[];
    contextType: 'user' | 'shared';
    tenantId?: string;
    isSharedContext: boolean;
    effectiveUserId: string;
}

function extractUserContext(request: any): UserContext {
    const userId = request.params?.userId;
    const originalUserId = request.params?.originalUserId;
    const sharedWith = request.params?.sharedWith || [];
    const contextType = request.params?.contextType || 'user';
    const tenantId = request.params?.tenantId;
    
    // Determine effective user ID for data operations
    const effectiveUserId = originalUserId || userId;
    const isSharedContext = !!originalUserId;
    
    if (!effectiveUserId) {
        log('ERROR', 'No user context available in request:', JSON.stringify(request.params, null, 2));
        throw new Error('No user context available in request');
    }
    
    log('DEBUG', 'Extracted user context:', {
        userId,
        originalUserId,
        effectiveUserId,
        isSharedContext,
        contextType,
        sharedWithCount: sharedWith.length,
        tenantId
    });
    
    return {
        userId: userId || 'unknown',
        originalUserId,
        sharedWith,
        contextType,
        tenantId,
        isSharedContext,
        effectiveUserId
    };
}

// Backward compatibility wrapper
function extractUserId(request: any): string | undefined {
    try {
        const context = extractUserContext(request);
        return context.effectiveUserId;
    } catch (error) {
        log('WARN', 'Failed to extract user context, falling back to legacy method:', error);
        
        // Legacy fallback
        if (request.params?.userId) {
            return request.params.userId.trim();
        }
        if (process.env.MCP_USER_ID) {
            return process.env.MCP_USER_ID;
        }
        return undefined;
    }
}
```

### 3.2 Update Request Handler

**File**: `mcp-servers/grocery-list/src/index.ts`

**Current**:
```typescript
async handleToolCall(request: any) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    log('INFO', `[REQUEST-${requestId}] ===== NEW TOOL CALL REQUEST =====`);
    log('INFO', `[REQUEST-${requestId}] Tool: ${request.params?.name || 'UNKNOWN'}`);

    const userId = extractUserId(request);
    log('INFO', `[REQUEST-${requestId}] Extracted userId: "${userId || 'NONE'}"`);
    log('INFO', `[REQUEST-${requestId}] User-based storage: ${this.isUserBased}`);

    // ... rest of method
}
```

**Target**:
```typescript
async handleToolCall(request: any) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    log('INFO', `[REQUEST-${requestId}] ===== NEW TOOL CALL REQUEST =====`);
    log('INFO', `[REQUEST-${requestId}] Tool: ${request.params?.name || 'UNKNOWN'}`);

    // Extract enhanced user context
    const userContext = extractUserContext(request);
    log('INFO', `[REQUEST-${requestId}] User context:`, {
        currentUser: userContext.userId,
        effectiveUser: userContext.effectiveUserId,
        isSharedContext: userContext.isSharedContext,
        contextType: userContext.contextType,
        sharedWithCount: userContext.sharedWith.length,
        tenantId: userContext.tenantId
    });

    // Backward compatibility
    const userId = userContext.effectiveUserId;
    log('INFO', `[REQUEST-${requestId}] User-based storage: ${this.isUserBased}`);

    try {
        log('INFO', `[REQUEST-${requestId}] Starting tool execution: ${request.params.name}`);

        switch (request.params.name) {
            case "add_grocery_item": {
                const { name, quantity = 1, category } = request.params.arguments;

                if (!name) {
                    return {
                        content: [{ type: "text", text: "Error: name is required" }],
                        isError: true
                    };
                }

                if (quantity <= 0) {
                    return {
                        content: [{ type: "text", text: "Error: Quantity must be greater than 0" }],
                        isError: true
                    };
                }

                const item = await this.addGroceryItem(name, quantity, category, userId);

                // Enhanced response with context information
                const contextInfo = userContext.isSharedContext 
                    ? ` (added to shared list for ${userContext.originalUserId})`
                    : '';

                return {
                    content: [{
                        type: "text",
                        text: `Grocery item added successfully${contextInfo}: ${item.name} (${item.quantity}) - ID: ${item.id}`
                    }]
                };
            }

            case "get_grocery_list": {
                log('INFO', `[REQUEST-${requestId}] Processing get_grocery_list`);
                const { purchased } = request.params.arguments;

                let items;
                if (purchased === true) {
                    items = (await this.getGroceryItems(userId)).filter(t => t.purchased);
                } else if (purchased === false) {
                    items = (await this.getGroceryItems(userId)).filter(t => !t.purchased);
                } else {
                    items = await this.getGroceryItems(userId);
                }

                // Add context information to response
                const contextInfo = userContext.isSharedContext 
                    ? ` (shared context from ${userContext.originalUserId})`
                    : '';

                log('INFO', `[REQUEST-${requestId}] Returning ${items.length} grocery items${contextInfo}`);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(items, null, 2)
                    }]
                };
            }

            case "get_web_ui": {
                log('INFO', `[REQUEST-${requestId}] Processing get_web_ui with context`);
                
                try {
                    const webUIResponse = await webUIManager.handleGetWebUI(userId, userContext);
                    log('INFO', `[REQUEST-${requestId}] Web UI generated successfully for effective user: ${userId}`);
                    return webUIResponse;
                } catch (error) {
                    log('ERROR', `[REQUEST-${requestId}] Failed to generate web UI: ${error}`);
                    return {
                        content: [{
                            type: "text",
                            text: `Error generating web UI: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }],
                        isError: true
                    };
                }
            }

            // ... other cases with similar context handling
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        log('ERROR', `[REQUEST-${requestId}] Tool execution failed after ${duration}ms: ${error}`);
        return {
            content: [{
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
            }],
            isError: true
        };
    }
}
```

### 3.3 Update Web UI Manager

**File**: `mcp-servers/grocery-list/src/web-ui-integration.ts`

**Current**:
```typescript
async handleGetWebUI(userId: string): Promise<{
    content: Array<{ type: string; text: string }>;
}> {
    this.log('INFO', `[GROCERY-WEB-UI] handleGetWebUI called with userId: "${userId}"`);
    
    // ... existing implementation
    
    return this.webUI.handleGetWebUI(userId);
}
```

**Target**:
```typescript
async handleGetWebUI(userId: string, userContext?: UserContext): Promise<{
    content: Array<{ type: string; text: string }>;
}> {
    this.log('INFO', `[GROCERY-WEB-UI] handleGetWebUI called with userId: "${userId}"`);
    
    if (userContext) {
        this.log('INFO', `[GROCERY-WEB-UI] Enhanced context:`, {
            isSharedContext: userContext.isSharedContext,
            contextType: userContext.contextType,
            originalUserId: userContext.originalUserId,
            sharedWithCount: userContext.sharedWith.length
        });
    }

    // Debug: Check how many grocery items this user ID has
    try {
        const userGroceries = await this.groceryManager.getGroceryItems(userId);
        this.log('INFO', `[GROCERY-WEB-UI] User "${userId}" has ${userGroceries.length} grocery items`);

        // Enhanced context information for shared scenarios
        if (userContext?.isSharedContext) {
            this.log('INFO', `[GROCERY-WEB-UI] Operating in shared context - original user: ${userContext.originalUserId}`);
        }

        // If user has no groceries, let's check what user IDs do have data (debug helper)
        if (userGroceries.length === 0 && process.env.MCP_DEBUG === 'true') {
            this.log('WARN', `[GROCERY-WEB-UI] User "${userId}" has no groceries. Checking for other user data...`);
            await this.debugCheckOtherUsers();
        }
    } catch (error) {
        this.log('ERROR', `[GROCERY-WEB-UI] Error checking user groceries: ${error}`);
    }

    // Pass context to web UI for enhanced rendering
    return this.webUI.handleGetWebUI(userId, {
        isSharedContext: userContext?.isSharedContext || false,
        contextType: userContext?.contextType || 'user',
        originalUserId: userContext?.originalUserId,
        sharedWith: userContext?.sharedWith || []
    });
}
```

---

## 4. Testing & Validation

### 4.1 Integration Test Cases

**File**: `mcp-servers/scheduled-tasks/tests/integration/user-context.test.js` (NEW)

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TaskManager } from '../../src/core/task-manager.js';
import { extractUserContext, validateUserAccess } from '../../src/utils/user-context.js';

describe('User Context Integration Tests', () => {
    let taskManager;
    
    beforeEach(() => {
        taskManager = new TaskManager();
    });

    describe('User Context Extraction', () => {
        it('should extract user context from LibreChat request', () => {
            const request = {
                params: {
                    userId: 'user123',
                    originalUserId: 'user456',
                    sharedWith: ['user789'],
                    contextType: 'shared',
                    tenantId: 'tenant1'
                }
            };

            const context = extractUserContext(request);

            expect(context.userId).toBe('user123');
            expect(context.originalUserId).toBe('user456');
            expect(context.effectiveUserId).toBe('user456');
            expect(context.isSharedContext).toBe(true);
            expect(context.contextType).toBe('shared');
            expect(context.sharedWith).toEqual(['user789']);
            expect(context.tenantId).toBe('tenant1');
        });

        it('should handle non-shared context', () => {
            const request = {
                params: {
                    userId: 'user123',
                    contextType: 'user'
                }
            };

            const context = extractUserContext(request);

            expect(context.userId).toBe('user123');
            expect(context.originalUserId).toBeUndefined();
            expect(context.effectiveUserId).toBe('user123');
            expect(context.isSharedContext).toBe(false);
            expect(context.contextType).toBe('user');
        });
    });

    describe('Task Creation with Context', () => {
        it('should create task with creator context', async () => {
            const userContext = {
                userId: 'user123',
                effectiveUserId: 'user123',
                isSharedContext: false,
                contextType: 'user',
                sharedWith: [],
                tenantId: 'tenant1'
            };

            const task = await taskManager.createTask({
                name: 'Test Task',
                message: 'Test message',
                schedule: { type: 'once', delayMinutes: 1 },
                sharedWith: ['user456']
            }, userContext);

            expect(task.creatorUserId).toBe('user123');
            expect(task.sharedWith).toEqual(['user456']);
            expect(task.contextType).toBe('shared');
            expect(task.tenantId).toBe('tenant1');
        });
    });

    describe('Access Validation', () => {
        it('should validate creator access', () => {
            const task = {
                creatorUserId: 'user123',
                sharedWith: ['user456']
            };

            const userContext = {
                userId: 'user123',
                effectiveUserId: 'user123'
            };

            expect(validateUserAccess(task, userContext)).toBe(true);
        });

        it('should validate shared user access', () => {
            const task = {
                creatorUserId: 'user123',
                sharedWith: ['user456']
            };

            const userContext = {
                userId: 'user456',
                effectiveUserId: 'user456'
            };

            expect(validateUserAccess(task, userContext)).toBe(true);
        });

        it('should deny unauthorized access', () => {
            const task = {
                creatorUserId: 'user123',
                sharedWith: ['user456']
            };

            const userContext = {
                userId: 'user789',
                effectiveUserId: 'user789'
            };

            expect(validateUserAccess(task, userContext)).toBe(false);
        });
    });
});
```

### 4.2 End-to-End Test Scenario

**File**: `mcp-servers/scheduled-tasks/tests/e2e/shared-context.test.js` (NEW)

```javascript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TaskManager } from '../../src/core/task-manager.js';
import { LibreChatClient } from '../../src/http/librechat-client.js';

describe('Shared Context End-to-End Tests', () => {
    let taskManager;
    let librechatClient;
    let mockFetch;

    beforeAll(() => {
        // Mock fetch for LibreChat API calls
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        taskManager = new TaskManager();
        librechatClient = new LibreChatClient({
            endpoint: 'http://localhost:3080',
            apiKey: 'test-key',
            agentName: 'test-agent'
        });
    });

    afterAll(() => {
        delete global.fetch;
    });

    it('should create shared task and trigger with correct context', async () => {
        // 1. Create task with sharing
        const userContext = {
            userId: 'user123',
            effectiveUserId: 'user123',
            isSharedContext: false,
            contextType: 'user',
            sharedWith: [],
            tenantId: 'tenant1'
        };

        const task = await taskManager.createTask({
            name: 'Shared Grocery Reminder',
            message: 'Check the grocery list',
            schedule: { type: 'once', delayMinutes: 1 },
            sharedWith: ['user456', 'user789']
        }, userContext);

        expect(task.creatorUserId).toBe('user123');
        expect(task.sharedWith).toEqual(['user456', 'user789']);
        expect(task.contextType).toBe('shared');

        // 2. Mock LibreChat API response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => 'Success'
        });

        // 3. Trigger task
        await librechatClient.triggerTask(task);

        // 4. Verify API call contains correct context
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3080/api/messages/sms-conversation',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"originalUserId":"user123"')
            })
        );

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.metadata.originalUserId).toBe('user123');
        expect(callBody.metadata.sharedWith).toEqual(['user456', 'user789']);
        expect(callBody.metadata.contextType).toBe('shared');
    });
});
```

---

## 5. Migration Strategy

### 5.1 Database Migration

**File**: `mcp-servers/scheduled-tasks/src/migrations/add-user-context.ts` (NEW)

```typescript
import { TaskStorageManager } from '../storage/TaskStorageManager.js';
import { Task } from '../types/index.js';

export async function migrateTasksToUserContext(): Promise<void> {
    console.log('🔄 Starting user context migration...');
    
    const storageManager = new TaskStorageManager();
    
    try {
        // Load existing tasks
        const existingTasks = await storageManager.loadTasks();
        console.log(`📋 Found ${existingTasks.length} existing tasks to migrate`);
        
        // Migrate each task
        const migratedTasks: Task[] = existingTasks.map(task => {
            // Add default user context for existing tasks
            const migratedTask: Task = {
                ...task,
                creatorUserId: process.env.MCP_USER_ID || 'unknown',
                sharedWith: [],
                contextType: 'user'
            };
            
            console.log(`✅ Migrated task: ${task.name} (${task.id})`);
            return migratedTask;
        });
        
        // Save migrated tasks
        await storageManager.saveTasks(migratedTasks);
        console.log(`🎉 Successfully migrated ${migratedTasks.length} tasks`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    migrateTasksToUserContext()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        });
}
```

### 5.2 Backward Compatibility

**File**: `mcp-servers/scheduled-tasks/src/utils/backward-compatibility.ts` (NEW)

```typescript
import { Task } from '../types/index.js';

export function ensureTaskCompatibility(task: any): Task {
    // Handle legacy tasks without user context
    if (!task.creatorUserId) {
        task.creatorUserId = process.env.MCP_USER_ID || 'unknown';
    }
    
    if (!task.sharedWith) {
        task.sharedWith = [];
    }
    
    if (!task.contextType) {
        task.contextType = task.sharedWith.length > 0 ? 'shared' : 'user';
    }
    
    return task as Task;
}

export function isLegacyTask(task: any): boolean {
    return !task.creatorUserId || task.sharedWith === undefined;
}
```

---

## 6. Documentation Updates

### 6.1 API Documentation

**File**: `mcp-servers/scheduled-tasks/API.md` (UPDATE)

```markdown
# Scheduled Tasks MCP Server API

## User Context and Sharing

### Overview
The Scheduled Tasks MCP Server supports user context and sharing, allowing tasks to be created by one user and shared with others while maintaining proper data isolation.

### User Context Flow
1. **Task Creation**: User creates task through LibreChat
2. **Context Capture**: Server captures creator user ID and sharing information
3. **Task Execution**: When task triggers, original user context is passed to MCP servers
4. **Data Operations**: MCP servers operate with correct user context

### Tool Parameters

All tools now support enhanced user context:

```json
{
  "name": "create_once_task",
  "arguments": {
    "name": "Grocery Reminder",
    "message": "Check the grocery list",
    "delayMinutes": 60,
    "sharedWith": ["user456", "user789"]
  }
}
```

### Sharing Model

Tasks can be shared with specific users:
- `creatorUserId`: The user who created the task
- `sharedWith`: Array of user IDs who can access the task
- `contextType`: Either 'user' (private) or 'shared'

### Access Control

Users can access tasks if they are:
1. The creator of the task
2. Listed in the `sharedWith` array
3. Operating in a shared context with proper permissions
```

### 6.2 Configuration Guide

**File**: `mcp-servers/scheduled-tasks/CONFIGURATION.md` (UPDATE)

```markdown
# Configuration Guide

## User Context Configuration

### Environment Variables

```bash
# User context settings
MCP_USER_BASED=true                    # Enable user-based storage
MCP_USER_ID=default                    # Default user ID (fallback)

# Multi-tenant support (future)
MCP_TENANT_ISOLATION=true              # Enable tenant isolation
MCP_DEFAULT_TENANT=default             # Default tenant ID
```

### LibreChat Integration

```yaml
mcpServers:
  scheduled-tasks:
    command: "node"
    args: ["/path/to/scheduled-tasks/dist/index.js"]
    env:
      # ... existing configuration
      
      # User context settings
      MCP_USER_BASED: "true"
      MCP_TENANT_ISOLATION: "true"
```

### Sharing Configuration

Tasks support sharing through the `sharedWith` parameter:

```javascript
// Create shared task
await server.createTask({
  name: "Family Grocery List",
  message: "Update the grocery list",
  schedule: { type: "daily", time: "09:00" },
  sharedWith: ["spouse_user_id", "agent_user_id"]
});
```
```

---

## 7. Implementation Order

### Phase 1: Foundation (Days 1-3)
1. **Update Task Model** - Add user context fields
2. **Create User Context Utils** - Extraction and validation functions
3. **Update Task Manager** - Modify creation and access logic
4. **Migration Script** - Handle existing tasks

### Phase 2: LibreChat Integration (Days 4-6)
1. **Update External Message Processing** - Extract scheduled task context
2. **Modify MCP Manager** - Pass user context to MCP servers
3. **Update Service Layer** - Handle context in API calls
4. **Connection Patching** - Ensure context flows through

### Phase 3: MCP Server Updates (Days 7-9)
1. **Update Grocery List** - Handle user context extraction
2. **Modify Web UI Manager** - Support shared contexts
3. **Update Other MCP Servers** - Apply same patterns
4. **Backward Compatibility** - Ensure existing functionality works

### Phase 4: Testing & Validation (Days 10-12)
1. **Unit Tests** - Test user context extraction and validation
2. **Integration Tests** - Test full flow from task creation to execution
3. **End-to-End Tests** - Test shared context scenarios
4. **Performance Testing** - Ensure no degradation

### Phase 5: Documentation & Deployment (Days 13-14)
1. **API Documentation** - Update tool schemas and examples
2. **Configuration Guide** - Document new settings
3. **Migration Guide** - Help users upgrade
4. **Deployment Testing** - Verify in production-like environment

---

## 8. Critical Code Patterns

### 8.1 User Context Extraction Pattern

```typescript
// Standard pattern for all MCP servers
function extractUserContext(request: any): UserContext {
    const userId = request.params?.userId;
    const originalUserId = request.params?.originalUserId;
    const sharedWith = request.params?.sharedWith || [];
    const contextType = request.params?.contextType || 'user';
    const tenantId = request.params?.tenantId;
    
    const effectiveUserId = originalUserId || userId;
    const isSharedContext = !!originalUserId;
    
    if (!effectiveUserId) {
        throw new Error('No user context available in request');
    }
    
    return {
        userId: userId || 'unknown',
        originalUserId,
        sharedWith,
        contextType,
        tenantId,
        isSharedContext,
        effectiveUserId
    };
}
```

### 8.2 Access Validation Pattern

```typescript
// Standard pattern for access control
function validateUserAccess(resource: any, userContext: UserContext): boolean {
    // Creator access
    if (resource.creatorUserId === userContext.userId) {
        return true;
    }
    
    // Shared access
    if (resource.sharedWith?.includes(userContext.userId)) {
        return true;
    }
    
    // Original user access (from shared context)
    if (userContext.originalUserId === resource.creatorUserId) {
        return true;
    }
    
    return false;
}
```

### 8.3 Context Passing Pattern

```typescript
// Standard pattern for LibreChat integration
async function triggerWithContext(resource: any): Promise<void> {
    const payload = {
        // ... existing payload
        metadata: {
            // ... existing metadata
            originalUserId: resource.creatorUserId,
            sharedWith: resource.sharedWith,
            contextType: resource.contextType,
            tenantId: resource.tenantId,
            
            additional_instructions: `SHARED CONTEXT: This operates in ${resource.contextType} context. ` +
                                   `${resource.sharedWith.length > 0 ? `Shared with: ${resource.sharedWith.join(', ')}` : ''}`
        }
    };
    
    // ... send payload
}
```

---

## 9. Success Criteria

### 9.1 Functional Requirements
- ✅ Tasks store creator user ID and sharing information
- ✅ LibreChat passes original user context to MCP servers
- ✅ MCP servers operate with correct user context
- ✅ Shared tasks work across multiple users
- ✅ Access control prevents unauthorized access
- ✅ Backward compatibility maintained

### 9.2 Technical Requirements
- ✅ No breaking changes to existing APIs
- ✅ Performance impact < 10ms per request
- ✅ All existing tests continue to pass
- ✅ New functionality covered by tests
- ✅ Documentation updated and complete

### 9.3 User Experience Requirements
- ✅ Transparent sharing - users don't need to understand technical details
- ✅ Clear feedback about shared contexts
- ✅ Consistent behavior across all MCP servers
- ✅ Intuitive sharing syntax in tool calls

---

## 10. Risk Mitigation

### 10.1 Data Integrity Risks
- **Risk**: Existing tasks lose user context during migration
- **Mitigation**: Comprehensive migration script with backup creation
- **Validation**: Test migration on copy of production data

### 10.2 Performance Risks
- **Risk**: Additional user context processing slows down requests
- **Mitigation**: Efficient context extraction and caching
- **Validation**: Performance benchmarks before/after changes

### 10.3 Security Risks
- **Risk**: Users gain unauthorized access to shared resources
- **Mitigation**: Strict access validation at every operation
- **Validation**: Security testing with various user scenarios

### 10.4 Compatibility Risks
- **Risk**: Existing integrations break with new context requirements
- **Mitigation**: Backward compatibility wrappers and gradual rollout
- **Validation**: Test all existing functionality with new code

---

This implementation guide provides a comprehensive roadmap for adding user context passing to the scheduled tasks system. The approach prioritizes backward compatibility while enabling powerful sharing capabilities that will scale to multi-tenant SaaS deployment. 