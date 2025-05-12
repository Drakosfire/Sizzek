#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use environment variable for file path, with a clear error if not set
const TODOS_FILE_PATH = process.env.TODOS_FILE_PATH;
if (!TODOS_FILE_PATH) {
    console.error('Error: TODOS_FILE_PATH environment variable is not set');
    console.error('Please set TODOS_FILE_PATH in your environment or LibreChat configuration');
    process.exit(1);
}

// Now we know TODOS_FILE_PATH is defined, we can use it safely
const todosFilePath: string = TODOS_FILE_PATH;

console.error(`Todoodles MCP Server starting...`);
console.error(`Todos will be saved to: ${todosFilePath}`);

// Simple interface for our todo items
interface TodoodleItem {
    id: string;
    text: string;
    createdAt: string;
    completed: boolean;
    completedAt?: string;
    timeToComplete?: number; // in milliseconds
}

// Our todo list manager
class TodoodleListManager {
    private todoodles: TodoodleItem[] = [];
    private lastId: number = 0;

    constructor() {
        this.load().catch(error => {
            console.error('Error loading todoodles:', error);
        });
    }

    private async load(): Promise<void> {
        try {
            console.error(`Loading todoodles from ${todosFilePath}`);

            // Ensure the directory exists
            const dirPath = path.dirname(todosFilePath);
            try {
                await fs.access(dirPath);
            } catch (error) {
                console.error(`Directory ${dirPath} does not exist, creating it...`);
                await fs.mkdir(dirPath, { recursive: true });
            }

            // Try to read the file
            try {
                const data = await fs.readFile(todosFilePath, 'utf-8');
                this.todoodles = JSON.parse(data);
                // Validate the data is an array
                if (!Array.isArray(this.todoodles)) {
                    console.error('Invalid todoodles data format, initializing with empty array');
                    this.todoodles = [];
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    console.error(`No existing todoodles file found at ${todosFilePath}, creating new file`);
                    this.todoodles = [];
                    // Initialize the file with an empty array
                    await fs.writeFile(todosFilePath, JSON.stringify(this.todoodles, null, 2));
                } else if (error instanceof SyntaxError) {
                    console.error('Invalid JSON in todoodles file, initializing with empty array');
                    this.todoodles = [];
                    // Reinitialize the file with an empty array
                    await fs.writeFile(todosFilePath, JSON.stringify(this.todoodles, null, 2));
                } else {
                    throw error;
                }
            }

            // Find the highest ID in existing todoodles
            this.lastId = this.todoodles.reduce((max, todoodle) => {
                const id = parseInt(todoodle.id);
                return id > max ? id : max;
            }, 0);
            console.error(`Loaded ${this.todoodles.length} todoodles, last ID: ${this.lastId}`);
        } catch (error) {
            console.error('Error loading todoodles:', error);
            // Initialize with empty state if there's an error
            this.todoodles = [];
            this.lastId = 0;
            // Try to save the empty state
            try {
                await fs.writeFile(todosFilePath, JSON.stringify(this.todoodles, null, 2));
            } catch (saveError) {
                console.error('Failed to save empty todoodles state:', saveError);
            }
        }
    }

    private async save(): Promise<void> {
        try {
            console.error(`Saving ${this.todoodles.length} todoodles to ${todosFilePath}`);
            await fs.writeFile(todosFilePath, JSON.stringify(this.todoodles, null, 2));
            console.error('Todoodles saved successfully');
        } catch (error) {
            console.error('Error saving todoodles:', error);
            throw error;
        }
    }

    async add(text: string): Promise<TodoodleItem> {
        this.lastId += 1;
        const todoodle: TodoodleItem = {
            id: this.lastId.toString(),
            text,
            createdAt: new Date().toISOString(),
            completed: false
        };
        this.todoodles.push(todoodle);
        await this.save();
        console.error(`📝 Added new todoodle with ID ${todoodle.id}: "${todoodle.text}"`);
        return todoodle;
    }

    async completeById(id: string): Promise<TodoodleItem | null> {
        const todoodle = this.todoodles.find(t => t.id === id);
        if (!todoodle || todoodle.completed) {
            return null;
        }

        const now = new Date();
        todoodle.completed = true;
        todoodle.completedAt = now.toISOString();
        todoodle.timeToComplete = now.getTime() - new Date(todoodle.createdAt).getTime();
        await this.save();
        return todoodle;
    }

