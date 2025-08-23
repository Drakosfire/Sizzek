#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TaskManager } from './core/task-manager.js';
import { ScheduleValidator } from './core/schedule-validator.js';
import { LibreChatClient } from './http/librechat-client.js';
import { ScheduledTasksWebUIManager } from './web-ui-integration.js';
import { extractUserContext, validateUserAccess } from './utils/user-context.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generic, overrideable env loader
function loadEnv(serverLabel: string) {
    const candidates: string[] = [];
    if (process.env.ENV_PATH) candidates.push(process.env.ENV_PATH);

    // Simple local env files for development
    const dirCandidates = [
        path.resolve(__dirname, '..', '..'), // compiled dist/src -> project root
        path.resolve(__dirname, '..'),
    ];
    const fileCandidates = [
        '.env.local',
        '.env',
        process.env.NODE_ENV === 'production' ? '.env.production' : undefined,
    ].filter(Boolean) as string[];
    for (const dir of dirCandidates) {
        for (const file of fileCandidates) {
            candidates.push(path.join(dir, file));
        }
    }

    let usedPath: string | undefined;
    for (const p of candidates) {
        if (existsSync(p)) {
            dotenv.config({ path: p, override: true });
            usedPath = usedPath || p;
        }
    }
    if (!usedPath) dotenv.config();

    // Back-compat for URI naming
    if (!process.env.MONGO_URI && process.env.MONGODB_URI) {
        process.env.MONGO_URI = process.env.MONGODB_URI;
    }
    if (!process.env.MONGODB_URI && process.env.MONGO_URI) {
        process.env.MONGODB_URI = process.env.MONGO_URI;
    }

    // Check if we're in a container environment where .env.sizzek is loaded via env_file
    const envFileLoaded = process.env.MONGODB_CONNECTION_STRING || process.env.MONGO_URI;
    if (envFileLoaded && !usedPath) {
        usedPath = '(container env_file)';
    }

    console.error(`[${serverLabel}] Env loaded: ${usedPath || '(default)'}`);
}

loadEnv('Scheduled-Tasks');

// Environment variables validation
const LIBRECHAT_ENDPOINT = process.env.LIBRECHAT_ENDPOINT || 'http://localhost:3080';
const LIBRECHAT_API_KEY = process.env.LIBRECHAT_API_KEY;
const HTTP_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT || '30000');
const RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS || '3');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '1000');

// Debug logging
console.error('Environment variables loaded:');
console.error('LIBRECHAT_ENDPOINT:', LIBRECHAT_ENDPOINT);
console.error('LIBRECHAT_API_KEY:', LIBRECHAT_API_KEY ? '[PRESENT]' : '[MISSING]');
console.error('HTTP_TIMEOUT:', HTTP_TIMEOUT);
console.error('RETRY_ATTEMPTS:', RETRY_ATTEMPTS);
console.error('RETRY_DELAY:', RETRY_DELAY);
console.error('LIBRECHAT_AGENT_NAME:', process.env.LIBRECHAT_AGENT_NAME || '[NOT SET]');
console.error('LIBRECHAT_AGENT_ID:', process.env.LIBRECHAT_AGENT_ID || '[NOT SET]');
console.error('LIBRECHAT_AGENT_MODEL:', process.env.LIBRECHAT_AGENT_MODEL || '[NOT SET]');
console.error('MONGO_URI:', process.env.MONGO_URI ? '[PRESENT]' : '[NOT SET]');

if (!LIBRECHAT_API_KEY) {
    console.error('Warning: LIBRECHAT_API_KEY not set. Tasks will only log messages instead of triggering LibreChat.');
}

// Initialize User Lookup Service
import { createUserLookupService } from './http/user-lookup.js';

const userLookupService = process.env.MONGO_URI
    ? createUserLookupService()
    : undefined;

