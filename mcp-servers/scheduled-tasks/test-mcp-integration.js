#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Simple test to verify the scheduled tasks server with web UI integration
async function testMCPIntegration() {
    console.log('🧪 Testing MCP Scheduled Tasks Server Integration...\n');

    try {
        // Import the compiled server modules
        const { TaskManager } = await import('./dist/core/task-manager.js');
        const { ScheduleValidator } = await import('./dist/core/schedule-validator.js');

        console.log('✅ Core modules imported successfully');

        // Initialize components
        const taskManager = new TaskManager();
        await taskManager.initialize();
        const validator = new ScheduleValidator();

        console.log('✅ TaskManager initialized');

        // Create test server
        const server = new Server({
            name: "test-scheduled-tasks-server",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });

        // Test basic functionality without web UI first
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "create_once_task",
                        description: "Create a one-time task",
                        inputSchema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                delayMinutes: { type: "number", minimum: 0.1 },
                                message: { type: "string" }
                            },
                            required: ["name", "delayMinutes", "message"]
                        }
                    },
                    {
                        name: "list_scheduled_tasks",
                        description: "List all scheduled tasks",
                        inputSchema: { type: "object", properties: {} }
                    }
                ]
            };
        });

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "create_once_task":
                    const task = await taskManager.createTask({
                        name: args.name,
                        description: undefined,
                        schedule: { type: "once", delayMinutes: args.delayMinutes },
                        message: args.message,
                        enabled: true
                    });

                    return {
                        content: [{
                            type: "text",
                            text: `Created task: ${task.name} (ID: ${task.id})`
                        }]
                    };

                case "list_scheduled_tasks":
                    const tasks = taskManager.getAllTasks();
                    return {
                        content: [{
                            type: "text",
                            text: `Found ${tasks.length} tasks`
                        }]
                    };

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });

        // Test list tools
        const toolsResponse = await server.request({
            method: "tools/list",
            params: {}
        }, ListToolsRequestSchema);

        console.log('✅ Tools list request successful');
        console.log(`   Found ${toolsResponse.tools.length} tools`);

        // Test create task
        const createResponse = await server.request({
            method: "tools/call",
            params: {
                name: "create_once_task",
                arguments: {
                    name: "Test Task",
                    delayMinutes: 1,
                    message: "Hello World!"
                }
            }
        }, CallToolRequestSchema);

        console.log('✅ Create task request successful');
        console.log(`   Response: ${createResponse.content[0].text}`);

        // Test list tasks
        const listResponse = await server.request({
            method: "tools/call",
            params: {
                name: "list_scheduled_tasks",
                arguments: {}
            }
        }, CallToolRequestSchema);

        console.log('✅ List tasks request successful');
        console.log(`   Response: ${listResponse.content[0].text}`);

        // Cleanup
        await taskManager.cleanup();
        console.log('✅ Cleanup completed');

        console.log('\n🎉 Basic MCP integration test passed!');
        console.log('\n📝 Next steps:');
        console.log('   1. Build the project: npm run build');
        console.log('   2. The web UI integration should work once mcp-web-ui dependencies are resolved');
        console.log('   3. Test with LibreChat or another MCP client that supports the get_web_ui tool');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

testMCPIntegration(); 