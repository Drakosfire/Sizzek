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
import {
    GroceryItem,
    GroceryData
} from './types/index.js';

// Export the web UI integration
export { GroceryListWebUIManager } from './web-ui-integration.js';
import { GroceryListWebUIManager } from './web-ui-integration.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from inherited environment variables
function loadEnv(serverLabel: string) {
    // Check if we have inherited environment variables from parent process
    const envVarsPresent = process.env.LIBRECHAT_API_KEY || process.env.MONGO_URI;
    const usedPath = envVarsPresent ? '(inherited env vars)' : '(default)';

    if (!envVarsPresent) {
        console.error(`[${serverLabel}] Warning: No environment variables found. Check LibreChat configuration.`);
    }

    // Back-compat for URI naming
    if (!process.env.MONGO_URI && process.env.MONGODB_URI) {
        process.env.MONGO_URI = process.env.MONGODB_URI;
    }
    if (!process.env.MONGODB_URI && process.env.MONGO_URI) {
        process.env.MONGODB_URI = process.env.MONGO_URI;
    }

    console.error(`[${serverLabel}] Env loaded: ${usedPath}`);
}

loadEnv('GroceryList');

// Enhanced logging function
function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}][${level}][GroceryList MCP] ${message}`;
    console.error(logMessage);

    if (data && process.env.MCP_DEBUG === 'true') {
        console.error(JSON.stringify(data, null, 2));
    }
}

// User-aware Grocery List Manager using shared storage
export class GroceryListManager {
    private storage: ReturnType<typeof this.createStorage>;
    private defaultUserId = 'default';
    private isUserBased: boolean;
    private operationLocks: Map<string, Promise<any>> = new Map();

    constructor() {
        // Debug environment variables
        log('DEBUG', 'Environment variables', {
            MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE,
            MONGO_URI: process.env.MONGO_URI?.replace(/\/\/.*@/, '//***@'), // Hide credentials
            MONGODB_DATABASE: process.env.MONGODB_DATABASE,
            MONGODB_COLLECTION: process.env.MONGODB_COLLECTION,
            MCP_USER_ID: process.env.MCP_USER_ID,
            MCP_USER_BASED: process.env.MCP_USER_BASED,
            GROCERY_FILE_PATH: process.env.GROCERY_FILE_PATH
        });

        this.isUserBased = process.env.MCP_USER_BASED === 'true';
        this.storage = this.createStorage();

        log('INFO', 'GroceryListManager initialized with storage type: ' + (process.env.MCP_STORAGE_TYPE || 'json') + ', userBased: ' + this.isUserBased);
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

                case "purchase_item": {
                    const { id } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    // Check if item exists and is not already purchased
                    const existingData = await this.getGroceryData(userId);
                    const existing = existingData.items.find(item => item.id === id);

                    if (!existing) {
                        return {
                            content: [{ type: "text", text: "Error: Grocery item not found" }],
                            isError: true
                        };
                    }

                    if (existing.purchased) {
                        return {
                            content: [{ type: "text", text: "Error: Item is already purchased" }],
                            isError: true
                        };
                    }

                    const item = await this.purchaseItem(id, userId);

                    if (item) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Item purchased: ${item.name}`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [{ type: "text", text: "Error: Failed to purchase item" }],
                            isError: true
                        };
                    }
                }

                case "unpurchase_item": {
                    const { id } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    const item = await this.unpurchaseItem(id, userId);

                    if (item) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Item unpurchased: ${item.name}`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [{ type: "text", text: "Error: Failed to unpurchase item" }],
                            isError: true
                        };
                    }
                }

                case "update_grocery_item": {
                    const { id, name, quantity, unit, category } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    // Prepare updates object with only provided fields
                    const updates: Partial<GroceryItem> = {};
                    if (name !== undefined) updates.name = name;
                    if (quantity !== undefined) updates.quantity = quantity;
                    if (unit !== undefined) updates.unit = unit;
                    if (category !== undefined) updates.category = category;

                    const item = await this.updateGroceryItem(id, updates, userId);

                    if (item) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Updated grocery item: ${item.name} (ID: ${item.id})`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [{ type: "text", text: "Error: Grocery item not found" }],
                            isError: true
                        };
                    }
                }

                case "get_grocery_list": {
                    log('INFO', `[REQUEST-${requestId}] Processing get_grocery_list`);
                    const { purchased } = request.params.arguments;

                    let items;

                    if (purchased === true) {
                        log('INFO', `[REQUEST-${requestId}] Fetching purchased items only`);
                        items = (await this.getGroceryItems(userId)).filter(t => t.purchased);
                    } else if (purchased === false) {
                        log('INFO', `[REQUEST-${requestId}] Fetching unpurchased items only`);
                        items = (await this.getGroceryItems(userId)).filter(t => !t.purchased);
                    } else {
                        log('INFO', `[REQUEST-${requestId}] Fetching all items`);
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

                case "delete_grocery_item": {
                    const { id } = request.params.arguments;

                    if (!id) {
                        return {
                            content: [{ type: "text", text: "Error: id is required" }],
                            isError: true
                        };
                    }

                    const result = await this.deleteGroceryItem(id, userId);

                    if (result.success && result.deletedItem) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Deleted grocery item: "${result.deletedItem.name}"`
                                }
                            ]
                        };
                    } else {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "Error: Grocery item not found"
                                }
                            ],
                            isError: true
                        };
                    }
                }

                case "search_grocery_items": {
                    const { query } = request.params.arguments;

                    if (!query) {
                        return {
                            content: [{ type: "text", text: "Error: query is required" }],
                            isError: true
                        };
                    }

                    const items = await this.searchGroceryItems(query, userId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(items, null, 2)
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

                case "get_grocery_stats": {
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

                default:
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Error: Unknown tool "${request.params.name}"`
                            }
                        ],
                        isError: true
                    };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            log('ERROR', `[REQUEST-${requestId}] Tool execution failed after ${duration}ms: ${error}`);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
                    }
                ],
                isError: true
            };
        } finally {
            const duration = Date.now() - startTime;
            log('INFO', `[REQUEST-${requestId}] ===== REQUEST COMPLETED in ${duration}ms =====`);
        }
    }

    private createStorage() {
        const storageType = process.env.MCP_STORAGE_TYPE || 'json';
        const defaultData: GroceryData = {
            items: [],
            lists: [],
            priceHistory: [],
            receipts: [],
            metadata: {
                lastId: 0,
                lastListId: 0,
                lastReceiptId: 0,
                lastPriceHistoryId: 0,
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                totalItems: 0,
                purchasedItems: 0,
                totalSpent: 0,
                avgMonthlySpent: 0,
                lastCalculatedAt: new Date().toISOString()
            }
        };

        const config = {
            type: storageType as 'json' | 'mongodb',
            mongodb: storageType === 'mongodb' ? {
                connectionString: process.env.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/LibreChat',
                databaseName: process.env.MONGODB_DATABASE || 'LibreChat',
                collectionName: process.env.MONGODB_COLLECTION || 'user_grocery_data',
                connectionTimeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
                maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
                encryptionKey: process.env.CREDS_KEY
            } : undefined,
            json: storageType === 'json' ? {
                baseDir: path.dirname(process.env.GROCERY_FILE_PATH || './grocery-data.json'),
                createDirIfNotExists: true,
                backupEnabled: process.env.MCP_BACKUP_ENABLED === 'true'
            } : undefined
        };

        return StorageFactory.createUserStorage(config, defaultData);
    }

    private getUserId(): string {
        return process.env.MCP_USER_ID || this.defaultUserId;
    }

    private async withLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
        const lockKey = userId || this.defaultUserId;

        // Wait for any existing operation to complete
        while (this.operationLocks.has(lockKey)) {
            await this.operationLocks.get(lockKey);
        }

        // Create new operation promise
        const promise = operation();
        this.operationLocks.set(lockKey, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            // Clean up lock
            this.operationLocks.delete(lockKey);
        }
    }

    private async getGroceryData(userId?: string): Promise<GroceryData> {
        const effectiveUserId = this.isUserBased ? (userId || this.getUserId()) : this.defaultUserId;

        try {
            let data;
            if (this.isUserBased) {
                data = await this.storage.loadForUser(effectiveUserId);
            } else {
                data = await this.storage.load();
            }
            log('DEBUG', `Loaded grocery data for user ${effectiveUserId}`, {
                itemCount: data.items?.length || 0,
                lastId: data.metadata?.lastId || 0
            });
            return data;
        } catch (error) {
            log('ERROR', `Failed to load grocery data for user ${effectiveUserId}: ${error}`);
            throw error;
        }
    }

    private async saveGroceryData(data: GroceryData, userId?: string): Promise<void> {
        const effectiveUserId = this.isUserBased ? (userId || this.getUserId()) : this.defaultUserId;

        // Update metadata
        data.metadata.updatedAt = new Date().toISOString();
        data.metadata.totalItems = data.items.length;
        data.metadata.purchasedItems = data.items.filter(item => item.purchased).length;

        try {
            if (this.isUserBased) {
                await this.storage.saveForUser(effectiveUserId, data);
            } else {
                await this.storage.save(data);
            }
            log('DEBUG', `Saved grocery data for user ${effectiveUserId}`, {
                itemCount: data.items.length
            });
        } catch (error) {
            log('ERROR', `Failed to save grocery data for user ${effectiveUserId}: ${error}`);
            throw error;
        }
    }

    async addGroceryItem(name: string, quantity: number = 1, category?: string, userId?: string): Promise<GroceryItem> {
        return this.withLock(userId || this.getUserId(), async () => {
            const data = await this.getGroceryData(userId);

            const newItem: GroceryItem = {
                id: (++data.metadata.lastId).toString(),
                name: name.trim(),
                quantity: quantity,
                unit: 'pieces', // Simple default for Phase 1
                category: category || this.categorizeItem(name),
                priority: 'medium', // Simple default for Phase 1
                purchased: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isStaple: false
            };

            data.items.push(newItem);
            await this.saveGroceryData(data, userId);

            log('INFO', `Added grocery item: ${newItem.name} (ID: ${newItem.id}) for user: ${userId || this.getUserId()}`);
            return newItem;
        });
    }

    async purchaseItem(id: string, userId?: string): Promise<GroceryItem | null> {
        return this.withLock(userId || this.getUserId(), async () => {
            const data = await this.getGroceryData(userId);
            const item = data.items.find(i => i.id === id);

            if (!item) {
                log('WARN', `Attempted to purchase non-existent item: ${id}`);
                return null;
            }

            if (item.purchased) {
                log('WARN', `Attempted to purchase already purchased item: ${id}`);
                return null;
            }

            const purchaseDate = new Date().toISOString();

            // Update item - simple completion like todoodles
            item.purchased = true;
            item.purchasedAt = purchaseDate;
            item.updatedAt = purchaseDate;

            await this.saveGroceryData(data, userId);

            log('INFO', `Purchased item: ${item.name} (ID: ${item.id})`);
            return item;
        });
    }

    async unpurchaseItem(id: string, userId?: string): Promise<GroceryItem | null> {
        return this.withLock(userId || this.getUserId(), async () => {
            const data = await this.getGroceryData(userId);
            const item = data.items.find(i => i.id === id);

            if (!item) {
                log('WARN', `Attempted to unpurchase non-existent item: ${id}`);
                return null;
            }

            if (!item.purchased) {
                log('WARN', `Attempted to unpurchase already pending item: ${id}`);
                return null;
            }

            const updateDate = new Date().toISOString();

            // Update item - mark as pending again
            item.purchased = false;
            delete item.purchasedAt; // Remove purchase timestamp
            item.updatedAt = updateDate;

            await this.saveGroceryData(data, userId);

            log('INFO', `Unpurchased item: ${item.name} (ID: ${item.id})`);
            return item;
        });
    }

    async getGroceryItems(userId?: string): Promise<GroceryItem[]> {
        const data = await this.getGroceryData(userId);
        return data.items;
    }

    async searchGroceryItems(query: string, userId?: string): Promise<GroceryItem[]> {
        const data = await this.getGroceryData(userId);
        const lowerQuery = query.toLowerCase();

        return data.items.filter(item =>
            item.name.toLowerCase().includes(lowerQuery) ||
            item.category.toLowerCase().includes(lowerQuery)
        );
    }

    async getGroceryItem(id: string, userId?: string): Promise<GroceryItem | null> {
        const data = await this.getGroceryData(userId);
        const item = data.items.find(item => item.id === id);
        return item || null;
    }

    async updateGroceryItem(id: string, updates: Partial<GroceryItem>, userId?: string): Promise<GroceryItem | null> {
        return this.withLock(userId || this.getUserId(), async () => {
            const data = await this.getGroceryData(userId);
            const item = data.items.find(item => item.id === id);

            if (!item) {
                log('WARN', `Grocery item not found for update: ${id}`);
                return null;
            }

            // Update only provided fields
            if (updates.name !== undefined) {
                item.name = updates.name.trim();
            }
            if (updates.quantity !== undefined) {
                item.quantity = updates.quantity;
            }
            if (updates.unit !== undefined) {
                item.unit = updates.unit;
            }
            if (updates.category !== undefined) {
                item.category = updates.category || this.categorizeItem(item.name);
            }
            if (updates.priority !== undefined) {
                item.priority = updates.priority;
            }
            if (updates.purchased !== undefined) {
                item.purchased = updates.purchased;
                if (updates.purchased) {
                    item.purchasedAt = new Date().toISOString();
                } else {
                    delete item.purchasedAt;
                }
            }

            // Always update the updatedAt timestamp
            item.updatedAt = new Date().toISOString();

            await this.saveGroceryData(data, userId);

            log('INFO', `Updated grocery item: ${item.name} (ID: ${item.id}) for user: ${userId || this.getUserId()}`);
            return item;
        });
    }

    async deleteGroceryItem(id: string, userId?: string): Promise<{ success: boolean; deletedItem?: GroceryItem }> {
        return this.withLock(userId || this.getUserId(), async () => {
            const data = await this.getGroceryData(userId);
            const index = data.items.findIndex(item => item.id === id);

            if (index === -1) {
                return { success: false };
            }

            const deletedItem = data.items[index];
            data.items.splice(index, 1);
            await this.saveGroceryData(data, userId);

            log('INFO', `Deleted grocery item: ${deletedItem.name} (ID: ${id})`);
            return { success: true, deletedItem };
        });
    }

    async getCategories(userId?: string): Promise<string[]> {
        const data = await this.getGroceryData(userId);
        const categories = [...new Set(data.items.map(item => item.category))];
        return categories.sort();
    }

    async getStats(userId?: string): Promise<any> {
        const data = await this.getGroceryData(userId);
        const items = data.items;

        const totalItems = items.length;
        const purchasedItems = items.filter(item => item.purchased).length;
        const pendingItems = totalItems - purchasedItems;

        const categories = await this.getCategories(userId);
        const categoryStats = categories.map(category => {
            const categoryItems = items.filter(item => item.category === category);
            const categoryPurchased = categoryItems.filter(item => item.purchased);

            return {
                category,
                totalItems: categoryItems.length,
                purchasedItems: categoryPurchased.length
            };
        });

        return {
            totalItems,
            purchasedItems,
            pendingItems,
            lastUpdated: data.metadata.updatedAt,
            categoryStats
        };
    }

    private categorizeItem(name: string): string {
        // Simple categorization based on item name
        const lowerName = name.toLowerCase();

        // Simple keyword-based categorization
        const categoryMappings: { [key: string]: string[] } = {
            produce: ['apple', 'banana', 'lettuce', 'tomato', 'onion', 'carrot', 'fruit', 'vegetable'],
            dairy: ['milk', 'cheese', 'yogurt', 'butter', 'cream'],
            meat: ['chicken', 'beef', 'pork', 'fish', 'turkey', 'ham'],
            frozen: ['ice cream', 'frozen', 'ice'],
            pantry: ['rice', 'pasta', 'bread', 'cereal', 'flour', 'sugar'],
            cleaning: ['detergent', 'soap', 'cleaner', 'bleach'],
            'personal care': ['shampoo', 'toothpaste', 'deodorant'],
            beverages: ['water', 'juice', 'soda', 'coffee', 'tea']
        };

        for (const [category, keywords] of Object.entries(categoryMappings)) {
            if (keywords.some(keyword => lowerName.includes(keyword))) {
                return category;
            }
        }

        return 'other';
    }
}

