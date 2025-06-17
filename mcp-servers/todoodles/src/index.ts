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
    category?: string; // Optional category for organizing todoodles
    priority: 'low' | 'medium' | 'high' | 'urgent'; // Priority level
    dueDate?: string; // Optional due date in ISO format
}

// Our todo list manager
class TodoodleListManager {
    private todoodles: TodoodleItem[] = [];
    private lastId: number = 0;
    private isSaving: boolean = false;
    private saveQueue: Promise<void> = Promise.resolve();

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
        // If already saving, queue this save operation
        if (this.isSaving) {
            return new Promise((resolve, reject) => {
                this.saveQueue = this.saveQueue
                    .then(() => this.performSave())
                    .then(resolve)
                    .catch(reject);
            });
        }

        return this.performSave();
    }

    private async performSave(): Promise<void> {
        this.isSaving = true;
        try {
            console.error(`Saving ${this.todoodles.length} todoodles to ${todosFilePath}`);

            // Create backup of existing file if it exists
            try {
                const backupDir = path.join(path.dirname(todosFilePath), 'backups');
                await fs.mkdir(backupDir, { recursive: true });

                if (await fs.access(todosFilePath).then(() => true).catch(() => false)) {
                    // Read the current file to ensure it's valid JSON
                    const currentData = await fs.readFile(todosFilePath, 'utf-8');
                    try {
                        // Validate the current data is valid JSON
                        JSON.parse(currentData);

                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const backupPath = path.join(backupDir, `todoodles_${timestamp}.json`);

                        // Write the backup
                        await fs.writeFile(backupPath, currentData);

                        // Keep only the last 5 backups
                        const backups = await fs.readdir(backupDir);
                        if (backups.length > 5) {
                            const sortedBackups = backups
                                .filter(f => f.startsWith('todoodles_'))
                                .sort()
                                .reverse();
                            for (const oldBackup of sortedBackups.slice(5)) {
                                await fs.unlink(path.join(backupDir, oldBackup));
                            }
                        }
                    } catch (parseError) {
                        console.error('Failed to validate current todoodles file:', parseError);
                        // Don't create a backup if the current file is invalid
                        return;
                    }
                }
            } catch (error) {
                console.error('Failed to create backup:', error);
            }

            // Create a temporary file first
            const tempFilePath = `${todosFilePath}.tmp`;
            await fs.writeFile(tempFilePath, JSON.stringify(this.todoodles, null, 2));

            // Atomic rename operation
            await fs.rename(tempFilePath, todosFilePath);

            console.error('Todoodles saved successfully');
        } catch (error) {
            console.error('Error saving todoodles:', error);
            throw error;
        } finally {
            this.isSaving = false;
        }
    }

    async add(text: string, category?: string, priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium', dueDate?: string): Promise<TodoodleItem> {
        this.lastId += 1;
        const todoodle: TodoodleItem = {
            id: this.lastId.toString(),
            text,
            createdAt: new Date().toISOString(),
            completed: false,
            category,
            priority,
            dueDate
        };
        this.todoodles.push(todoodle);
        await this.save();
        const dueDateText = dueDate ? `, due ${new Date(dueDate).toLocaleDateString()}` : '';
        console.error(`📝 Added new todoodle with ID ${todoodle.id}: "${todoodle.text}" [${priority}${category ? `, ${category}` : ''}${dueDateText}]`);
        return todoodle;
    }

    async completeById(id: string): Promise<TodoodleItem | null> {
        const todoodle = this.todoodles.find(t => t.id === id);
        if (!todoodle) {
            return null;
        }

        // Remove the todoodle (same logic as deleteById)
        const initialLength = this.todoodles.length;
        this.todoodles = this.todoodles.filter(t => t.id !== id);
        if (this.todoodles.length !== initialLength) {
            await this.save();
            console.error(`✅ Completed and removed todoodle with ID ${todoodle.id}: "${todoodle.text}"`);
            return todoodle;
        }
        return null;
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

    getByCategory(category: string): TodoodleItem[] {
        return this.get().filter(todoodle =>
            todoodle.category?.toLowerCase() === category.toLowerCase()
        );
    }

    getByPriority(priority: 'low' | 'medium' | 'high' | 'urgent'): TodoodleItem[] {
        return this.get().filter(todoodle => todoodle.priority === priority);
    }

    getPrioritized(): TodoodleItem[] {
        const priorityOrder = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
        return [...this.todoodles]
            .sort((a, b) => {
                // First sort by priority (urgent first)
                const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
                if (priorityDiff !== 0) return priorityDiff;
                // Then by creation date (newest first)
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
    }

    getCategories(): string[] {
        const categories = new Set(
            this.todoodles
                .map(t => t.category)
                .filter((c): c is string => c !== undefined && c !== null && c.trim() !== '')
        );
        return Array.from(categories).sort();
    }

    getDueToday(): TodoodleItem[] {
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0); // Start of today

        return this.get().filter(todoodle => {
            if (!todoodle.dueDate || todoodle.completed) return false;
            const dueDate = new Date(todoodle.dueDate);
            return dueDate >= todayStart && dueDate <= today;
        });
    }

    getOverdue(): TodoodleItem[] {
        const now = new Date();
        return this.get().filter(todoodle => {
            if (!todoodle.dueDate || todoodle.completed) return false;
            const dueDate = new Date(todoodle.dueDate);
            return dueDate < now;
        });
    }

    getDueThisWeek(): TodoodleItem[] {
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        return this.get().filter(todoodle => {
            if (!todoodle.dueDate || todoodle.completed) return false;
            const dueDate = new Date(todoodle.dueDate);
            return dueDate >= now && dueDate <= weekFromNow;
        });
    }

    getSortedByDueDate(): TodoodleItem[] {
        return [...this.todoodles].sort((a, b) => {
            // Items without due dates go to the bottom
            if (!a.dueDate && !b.dueDate) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;

            // Sort by due date (earliest first)
            const dueDateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            if (dueDateDiff !== 0) return dueDateDiff;

            // If same due date, sort by priority
            const priorityOrder = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    // Helper function to format due date information
    formatDueDate(dueDate: string): { text: string; emoji: string; isOverdue: boolean } {
        const due = new Date(dueDate);
        const now = new Date();
        const diffMs = due.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return {
                text: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`,
                emoji: '🚨',
                isOverdue: true
            };
        } else if (diffDays === 0) {
            return { text: 'due today', emoji: '⏰', isOverdue: false };
        } else if (diffDays === 1) {
            return { text: 'due tomorrow', emoji: '📅', isOverdue: false };
        } else if (diffDays <= 7) {
            return { text: `due in ${diffDays} days`, emoji: '📅', isOverdue: false };
        } else {
            return { text: `due ${due.toLocaleDateString()}`, emoji: '📅', isOverdue: false };
        }
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
                description: "Add a new todoodle item to the list with optional category and priority",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "The text of the todoodle item"
                        },
                        category: {
                            type: "string",
                            description: "Optional category to organize the todoodle (e.g., 'work', 'personal', 'shopping')"
                        },
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "Priority level of the todoodle. Defaults to 'medium' if not specified."
                        },
                        dueDate: {
                            type: "string",
                            description: "Optional due date in ISO format (YYYY-MM-DD) or natural language (e.g., 'tomorrow', '2024-12-25')"
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
            {
                name: "get_by_category",
                description: "Get all todoodles in a specific category",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "The category to filter by"
                        },
                    },
                    required: ["category"],
                },
            },
            {
                name: "get_by_priority",
                description: "Get all todoodles with a specific priority level",
                inputSchema: {
                    type: "object",
                    properties: {
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "The priority level to filter by"
                        },
                    },
                    required: ["priority"],
                },
            },
            {
                name: "get_prioritized",
                description: "Get all todoodles sorted by priority (urgent first) then by creation date",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get_categories",
                description: "Get a list of all categories currently in use",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get_due_today",
                description: "Get all todoodles due today",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get_overdue",
                description: "Get all overdue todoodles",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get_due_this_week",
                description: "Get all todoodles due within the next 7 days",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get_sorted_by_due_date",
                description: "Get all todoodles sorted by due date (earliest first), then by priority",
                inputSchema: {
                    type: "object",
                    properties: {},
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
            const todoodle = await todoodleManager.add(
                args.text as string,
                args.category as string | undefined,
                args.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
                args.dueDate as string | undefined
            );
            const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
            const priorityEmoji = {
                'low': '🟢',
                'medium': '🟡',
                'high': '🟠',
                'urgent': '🔴'
            }[todoodle.priority];

            let dueDateDisplay = '';
            if (todoodle.dueDate) {
                const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                dueDateDisplay = ` ${dueInfo.emoji} ${dueInfo.text}`;
            }

            return {
                content: [{
                    type: "text",
                    text: `📝 Added todoodle: "${todoodle.text}"${categoryText} ${priorityEmoji} ${todoodle.priority} priority${dueDateDisplay} (created at ${new Date(todoodle.createdAt).toLocaleString()})`
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
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const priorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                let dueDateInfo = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    dueDateInfo = ` ${dueInfo.emoji} ${dueInfo.text}`;
                }
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${priorityEmoji} ${todoodle.priority}${dueDateInfo} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
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
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const allPriorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                let allDueDateInfo = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    allDueDateInfo = ` ${dueInfo.emoji} ${dueInfo.text}`;
                }
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${allPriorityEmoji} ${todoodle.priority}${allDueDateInfo} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
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
            const incompleteSummary = incompleteTodoodles.map(todoodle => {
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const incompletePriorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                let incompleteDueDateInfo = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    incompleteDueDateInfo = ` ${dueInfo.emoji} ${dueInfo.text}`;
                }
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${incompletePriorityEmoji} ${todoodle.priority}${incompleteDueDateInfo} (created at ${new Date(todoodle.createdAt).toLocaleString()})`;
            }).join('\n');
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
            const searchResults = matches.map(todoodle => {
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const searchPriorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                let searchDueDateInfo = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    searchDueDateInfo = ` ${dueInfo.emoji} ${dueInfo.text}`;
                }
                return `- ID: ${todoodle.id}, Text: "${todoodle.text}"${categoryText} ${searchPriorityEmoji} ${todoodle.priority}${searchDueDateInfo} (${todoodle.completed ? '✅ Completed' : '⏳ Pending'})`;
            }).join('\n');
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
                        text: "❌ Todoodle not found (ID: " + args.id + ")"
                    }]
                };
            }
            return {
                content: [{
                    type: "text",
                    text: "🗑️ Todoodle deleted successfully (ID: " + args.id + ")"
                }]
            };
        case "get_by_category":
            const categoryTodoodles = todoodleManager.getByCategory(args.category as string);
            if (categoryTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `📂 No todoodles found in category "${args.category}"`
                    }]
                };
            }
            const categorySummary = categoryTodoodles.map(todoodle => {
                const status = todoodle.completed
                    ? `✅ Completed in ${Math.round(todoodle.timeToComplete! / 1000 / 60)} minutes`
                    : "⏳ Pending";
                const itemPriorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                let categoryDueDateInfo = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    categoryDueDateInfo = ` ${dueInfo.emoji} ${dueInfo.text}`;
                }
                return `- ID: ${todoodle.id}, ${todoodle.text} ${itemPriorityEmoji} ${todoodle.priority}${categoryDueDateInfo} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `📂 Todoodles in category "${args.category}":\n${categorySummary}`
                }]
            };
        case "get_by_priority":
            const priorityTodoodles = todoodleManager.getByPriority(args.priority as 'low' | 'medium' | 'high' | 'urgent');
            if (priorityTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `🎯 No todoodles found with ${args.priority} priority`
                    }]
                };
            }
            const filterPriorityEmoji = {
                'low': '🟢',
                'medium': '🟡',
                'high': '🟠',
                'urgent': '🔴'
            }[args.priority as 'low' | 'medium' | 'high' | 'urgent'];
            const prioritySummary = priorityTodoodles.map(todoodle => {
                const status = todoodle.completed
                    ? `✅ Completed in ${Math.round(todoodle.timeToComplete! / 1000 / 60)} minutes`
                    : "⏳ Pending";
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                let priorityDueDateInfo = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    priorityDueDateInfo = ` ${dueInfo.emoji} ${dueInfo.text}`;
                }
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText}${priorityDueDateInfo} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `🎯 ${filterPriorityEmoji} ${args.priority} priority todoodles:\n${prioritySummary}`
                }]
            };
        case "get_prioritized":
            const prioritizedTodoodles = todoodleManager.getPrioritized();
            if (prioritizedTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📋 No todoodles found!"
                    }]
                };
            }
            const prioritizedSummary = prioritizedTodoodles.map(todoodle => {
                const status = todoodle.completed
                    ? `✅ Completed in ${Math.round(todoodle.timeToComplete! / 1000 / 60)} minutes`
                    : "⏳ Pending";
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const todoodlePriorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${todoodlePriorityEmoji} ${todoodle.priority} (${new Date(todoodle.createdAt).toLocaleString()}) - ${status}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `🎯 Todoodles by priority:\n${prioritizedSummary}`
                }]
            };
        case "get_categories":
            const categories = todoodleManager.getCategories();
            if (categories.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📂 No categories found. Add some todoodles with categories to see them here!"
                    }]
                };
            }
            return {
                content: [{
                    type: "text",
                    text: `📂 Available categories:\n${categories.map(cat => `- ${cat}`).join('\n')}`
                }]
            };
        case "get_due_today":
            const dueTodayTodoodles = todoodleManager.getDueToday();
            if (dueTodayTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "⏰ No todoodles due today!"
                    }]
                };
            }
            const dueTodaySummary = dueTodayTodoodles.map(todoodle => {
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const priorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${priorityEmoji} ${todoodle.priority} ⏰ due today`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `⏰ Todoodles due today:\n${dueTodaySummary}`
                }]
            };
        case "get_overdue":
            const overdueTodoodles = todoodleManager.getOverdue();
            if (overdueTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "✅ No overdue todoodles! You're all caught up!"
                    }]
                };
            }
            const overdueSummary = overdueTodoodles.map(todoodle => {
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const priorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate!);
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${priorityEmoji} ${todoodle.priority} ${dueInfo.emoji} ${dueInfo.text}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `🚨 Overdue todoodles:\n${overdueSummary}`
                }]
            };
        case "get_due_this_week":
            const dueThisWeekTodoodles = todoodleManager.getDueThisWeek();
            if (dueThisWeekTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📅 No todoodles due this week!"
                    }]
                };
            }
            const dueThisWeekSummary = dueThisWeekTodoodles.map(todoodle => {
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const priorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];
                const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate!);
                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${priorityEmoji} ${todoodle.priority} ${dueInfo.emoji} ${dueInfo.text}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `📅 Todoodles due this week:\n${dueThisWeekSummary}`
                }]
            };
        case "get_sorted_by_due_date":
            const sortedByDueDateTodoodles = todoodleManager.getSortedByDueDate();
            if (sortedByDueDateTodoodles.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "📋 No todoodles found!"
                    }]
                };
            }
            const sortedByDueDateSummary = sortedByDueDateTodoodles.map(todoodle => {
                const status = todoodle.completed
                    ? `✅ Completed in ${Math.round(todoodle.timeToComplete! / 1000 / 60)} minutes`
                    : "⏳ Pending";
                const categoryText = todoodle.category ? ` [${todoodle.category}]` : '';
                const priorityEmoji = {
                    'low': '🟢',
                    'medium': '🟡',
                    'high': '🟠',
                    'urgent': '🔴'
                }[todoodle.priority];

                let dueDateText = '';
                if (todoodle.dueDate) {
                    const dueInfo = todoodleManager.formatDueDate(todoodle.dueDate);
                    dueDateText = ` ${dueInfo.emoji} ${dueInfo.text}`;
                } else {
                    dueDateText = ' 📝 no due date';
                }

                return `- ID: ${todoodle.id}, ${todoodle.text}${categoryText} ${priorityEmoji} ${todoodle.priority}${dueDateText} - ${status}`;
            }).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `📅 Todoodles sorted by due date:\n${sortedByDueDateSummary}`
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