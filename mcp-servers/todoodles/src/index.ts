#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StorageFactory } from 'mcp-data';
import { TodoodlesWebUIManager } from './web-ui-integration.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generic, overrideable env loader
function loadEnv(serverLabel: string) {
    const candidates: string[] = [];
    if (process.env.ENV_PATH) candidates.push(process.env.ENV_PATH);
    const dirCandidates = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')];
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
        if (fs.existsSync(p)) {
            dotenv.config({ path: p, override: true });
            usedPath = usedPath || p;
        }
    }
    if (!usedPath) dotenv.config();

    // Normalize Mongo env vars for cross-compat
    if (!process.env.MONGODB_CONNECTION_STRING && process.env.MONGODB_URI) {
        process.env.MONGODB_CONNECTION_STRING = process.env.MONGODB_URI;
    }
    if (!process.env.MONGODB_URI && process.env.MONGODB_CONNECTION_STRING) {
        process.env.MONGODB_URI = process.env.MONGODB_CONNECTION_STRING;
    }

    const uri = (process.env.MONGODB_URI || '').replace(/\/\/.*@/, '//***@');
    const db = process.env.MONGODB_DATABASE || '';
    const coll = process.env.MONGODB_COLLECTION || process.env.MONGODB_COLLECTION_PREFIX || '';
    console.error(`[${serverLabel}] Env loaded: ${usedPath || '(default)'} | DB=${db} | Collection=${coll} | URI=${uri ? '[SET]' : '[NOT_SET]'}`);
}

loadEnv('Todoodles');

