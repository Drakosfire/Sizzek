# Grocery List MCP Server - Comprehensive Design Document

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

**Advanced Grocery List Management MCP Server**

A sophisticated MCP server for comprehensive grocery list management, built on the proven todoodles architecture. Features price tracking, frequency analysis, receipt processing, and intelligent shopping trip planning.

---

## 🎯 **Executive Summary**

The **Grocery List MCP Server** leverages the robust, battle-tested architecture of the todoodles MCP server while adding grocery-specific enhancements. This server provides user-isolated grocery list management with advanced features like:

- **🛒 Smart Grocery Lists**: Quantity, units, categories, and priority management
- **💰 Price Tracking**: Historical price data and trend analysis
- **📊 Frequency Analysis**: Automatic staples identification and purchase patterns
- **🧾 Receipt Processing**: OCR and manual receipt entry with item matching
- **🗺️ Shopping Trip Planning**: Route optimization and budget management
- **👥 User Isolation**: Perfect for LibreChat and SMS user integration
- **🌐 Rich Web UI**: Built with vanilla JS framework for responsive experience

---

## 🏗️ **Architecture Overview**

### Core Data Models

```typescript
interface GroceryItem {
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

interface GroceryData {
    items: GroceryItem[];
    lists: ShoppingList[];         // Shopping trip lists
    priceHistory: PriceHistory[];  // Historical price data
    receipts: Receipt[];           // Receipt records
    metadata: {
        lastId: number;
        lastListId: number;
        version: string;
        updatedAt: string;
        totalItems: number;
        purchasedItems: number;
        totalSpent: number;         // Lifetime spending
        avgMonthlySpent: number;    // Average monthly spending
    };
}

interface ShoppingList {
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
}

interface PriceHistory {
    itemName: string;              // Normalized item name
    price: number;
    storeName: string;
    purchaseDate: string;
    brand?: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;          // Calculated price per unit
}

interface Receipt {
    id: string;
    storeName: string;
    purchaseDate: string;
    totalAmount: number;
    items: ReceiptItem[];
    imageUrl?: string;             // For receipt image storage
    processed: boolean;            // Whether receipt has been processed
    createdAt: string;
}
```

### File Structure

```
grocery-list/
├── src/
│   ├── index.ts                 // Main MCP server (based on todoodles)
│   ├── managers/
│   │   ├── GroceryListManager.ts      // Core business logic
│   │   ├── PriceTrackingManager.ts    // Price history management
│   │   ├── FrequencyAnalyzer.ts       // Purchase frequency analysis
│   │   └── ReceiptProcessor.ts        // Receipt parsing and analysis
│   ├── web-ui-integration.ts          // Web UI manager
│   ├── utils/
│   │   ├── categoryMapping.ts         // Store category mappings
│   │   ├── unitNormalizer.ts          // Unit conversion utilities
│   │   └── priceCalculator.ts         // Price calculation utilities
│   └── types/
│       └── index.ts                   // Type definitions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── helpers/
├── dist/                              // Compiled JavaScript
├── package.json
├── tsconfig.json
├── env.example
└── README.md
```

---

## 🛠️ **Enhanced MCP Tools**

### Core Grocery Operations

#### 1. **add_grocery_item**
Add a new item to the grocery list with comprehensive details.

```json
{
    "name": "add_grocery_item",
    "arguments": {
        "name": "Organic Bananas",
        "quantity": 6,
        "unit": "pieces",
        "category": "produce",
        "priority": "medium",
        "priceExpected": 2.50,
        "storeName": "Whole Foods",
        "brand": "365 Organic"
    }
}
```

#### 2. **purchase_item**
Mark an item as purchased and record actual price/details.

```json
{
    "name": "purchase_item",
    "arguments": {
        "id": "1",
        "priceActual": 2.75,
        "storeName": "Whole Foods",
        "purchaseDate": "2024-12-15T10:30:00Z"
    }
}
```

#### 3. **get_grocery_list**
Retrieve grocery items with flexible filtering options.

```json
{
    "name": "get_grocery_list",
    "arguments": {
        "purchased": false,
        "category": "produce",
        "priority": "high"
    }
}
```

### Shopping List Management

#### 4. **create_shopping_list**
Create organized shopping trips with budgets and planning.

