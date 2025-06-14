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
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '..', '.env');
console.error('Loading .env file from:', envPath);
dotenv.config({ path: envPath });

// Environment variables validation
const LIBRECHAT_ENDPOINT = process.env.LIBRECHAT_ENDPOINT || 'http://localhost:3080';
const LIBRECHAT_API_KEY = process.env.LIBRECHAT_API_KEY;
const LIBRECHAT_CONVERSATION_ID = process.env.LIBRECHAT_CONVERSATION_ID;
const HTTP_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT || '30000');
const RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS || '3');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '1000');

// Debug logging
console.error('Environment variables loaded:');
console.error('LIBRECHAT_ENDPOINT:', LIBRECHAT_ENDPOINT);
console.error('LIBRECHAT_API_KEY:', LIBRECHAT_API_KEY ? '✓ Set' : '✗ Not set');
console.error('LIBRECHAT_CONVERSATION_ID:', LIBRECHAT_CONVERSATION_ID || 'Not set (optional)');

if (!LIBRECHAT_API_KEY) {
    console.error('Warning: LIBRECHAT_API_KEY not set. Tasks will only log messages instead of triggering LibreChat.');
}

// Initialize LibreChat client if API key is available
const librechatClient = LIBRECHAT_API_KEY ? new LibreChatClient({
    endpoint: LIBRECHAT_ENDPOINT,
    apiKey: LIBRECHAT_API_KEY,
    conversationId: LIBRECHAT_CONVERSATION_ID || undefined,
    timeout: HTTP_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
    retryDelay: RETRY_DELAY
}) : undefined;

// Initialize the task manager with LibreChat client
const taskManager = new TaskManager(librechatClient);
const validator = new ScheduleValidator();

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
                name: "create_scheduled_task",
                description: "Create a new scheduled task that will send a message back to the agent at specified times. Use this to schedule reminders, periodic actions, or one-time future messages.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "A descriptive name for the task"
                        },
                        description: {
                            type: "string",
                            description: "Optional description of what the task does"
                        },
                        schedule: {
                            type: "object",
                            description: "Schedule configuration. CRITICAL: Use 'once' for ONE-TIME tasks (confirmation messages, reminders, single notifications). Use 'interval' for REPEATING tasks. For one-time tasks after N minutes, use: {type: 'once', delayMinutes: N}. For repeating tasks every N minutes, use: {type: 'interval', every: N, unit: 'minutes'}.",
                            properties: {
                                type: {
                                    type: "string",
                                    enum: ["once", "interval", "daily", "weekly", "monthly"],
                                    description: "CRITICAL: Use 'once' for confirmation messages, one-time reminders, or any single execution. Use 'interval' only for repeating tasks."
                                }
                            },
                            required: ["type"],
                            anyOf: [
                                {
                                    properties: {
                                        type: { const: "once" },
                                        delayMinutes: {
                                            type: "number",
                                            minimum: 0.1,
                                            description: "Delay in minutes from current server time. Supports decimals (e.g., 0.5 = 30 seconds, 1.5 = 90 seconds)"
                                        }
                                    },
                                    required: ["type", "delayMinutes"],
                                    additionalProperties: false
                                },
                                {
                                    properties: {
                                        type: { const: "interval" },
                                        every: {
                                            type: "integer",
                                            minimum: 1,
                                            description: "Number of units between executions"
                                        },
                                        unit: {
                                            type: "string",
                                            enum: ["minutes", "hours", "days"],
                                            description: "Unit of time for interval"
                                        },
                                        startTime: {
                                            type: "string",
                                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                                            description: "Optional start time in HH:MM format"
                                        }
                                    },
                                    required: ["type", "every", "unit"],
                                    additionalProperties: false
                                },
                                {
                                    properties: {
                                        type: { const: "daily" },
                                        time: {
                                            type: "string",
                                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                                            description: "Time in HH:MM format (24-hour)"
                                        },
                                        weekdaysOnly: {
                                            type: "boolean",
                                            description: "If true, only runs on weekdays (Mon-Fri)"
                                        }
                                    },
                                    required: ["type", "time"],
                                    additionalProperties: false
                                },
                                {
                                    properties: {
                                        type: { const: "weekly" },
                                        dayOfWeek: {
                                            type: "string",
                                            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                                            description: "Day of week to run"
                                        },
                                        time: {
                                            type: "string",
                                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                                            description: "Time in HH:MM format (24-hour)"
                                        }
                                    },
                                    required: ["type", "dayOfWeek", "time"],
                                    additionalProperties: false
                                },
                                {
                                    properties: {
                                        type: { const: "monthly" },
                                        dayOfMonth: {
                                            type: "integer",
                                            minimum: 1,
                                            maximum: 31,
                                            description: "Day of month to run (1-31)"
                                        },
                                        time: {
                                            type: "string",
                                            pattern: "^([0-1][0-9]|2[0-3]):([0-5][0-9])$",
                                            description: "Time in HH:MM format (24-hour)"
                                        }
                                    },
                                    required: ["type", "dayOfMonth", "time"],
                                    additionalProperties: false
                                }
                            ],
                            examples: [
                                { type: "once", delayMinutes: 1 },
                                { type: "once", delayMinutes: 0.5 },
                                { type: "once", delayMinutes: 5 },
                                { type: "interval", every: 15, unit: "minutes" },
                                { type: "daily", time: "08:00" },
                                { type: "weekly", dayOfWeek: "monday", time: "09:00" },
                                { type: "daily", time: "09:00", weekdaysOnly: true }
                            ]
                        },
                        message: {
                            type: "string",
                            description: "Message to send when task triggers"
                        },
                        enabled: {
                            type: "boolean",
                            description: "Whether the task should be active immediately",
                            default: true
                        }
                    },
                    required: ["name", "schedule", "message"]
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
            }
        ]
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;

    if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
    }

    switch (name) {
        case "create_scheduled_task":
            try {
                const task = await taskManager.createTask({
                    name: args.name,
                    description: args.description || undefined,
                    schedule: args.schedule,
                    message: args.message,
                    enabled: args.enabled !== undefined ? args.enabled : undefined
                });

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
                const tasks = taskManager.getAllTasks();

                if (tasks.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: 'No scheduled tasks found.'
                            }
                        ]
                    };
                }

                const taskList = tasks.map(task => {
                    const status = task.enabled ? '✅' : '⏸️';
                    const nextRun = task.nextRun ? task.nextRun.toISOString() : 'Not scheduled';
                    const schedule = validator.generateHumanReadable(task.schedule);
                    return `${status} ${task.name}\n` +
                        `   ID: ${task.id}\n` +
                        `   Schedule: ${schedule}\n` +
                        `   Status: ${task.status}\n` +
                        `   Next run: ${nextRun}\n` +
                        `   Runs: ${task.successfulRuns}/${task.totalRuns}`;
                }).join('\n\n');

                return {
                    content: [
                        {
                            type: "text",
                            text: `📋 Scheduled Tasks (${tasks.length}):\n\n${taskList}`
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

                const schedule = validator.generateHumanReadable(task.schedule);
                const details = `📄 Task Details:\n` +
                    `Name: ${task.name}\n` +
                    `ID: ${task.id}\n` +
                    `Description: ${task.description || 'None'}\n` +
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
                    content: [
                        {
                            type: "text",
                            text: finalDetails
                        }
                    ]
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

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Scheduled Tasks MCP Server running on stdio");

    // Handle process termination
    process.on('SIGTERM', () => {
        console.error('Received SIGTERM signal');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.error('Received SIGINT signal');
        process.exit(0);
    });
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
}); 