// Initialize LibreChat client if API key is available
const librechatClientConfig: any = {
    endpoint: LIBRECHAT_ENDPOINT,
    apiKey: LIBRECHAT_API_KEY,
    timeout: HTTP_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
    retryDelay: RETRY_DELAY,
    agentName: process.env.LIBRECHAT_AGENT_NAME || 'Sizzek'
};

if (userLookupService) {
    librechatClientConfig.userLookupService = userLookupService;
}

const librechatClient = LIBRECHAT_API_KEY ? new LibreChatClient(librechatClientConfig) : undefined;

// Extract user ID from environment for user-based storage (for future use)
// const extractUserId = (request: any): string | undefined => {
//     // Try multiple sources for user ID
//     if (request?.meta?.userId) return request.meta.userId;
//     if (request?.context?.userId) return request.context.userId;
//     if (request?.userId) return request.userId;
//     if (process.env.MCP_USER_ID) return process.env.MCP_USER_ID;
//     return undefined;
// };

// Initialize the task manager with LibreChat client and unified storage
const taskManager = new TaskManager(librechatClient, undefined, process.env.MCP_USER_ID, userLookupService);
const validator = new ScheduleValidator();

// Initialize the web UI manager
const webUIManager = new ScheduledTasksWebUIManager(taskManager);