```json
{
    "name": "create_shopping_list",
    "arguments": {
        "name": "Weekly Grocery Run",
        "storeName": "Kroger",
        "scheduledDate": "2024-12-16",
        "budget": 150.00,
        "itemIds": ["1", "2", "3"]
    }
}
```

#### 5. **optimize_shopping_route**
Get optimized shopping route based on store layout.

```json
{
    "name": "optimize_shopping_route",
    "arguments": {
        "listId": "trip-1",
        "storeName": "Kroger"
    }
}
```

### Price Tracking & Analysis

#### 6. **get_price_history**
Analyze price trends for specific items.

```json
{
    "name": "get_price_history",
    "arguments": {
        "itemName": "Organic Bananas",
        "storeName": "Whole Foods",
        "daysBack": 90
    }
}
```

#### 7. **analyze_spending_patterns**
Get detailed spending analysis and insights.

```json
{
    "name": "analyze_spending_patterns",
    "arguments": {
        "period": "month",
        "category": "produce"
    }
}
```

#### 8. **get_staples_analysis**
Identify frequently purchased items and patterns.

```json
{
    "name": "get_staples_analysis",
    "arguments": {
        "minimumFrequency": 2
    }
}
```

### Receipt Processing

#### 9. **process_receipt**
Process receipt data to automatically update purchases.

```json
{
    "name": "process_receipt",
    "arguments": {
        "receiptText": "WHOLE FOODS MARKET\\nORGANIC BANANAS 6CT $2.75\\nMILK GALLON $4.99",
        "storeName": "Whole Foods",
        "purchaseDate": "2024-12-15"
    }
}
```

#### 10. **get_budget_status**
Monitor budget usage and spending patterns.

```json
{
    "name": "get_budget_status",
    "arguments": {
        "period": "month",
        "category": "produce"
    }
}
```

---

## 🎨 **Web UI Integration**

### Enhanced Components

#### **GroceryListComponent.js**
Advanced grocery list interface with quantity, pricing, and categories.

