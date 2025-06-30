/**
 * Type definitions for Grocery List MCP Server
 * Based on the proven architecture of todoodles with grocery-specific enhancements
 */

export interface GroceryItem {
    id: string;                    // Sequential numeric ID (per user)
    name: string;                  // Item name
    description?: string;          // Optional description/notes
    quantity: number;              // Quantity needed
    unit: string;                  // Unit (lbs, oz, pieces, etc.)
    category: string;              // Store section (produce, dairy, etc.)
    priority: 'low' | 'medium' | 'high' | 'urgent';
    purchased: boolean;            // Purchase status
    purchasedAt?: string;          // Purchase timestamp
    priceExpected?: number;        // Expected price
    priceActual?: number;          // Actual paid price
    storeName?: string;            // Where to buy / where bought
    brand?: string;                // Preferred brand
    isStaple: boolean;             // Is this a regular purchase?
    lastPurchased?: string;        // Last purchase date
    purchaseFrequency?: number;    // Days between purchases (calculated)
    createdAt: string;             // ISO timestamp
    updatedAt: string;             // Last update timestamp
    addedBy?: string;              // User who added (for family sharing)
    listId?: string;               // Shopping list/trip ID
}

export interface ShoppingList {
    id: string;
    name: string;
    storeName?: string;
    scheduledDate?: string;
    completed: boolean;
    completedAt?: string;
    itemIds: string[];             // References to GroceryItem.id
    totalBudget?: number;
    actualSpent?: number;
    createdAt: string;
    updatedAt: string;
}

export interface PriceHistory {
    id: string;
    itemName: string;              // Normalized item name
    price: number;
    storeName: string;
    purchaseDate: string;
    brand?: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;          // Calculated price per unit
    groceryItemId?: string;        // Link to original grocery item
    receiptId?: string;            // Link to receipt if from receipt
    createdAt: string;
}

export interface Receipt {
    id: string;
    storeName: string;
    purchaseDate: string;
    totalAmount: number;
    items: ReceiptItem[];
    imageUrl?: string;             // For receipt image storage
    processed: boolean;            // Whether receipt has been processed
    notes?: string;                // Additional notes
    createdAt: string;
    updatedAt: string;
}

export interface ReceiptItem {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    category?: string;             // Auto-categorized
    matchedItemId?: string;        // Link to grocery item if matched
    tax?: number;                  // Tax amount if applicable
}

export interface GroceryData {
    items: GroceryItem[];
    lists: ShoppingList[];         // Shopping trip lists
    priceHistory: PriceHistory[];  // Historical price data
    receipts: Receipt[];           // Receipt records
    metadata: GroceryMetadata;
}

export interface GroceryMetadata {
    lastId: number;
    lastListId: number;
    lastReceiptId: number;
    lastPriceHistoryId: number;
    version: string;
    updatedAt: string;
    totalItems: number;
    purchasedItems: number;
    totalSpent: number;            // Lifetime spending
    avgMonthlySpent: number;       // Average monthly spending
    lastCalculatedAt: string;      // Last time stats were calculated
}

export interface UserPreferences {
    defaultStore: string;
    preferredUnits: string[];
    budgetLimits: {
        weekly?: number;
        monthly?: number;
        yearly?: number;
    };
    categories: CategoryDefinition[];
    notifications: {
        budgetAlerts: boolean;
        staplesReminders: boolean;
        priceAlerts: boolean;
    };
    privacy: {
        shareWithFamily: boolean;
        allowPriceTracking: boolean;
    };
}

export interface CategoryDefinition {
    name: string;
    icon: string;
    sortOrder: number;
    storeSection?: string;         // Physical store section
    budgetAllocation?: number;     // Percentage of budget for this category
}

export interface FrequencyAnalysis {
    itemName: string;
    averageDaysBetweenPurchases: number;
    totalPurchases: number;
    lastPurchaseDate: string;
    nextSuggestedDate: string;
    confidence: number;            // 0-1, how confident we are in the prediction
    isStaple: boolean;
    seasonalPattern?: SeasonalPattern;
}

export interface SeasonalPattern {
    spring: number;   // Purchase frequency multiplier for spring
    summer: number;   // Purchase frequency multiplier for summer
    fall: number;     // Purchase frequency multiplier for fall
    winter: number;   // Purchase frequency multiplier for winter
}

export interface PriceAnalysis {
    itemName: string;
    currentPrice: number;
    averagePrice: number;
    lowestPrice: number;
    highestPrice: number;
    priceHistory: PriceHistory[];
    trend: 'increasing' | 'decreasing' | 'stable';
    trendPercentage: number;       // Percentage change over time
    bestStore: string;             // Store with best average price
    worstStore: string;            // Store with highest average price
}

export interface BudgetAnalysis {
    period: 'week' | 'month' | 'quarter' | 'year';
    startDate: string;
    endDate: string;
    totalBudget: number;
    totalSpent: number;
    remainingBudget: number;
    percentageUsed: number;
    categoryBreakdown: CategorySpending[];
    isOverBudget: boolean;
    projectedSpending?: number;    // Based on current trends
}

export interface CategorySpending {
    category: string;
    budgetAllocated: number;
    amountSpent: number;
    percentageUsed: number;
    isOverBudget: boolean;
    itemCount: number;
}

export interface ShoppingOptimization {
    listId: string;
    storeName: string;
    optimizedRoute: string[];      // Categories in optimal order
    estimatedTime: number;         // Estimated shopping time in minutes
    estimatedTotal: number;        // Estimated total cost
    suggestions: OptimizationSuggestion[];
}

export interface OptimizationSuggestion {
    type: 'substitution' | 'quantity' | 'store' | 'timing';
    itemId: string;
    currentValue: string | number;
    suggestedValue: string | number;
    reason: string;
    potentialSavings?: number;
}

// Request/Response types for MCP tools
export interface AddGroceryItemRequest {
    name: string;
    quantity?: number;
    unit?: string;
    category?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    priceExpected?: number;
    storeName?: string;
    brand?: string;
    listId?: string;
    description?: string;
}

export interface PurchaseItemRequest {
    id: string;
    priceActual?: number;
    storeName?: string;
    purchaseDate?: string;
    notes?: string;
}

export interface CreateShoppingListRequest {
    name: string;
    storeName?: string;
    scheduledDate?: string;
    budget?: number;
    itemIds?: string[];
}

export interface ProcessReceiptRequest {
    receiptText: string;
    storeName: string;
    purchaseDate?: string;
    imageUrl?: string;
    totalAmount?: number;
}

export interface GetPriceHistoryRequest {
    itemName: string;
    storeName?: string;
    daysBack?: number;
    includeAllStores?: boolean;
}

export interface AnalyzeSpendingRequest {
    period: 'week' | 'month' | 'quarter' | 'year';
    category?: string;
    startDate?: string;
    endDate?: string;
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