#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StorageFactory, UserStorageInterface } from '@sizzek/mcp-data';

console.error(`User-Aware Todoodles MCP Server starting...`);

// Enhanced Todo interface with user context
interface TodoodleItem {
    id: string;
    text: string;
    createdAt: string;
    completed: boolean;
    completedAt?: string;
    timeToComplete?: number;
    category?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: string;
    userId?: string; // Track which user created this todo
}

interface TodoodleList {
    todos: TodoodleItem[];
    lastId: number;
}

/**
 * User-Aware Todoodles Manager
 * Each user gets their own isolated todo list
 */
class UserAwareTodoodleManager {
    private storageManagers: Map<string, UserStorageInterface<TodoodleList>> = new Map();
    private defaultUserId = 'default';

    /**
     * Get or create a storage manager for a specific user
     */
    private getStorageManager(userId?: string): UserStorageInterface<TodoodleList> {
        const effectiveUserId = userId || this.defaultUserId;

        if (!this.storageManagers.has(effectiveUserId)) {
            // Create storage with default empty todo list
            const storage = StorageFactory.createFromEnvironment<TodoodleList>({
                todos: [],
                lastId: 0
            });

            this.storageManagers.set(effectiveUserId, storage);
            console.error(`[Todoodles] Created storage for user: ${effectiveUserId}`);
        }

        return this.storageManagers.get(effectiveUserId)!;
    }

    /**
     * Load todos for a specific user
     */
    private async loadTodos(userId?: string): Promise<TodoodleList> {
        const storage = this.getStorageManager(userId);
        try {
            return await storage.loadForUser(userId || this.defaultUserId);
        } catch (error) {
            console.error(`[Todoodles] Error loading todos for user ${userId}:`, error);
            return { todos: [], lastId: 0 };
        }
    }

    /**
     * Save todos for a specific user
     */
    private async saveTodos(todoList: TodoodleList, userId?: string): Promise<void> {
        const storage = this.getStorageManager(userId);
        const effectiveUserId = userId || this.defaultUserId;

        try {
            await storage.saveForUser(effectiveUserId, todoList);
            console.error(`[Todoodles] Saved ${todoList.todos.length} todos for user: ${effectiveUserId}`);
        } catch (error) {
            console.error(`[Todoodles] Error saving todos for user ${effectiveUserId}:`, error);
            throw error;
        }
    }

    async addTodo(text: string, userId?: string, category?: string, priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium', dueDate?: string): Promise<TodoodleItem> {
        const todoList = await this.loadTodos(userId);
        const effectiveUserId = userId || this.defaultUserId;

        todoList.lastId += 1;
        const newTodo: TodoodleItem = {
            id: todoList.lastId.toString(),
            text,
            createdAt: new Date().toISOString(),
            completed: false,
            category,
            priority,
            dueDate,
            userId: effectiveUserId
        };

        todoList.todos.push(newTodo);
        await this.saveTodos(todoList, userId);

        return newTodo;
    }

    async getTodos(userId?: string): Promise<TodoodleItem[]> {
        const todoList = await this.loadTodos(userId);
        return todoList.todos;
    }

    async getIncompleteTodos(userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        return todos.filter(todo => !todo.completed);
    }

    async completeTodo(id: string, userId?: string): Promise<TodoodleItem | null> {
        const todoList = await this.loadTodos(userId);
        const todo = todoList.todos.find(t => t.id === id);

        if (!todo) {
            return null;
        }

        if (!todo.completed) {
            todo.completed = true;
            todo.completedAt = new Date().toISOString();
            todo.timeToComplete = new Date().getTime() - new Date(todo.createdAt).getTime();

            await this.saveTodos(todoList, userId);
        }

        return todo;
    }

    async deleteTodo(id: string, userId?: string): Promise<boolean> {
        const todoList = await this.loadTodos(userId);
        const initialLength = todoList.todos.length;

        todoList.todos = todoList.todos.filter(todo => todo.id !== id);

        if (todoList.todos.length !== initialLength) {
            await this.saveTodos(todoList, userId);
            return true;
        }

        return false;
    }

    async searchTodos(query: string, userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        const lowerQuery = query.toLowerCase();

        return todos.filter(todo =>
            todo.text.toLowerCase().includes(lowerQuery) ||
            (todo.category && todo.category.toLowerCase().includes(lowerQuery))
        );
    }

    async getTodosByCategory(category: string, userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        return todos.filter(todo => todo.category === category);
    }

    async getTodosByPriority(priority: 'low' | 'medium' | 'high' | 'urgent', userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        return todos.filter(todo => todo.priority === priority);
    }

    async getOverdueTodos(userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        const now = new Date();

        return todos.filter(todo => {
            if (!todo.dueDate || todo.completed) return false;
            return new Date(todo.dueDate) < now;
        });
    }

    // Utility methods
    getActiveUsers(): string[] {
        return Array.from(this.storageManagers.keys());
    }

    async getUserStats(userId?: string): Promise<any> {
        const todos = await this.getTodos(userId);
        const effectiveUserId = userId || this.defaultUserId;

        return {
            userId: effectiveUserId,
            totalTodos: todos.length,
            completedTodos: todos.filter(t => t.completed).length,
            incompleteTodos: todos.filter(t => !t.completed).length,
            overdueTodos: (await this.getOverdueTodos(userId)).length,
            categories: [...new Set(todos.filter(t => t.category).map(t => t.category))],
            storageType: process.env.MCP_STORAGE_TYPE || 'json'
        };
    }
}