```javascript
class GroceryListComponent extends BaseComponent {
    constructor(element, data, config) {
        const groceryConfig = {
            enableQuantity: true,
            enableUnits: true,
            enablePricing: true,
            enableCategories: true,
            enableShopping: true,
            defaultUnits: ['pieces', 'lbs', 'oz', 'gallons', 'boxes'],
            defaultCategories: [
                'produce', 'dairy', 'meat', 'frozen', 
                'pantry', 'cleaning', 'personal care'
            ],
            enableBudgetTracking: true,
            enableReceiptIntegration: true,
            ...config.grocery
        };
        
        super(element, data, config);
        this.groceryConfig = groceryConfig;
    }
    
    renderGroceryItem(item) {
        return this.html`
            <div class="grocery-item ${item.purchased ? 'purchased' : ''}" 
                 data-id="${item.id}">
                <div class="item-main">
                    <div class="item-checkbox">
                        <input type="checkbox" ${item.purchased ? 'checked' : ''} 
                               data-action="toggle-purchase" data-id="${item.id}">
                    </div>
                    <div class="item-details">
                        <div class="item-name">${item.name}</div>
                        <div class="item-meta">
                            <span class="quantity">${item.quantity} ${item.unit}</span>
                            <span class="category">${item.category}</span>
                            <span class="priority priority-${item.priority}">
                                ${item.priority}
                            </span>
                        </div>
                    </div>
                    <div class="item-pricing">
                        ${item.priceExpected ? 
                            `<span class="price-expected">~$${item.priceExpected}</span>` : ''}
                        ${item.priceActual ? 
                            `<span class="price-actual">$${item.priceActual}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}
```

#### **PriceTrackingComponent.js**
Price history visualization and trend analysis.

```javascript
class PriceTrackingComponent extends BaseComponent {
    renderPriceChart(itemName, priceHistory) {
        return this.html`
            <div class="price-chart">
                <h3>Price History: ${itemName}</h3>
                <canvas class="price-canvas" data-item="${itemName}"></canvas>
                <div class="price-stats">
                    <div class="stat-item">
                        <span class="label">Average:</span>
                        <span class="value">$${this.calculateAverage(priceHistory)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Lowest:</span>
                        <span class="value">$${this.calculateMin(priceHistory)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Highest:</span>
                        <span class="value">$${this.calculateMax(priceHistory)}</span>
                    </div>
                </div>
            </div>
        `;
    }
}
```

### Web UI Schema

```typescript
const groceryUISchema = {
    title: "Grocery List Manager",
    components: [
        {
            type: "stats",
            id: "grocery-stats",
            config: {
                metrics: [
                    { key: "totalItems", label: "Total Items", icon: "🛒", color: "blue" },
                    { key: "purchasedItems", label: "Purchased", icon: "✅", color: "green" },
                    { key: "pendingItems", label: "Pending", icon: "⏳", color: "yellow" },
                    { key: "monthlySpent", label: "This Month", icon: "💰", 
                      color: "purple", type: "currency" },
                    { key: "averageItemPrice", label: "Avg Price", icon: "📊", 
                      color: "orange", type: "currency" }
                ]
            }
        },
        {
            type: "grocery-list",
            id: "main-grocery-list",
            config: {
                enableQuantity: true,
                enablePricing: true,
                enableCategories: true,
                groupBy: "category"
            }
        },
        {
            type: "table",
            id: "shopping-trips",
            config: {
                title: "Shopping Trips",
                fields: [
                    { key: "name", label: "Trip Name", type: "text", sortable: true },
                    { key: "storeName", label: "Store", type: "text" },
                    { key: "scheduledDate", label: "Date", type: "date", sortable: true },
                    { key: "itemCount", label: "Items", type: "number" },
                    { key: "totalBudget", label: "Budget", type: "currency" },
                    { key: "actualSpent", label: "Spent", type: "currency" },
                    { key: "status", label: "Status", type: "badge" }
                ]
            }
        }
    ],
    actions: [
        { id: "add-item", type: "button", label: "Add Item", icon: "➕" },
        { id: "create-trip", type: "button", label: "New Shopping Trip", icon: "🛒" },
        { id: "process-receipt", type: "button", label: "Process Receipt", icon: "🧾" },
        { id: "analyze-spending", type: "button", label: "Spending Analysis", icon: "📊" }
    ]
};
```

---

## 💾 **Storage & Configuration**

### Environment Configuration

```env
# ===== STORAGE CONFIGURATION =====
MCP_STORAGE_TYPE=mongodb

# ===== MONGODB STORAGE =====
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=user_grocery_data

# ===== USER ISOLATION =====
MCP_USER_BASED=true
MCP_USER_ID=${USER_ID}

# ===== GROCERY-SPECIFIC SETTINGS =====
GROCERY_DEFAULT_STORE=Kroger
GROCERY_ENABLE_PRICE_TRACKING=true
GROCERY_ENABLE_RECEIPT_PROCESSING=true
GROCERY_BUDGET_ALERTS=true

# ===== WEB UI CONFIGURATION =====
MCP_WEB_UI_BASE_URL=http://localhost

# ===== ENCRYPTION =====
CREDS_KEY=your-64-character-hex-encryption-key
```

### MongoDB Schema

```javascript
// Collection: user_grocery_data
{
    "userId": "+1234567890",
    "data": {
        "items": [/* GroceryItem[] */],
        "lists": [/* ShoppingList[] */],
        "priceHistory": [/* PriceHistory[] */],
        "receipts": [/* Receipt[] */],
        "metadata": {
            "lastId": 156,
            "lastListId": 12,
            "version": "1.0.0",
            "updatedAt": "2024-12-15T...",
            "totalItems": 156,
            "purchasedItems": 89,
            "totalSpent": 2847.50,
            "avgMonthlySpent": 485.20
        }
    },
    "preferences": {
        "defaultStore": "Whole Foods",
        "preferredUnits": ["lbs", "pieces", "gallons"],
        "budgetLimits": {
            "weekly": 150,
            "monthly": 600
        },
        "categories": [
            { "name": "produce", "icon": "🥕", "sortOrder": 1 },
            { "name": "dairy", "icon": "🥛", "sortOrder": 2 }
        ]
    }
}
```

---

## 🚀 **Implementation Plan**

### Phase 1: Core Foundation (Week 1-2)
- [ ] Copy and adapt todoodles architecture
- [ ] Create enhanced data models (GroceryItem, GroceryData)
- [ ] Implement basic CRUD operations
- [ ] Set up storage abstraction (JSON/MongoDB)
- [ ] Create basic test suite

### Phase 2: Enhanced Features (Week 3-4)
- [ ] Implement price tracking and history
- [ ] Add frequency analysis capabilities
- [ ] Create shopping list/trip management
- [ ] Implement categorization system
- [ ] Add budget tracking

### Phase 3: Web UI Integration (Week 5-6)
- [ ] Create custom grocery components
- [ ] Implement price tracking visualizations
- [ ] Add receipt processing interface
- [ ] Create shopping trip planning UI
- [ ] Integrate with vanilla JS framework

### Phase 4: Advanced Features (Week 7-8)
- [ ] Receipt processing and OCR integration
- [ ] Spending pattern analysis
- [ ] Staples recommendation system
- [ ] Store route optimization
- [ ] Advanced reporting and analytics

### Phase 5: Polish & Production (Week 9-10)
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] LibreChat integration testing
- [ ] Deployment preparation

---

## 🎯 **Key Features & Benefits**

### **Smart Grocery Management**
- **Quantity & Units**: Precise shopping with proper measurements
- **Categories**: Organized by store sections for efficient shopping
- **Priority Levels**: Focus on urgent vs. optional items
- **Brand Preferences**: Track preferred brands for consistent quality

### **Price Intelligence**
- **Historical Tracking**: Monitor price trends over time
- **Store Comparisons**: Compare prices across different stores
- **Budget Management**: Set and track spending limits
- **Cost Analysis**: Understand spending patterns and optimize

### **Frequency Analysis**
- **Staples Identification**: Automatically identify regular purchases
- **Purchase Patterns**: Understand buying habits and frequencies
- **Reorder Suggestions**: Smart recommendations based on usage patterns
- **Inventory Prediction**: Anticipate when items will be needed

### **Shopping Trip Optimization**
- **Route Planning**: Optimize store navigation for efficiency
- **List Organization**: Group items by store sections
- **Budget Tracking**: Monitor spending during shopping trips
- **Multi-Store Support**: Plan trips across multiple stores

### **Receipt Processing**
- **Automatic Entry**: Process receipts to update purchase data
- **Price Verification**: Compare actual vs. expected prices
- **Spending Insights**: Analyze spending patterns from receipts
- **Tax Tracking**: Track tax information for budgeting

---

## 🔧 **Development Setup**

### Prerequisites
- Node.js 18+
- MongoDB (for production)
- TypeScript 5.3+
- MCP Web UI Framework

### Installation

```bash
# Clone repository
cd mcp-servers/grocery-list

# Install dependencies
npm install

# Create environment configuration
cp env.example .env
# Edit .env for your environment

# Build the server
npm run build

# Run locally
npm start
```

### LibreChat Integration

```yaml
mcpServers:
  grocery-list:
    type: stdio
    command: node
    args:
      - "../Sizzek/mcp-servers/grocery-list/dist/index.js"
    timeout: 30000
    env:
      MCP_STORAGE_TYPE: "mongodb"
      MCP_USER_BASED: "true"
      MONGODB_CONNECTION_STRING: "mongodb://localhost:27017/LibreChat"
      MCP_USER_ID: "${USER_ID}"
      GROCERY_DEFAULT_STORE: "Kroger"
      MCP_WEB_UI_BASE_URL: "http://localhost"
```

---

## 🎨 **Use Cases**

### **Personal Grocery Management**
- Track weekly shopping lists with prices
- Monitor spending patterns and budgets
- Identify frequently purchased items
- Plan efficient shopping trips

### **Family Household Management**
- Shared grocery lists with multiple users
- Budget tracking for household expenses
- Receipt processing for expense tracking
- Staples management for regular purchases

### **Business Expense Tracking**
- Track office supplies and snacks
- Monitor catering and event expenses
- Analyze spending patterns for budgeting
- Receipt processing for tax purposes

### **Meal Planning Integration**
- Generate grocery lists from meal plans
- Track ingredient costs for recipes
- Monitor dietary preferences and restrictions
- Plan shopping for special events

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- Built on the proven architecture of the [Todoodles MCP Server](../todoodles/)
- Integrated with [MCP Web UI Framework](../../../../mcp-web-ui-standalone/)
- Designed for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) ecosystem
- Optimized for [LibreChat](../../../LibreChat/) integration

---

**Made with ❤️ by the MCP Community**  
*Last updated: December 2024* 