// Enhanced logging function
function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}][${level}][Todoodles MCP] ${message}`;
    console.error(logMessage);

    if (data && process.env.MCP_DEBUG === 'true') {
        console.error(JSON.stringify(data, null, 2));
    }
}

// Todoodles data interfaces
interface TodoodleItem {
    id: string;
    text: string;
    createdAt: string;
    completed: boolean;
    completedAt?: string;
    timeToComplete?: number; // in milliseconds
    category?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: string; // ISO format
}

interface TodoodleData {
    items: TodoodleItem[];
    metadata: {
        lastId: number;
        version: string;
        updatedAt: string;
        totalItems: number;
        completedItems: number;
    };
}

// User-aware Todoodles Manager using shared storage
export class UserAwareTodoodlesManager {
    private storage: ReturnType<typeof this.createStorage>;
    private defaultUserId = 'default';
    private isUserBased: boolean;
    private operationLocks: Map<string, Promise<any>> = new Map();


    constructor() {
        // Debug environment variables
        log('DEBUG', 'Environment variables', {
            MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE,
            MONGODB_CONNECTION_STRING: process.env.MONGODB_CONNECTION_STRING?.replace(/\/\/.*@/, '//***@'), // Hide credentials
            MONGODB_DATABASE: process.env.MONGODB_DATABASE,
            MONGODB_COLLECTION: process.env.MONGODB_COLLECTION,
            MCP_USER_ID: process.env.MCP_USER_ID,
            MCP_USER_BASED: process.env.MCP_USER_BASED,
            TODOS_FILE_PATH: process.env.TODOS_FILE_PATH
        });

        this.isUserBased = process.env.MCP_USER_BASED === 'true';
        this.storage = this.createStorage();

        log('INFO', 'UserAwareTodoodlesManager initialized with storage type: ' + (process.env.MCP_STORAGE_TYPE || 'json') + ', userBased: ' + this.isUserBased);
    }

    async initialize() {
        // Initialize storage if needed
        return Promise.resolve();
    }

    async cleanup() {
        // Close storage connections to prevent hanging
        if (this.storage && 'disconnect' in this.storage && typeof (this.storage as any).disconnect === 'function') {
            await (this.storage as any).disconnect();
        }
    }

    async handleToolCall(request: any) {
        // ===== COMPREHENSIVE REQUEST LOGGING =====
        const startTime = Date.now();
        const requestId = Math.random().toString(36).substr(2, 9);

        log('INFO', `[REQUEST-${requestId}] ===== NEW TOOL CALL REQUEST =====`);
        log('INFO', `[REQUEST-${requestId}] Tool: ${request.params?.name || 'UNKNOWN'}`);
        log('INFO', `[REQUEST-${requestId}] Full request object:`, {
            jsonrpc: request.jsonrpc,
            id: request.id,
            method: request.method,
            params: request.params,
            meta: request.meta || 'NOT_PRESENT',
            headers: request.headers || 'NOT_PRESENT',
            user: request.user || 'NOT_PRESENT',
            userId: request.userId || 'NOT_PRESENT',
            context: request.context || 'NOT_PRESENT'
        });
        log('INFO', `[REQUEST-${requestId}] Environment context:`, {
            MCP_USER_ID: process.env.MCP_USER_ID || 'NOT_SET',
            MCP_USER_BASED: process.env.MCP_USER_BASED || 'NOT_SET',
            MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE || 'NOT_SET',
            MONGODB_CONNECTION_STRING: process.env.MONGODB_CONNECTION_STRING ? '[SET]' : '[NOT_SET]',
            MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'NOT_SET',
            MONGODB_COLLECTION: process.env.MONGODB_COLLECTION || 'NOT_SET'
        });

        const userId = extractUserId(request);
        log('INFO', `[REQUEST-${requestId}] Extracted userId: "${userId || 'NONE'}"`);
        log('INFO', `[REQUEST-${requestId}] User-based storage: ${this.isUserBased}`);

        try {
            log('INFO', `[REQUEST-${requestId}] Starting tool execution: ${request.params.name}`);

            switch (request.params.name) {
                case "add_todoodle": {
                    const { text, category, priority = 'medium', dueDate } = request.params.arguments;

                    if (!text) {
                        return {
                            content: [{ type: "text", text: "Error: text is required" }],
                            isError: true
                        };
                    }

                    if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
                        return {
                            content: [{ type: "text", text: "Error: Invalid priority" }],
                            isError: true
                        };
                    }

                    // Validate due date format if provided
                    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
                        return {
                            content: [{ type: "text", text: "Error: Invalid date format. Use YYYY-MM-DD" }],
                            isError: true
                        };
                    }

                    const todoodle = await this.addTodo(text, category, priority, dueDate, userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Todoodle added successfully: ${todoodle.text} (ID: ${todoodle.id})`
                            }
                        ]
                    };
                }

                case "complete_todoodle": {
                    const { id } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    // Check if it's already completed first
                    const existingData = await this.getTodoData(userId);
                    const existing = existingData.items.find(item => item.id === id);

                    if (!existing) {
                        return {
                            content: [{ type: "text", text: "Error: Todoodle not found" }],
                            isError: true
                        };
                    }

                    if (existing.completed) {
                        return {
                            content: [{ type: "text", text: "Error: Todoodle is already completed" }],
                            isError: true
                        };
                    }

                    const todoodle = await this.completeTodo(id, userId);
                    if (todoodle) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Completed todoodle: ${todoodle.text} (completed in ${todoodle.timeToComplete ? Math.round(todoodle.timeToComplete / 1000) + ' seconds' : 'unknown time'})`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [{ type: "text", text: "Error: Todoodle not found" }],
                            isError: true
                        };
                    }
                }

                case "update_todoodle": {
                    const { id, text, category, priority, dueDate } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
                        return {
                            content: [{ type: "text", text: "Error: Invalid priority" }],
                            isError: true
                        };
                    }

                    // Validate due date format if provided
                    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
                        return {
                            content: [{ type: "text", text: "Error: Invalid date format. Use YYYY-MM-DD" }],
                            isError: true
                        };
                    }

                    const updates: any = {};
                    if (text !== undefined) updates.text = text;
                    if (category !== undefined) updates.category = category;
                    if (priority !== undefined) updates.priority = priority;
                    if (dueDate !== undefined) updates.dueDate = dueDate;

                    const result = await this.updateTodo(id, updates, userId);
                    if (result.success && result.updatedTodo) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Updated todoodle: ${result.updatedTodo.text} (ID: ${result.updatedTodo.id})`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [{ type: "text", text: "Error: Todoodle not found" }],
                            isError: true
                        };
                    }
                }

                case "get_all_todoodles": {
                    log('INFO', `[REQUEST-${requestId}] Processing get_all_todoodles`);
                    const { completed } = request.params.arguments;
                    log('INFO', `[REQUEST-${requestId}] Completed filter: ${completed}`);
                    log('INFO', `[REQUEST-${requestId}] Using userId: "${userId || 'NONE'}"`);

                    let todoodles;

                    log('INFO', `[REQUEST-${requestId}] About to fetch todos from storage...`);
                    const fetchStartTime = Date.now();

                    if (completed === true) {
                        log('INFO', `[REQUEST-${requestId}] Fetching completed todos only`);
                        todoodles = (await this.getTodos(userId)).filter(t => t.completed);
                    } else if (completed === false) {
                        log('INFO', `[REQUEST-${requestId}] Fetching incomplete todos only`);
                        todoodles = await this.getIncompleteTodos(userId);
                    } else {
                        log('INFO', `[REQUEST-${requestId}] Fetching all todos`);
                        todoodles = await this.getTodos(userId);
                    }

                    const fetchDuration = Date.now() - fetchStartTime;
                    log('INFO', `[REQUEST-${requestId}] Fetched ${todoodles.length} todos in ${fetchDuration}ms`);
                    log('INFO', `[REQUEST-${requestId}] Todo sample:`, todoodles.slice(0, 2).map(t => ({ id: t.id, text: t.text, completed: t.completed })));

                    const response = {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(todoodles, null, 2)
                            }
                        ]
                    };

                    log('INFO', `[REQUEST-${requestId}] Returning response with ${response.content[0].text.length} characters`);
                    return response;
                }

                case "delete_todoodle": {
                    const { id } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    const result = await this.deleteTodo(id, userId);

                    if (result.success && result.deletedTodo) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Deleted todoodle: "${result.deletedTodo.text}"`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "Error: Todoodle not found"
                                }
                            ],
                            isError: true
                        };
                    }
                }

                case "search_todoodles": {
                    const { query } = request.params.arguments;

                    if (!query) {
                        return {
                            content: [{ type: "text", text: "Error: query is required" }],
                            isError: true
                        };
                    }

                    const todoodles = await this.searchTodos(query, userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(todoodles, null, 2)
                            }
                        ]
                    };
                }

                case "get_todoodles_by_category": {
                    const { category } = request.params.arguments;

                    if (!category) {
                        return {
                            content: [{ type: "text", text: "Error: category is required" }],
                            isError: true
                        };
                    }

                    const todoodles = await this.getTodosByCategory(category, userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(todoodles, null, 2)
                            }
                        ]
                    };
                }

                case "get_todoodles_by_priority": {
                    const { priority } = request.params.arguments;

                    if (!priority) {
                        return {
                            content: [{ type: "text", text: "Error: priority is required" }],
                            isError: true
                        };
                    }

                    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
                        return {
                            content: [{ type: "text", text: "Error: Invalid priority" }],
                            isError: true
                        };
                    }

                    const todoodles = await this.getTodosByPriority(priority, userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(todoodles, null, 2)
                            }
                        ]
                    };
                }

                case "get_due_todoodles": {
                    const { overdue_only, days } = request.params.arguments;

                    if (days !== undefined && (typeof days !== 'number' || days < 0)) {
                        return {
                            content: [{ type: "text", text: "Error: days must be non-negative" }],
                            isError: true
                        };
                    }

                    let todoodles;
                    if (overdue_only) {
                        todoodles = await this.getOverdueTodos(userId);
                    } else {
                        todoodles = await this.getDueTodos(userId);
                    }

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(todoodles, null, 2)
                            }
                        ]
                    };
                }

                case "get_categories": {
                    const categories = await this.getCategories(userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(categories, null, 2)
                            }
                        ]
                    };
                }

                case "get_todoodles_stats": {
                    const stats = await this.getStats(userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(stats, null, 2)
                            }
                        ]
                    };
                }

                case "get_web_ui": {

                    return await webUIManager.handleGetWebUI(userId || 'default');
                }

                default:
                    if (!request.params.name) {
                        return {
                            content: [{ type: "text", text: "Error: Tool name is required" }],
                            isError: true
                        };
                    }
                    return {
                        content: [{ type: "text", text: `Error: Unknown tool: ${request.params.name}` }],
                        isError: true
                    };
            }
        } catch (error: any) {
            const duration = Date.now() - startTime;
            log('ERROR', `[REQUEST-${requestId}] Tool ${request.params.name} FAILED for user ${userId} after ${duration}ms: ${error.message}`);
            log('ERROR', `[REQUEST-${requestId}] Error stack:`, error.stack);
            log('ERROR', `[REQUEST-${requestId}] Error details:`, {
                name: error.name,
                message: error.message,
                code: error.code || 'NO_CODE',
                cause: error.cause || 'NO_CAUSE'
            });

            const errorResponse = {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`
                    }
                ],
                isError: true
            };

            log('ERROR', `[REQUEST-${requestId}] Returning error response`);
            return errorResponse;
        } finally {
            const totalDuration = Date.now() - startTime;
            log('INFO', `[REQUEST-${requestId}] ===== REQUEST COMPLETED in ${totalDuration}ms =====`);
        }
    }

    private createStorage() {
        const storageType = process.env.MCP_STORAGE_TYPE || 'json';
        const defaultData: TodoodleData = {
            items: [],
            metadata: {
                lastId: 0,
                version: '2.1.0',
                updatedAt: new Date().toISOString(),
                totalItems: 0,
                completedItems: 0
            }
        };

        const config = {
            type: storageType as 'json' | 'mongodb',
            mongodb: storageType === 'mongodb' ? {
                connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/LibreChat',
                databaseName: process.env.MONGODB_DATABASE || 'LibreChat',
                collectionName: process.env.MONGODB_COLLECTION || 'user_todoodles',
                connectionTimeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
                maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
                encryptionKey: process.env.CREDS_KEY
            } : undefined,
            json: storageType === 'json' ? {
                baseDir: path.dirname(process.env.TODOS_FILE_PATH || './todoodle.json'),
                createDirIfNotExists: true,
                backupEnabled: process.env.MCP_BACKUP_ENABLED === 'true'
            } : undefined
        };

        return StorageFactory.createUserStorage(config, defaultData);
    }

    private getUserId(): string {
        if (this.isUserBased && process.env.MCP_USER_ID) {
            return process.env.MCP_USER_ID;
        }
        return this.defaultUserId;
    }

    // Prevent race conditions during concurrent operations
    private async withLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
        const lockKey = `user_${userId}`;

        // Wait for existing operation to complete (without timeout to avoid aborting valid operations)
        while (this.operationLocks.has(lockKey)) {
            try {
                await this.operationLocks.get(lockKey);
            } catch (error: any) {
                // Previous operation failed, but lock should be cleaned up
                log('DEBUG', `Previous operation failed for user ${userId}: ${error.message}`);
            }
            // Give a small delay to prevent tight loops
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Create new operation promise
        const operationPromise = (async () => {
            try {
                log('DEBUG', `Starting locked operation for user ${userId}`);
                const result = await operation();
                log('DEBUG', `Completed locked operation for user ${userId}`);
                return result;
            } catch (error: any) {
                log('ERROR', `Operation failed for user ${userId}: ${error.message}`);
                throw error;
            }
        })();

        this.operationLocks.set(lockKey, operationPromise);

        try {
            const result = await operationPromise;
            return result;
        } finally {
            // Clean up the lock
            this.operationLocks.delete(lockKey);
            log('DEBUG', `Released lock for user ${userId}`);
        }
    }

    private async getTodoData(userId?: string): Promise<TodoodleData> {
        const effectiveUserId = userId || this.getUserId();
        log('INFO', `[GETTODODATA] Starting getTodoData for user: "${effectiveUserId}"`);
        log('INFO', `[GETTODODATA] isUserBased: ${this.isUserBased}`);

        try {
            let data;
            if (this.isUserBased) {
                log('INFO', `[GETTODODATA] Loading user-specific data for: "${effectiveUserId}"`);
                const loadStartTime = Date.now();
                data = await this.storage.loadForUser(effectiveUserId);
                const loadDuration = Date.now() - loadStartTime;
                log('INFO', `[GETTODODATA] storage.loadForUser completed in ${loadDuration}ms`);
            } else {
                log('INFO', `[GETTODODATA] Loading default data (non-user-based)`);
                const loadStartTime = Date.now();
                data = await this.storage.load();
                const loadDuration = Date.now() - loadStartTime;
                log('INFO', `[GETTODODATA] storage.load completed in ${loadDuration}ms`);
            }

            log('INFO', `[GETTODODATA] Successfully loaded ${data.items?.length || 0} todos for user ${effectiveUserId}`);
            log('INFO', `[GETTODODATA] Data structure:`, {
                itemCount: data.items?.length || 0,
                hasMetadata: !!data.metadata,
                lastId: data.metadata?.lastId,
                version: data.metadata?.version,
                updatedAt: data.metadata?.updatedAt
            });

            return data;
        } catch (error: any) {
            log('ERROR', `[GETTODODATA] Failed to load todo data for user ${effectiveUserId}: ${error.message}`);
            log('ERROR', `[GETTODODATA] Error details:`, {
                name: error.name,
                message: error.message,
                code: error.code || 'NO_CODE',
                stack: error.stack
            });
            throw error;
        }
    }

    private async saveTodoData(data: TodoodleData, userId?: string): Promise<void> {
        const effectiveUserId = userId || this.getUserId();

        try {
            // Update metadata
            data.metadata.updatedAt = new Date().toISOString();
            data.metadata.totalItems = data.items.length;
            data.metadata.completedItems = data.items.filter(item => item.completed).length;

            log('DEBUG', `Attempting to save ${data.items.length} todos for user ${effectiveUserId}`);

            if (this.isUserBased) {
                await this.storage.saveForUser(effectiveUserId, data);
            } else {
                await this.storage.save(data);
            }

            log('DEBUG', `Successfully saved ${data.items.length} todos for user ${effectiveUserId}`);
        } catch (error: any) {
            log('ERROR', `Failed to save todo data for user ${effectiveUserId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    async addTodo(text: string, category?: string, priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium', dueDate?: string, userId?: string): Promise<TodoodleItem> {
        const effectiveUserId = userId || this.getUserId();
        log('INFO', `Adding todo for user: ${effectiveUserId}: "${text}", category: ${category}, priority: ${priority}`);

        return await this.withLock(effectiveUserId, async () => {
            const data = await this.getTodoData(effectiveUserId);
            log('DEBUG', `Loaded ${data.items.length} existing todos, lastId: ${data.metadata.lastId}`);

            // Check for exact duplicates (text, category, priority, dueDate all match)
            const existingTodo = data.items.find(item =>
                !item.completed && // Only check against incomplete todos
                item.text.trim().toLowerCase() === text.trim().toLowerCase() &&
                (item.category || '') === (category || '') &&
                item.priority === priority &&
                (item.dueDate || '') === (dueDate || '')
            );

            if (existingTodo) {
                log('WARN', `Duplicate todo detected for user ${effectiveUserId}: "${text}" (existing ID: ${existingTodo.id})`);
                return existingTodo; // Return the existing todo instead of creating a duplicate
            }

            // Find the lowest available numeric ID to fill gaps
            const numericIds = data.items
                .map(item => parseInt(item.id))
                .filter(id => !isNaN(id))
                .sort((a, b) => a - b);

            let nextId = 1;
            for (const id of numericIds) {
                if (id === nextId) {
                    nextId++;
                } else {
                    break; // Found a gap
                }
            }

            data.metadata.lastId = nextId;

            const newTodo: TodoodleItem = {
                id: nextId.toString(),
                text,
                createdAt: new Date().toISOString(),
                completed: false,
                priority
            };

            // Only add optional fields if they have values
            if (category) {
                newTodo.category = category;
            }
            if (dueDate) {
                newTodo.dueDate = dueDate;
            }

            data.items.push(newTodo);

            try {
                await this.saveTodoData(data, effectiveUserId);
                log('DEBUG', `Successfully added todo ${nextId} for user ${effectiveUserId}. Total todos: ${data.items.length}`);
                return newTodo;
            } catch (error: any) {
                log('ERROR', `Failed to save todo for user ${effectiveUserId}: ${error.message}`);
                throw error;
            }
        });
    }

    async completeTodo(id: string, userId?: string): Promise<TodoodleItem | null> {
        const effectiveUserId = userId || this.getUserId();
        log('INFO', `Completing todo ${id} for user: ${effectiveUserId}`);

        return await this.withLock(effectiveUserId, async () => {
            const data = await this.getTodoData(effectiveUserId);
            const todo = data.items.find(item => item.id === id);

            if (!todo) {
                log('WARN', `Todo ${id} not found for user ${effectiveUserId}`);
                return null;
            }

            if (!todo.completed) {
                todo.completed = true;
                todo.completedAt = new Date().toISOString();
                todo.timeToComplete = new Date(todo.completedAt).getTime() - new Date(todo.createdAt).getTime();

                await this.saveTodoData(data, effectiveUserId);
                log('DEBUG', `Completed todo ${id} for user ${effectiveUserId}`);
            } else {
                log('WARN', `Todo ${id} is already completed for user ${effectiveUserId}`);
            }

            return todo;
        });
    }

    async getTodos(userId?: string): Promise<TodoodleItem[]> {
        const effectiveUserId = userId || this.getUserId();
        log('INFO', `[GETTODOS] Starting getTodos for user: "${effectiveUserId}"`);

        try {
            log('INFO', `[GETTODOS] Calling getTodoData for user: "${effectiveUserId}"`);
            const dataStartTime = Date.now();
            const data = await this.getTodoData(effectiveUserId);
            const dataDuration = Date.now() - dataStartTime;

            log('INFO', `[GETTODOS] getTodoData completed in ${dataDuration}ms, got ${data.items?.length || 0} items`);
            log('INFO', `[GETTODOS] Data metadata:`, data.metadata);

            // Clean up any null values that should be undefined for optional fields
            const cleanedItems = data.items.map(item => {
                const cleaned: TodoodleItem = {
                    id: item.id,
                    text: item.text,
                    createdAt: item.createdAt,
                    completed: item.completed,
                    priority: item.priority
                };

                // Only add optional fields if they exist and aren't null
                if (item.category && item.category !== null) {
                    cleaned.category = item.category;
                }
                if (item.dueDate && item.dueDate !== null) {
                    cleaned.dueDate = item.dueDate;
                }
                if (item.completedAt && item.completedAt !== null) {
                    cleaned.completedAt = item.completedAt;
                }
                if (item.timeToComplete && item.timeToComplete !== null) {
                    cleaned.timeToComplete = item.timeToComplete;
                }

                return cleaned;
            });

            log('INFO', `[GETTODOS] Retrieved and cleaned ${cleanedItems.length} todos for user ${effectiveUserId}`);
            return cleanedItems;
        } catch (error: any) {
            log('ERROR', `[GETTODOS] Failed to get todos for user "${effectiveUserId}": ${error.message}`);
            log('ERROR', `[GETTODOS] Error stack:`, error.stack);
            throw error;
        }
    }

    async getIncompleteTodos(userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        return todos.filter(todo => !todo.completed);
    }

    async searchTodos(query: string, userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        const lowerQuery = query.toLowerCase();

        return todos.filter(todo =>
            todo.text.toLowerCase().includes(lowerQuery) ||
            todo.category?.toLowerCase().includes(lowerQuery)
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

    async getDueTodos(userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today

        return todos.filter(todo => {
            if (!todo.dueDate || todo.completed) return false;
            const dueDate = new Date(todo.dueDate);
            return dueDate <= today;
        });
    }

    async getOverdueTodos(userId?: string): Promise<TodoodleItem[]> {
        const todos = await this.getTodos(userId);
        const now = new Date();

        return todos.filter(todo => {
            if (!todo.dueDate || todo.completed) return false;
            const dueDate = new Date(todo.dueDate);
            return dueDate < now;
        });
    }

    async deleteTodo(id: string, userId?: string): Promise<{ success: boolean; deletedTodo?: TodoodleItem }> {
        const effectiveUserId = userId || this.getUserId();
        log('INFO', `Deleting todo ${id} for user: ${effectiveUserId}`);

        return await this.withLock(effectiveUserId, async () => {
            const data = await this.getTodoData(effectiveUserId);
            const todoToDelete = data.items.find(item => item.id === id);

            if (!todoToDelete) {
                log('WARN', `Todo ${id} not found for deletion for user ${effectiveUserId}`);
                return { success: false };
            }

            // Remove the todo from the array
            data.items = data.items.filter(item => item.id !== id);

            await this.saveTodoData(data, effectiveUserId);
            log('DEBUG', `Deleted todo ${id} ("${todoToDelete.text}") for user ${effectiveUserId}`);
            return { success: true, deletedTodo: todoToDelete };
        });
    }

    async updateTodo(id: string, updates: Partial<Pick<TodoodleItem, 'text' | 'category' | 'priority' | 'dueDate'>>, userId?: string): Promise<{ success: boolean; updatedTodo?: TodoodleItem }> {
        const effectiveUserId = userId || this.getUserId();
        log('INFO', `Updating todo ${id} for user: ${effectiveUserId}`, { updates });

        return await this.withLock(effectiveUserId, async () => {
            const data = await this.getTodoData(effectiveUserId);
            const todoIndex = data.items.findIndex(item => item.id === id);

            if (todoIndex === -1) {
                log('WARN', `Todo ${id} not found for update for user ${effectiveUserId}`);
                return { success: false };
            }

            const originalTodo = data.items[todoIndex];

            // Update the todo with new values, keeping the original structure
            const updatedTodo: TodoodleItem = {
                ...originalTodo,
                ...updates,
                id: originalTodo.id, // Preserve the original ID
                createdAt: originalTodo.createdAt, // Preserve creation time
                completed: originalTodo.completed, // Preserve completion status
                completedAt: originalTodo.completedAt, // Preserve completion time
                timeToComplete: originalTodo.timeToComplete // Preserve time tracking
            };

            // Replace the todo in the array
            data.items[todoIndex] = updatedTodo;

            // Update metadata
            data.metadata.updatedAt = new Date().toISOString();

            await this.saveTodoData(data, effectiveUserId);
            log('DEBUG', `Updated todo ${id} for user ${effectiveUserId}`, {
                originalText: originalTodo.text,
                newText: updatedTodo.text
            });

            return { success: true, updatedTodo };
        });
    }

    async getCategories(userId?: string): Promise<string[]> {
        const todos = await this.getTodos(userId);
        const categories = new Set<string>();

        todos.forEach(todo => {
            if (todo.category) {
                categories.add(todo.category);
            }
        });

        return Array.from(categories).sort();
    }

    async getStats(userId?: string): Promise<any> {
        const effectiveUserId = userId || this.getUserId();
        const data = await this.getTodoData(effectiveUserId);
        const todos = data.items;

        const completed = todos.filter(t => t.completed);
        const incomplete = todos.filter(t => !t.completed);
        const overdue = await this.getOverdueTodos(effectiveUserId);

        // Calculate category counts
        const categoryStats: Record<string, number> = {};
        todos.forEach(todo => {
            if (todo.category) {
                categoryStats[todo.category] = (categoryStats[todo.category] || 0) + 1;
            }
        });

        // Calculate priority counts
        const priorityStats: Record<string, number> = {};
        todos.forEach(todo => {
            if (todo.priority) {
                priorityStats[todo.priority] = (priorityStats[todo.priority] || 0) + 1;
            }
        });

        return {
            total: todos.length,
            completed: completed.length,
            incomplete: incomplete.length,
            overdue: overdue.length,
            categories: categoryStats,
            priorities: priorityStats,
            averageCompletionTime: completed.length > 0
                ? completed.reduce((sum, t) => sum + (t.timeToComplete || 0), 0) / completed.length
                : 0,
            lastUpdated: data.metadata.updatedAt
        };
    }
}

// Initialize the manager
const todoodlesManager = new UserAwareTodoodlesManager();

// Initialize web UI manager (clean separation)
const webUIManager = new TodoodlesWebUIManager(todoodlesManager);

// Function to extract user ID from request (for LibreChat integration)
function extractUserId(request: any): string | undefined {
    // Check multiple possible locations for user ID in order of priority
    const userId = request.params?.userId || // LibreChat sends userId in params
        request.meta?.user_id ||
        request.meta?.userId ||
        request.meta?.phone_number || // SMS users  
        request.params?.user_id ||
        process.env.MCP_USER_ID;

    if (process.env.MCP_DEBUG === 'true') {
        log('DEBUG', `Extracted user ID: ${userId}`, {
            'request.params?.userId': request.params?.userId,
            'request.meta?.user_id': request.meta?.user_id,
            'request.meta?.userId': request.meta?.userId,
            'request.meta?.phone_number': request.meta?.phone_number,
            'request.params?.user_id': request.params?.user_id,
            'process.env.MCP_USER_ID': process.env.MCP_USER_ID
        });
    }

    return userId;
}

// Create the MCP server
const server = new Server(
    {
        name: "todoodles",
        version: "2.1.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "add_todoodle",
                description: "Add a new todoodle item with optional category, priority, and due date",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "The todoodle text"
                        },
                        category: {
                            type: "string",
                            description: "Optional category for the todoodle"
                        },
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "Priority level (default: medium)"
                        },
                        dueDate: {
                            type: "string",
                            description: "Optional due date in ISO format"
                        }
                    },
                    required: ["text"]
                }
            },
            {
                name: "complete_todoodle",
                description: "Mark a todoodle as completed",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the todoodle to complete"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "update_todoodle",
                description: "Update a todoodle's text, category, priority, or due date",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the todoodle to update"
                        },
                        text: {
                            type: "string",
                            description: "New text for the todoodle"
                        },
                        category: {
                            type: "string",
                            description: "New category for the todoodle"
                        },
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "New priority level"
                        },
                        dueDate: {
                            type: "string",
                            description: "New due date in ISO format"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "get_all_todoodles",
                description: "Get all todoodles or filter by completion status",
                inputSchema: {
                    type: "object",
                    properties: {
                        completed: {
                            type: "boolean",
                            description: "Filter by completion status (true=completed, false=incomplete, omit=all)"
                        }
                    },
                    required: []
                }
            },
            {
                name: "search_todoodles",
                description: "Search todoodles by text or category",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search query for text or category"
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_todoodles_by_category",
                description: "Get todoodles by category",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Category name"
                        }
                    },
                    required: ["category"]
                }
            },
            {
                name: "get_todoodles_by_priority",
                description: "Get todoodles by priority level",
                inputSchema: {
                    type: "object",
                    properties: {
                        priority: {
                            type: "string",
                            enum: ["low", "medium", "high", "urgent"],
                            description: "Priority level"
                        }
                    },
                    required: ["priority"]
                }
            },
            {
                name: "get_due_todoodles",
                description: "Get todoodles that are due today or overdue",
                inputSchema: {
                    type: "object",
                    properties: {
                        overdue_only: {
                            type: "boolean",
                            description: "If true, only return overdue todoodles"
                        }
                    },
                    required: []
                }
            },
            {
                name: "delete_todoodle",
                description: "Delete a todoodle permanently",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the todoodle to delete"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "get_categories",
                description: "Get all unique categories",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_todoodles_stats",
                description: "Get statistics about todoodles",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_web_ui",
                description: "Get a web interface for managing todoodles, then return the link in markdown format",
                inputSchema: {
                    type: "object",
                    properties: {
                        extend_minutes: {
                            type: "number",
                            description: "Minutes to extend session (default: 30)",
                            minimum: 5,
                            maximum: 120
                        }
                    },
                    additionalProperties: false
                }
            }
        ]
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const userId = extractUserId(request);

    try {
        switch (request.params.name) {
            case "add_todoodle": {
                const { text, category, priority = 'medium', dueDate } = request.params.arguments as any;
                const todoodle = await todoodlesManager.addTodo(text, category, priority, dueDate, userId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Added todoodle: ${todoodle.text} (ID: ${todoodle.id})`
                        }
                    ]
                };
            }

            case "complete_todoodle": {
                const { id } = request.params.arguments as any;
                const todoodle = await todoodlesManager.completeTodo(id, userId);
                if (todoodle) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Completed todoodle: ${todoodle.text} (completed in ${todoodle.timeToComplete ? Math.round(todoodle.timeToComplete / 1000) + ' seconds' : 'unknown time'})`
                            }
                        ]
                    };
                } else {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Todoodle with ID ${id} not found`
                            }
                        ]
                    };
                }
            }

            case "update_todoodle": {
                const { id, text, category, priority, dueDate } = request.params.arguments as any;
                const result = await todoodlesManager.updateTodo(id, { text, category, priority, dueDate }, userId);
                if (result.success && result.updatedTodo) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Updated todoodle: ${result.updatedTodo.text} (ID: ${result.updatedTodo.id})`
                            }
                        ]
                    };
                } else {
                    return {
                        content: [{ type: "text", text: "Error: Todoodle not found" }],
                        isError: true
                    };
                }
            }

            case "get_all_todoodles": {
                const { completed } = request.params.arguments as any;
                let todoodles;

                if (completed === true) {
                    todoodles = (await todoodlesManager.getTodos(userId)).filter(t => t.completed);
                } else if (completed === false) {
                    todoodles = await todoodlesManager.getIncompleteTodos(userId);
                } else {
                    todoodles = await todoodlesManager.getTodos(userId);
                }

                const todoText = todoodles.map(t =>
                    `${t.id}. ${t.text} ${t.completed ? '✓' : '○'} [${t.priority}] ${t.category ? `(${t.category})` : ''} ${t.dueDate ? `Due: ${t.dueDate}` : ''}`
                ).join('\n');

                return {
                    content: [
                        {
                            type: "text",
                            text: todoodles.length > 0 ? todoText : "No todoodles found"
                        }
                    ]
                };
            }

            case "search_todoodles": {
                const { query } = request.params.arguments as any;
                const todoodles = await todoodlesManager.searchTodos(query, userId);

                const todoText = todoodles.map(t =>
                    `${t.id}. ${t.text} ${t.completed ? '✓' : '○'} [${t.priority}] ${t.category ? `(${t.category})` : ''}`
                ).join('\n');

                return {
                    content: [
                        {
                            type: "text",
                            text: todoodles.length > 0 ? todoText : `No todoodles found matching "${query}"`
                        }
                    ]
                };
            }

            case "get_todoodles_by_category": {
                const { category } = request.params.arguments as any;
                const todoodles = await todoodlesManager.getTodosByCategory(category, userId);

                const todoText = todoodles.map(t =>
                    `${t.id}. ${t.text} ${t.completed ? '✓' : '○'} [${t.priority}]`
                ).join('\n');

                return {
                    content: [
                        {
                            type: "text",
                            text: todoodles.length > 0 ? todoText : `No todoodles found in category "${category}"`
                        }
                    ]
                };
            }

            case "get_todoodles_by_priority": {
                const { priority } = request.params.arguments as any;
                const todoodles = await todoodlesManager.getTodosByPriority(priority, userId);

                const todoText = todoodles.map(t =>
                    `${t.id}. ${t.text} ${t.completed ? '✓' : '○'} ${t.category ? `(${t.category})` : ''}`
                ).join('\n');

                return {
                    content: [
                        {
                            type: "text",
                            text: todoodles.length > 0 ? todoText : `No todoodles found with priority "${priority}"`
                        }
                    ]
                };
            }

            case "get_due_todoodles": {
                const { overdue_only } = request.params.arguments as any;
                const todoodles = overdue_only
                    ? await todoodlesManager.getOverdueTodos(userId)
                    : await todoodlesManager.getDueTodos(userId);

                const todoText = todoodles.map(t =>
                    `${t.id}. ${t.text} [${t.priority}] Due: ${t.dueDate} ${t.category ? `(${t.category})` : ''}`
                ).join('\n');

                return {
                    content: [
                        {
                            type: "text",
                            text: todoodles.length > 0 ? todoText : `No ${overdue_only ? 'overdue' : 'due'} todoodles found`
                        }
                    ]
                };
            }

            case "delete_todoodle": {
                const { id } = request.params.arguments as any;
                const result = await todoodlesManager.deleteTodo(id, userId);

                if (result.success && result.deletedTodo) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Deleted todoodle: "${result.deletedTodo.text}"`
                            }
                        ]
                    };
                } else {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Todoodle with ID ${id} not found`
                            }
                        ]
                    };
                }
            }

            case "get_categories": {
                const categories = await todoodlesManager.getCategories(userId);

                return {
                    content: [
                        {
                            type: "text",
                            text: categories.length > 0 ? categories.join(', ') : "No categories found"
                        }
                    ]
                };
            }

            case "get_todoodles_stats": {
                const stats = await todoodlesManager.getStats(userId);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Todoodles Statistics:
Total: ${stats.total}
Completed: ${stats.completed}
Incomplete: ${stats.incomplete}
Overdue: ${stats.overdue}
Categories: ${stats.categories.length}
Average completion time: ${Math.round(stats.averageCompletionTime / 1000 / 60)} minutes
Last updated: ${stats.lastUpdated}`
                        }
                    ]
                };
            }

            case "get_web_ui": {
                log('INFO', `[TODOODLES-WEB-UI-SERVER] get_web_ui called with extracted userId: "${userId}"`);
                log('INFO', `[TODOODLES-WEB-UI-SERVER] Passing userId to web UI: "${userId || 'default'}"`);
                return await webUIManager.handleGetWebUI(userId || 'default');
            }

            default:
                throw new Error(`Unknown tool: ${request.params.name}`);
        }
    } catch (error: any) {
        log('ERROR', `Tool ${request.params.name} failed for user ${userId}: ${error.message}`);
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error.message}`
                }
            ],
            isError: true
        };
    }
});

// Cleanup on process exit
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
}

main().catch((error) => {
    log('ERROR', `Failed to start server: ${error.message}`);
    process.exit(1);
}); 