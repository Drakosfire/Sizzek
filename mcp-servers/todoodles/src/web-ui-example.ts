#!/usr/bin/env node

/**
 * Example integration of Todoodles with Web UI
 * 
 * This shows how to add web UI functionality to any MCP server
 * with minimal changes to the main server code.
 * 
 * Usage:
 * 1. Import your existing MCP server components
 * 2. Create the web UI integration module
 * 3. Add one additional tool for web UI
 * 4. Handle the tool in your existing tool handler
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import your existing todoodles manager
import { UserAwareTodoodlesManager } from './index.js';

// Import the clean web UI integration
import { TodoodlesWebUIManager } from './web-ui-integration.js';

// Enhanced logging
function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}][${level}][TodoodlesWebUI-Example] ${message}`);
}

// Create your existing components
const todoodlesManager = new UserAwareTodoodlesManager();

// Create the web UI integration (separate, clean)
const webUIManager = new TodoodlesWebUIManager(todoodlesManager);

// Create MCP server
const server = new Server(
    {
        name: "todoodles-with-webui",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List tools - add the web UI tool to your existing tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            // ... all your existing todoodles tools would go here ...

            // Add the web UI tool (just one additional tool!)
            webUIManager.getMCPToolDefinition(),

            // Example of existing tools structure:
            {
                name: "add_todoodle",
                description: "Add a new todoodle with optional category, priority, and due date",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: { type: "string", description: "The todoodle text" },
                        category: { type: "string", description: "Optional category" },
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "Priority level (default: medium)"
                        },
                        dueDate: {
                            type: "string",
                            description: "Due date in YYYY-MM-DD format"
                        }
                    },
                    required: ["text"],
                    additionalProperties: false
                }
            }
        ],
    };
});

// Handle tools - add web UI handling to your existing handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const userId = extractUserId(request) || 'default';

    try {
        // Handle web UI tool call (just one additional case!)
        if (request.params.name === "get_web_ui") {
            return await webUIManager.handleGetWebUI(userId);
        }

        // Handle all your existing tools
        switch (request.params.name) {
            case "add_todoodle":
                // Your existing add_todoodle logic
                const { text, category, priority = 'medium', dueDate } = request.params.arguments as any;
                const todoodle = await todoodlesManager.addTodo(text, category, priority, dueDate, userId);
                return {
                    content: [{
                        type: "text",
                        text: `Todoodle added: ${todoodle.text} (ID: ${todoodle.id})`
                    }]
                };

            // ... all your other existing tool cases ...

            default:
                throw new Error(`Unknown tool: ${request.params.name}`);
        }
    } catch (error: any) {
        log('ERROR', `Tool ${request.params.name} failed: ${error.message}`);
        return {
            content: [{
                type: "text",
                text: `Error: ${error.message}`
            }],
            isError: true
        };
    }
});

// Utility function to extract user ID (your existing function)
function extractUserId(request: any): string | undefined {
    return request.meta?.user_id ||
        request.headers?.['x-user-id'] ||
        request.context?.user_id ||
        process.env.MCP_USER_ID ||
        undefined;
}

// Cleanup on exit
process.on('SIGINT', async () => {
    log('INFO', 'Shutting down...');
    await webUIManager.cleanup();
    await todoodlesManager.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('INFO', 'Shutting down...');
    await webUIManager.cleanup();
    await todoodlesManager.cleanup();
    process.exit(0);
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log('INFO', 'Todoodles MCP Server with Web UI started successfully');

    // Log web UI stats periodically for debugging
    setInterval(async () => {
        const stats = await webUIManager.getWebUIStats();
        if (stats.totalActiveSessions > 0) {
            log('INFO', `Web UI Stats: ${stats.totalActiveSessions} active sessions`);
        }
    }, 60000); // Every minute
}

main().catch((error) => {
    log('ERROR', `Failed to start server: ${error.message}`);
    process.exit(1);
}); 