    get(): TodoodleItem[] {
        return [...this.todoodles].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    getToday(): TodoodleItem[] {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.get().filter(todoodle =>
            new Date(todoodle.createdAt) >= today
        );
    }

    getAll(): TodoodleItem[] {
        return this.get();
    }

    getIncomplete(): TodoodleItem[] {
        return this.get().filter(todoodle => !todoodle.completed);
    }

    search(query: string): TodoodleItem[] {
        // Simple case-insensitive search
        const searchTerms = query.toLowerCase().split(/\s+/);
        return this.todoodles.filter(todoodle => {
            const todoodleText = todoodle.text.toLowerCase();
            return searchTerms.every(term => todoodleText.includes(term));
        });
    }

    async completeByText(text: string): Promise<TodoodleItem | null> {
        const matches = this.search(text);
        if (matches.length === 0) {
            return null;
        }
        // If multiple matches, complete the most recent one
        const todoodleToComplete = matches[0];
        return this.completeById(todoodleToComplete.id);
    }

    async deleteById(id: string): Promise<boolean> {
        const initialLength = this.todoodles.length;
        this.todoodles = this.todoodles.filter(t => t.id !== id);
        if (this.todoodles.length !== initialLength) {
            await this.save();
            return true;
        }
        return false;
    }
}

const todoodleManager = new TodoodleListManager();

// Create the MCP server
const server = new Server({
    name: "todoodle-server",
    version: "0.1.0",
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
                name: "add",
                description: "Add a new todoodle item to the list",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "The text of the todoodle item"
                        },
                    },
                    required: ["text"],
                },
            },
            {
                name: "get_today",
                description: "Get all todoodle items created today, ordered from newest to oldest",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get_all",
                description: "Get all todoodle items, ordered from newest to oldest",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "complete",
                description: "Mark a todoodle item as completed",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the todoodle item to complete"
                        },
                    },
                    required: ["id"],
                },
            },
            {
                name: "get_incomplete",
                description: "Get all incomplete todoodle items, ordered from newest to oldest",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "search",
                description: "Search for todoodles by text content",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query to match against todoodle text"
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "complete_by_text",
                description: "Mark a todoodle as completed by searching for its text content",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "The text content to search for and complete"
                        },
                    },
                    required: ["text"],
                },
            },
            {
                name: "delete",
                description: "Delete a todoodle by its ID",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the todoodle to delete"
                        },
                    },
                    required: ["id"],
                },
            },
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
    }

    switch (name) {
        case "add":
            const todoodle = await todoodleManager.add(args.text as string);
            return {
                content: [{
                    type: "text",
                    text: `📝 Added todoodle: "${todoodle.text}" (created at ${new Date(todoodle.createdAt).toLocaleString()})`
                }]
            };
        case "get_today":
            const todayTodoodles = todoodleManager.getToday();
            if (todayTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📅 No todoodles for today!"
                    }]
                };
            }
            const todaySummary = todayTodoodles.map(todoodle => {
                const status = todoodle.completed
                    ? `✅ Completed in ${Math.round(todoodle.timeToComplete! / 1000 / 60)} minutes`
                    : "⏳ Pending";
                return `- ID: ${todoodle.id}, ${todoodle.text} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `📅 Today's todoodles:\n${todaySummary}`
                }]
            };
        case "get_all":
            const allTodoodles = todoodleManager.getAll();
            if (allTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📋 No todoodles found!"
                    }]
                };
            }
            const allSummary = allTodoodles.map(todoodle => {
                const status = todoodle.completed
                    ? `✅ Completed in ${Math.round(todoodle.timeToComplete! / 1000 / 60)} minutes`
                    : "⏳ Pending";
                return `- ID: ${todoodle.id}, ${todoodle.text} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `📋 All todoodles:\n${allSummary}`
                }]
            };
        case "complete":
            const completedTodoodleById = await todoodleManager.completeById(args.id as string);
            if (!completedTodoodleById) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ Todoodle not found or already completed"
                    }]
                };
            }
            return {
                content: [{
                    type: "text",
                    text: `🎉 Completed todoodle: "${completedTodoodleById.text}" (ID: ${completedTodoodleById.id}, took ${Math.round(completedTodoodleById.timeToComplete! / 1000 / 60)} minutes)`
                }]
            };
        case "get_incomplete":
            const incompleteTodoodles = todoodleManager.getIncomplete();
            if (incompleteTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📝 No incomplete todoodles found!"
                    }]
                };
            }
            const incompleteSummary = incompleteTodoodles.map(todoodle =>
                `- ID: ${todoodle.id}, ${todoodle.text} (created at ${new Date(todoodle.createdAt).toLocaleString()})`
            ).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `📝 Incomplete todoodles:\n${incompleteSummary}`
                }]
            };
        case "search":
            const matches = todoodleManager.search(args.query as string);
            if (matches.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "🔍 No matching todoodles found"
                    }]
                };
            }
            const searchResults = matches.map(todoodle =>
                `- ID: ${todoodle.id}, Text: "${todoodle.text}" (${todoodle.completed ? '✅ Completed' : '⏳ Pending'})`
            ).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `🔍 Found ${matches.length} matching todoodles:\n${searchResults}`
                }]
            };
        case "complete_by_text":
            const completedTodoodleByText = await todoodleManager.completeByText(args.text as string);
            if (!completedTodoodleByText) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ No matching todoodle found to complete"
                    }]
                };
            }
            return {
                content: [{
                    type: "text",
                    text: `🎉 Completed todoodle: "${completedTodoodleByText.text}" (ID: ${completedTodoodleByText.id}, took ${Math.round(completedTodoodleByText.timeToComplete! / 1000 / 60)} minutes)`
                }]
            };
        case "delete":
            const deleted = await todoodleManager.deleteById(args.id as string);
            if (!deleted) {
                return {
                    content: [{
                        type: "text",
                        text: "🗑️ Todoodle deleted successfully (ID: " + args.id + ")"
                    }]
                };
            }
            return {
                content: [{
                    type: "text",
                    text: "🗑️ Todoodle deleted successfully (ID: " + args.id + ")"
                }]
            };
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Todo MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
}); 