// Create the MCP server
const server = new Server({
    name: "scheduled-tasks-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});

// Define the tools we'll expose
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "create_once_task",
                description: "Create a one-time task that executes after a specified delay from now. Use this for relative timing like 'in 30 minutes' or 'in 2 hours'.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task",
                            examples: ["Reminder to call John", "Meeting notification", "Exercise reminder"]
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the agent should do"
                        },
                        delayMinutes: {
                            type: "number",
                            minimum: 0.1,
                            description: "Delay in minutes from now. Supports decimals (e.g., 0.5 = 30 seconds, 1.5 = 90 seconds)",
                            examples: [1, 5, 30, 60, 120]
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers",
                            examples: ["Time to call John!", "Meeting starts in 5 minutes", "Time for your workout! 💪"]
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "delayMinutes", "message"]
                }
            },
            {
                name: "create_scheduled_task",
                description: "Create a one-time task that executes at a specific date and time. Use this for absolute timing like 'tomorrow at 3pm' or 'December 25th at 9am'.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task",
                            examples: ["Birthday reminder for Sarah", "Christmas morning greeting", "Project deadline alert"]
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the agent should do"
                        },
                        datetime: {
                            type: "string",
                            description: "Date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). Use server's local timezone.",
                            examples: ["2024-12-25T09:00:00", "2024-06-15T14:30:00", "2024-07-04T12:00:00"]
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers",
                            examples: ["Happy Birthday Sarah! 🎂", "Merry Christmas! 🎄", "Project deadline is today!"]
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "datetime", "message"]
                }
            },
            {
                name: "create_daily_task",
                description: "Create a task that executes daily at a specific time. Use this for daily routines and regular reminders.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task",
                            examples: ["Daily exercise reminder", "Morning standup", "End of day review"]
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the agent should do"
                        },
                        time: {
                            type: "string",
                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                            description: "Time in HH:MM format (24-hour)",
                            examples: ["08:00", "12:30", "17:45", "09:15"]
                        },
                        weekdaysOnly: {
                            type: "boolean",
                            description: "If true, only runs on weekdays (Monday-Friday)",
                            default: false
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers",
                            examples: ["Time for your daily exercise!", "Daily standup meeting starts now", "Time to review your day"]
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "time", "message"]
                }
            },
            {
                name: "create_weekly_task",
                description: "Create a task that executes weekly on a specific day and time. Use this for weekly meetings, reports, or routines.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task",
                            examples: ["Weekly team meeting", "Sunday meal prep reminder", "Friday report"]
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the agent should do"
                        },
                        dayOfWeek: {
                            type: "string",
                            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                            description: "Day of week to run (must be lowercase)",
                            examples: ["monday", "friday", "sunday"]
                        },
                        time: {
                            type: "string",
                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                            description: "Time in HH:MM format (24-hour)",
                            examples: ["09:00", "14:30", "18:00"]
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers",
                            examples: ["Weekly team meeting starts now!", "Time for Sunday meal prep", "Weekly report is due"]
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "dayOfWeek", "time", "message"]
                }
            },
            {
                name: "create_monthly_task",
                description: "Create a task that executes monthly on a specific date and time. Use this for monthly reports, bill reminders, or periodic reviews.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task",
                            examples: ["Monthly report", "Pay rent reminder", "Monthly review meeting"]
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the agent should do"
                        },
                        dayOfMonth: {
                            type: "integer",
                            minimum: 1,
                            maximum: 31,
                            description: "Day of month to run (1-31). For months with fewer days, will run on the last day of that month.",
                            examples: [1, 15, 28, 31]
                        },
                        time: {
                            type: "string",
                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                            description: "Time in HH:MM format (24-hour)",
                            examples: ["09:00", "10:30", "15:00"]
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers",
                            examples: ["Monthly report is due today", "Time to pay rent", "Monthly review meeting starts now"]
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "dayOfMonth", "time", "message"]
                }
            },
            {
                name: "create_interval_task",
                description: "Create a task that executes repeatedly at regular intervals. Use this for periodic checks, status updates, or recurring actions.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task",
                            examples: ["Health check", "Status update", "Periodic reminder"]
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the agent should do"
                        },
                        every: {
                            type: "integer",
                            minimum: 1,
                            description: "Number of units between executions",
                            examples: [5, 15, 30, 60, 120]
                        },
                        unit: {
                            type: "string",
                            enum: ["minutes", "hours", "days"],
                            description: "Unit of time for interval",
                            examples: ["minutes", "hours", "days"]
                        },
                        startTime: {
                            type: "string",
                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                            description: "Optional start time in HH:MM format for hour/day intervals"
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers",
                            examples: ["System health check", "Hourly status update", "Time for your break!"]
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "every", "unit", "message"]
                }
            },
            {
                name: "list_scheduled_tasks",
                description: "List all scheduled tasks with their current status",
                inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false
                }
            },
            {
                name: "get_scheduled_task",
                description: "Get details of a specific scheduled task",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "UUID of the task to retrieve"
                        }
                    },
                    required: ["taskId"]
                }
            },
            {
                name: "enable_scheduled_task",
                description: "Enable a disabled scheduled task",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "UUID of the task to enable"
                        }
                    },
                    required: ["taskId"]
                }
            },
            {
                name: "disable_scheduled_task",
                description: "Disable an active scheduled task",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "UUID of the task to disable"
                        }
                    },
                    required: ["taskId"]
                }
            },
            {
                name: "update_scheduled_task",
                description: "Update an existing scheduled task. Only provide the fields you want to change.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "UUID of the task to update"
                        },
                        name: {
                            type: "string",
                            description: "New name for the task"
                        },
                        description: {
                            type: "string",
                            description: "New description for the task"
                        },
                        schedule: {
                            type: "object",
                            description: "New schedule for the task. Can be any of the schedule types (once, scheduled, daily, weekly, monthly, interval)",
                            oneOf: [
                                {
                                    type: "object",
                                    properties: {
                                        type: { type: "string", enum: ["once"] },
                                        delayMinutes: { type: "number", minimum: 0.1 }
                                    },
                                    required: ["type", "delayMinutes"]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        type: { type: "string", enum: ["scheduled"] },
                                        datetime: { type: "string" }
                                    },
                                    required: ["type", "datetime"]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        type: { type: "string", enum: ["daily"] },
                                        time: { type: "string", pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$" },
                                        weekdaysOnly: { type: "boolean" }
                                    },
                                    required: ["type", "time"]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        type: { type: "string", enum: ["weekly"] },
                                        dayOfWeek: { type: "string", enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
                                        time: { type: "string", pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$" }
                                    },
                                    required: ["type", "dayOfWeek", "time"]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        type: { type: "string", enum: ["monthly"] },
                                        dayOfMonth: { type: "integer", minimum: 1, maximum: 31 },
                                        time: { type: "string", pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$" }
                                    },
                                    required: ["type", "dayOfMonth", "time"]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        type: { type: "string", enum: ["interval"] },
                                        every: { type: "integer", minimum: 1 },
                                        unit: { type: "string", enum: ["minutes", "hours", "days"] },
                                        startTime: { type: "string", pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$" }
                                    },
                                    required: ["type", "every", "unit"]
                                }
                            ]
                        },
                        message: {
                            type: "string",
                            description: "New message to send when task triggers"
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be enabled or disabled"
                        }
                    },
                    required: ["taskId"]
                }
            },
            {
                name: "delete_scheduled_task",
                description: "Permanently delete a scheduled task",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "UUID of the task to delete"
                        }
                    },
                    required: ["taskId"]
                }
            },
            {
                name: "get_web_ui",
                description: "Get the web UI HTML for displaying scheduled tasks in a browser interface",
                inputSchema: {
                    type: "object",
                    properties: {
                        userId: {
                            type: "string",
                            description: "User ID for the session"
                        }
                    },
                    additionalProperties: false
                }
            },
            {
                name: "web_ui_update",
                description: "Handle user interactions from the web UI interface",
                inputSchema: {
                    type: "object",
                    properties: {
                        action: {
                            type: "string",
                            description: "Action to perform (toggle, delete, run-now, etc.)",
                            enum: ["toggle", "delete", "run-now"]
                        },
                        data: {
                            type: "object",
                            description: "Data for the action (task ID, name, etc.)",
                            properties: {
                                id: { type: "string", description: "Task ID" },
                                name: { type: "string", description: "Task name" },
                                enabled: { type: "boolean", description: "Current enabled state" }
                            },
                            required: ["id"]
                        },
                        userId: {
                            type: "string",
                            description: "User ID for the session"
                        }
                    },
                    required: ["action", "data"]
                }
            }
        ]
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;

    // Extract user context from LibreChat
    const userContext = extractUserContext(request);

    console.log(`[${name}] Request from user: ${userContext.userId}, effective: ${userContext.effectiveUserId}, shared: ${userContext.isSharedContext}`);

    if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
    }

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
                            `Shared with: ${task.sharedWith?.join(', ') || 'None'}\n` +
                            `Context: ${task.contextType}\n` +
                            `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                            `Status: ${task.status}\n` +
                            `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                            `Enabled: ${task.enabled}\n` +
                            `Integration: ${librechatStatus}`
                    }]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "create_scheduled_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: { type: "scheduled", datetime: args.datetime },
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined
                }, userContext);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Created scheduled task: "${task.name}"\n` +
                                `ID: ${task.id}\n` +
                                `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                                `Status: ${task.status}\n` +
                                `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                                `Enabled: ${task.enabled}\n` +
                                `Integration: ${librechatStatus}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "create_daily_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: { type: "daily", time: args.time, weekdaysOnly: args.weekdaysOnly },
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined
                }, userContext);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Created scheduled task: "${task.name}"\n` +
                                `ID: ${task.id}\n` +
                                `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                                `Status: ${task.status}\n` +
                                `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                                `Enabled: ${task.enabled}\n` +
                                `Integration: ${librechatStatus}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "create_weekly_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: { type: "weekly", dayOfWeek: args.dayOfWeek, time: args.time },
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined
                }, userContext);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Created scheduled task: "${task.name}"\n` +
                                `ID: ${task.id}\n` +
                                `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                                `Status: ${task.status}\n` +
                                `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                                `Enabled: ${task.enabled}\n` +
                                `Integration: ${librechatStatus}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "create_monthly_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: { type: "monthly", dayOfMonth: args.dayOfMonth, time: args.time },
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined
                }, userContext);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Created scheduled task: "${task.name}"\n` +
                                `ID: ${task.id}\n` +
                                `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                                `Status: ${task.status}\n` +
                                `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                                `Enabled: ${task.enabled}\n` +
                                `Integration: ${librechatStatus}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "create_interval_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: { type: "interval", every: args.every, unit: args.unit, startTime: args.startTime },
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined
                }, userContext);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Created scheduled task: "${task.name}"\n` +
                                `ID: ${task.id}\n` +
                                `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                                `Status: ${task.status}\n` +
                                `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                                `Enabled: ${task.enabled}\n` +
                                `Integration: ${librechatStatus}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error creating scheduled task:', error);
                throw new Error(`Failed to create scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "list_scheduled_tasks":
            try {
                const allTasks = taskManager.getAllTasks();

                // Filter tasks based on user access
                const accessibleTasks = allTasks.filter(task =>
                    validateUserAccess(task, userContext)
                );

                if (accessibleTasks.length === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: 'No scheduled tasks found.'
                        }]
                    };
                }

                const taskList = accessibleTasks.map(task => {
                    const status = task.enabled ? '✅' : '⏸️';
                    const nextRun = task.nextRun ? task.nextRun.toISOString() : 'Not scheduled';
                    const schedule = validator.generateHumanReadable(task.schedule);
                    const contextInfo = task.contextType === 'shared' ? ` (shared with ${task.sharedWith?.length || 0} users)` : '';
                    return `${status} ${task.name}${contextInfo}\n` +
                        `   ID: ${task.id}\n` +
                        `   Creator: ${task.creatorUserId}\n` +
                        `   Context: ${task.contextType}\n` +
                        `   Schedule: ${schedule}\n` +
                        `   Status: ${task.status}\n` +
                        `   Next run: ${nextRun}\n` +
                        `   Runs: ${task.successfulRuns}/${task.totalRuns}`;
                }).join('\n\n');

                return {
                    content: [{
                        type: "text",
                        text: `📋 Scheduled Tasks (${accessibleTasks.length}):\n\n${taskList}`
                    }
                    ]
                };
            } catch (error) {
                console.error('Error listing scheduled tasks:', error);
                throw new Error(`Failed to list scheduled tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "get_scheduled_task":
            try {
                const task = taskManager.getTask(args.taskId);

                if (!task) {
                    throw new Error(`Task not found: ${args.taskId}`);
                }

                // Check user access
                if (!validateUserAccess(task, userContext)) {
                    throw new Error(`Access denied: You don't have permission to view this task`);
                }

                const schedule = validator.generateHumanReadable(task.schedule);
                const details = `📄 Task Details:\n` +
                    `Name: ${task.name}\n` +
                    `ID: ${task.id}\n` +
                    `Description: ${task.description || 'None'}\n` +
                    `Creator: ${task.creatorUserId}\n` +
                    `Context: ${task.contextType}\n` +
                    `Shared with: ${task.sharedWith?.join(', ') || 'None'}\n` +
                    `Schedule: ${schedule}\n` +
                    `Message: ${task.message}\n` +
                    `Status: ${task.status}\n` +
                    `Enabled: ${task.enabled}\n` +
                    `Created: ${task.createdAt.toISOString()}\n` +
                    `Updated: ${task.updatedAt.toISOString()}\n` +
                    `Last run: ${task.lastRun?.toISOString() || 'Never'}\n` +
                    `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                    `Total runs: ${task.totalRuns}\n` +
                    `Successful: ${task.successfulRuns}\n` +
                    `Failed: ${task.failedRuns}`;

                const finalDetails = task.lastError ? `${details}\nLast error: ${task.lastError}` : details;

                return {
                    content: [{
                        type: "text",
                        text: finalDetails
                    }]
                };
            } catch (error) {
                console.error('Error getting scheduled task:', error);
                throw new Error(`Failed to get scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "enable_scheduled_task":
            try {
                await taskManager.enableTask(args.taskId);

                const task = taskManager.getTask(args.taskId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Enabled task: "${task?.name}"\nNext run: ${task?.nextRun?.toISOString() || 'Not scheduled'}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error enabling scheduled task:', error);
                throw new Error(`Failed to enable scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "disable_scheduled_task":
            try {
                await taskManager.disableTask(args.taskId);

                const task = taskManager.getTask(args.taskId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `⏸️ Disabled task: "${task?.name}"`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error disabling scheduled task:', error);
                throw new Error(`Failed to disable scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "update_scheduled_task":
            try {
                const updateRequest: any = {};
                if (args.name !== undefined) updateRequest.name = args.name;
                if (args.description !== undefined) updateRequest.description = args.description;
                if (args.schedule !== undefined) updateRequest.schedule = args.schedule;
                if (args.message !== undefined) updateRequest.message = args.message;
                if (args.enabled !== undefined) updateRequest.enabled = args.enabled;

                const task = await taskManager.updateTask(args.taskId, updateRequest);

                const librechatStatus = librechatClient ? 'LibreChat integration enabled' : 'LibreChat integration disabled (no API key)';

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Updated scheduled task: "${task.name}"\n` +
                                `ID: ${task.id}\n` +
                                `Schedule: ${validator.generateHumanReadable(task.schedule)}\n` +
                                `Status: ${task.status}\n` +
                                `Next run: ${task.nextRun?.toISOString() || 'Not scheduled'}\n` +
                                `Enabled: ${task.enabled}\n` +
                                `Integration: ${librechatStatus}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error updating scheduled task:', error);
                throw new Error(`Failed to update scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "delete_scheduled_task":
            try {
                const task = taskManager.getTask(args.taskId);

                if (!task) {
                    throw new Error(`Task not found: ${args.taskId}`);
                }

                const taskName = task.name;
                await taskManager.deleteTask(args.taskId);

                return {
                    content: [
                        {
                            type: "text",
                            text: `🗑️ Deleted task: "${taskName}"`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error deleting scheduled task:', error);
                throw new Error(`Failed to delete scheduled task: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "get_web_ui":
            try {
                const userId = args.userId || userContext.effectiveUserId || 'default';
                return await webUIManager.handleGetWebUI(userId);
            } catch (error) {
                console.error('Error getting web UI:', error);
                throw new Error(`Failed to get web UI: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        case "web_ui_update":
            try {
                const { action, data } = args;
                const result = await webUIManager['handleUIUpdate'](action, data, userContext.effectiveUserId);

                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? `✅ ${result.message || 'Action completed successfully'}`
                                : `❌ ${result.error || 'Action failed'}`
                        }
                    ]
                };
            } catch (error) {
                console.error('Error handling web UI update:', error);
                throw new Error(`Failed to handle web UI update: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});

// Start the server
async function main() {
    console.error('🚀 Starting Scheduled Tasks MCP Server...');

    try {
        // Initialize the task manager with unified storage
        console.error('🔧 Initializing TaskManager...');
        await taskManager.initialize();
        console.error('✅ TaskManager initialization completed');

        console.error('🔌 Setting up MCP transport...');
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("✅ Scheduled Tasks MCP Server running on stdio");

        // Handle process termination with proper cleanup
        const cleanup = async () => {
            console.error('🛑 Shutting down server...');
            try {
                await taskManager.cleanup();
                if (userLookupService) {
                    await userLookupService.disconnect();
                }
                console.error('✅ Server cleanup completed');
            } catch (cleanupError) {
                console.error('❌ Error during cleanup:', cleanupError);
            }
            process.exit(0);
        };

        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
        process.on('beforeExit', cleanup);

    } catch (error) {
        console.error('❌ Failed to initialize server:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
        throw error;
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
}); 