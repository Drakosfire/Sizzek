/**
 * Type definitions for Grocery List MCP Server - Phase 1 (Simplified)
 * Based on the proven architecture of todoodles with basic grocery functionality
 */

export interface GroceryItem {
    id: string;                    // Sequential numeric ID (per user)
    name: string;                  // Item name
    quantity: number;              // Quantity needed
    unit: string;                  // Unit (default: "pieces" for Phase 1)
    category: string;              // Store section (produce, dairy, etc.)
    priority: 'low' | 'medium' | 'high' | 'urgent'; // Priority level
    purchased: boolean;            // Purchase status
    purchasedAt?: string;          // Purchase timestamp
    createdAt: string;             // ISO timestamp
    updatedAt: string;             // Last update timestamp
    isStaple: boolean;             // Is this a regular purchase?
}

export interface GroceryData {
    items: GroceryItem[];
    lists: ShoppingList[];         // For future phases
    priceHistory: PriceHistory[];  // For future phases
    receipts: Receipt[];           // For future phases
    metadata: {
        lastId: number;
        lastListId: number;
        lastReceiptId: number;
        lastPriceHistoryId: number;
        version: string;
        updatedAt: string;
        totalItems: number;
        purchasedItems: number;
        totalSpent: number;         // For future phases
        avgMonthlySpent: number;    // For future phases
        lastCalculatedAt: string;
    };
}

// Future phase interfaces (kept for structure but not used in Phase 1)
export interface ShoppingList {
    id: string;
    name: string;
    storeName?: string;
    scheduledDate?: string;
    completed: boolean;
    completedAt?: string;
    itemIds: string[];
    createdAt: string;
}

export interface PriceHistory {
    id: string;
    itemName: string;
    price: number;
    storeName: string;
    purchaseDate: string;
    brand?: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    groceryItemId: string;
    createdAt: string;
}

export interface Receipt {
    id: string;
    storeName: string;
    purchaseDate: string;
    totalAmount: number;
    items: ReceiptItem[];
    imageUrl?: string;
    processed: boolean;
    createdAt: string;
}

export interface ReceiptItem {
    name: string;
    price: number;
    quantity: number;
    unit: string;
    matchedItemId?: string;
}

// Phase 1 Request interfaces (simplified)
export interface AddGroceryItemRequest {
    name: string;
    quantity?: number;
    category?: string;
}

export interface PurchaseItemRequest {
    id: string;
}

// Future phase request interfaces (for reference)
export interface CreateShoppingListRequest {
    name: string;
    storeName?: string;
    scheduledDate?: string;
    itemIds?: string[];
}

export interface ProcessReceiptRequest {
    receiptText: string;
    storeName: string;
    purchaseDate: string;
}

export interface GetPriceHistoryRequest {
    itemName: string;
    storeName?: string;
    daysBack?: number;
}

export interface AnalyzeSpendingRequest {
    period: 'week' | 'month' | 'year';
    category?: string;
}

// Configuration types
export interface GroceryServerConfig {
    storage: {
        type: 'json' | 'mongodb';
        filePath?: string;
        mongodb?: {
            connectionString: string;
            database: string;
            collection: string;
        };
    };
    features: {
        priceTracking: boolean;
        receiptProcessing: boolean;
        budgetAlerts: boolean;
        staplesDetection: boolean;
        familySharing: boolean;
    };
    defaults: {
        store: string;
        categories: string[];
        units: string[];
        monthlyBudget: number;
    };
    webUI: {
        baseUrl: string;
        enableMobileOptimization: boolean;
    };
}

// Error types
export interface GroceryError {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
}

// Utility types
export type GroceryItemStatus = 'pending' | 'purchased' | 'cancelled';
export type ShoppingListStatus = 'planning' | 'shopping' | 'completed' | 'cancelled';
export type PriceTrackingPeriod = '7d' | '30d' | '90d' | '1y' | 'all';
export type SortOrder = 'asc' | 'desc';
export type FilterOperation = 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';

// Web UI specific types
export interface GroceryUIConfig {
    enableQuantity: boolean;
    enableUnits: boolean;
    enablePricing: boolean;
    enableCategories: boolean;
    enableShopping: boolean;
    enableBudgetTracking: boolean;
    enableReceiptIntegration: boolean;
    defaultUnits: string[];
    defaultCategories: string[];
    groupBy: 'category' | 'priority' | 'store' | 'none';
} 