// Enhanced user context interface
interface UserContext {
    userId: string;
    originalUserId?: string;
    sharedWith: string[];
    contextType: 'user' | 'shared';
    tenantId?: string;
    isSharedContext: boolean;
    effectiveUserId: string;
}

// Enhanced user context extraction supporting scheduled task context
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

// Backward compatibility: Extract user ID using legacy method
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

// Initialize the grocery list manager
const groceryListManager = new GroceryListManager();

// Initialize the web UI manager
const webUIManager = new GroceryListWebUIManager(groceryListManager, true);

// Create the MCP server
const server = new Server(
    {
        name: "grocery-list",
        version: "1.0.0",
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
                name: "add_grocery_item",
                description: "Add a new grocery item to the list",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "The name of the grocery item"
                        },
                        quantity: {
                            type: "number",
                            description: "Quantity needed (default: 1)"
                        },
                        category: {
                            type: "string",
                            description: "Store category (produce, dairy, etc.)"
                        }
                    },
                    required: ["name"]
                }
            },
            {
                name: "purchase_item",
                description: "Mark an item as purchased/completed",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the grocery item to mark as purchased"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "unpurchase_item",
                description: "Mark an item as unpurchased/pending",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the grocery item to mark as unpurchased"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "update_grocery_item",
                description: "Update an existing grocery item",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the grocery item to update"
                        },
                        name: {
                            type: "string",
                            description: "The new name of the grocery item"
                        },
                        quantity: {
                            type: "number",
                            description: "The new quantity needed"
                        },
                        unit: {
                            type: "string",
                            description: "The new unit (lbs, oz, pieces, etc.)"
                        },
                        category: {
                            type: "string",
                            description: "The new store category (produce, dairy, etc.)"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "get_grocery_list",
                description: "Get grocery items with optional filtering",
                inputSchema: {
                    type: "object",
                    properties: {
                        purchased: {
                            type: "boolean",
                            description: "Filter by purchase status (true=purchased, false=pending)"
                        }
                    }
                }
            },
            {
                name: "delete_grocery_item",
                description: "Delete a grocery item",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "The ID of the grocery item to delete"
                        }
                    },
                    required: ["id"]
                }
            },
            {
                name: "search_grocery_items",
                description: "Search grocery items by name or category",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search query"
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_categories",
                description: "Get all available categories",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "get_grocery_stats",
                description: "Get grocery list statistics",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "get_web_ui",
                description: "Get an interactive web UI for managing grocery items, then return the link in markdown format",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            }
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return groceryListManager.handleToolCall(request);
});

// Cleanup on process exit
process.on('SIGINT', async () => {
    log('INFO', 'Shutting down...');
    await groceryListManager.cleanup();
    await webUIManager.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('INFO', 'Shutting down...');
    await groceryListManager.cleanup();
    await webUIManager.cleanup();
    process.exit(0);
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log('INFO', 'Grocery List MCP Server started successfully');
}

main().catch((error) => {
    log('ERROR', 'Failed to start server:', error);
    process.exit(1);
}); 