// Create the user-aware todoodles manager
const todoodleManager = new UserAwareTodoodleManager();

// The server instance
const server = new Server({
    name: "user-aware-todoodles-server",
    version: "2.2.0",
}, {
    capabilities: {
        tools: {},
    },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "add_todo",
                description: "Add a new todo item with optional category, priority, and due date",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: { type: "string", description: "The todo item text" },
                        category: { type: "string", description: "Optional category for organizing todos" },
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "Priority level (default: medium)"
                        },
                        dueDate: { type: "string", description: "Optional due date in ISO format (YYYY-MM-DD)" }
                    },
                    required: ["text"]
                }
            },
            {
                name: "get_todos",
                description: "Get all todos for the current user",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "get_incomplete_todos",
                description: "Get all incomplete todos for the current user",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "complete_todo",
                description: "Mark a todo as completed by ID",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "The ID of the todo to complete" }
                    },
                    required: ["id"]
                }
            },
            {
                name: "delete_todo",
                description: "Delete a todo by ID",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "The ID of the todo to delete" }
                    },
                    required: ["id"]
                }
            },
            {
                name: "search_todos",
                description: "Search todos by text or category",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Search query" }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_todos_by_category",
                description: "Get todos filtered by category",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: { type: "string", description: "Category to filter by" }
                    },
                    required: ["category"]
                }
            },
            {
                name: "get_todos_by_priority",
                description: "Get todos filtered by priority level",
                inputSchema: {
                    type: "object",
                    properties: {
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "Priority level to filter by"
                        }
                    },
                    required: ["priority"]
                }
            },
            {
                name: "get_overdue_todos",
                description: "Get all overdue todos for the current user",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Extract userId from top-level params (LibreChat integration)
    const { name, arguments: args, userId } = request.params as {
        name: string;
        arguments: any;
        userId?: string;
    };

    if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
    }

    // Log user context for debugging
    console.error(`[${name}] Tool called by user: ${userId || 'anonymous'}`);

    switch (name) {
        case "add_todo":
            const newTodo = await todoodleManager.addTodo(
                args.text,
                userId,
                args.category,
                args.priority || 'medium',
                args.dueDate
            );
            return {
                content: [{
                    type: "text",
                    text: `Added todo for user ${userId || 'anonymous'}: "${newTodo.text}" (ID: ${newTodo.id}, Priority: ${newTodo.priority})`
                }]
            };

        case "get_todos":
            const todos = await todoodleManager.getTodos(userId);
            return {
                content: [{
                    type: "text",
                    text: `User ${userId || 'anonymous'} has ${todos.length} todos:\n${JSON.stringify(todos, null, 2)}`
                }]
            };

        case "get_incomplete_todos":
            const incompleteTodos = await todoodleManager.getIncompleteTodos(userId);
            return {
                content: [{
                    type: "text",
                    text: `User ${userId || 'anonymous'} has ${incompleteTodos.length} incomplete todos:\n${JSON.stringify(incompleteTodos, null, 2)}`
                }]
            };

        case "complete_todo":
            const completedTodo = await todoodleManager.completeTodo(args.id, userId);
            if (completedTodo) {
                return {
                    content: [{
                        type: "text",
                        text: `Completed todo for user ${userId || 'anonymous'}: "${completedTodo.text}" (completed in ${completedTodo.timeToComplete}ms)`
                    }]
                };
            } else {
                return {
                    content: [{
                        type: "text",
                        text: `Todo with ID ${args.id} not found for user ${userId || 'anonymous'}`
                    }]
                };
            }

        case "delete_todo":
            const deleted = await todoodleManager.deleteTodo(args.id, userId);
            return {
                content: [{
                    type: "text",
                    text: deleted
                        ? `Deleted todo ${args.id} for user ${userId || 'anonymous'}`
                        : `Todo with ID ${args.id} not found for user ${userId || 'anonymous'}`
                }]
            };

        case "search_todos":
            const searchResults = await todoodleManager.searchTodos(args.query, userId);
            return {
                content: [{
                    type: "text",
                    text: `Search results for "${args.query}" (user ${userId || 'anonymous'}): ${searchResults.length} todos found\n${JSON.stringify(searchResults, null, 2)}`
                }]
            };

        case "get_todos_by_category":
            const categoryTodos = await todoodleManager.getTodosByCategory(args.category, userId);
            return {
                content: [{
                    type: "text",
                    text: `Todos in category "${args.category}" for user ${userId || 'anonymous'}: ${categoryTodos.length} found\n${JSON.stringify(categoryTodos, null, 2)}`
                }]
            };

        case "get_todos_by_priority":
            const priorityTodos = await todoodleManager.getTodosByPriority(args.priority, userId);
            return {
                content: [{
                    type: "text",
                    text: `${args.priority} priority todos for user ${userId || 'anonymous'}: ${priorityTodos.length} found\n${JSON.stringify(priorityTodos, null, 2)}`
                }]
            };

        case "get_overdue_todos":
            const overdueTodos = await todoodleManager.getOverdueTodos(userId);
            return {
                content: [{
                    type: "text",
                    text: `Overdue todos for user ${userId || 'anonymous'}: ${overdueTodos.length} found\n${JSON.stringify(overdueTodos, null, 2)}`
                }]
            };

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("User-Aware Todoodles MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
}); 