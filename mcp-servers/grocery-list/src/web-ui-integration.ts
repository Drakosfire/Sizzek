import { MCPWebUI, UISchema } from 'mcp-web-ui';

// GroceryItem interface (matching the grocery list data model)
interface GroceryItem {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    category: string;
    purchased: boolean;
    purchasedAt?: string;
    createdAt: string;
    updatedAt: string;
    isStaple: boolean;
}

/**
 * Clean, separate web UI integration for Grocery List
 * Keeps all web UI logic isolated from the main MCP server
 * Features multi-section support for shopping list and purchased items
 */
export class GroceryListWebUIManager {
    private webUI: MCPWebUI<GroceryItem>;

    constructor(
        private groceryManager: any, // The main GroceryListManager instance
        private enableLogging = true
    ) {
        // Create the UI schema specifically for grocery list
        const schema = this.createGroceryListUISchema();

        // Initialize the web UI framework
        this.webUI = new MCPWebUI<GroceryItem>({
            dataSource: this.getDataSource.bind(this),
            schema: schema as UISchema, // Type assertion for extended grocery schema
            onUpdate: this.handleUIUpdate.bind(this),
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            pollInterval: 5000, // 5 seconds - reduced from 2000ms to prevent infinite loops
            enableLogging: this.enableLogging,
            baseUrl: process.env.MCP_WEB_UI_BASE_URL || 'localhost',
            // Explicit CSS path for grocery list
            cssPath: process.env.MCP_WEB_UI_CSS_PATH || './static'
        });

        this.log('INFO', 'GroceryListWebUIManager initialized');
    }

    /**
     * Get the MCP tool definition for web UI
     */
    getMCPToolDefinition() {
        return this.webUI.getMCPToolDefinition();
    }

    /**
     * Handle the get_web_ui tool call
     */
    async handleGetWebUI(userId: string, userContext?: any): Promise<{
        content: Array<{ type: string; text: string }>;
    }> {
        this.log('INFO', `[GROCERY-WEB-UI] handleGetWebUI called with userId: "${userId}"`);

        if (userContext) {
            this.log('INFO', `[GROCERY-WEB-UI] Enhanced context:`, {
                isSharedContext: userContext.isSharedContext,
                contextType: userContext.contextType,
                originalUserId: userContext.originalUserId,
                sharedWithCount: userContext.sharedWith?.length || 0
            });
        }

        // Debug: Check how many grocery items this user ID has
        try {
            const userGroceries = await this.groceryManager.getGroceryItems(userId);
            this.log('INFO', `[GROCERY-WEB-UI] User "${userId}" has ${userGroceries.length} grocery items`);

            // Enhanced context information for shared scenarios
            if (userContext?.isSharedContext) {
                this.log('INFO', `[GROCERY-WEB-UI] Operating in shared context - original user: ${userContext.originalUserId}`);
            }

            // If user has no groceries, let's check what user IDs do have data (debug helper)
            if (userGroceries.length === 0 && process.env.MCP_DEBUG === 'true') {
                this.log('WARN', `[GROCERY-WEB-UI] User "${userId}" has no groceries. Checking for other user data...`);
                await this.debugCheckOtherUsers();
            }
        } catch (error) {
            this.log('ERROR', `[GROCERY-WEB-UI] Error checking user groceries: ${error}`);
        }

        // Pass context to web UI for enhanced rendering
        return this.webUI.handleGetWebUI(userId);
    }

    /**
     * Debug helper to check what user IDs have data in the system
     */
    private async debugCheckOtherUsers(): Promise<void> {
        try {
            // Check common user ID patterns
            const testUserIds = [
                undefined, // Default user
                'default',
                process.env.MCP_USER_ID,
                // Add more user IDs to check based on your context
            ].filter(Boolean);

            this.log('DEBUG', `[GROCERY-WEB-UI] Checking data for user IDs: ${JSON.stringify(testUserIds)}`);

            for (const testUserId of testUserIds) {
                try {
                    const groceries = await this.groceryManager.getGroceryItems(testUserId as string);
                    if (groceries.length > 0) {
                        this.log('WARN', `[GROCERY-WEB-UI] Found ${groceries.length} groceries for user "${testUserId}"`);
                    }
                } catch (error) {
                    // Ignore errors for individual user checks
                }
            }
        } catch (error) {
            this.log('ERROR', `[GROCERY-WEB-UI] Debug check failed: ${error}`);
        }
    }

    /**
     * Create grocery list-specific UI schema with multi-section support
     */
    private createGroceryListUISchema() {
        return {
            title: "Grocery List Dashboard",
            description: "Manage your grocery items with an interactive web interface",
            components: [
                {
                    type: "list",
                    id: "grocery-list",
                    title: "Your Grocery Items",
                    config: {
                        // Enable multi-section mode for pending vs completed items
                        mode: "multi",
                        groupBy: "purchased",

                        // Core list configuration
                        itemIdField: "id",
                        itemTextField: "name",
                        showItemCount: true,
                        layout: "list",

                        // Enable basic interactions
                        enableSearch: true,
                        enableSorting: true,
                        confirmDeletes: true,

                        // Multi-section configuration
                        sections: {
                            "false": {
                                name: "Shopping List",
                                icon: "🛒",
                                collapsible: false,
                                sortOrder: 0,
                                description: "Items you need to buy"
                            },
                            "true": {
                                name: "Purchased Items",
                                icon: "✅",
                                collapsible: true,
                                sortOrder: 1,
                                description: "Items you've already bought"
                            }
                        },

                        // Section transitions
                        sectionTransitions: {
                            enabled: true,
                            duration: 300,
                            easing: "ease-in-out"
                        },

                        // Field configuration for display
                        fields: [
                            { key: "name", label: "Item", type: "text", primary: true },
                            { key: "quantity", label: "Qty", type: "number" },
                            { key: "unit", label: "Unit", type: "text" },
                            {
                                key: "category",
                                label: "Category",
                                type: "badge",
                                format: (value: string) => {
                                    const icons = {
                                        produce: '🥕', dairy: '🥛', meat: '🥩', frozen: '🧊',
                                        pantry: '🥫', cleaning: '🧽', 'personal care': '🧴',
                                        beverages: '🥤', other: '📦'
                                    };
                                    const icon = icons[value as keyof typeof icons] || icons.other;
                                    return `${icon} ${value.charAt(0).toUpperCase() + value.slice(1)}`;
                                }
                            }
                        ],

                        // Actions configuration
                        actions: {
                            item: ["edit", "delete"],
                            bulk: ["delete", "purchase"],
                            global: ["add", "import"]
                        },

                        // Section-specific actions
                        sectionActions: {
                            "false": {
                                item: ["edit", "delete", "purchase"],
                                bulk: ["delete", "purchase"],
                                global: ["add", "import"]
                            },
                            "true": {
                                item: ["delete", "mark_needed"],
                                bulk: ["delete", "mark_needed"],
                                global: ["clear_purchased"]
                            }
                        },

                        // Search configuration
                        search: {
                            placeholder: "Search grocery items...",
                            searchFields: ["name", "category"]
                        }
                    }
                }
            ],
            actions: [
                {
                    id: "purchase",
                    label: "Mark as Purchased",
                    type: "inline",
                    handler: "purchase",
                    icon: "✅"
                },
                {
                    id: "mark_needed",
                    label: "Mark as Needed",
                    type: "inline",
                    handler: "mark_needed",
                    icon: "🛒"
                },
                {
                    id: "delete",
                    label: "Delete",
                    type: "inline",
                    handler: "delete",
                    icon: "🗑️",
                    confirm: "Are you sure you want to delete this grocery item?"
                },
                {
                    id: "add",
                    label: "Add Grocery Item",
                    type: "button",
                    handler: "add",
                    icon: "🛒"
                },
                {
                    id: "clear_purchased",
                    label: "Clear Purchased Items",
                    type: "button",
                    handler: "clear_purchased",
                    icon: "🧹",
                    confirm: "Are you sure you want to clear all purchased items? This will permanently delete them from your list."
                }
            ],
            polling: {
                enabled: true,
                intervalMs: 5000
            }
        };
    }

    /**
     * Get stats about active web UI sessions
     */
    getWebUIStats() {
        return this.webUI.getStats();
    }

    /**
     * Cleanup web UI resources
     */
    async cleanup() {
        await this.webUI.shutdown();
        this.log('INFO', 'GroceryListWebUIManager cleaned up');
    }

    /**
     * Data source function - gets grocery items for the specified user
     * The user context is automatically provided by the web UI framework
     * Returns array of items as expected by the framework
     */
    private async getDataSource(userId?: string): Promise<GroceryItem[]> {
        try {
            this.log('DEBUG', `[GROCERY-DATA] Fetching grocery data for user: ${userId}`);

            // Call the manager's getGroceryItems method with the userId
            const allGroceries = await this.groceryManager.getGroceryItems(userId);

            this.log('INFO', `[GROCERY-DATA] Retrieved ${allGroceries.length} total grocery items`, {
                totalItems: allGroceries.length,
                purchasedCount: allGroceries.filter((item: GroceryItem) => item.purchased).length,
                pendingCount: allGroceries.filter((item: GroceryItem) => !item.purchased).length
            });

            // Transform data to match framework expectations
            // For multi-section mode, we keep the original 'purchased' field since we're grouping by it
            const transformedGroceries = allGroceries.map((item: GroceryItem) => ({
                ...item,
                completed: item.purchased // Map purchased to completed for framework compatibility
            }));

            // Sort by purchase status and creation date: unpurchased items first, then newest first
            const sortedGroceries = transformedGroceries.sort((a: any, b: any) => {
                // Unpurchased items first
                if (a.completed !== b.completed) {
                    return a.completed ? 1 : -1;
                }

                // Then by creation date (newest first)
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            this.log('DEBUG', `[GROCERY-DATA] Returning ${sortedGroceries.length} sorted grocery items for multi-section display`);

            return sortedGroceries;
        } catch (error) {
            this.log('ERROR', `[GROCERY-WEB-UI] Failed to get grocery data for user "${userId}": ${error}`);
            return [];
        }
    }

    /**
     * Handle UI updates (checkbox toggles, deletes, adds, etc.)
     */
    private async handleUIUpdate(action: string, data: any, userId: string): Promise<any> {
        try {
            this.log('INFO', `[GROCERY-ACTION] Handling UI update: ${action} for user: ${userId}`, {
                action,
                itemId: data?.id,
                dataKeys: Object.keys(data || {}),
                userId
            });

            switch (action) {
                case 'toggle':
                    // Handle both formats: {id, completed} or {id, field, value}
                    const toggleId = data.id;
                    const toggleValue = data.completed !== undefined ? data.completed :
                        (data.field === 'completed' ? data.value : false);

                    if (toggleValue) {
                        // Mark item as purchased
                        const result = await this.groceryManager.purchaseItem(toggleId, userId);
                        if (!result) {
                            throw new Error(`Grocery item with ID ${toggleId} not found`);
                        }
                        this.log('INFO', `Marked grocery item ${toggleId} as purchased for user ${userId}`);
                        return {
                            success: true,
                            message: `Marked "${result.name}" as purchased`,
                            item: { ...result, completed: result.purchased }
                        };
                    } else {
                        // Mark item as unpurchased (pending)
                        const result = await this.groceryManager.unpurchaseItem(toggleId, userId);
                        if (!result) {
                            throw new Error(`Grocery item with ID ${toggleId} not found`);
                        }
                        this.log('INFO', `Marked grocery item ${toggleId} as unpurchased for user ${userId}`);
                        return {
                            success: true,
                            message: `Marked "${result.name}" as pending`,
                            item: { ...result, completed: result.purchased }
                        };
                    }

                // Handle frontend action name variations  
                case 'toggle-item':
                    // This is the framework's checkbox toggle action for multi-section mode
                    this.log('INFO', `[GROCERY-TOGGLE] Framework toggle-item called`, {
                        itemId: data.id,
                        currentCompleted: data.completed,
                        dataReceived: data
                    });

                    const toggleResult = data.completed ?
                        await this.groceryManager.purchaseItem(data.id, userId) :
                        await this.groceryManager.unpurchaseItem(data.id, userId);

                    if (!toggleResult) {
                        this.log('ERROR', `[GROCERY-TOGGLE] Item not found: ${data.id}`);
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }

                    this.log('INFO', `[GROCERY-TOGGLE] Successfully toggled item ${data.id} to ${data.completed ? 'purchased' : 'pending'}`, {
                        itemName: toggleResult.name,
                        newPurchasedState: toggleResult.purchased,
                        userId
                    });

                    return {
                        success: true,
                        message: `Marked "${toggleResult.name}" as ${data.completed ? 'purchased' : 'pending'}`,
                        item: { ...toggleResult, completed: toggleResult.purchased }
                    };

                case 'purchase_item':
                case 'toggle-purchase':
                    const purchaseResult = await this.groceryManager.purchaseItem(data.id, userId);
                    if (!purchaseResult) {
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }
                    this.log('INFO', `Purchased grocery item ${data.id} for user ${userId}`);
                    return {
                        success: true,
                        message: `Marked "${purchaseResult.name}" as purchased`,
                        item: purchaseResult
                    };

                case 'unpurchase_item':
                    const unpurchaseResult = await this.groceryManager.unpurchaseItem(data.id, userId);
                    if (!unpurchaseResult) {
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }
                    this.log('INFO', `Unpurchased grocery item ${data.id} for user ${userId}`);
                    return {
                        success: true,
                        message: `Marked "${unpurchaseResult.name}" as pending`,
                        item: unpurchaseResult
                    };

                case 'delete':
                case 'delete_grocery_item':
                    const deleteResult = await this.groceryManager.deleteGroceryItem(data.id, userId);
                    if (!deleteResult || !deleteResult.success) {
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }
                    this.log('INFO', `Deleted grocery item ${data.id} for user ${userId}`);
                    return {
                        success: true,
                        message: `Deleted "${deleteResult.deletedItem?.name || 'item'}" from your grocery list`,
                        deletedItem: deleteResult.deletedItem
                    };

                case 'add':
                case 'add_grocery_item':
                case 'add-item':
                    // If no data provided, return form schema for modal
                    if (!data || !data.name) {
                        return {
                            success: true,
                            showForm: true,
                            form: {
                                title: "Add Grocery Item",
                                fields: [
                                    {
                                        key: "name",
                                        label: "Item Name",
                                        type: "text",
                                        required: true,
                                        placeholder: "Enter grocery item name..."
                                    },
                                    {
                                        key: "quantity",
                                        label: "Quantity",
                                        type: "number",
                                        required: false,
                                        defaultValue: 1,
                                        min: 1,
                                        max: 99
                                    },
                                    {
                                        key: "unit",
                                        label: "Unit",
                                        type: "text",
                                        required: false,
                                        placeholder: "lbs, oz, pieces, etc."
                                    },
                                    {
                                        key: "category",
                                        label: "Category",
                                        type: "select",
                                        required: false,
                                        options: [
                                            { value: "", label: "Auto-detect" },
                                            { value: "produce", label: "Produce" },
                                            { value: "dairy", label: "Dairy" },
                                            { value: "meat", label: "Meat" },
                                            { value: "frozen", label: "Frozen" },
                                            { value: "pantry", label: "Pantry" },
                                            { value: "cleaning", label: "Cleaning" },
                                            { value: "personal care", label: "Personal Care" },
                                            { value: "beverages", label: "Beverages" },
                                            { value: "other", label: "Other" }
                                        ]
                                    }
                                ]
                            }
                        };
                    }

                    // Process form submission
                    const addedItem = await this.groceryManager.addGroceryItem(
                        data.name.trim(),
                        parseInt(data.quantity) || 1,
                        data.category || undefined,
                        userId
                    );
                    this.log('INFO', `Added new grocery item for user ${userId}: "${data.name}"`);
                    return {
                        success: true,
                        message: `Added "${data.name}" to your grocery list`,
                        item: addedItem
                    };

                case 'update':
                case 'edit':
                case 'update_grocery_item':
                case 'edit-item':
                    // Handle edit action
                    if (!data || !data.id) {
                        throw new Error('Item ID is required for update action');
                    }

                    // Handle checkbox toggle updates (completed field)
                    if (data.hasOwnProperty('completed')) {
                        this.log('INFO', `[GROCERY-UPDATE] Checkbox update via update action for item ${data.id}`, {
                            itemId: data.id,
                            newCompletedState: data.completed,
                            userId
                        });

                        const toggleUpdateResult = data.completed ?
                            await this.groceryManager.purchaseItem(data.id, userId) :
                            await this.groceryManager.unpurchaseItem(data.id, userId);

                        if (!toggleUpdateResult) {
                            this.log('ERROR', `[GROCERY-UPDATE] Item not found: ${data.id}`);
                            throw new Error(`Grocery item with ID ${data.id} not found`);
                        }

                        this.log('INFO', `[GROCERY-UPDATE] Successfully toggled item ${data.id} to ${data.completed ? 'purchased' : 'pending'}`, {
                            itemName: toggleUpdateResult.name,
                            newPurchasedState: toggleUpdateResult.purchased,
                            userId
                        });

                        return {
                            success: true,
                            message: `Marked "${toggleUpdateResult.name}" as ${data.completed ? 'purchased' : 'pending'}`,
                            item: { ...toggleUpdateResult, completed: toggleUpdateResult.purchased }
                        };
                    }

                    // If only ID provided, return form schema for modal with current item data
                    if (!data.name && !data.hasOwnProperty('quantity') && !data.hasOwnProperty('category')) {
                        const currentItem = await this.groceryManager.getGroceryItem(data.id, userId);
                        if (!currentItem) {
                            throw new Error(`Grocery item with ID ${data.id} not found`);
                        }

                        return {
                            success: true,
                            showForm: true,
                            form: {
                                title: "Edit Grocery Item",
                                fields: [
                                    {
                                        key: "name",
                                        label: "Item Name",
                                        type: "text",
                                        required: true,
                                        defaultValue: currentItem.name
                                    },
                                    {
                                        key: "quantity",
                                        label: "Quantity",
                                        type: "number",
                                        required: false,
                                        defaultValue: currentItem.quantity || 1,
                                        min: 1,
                                        max: 99
                                    },
                                    {
                                        key: "unit",
                                        label: "Unit",
                                        type: "text",
                                        required: false,
                                        defaultValue: currentItem.unit || ""
                                    },
                                    {
                                        key: "category",
                                        label: "Category",
                                        type: "select",
                                        required: false,
                                        defaultValue: currentItem.category || "",
                                        options: [
                                            { value: "", label: "Auto-detect" },
                                            { value: "produce", label: "Produce" },
                                            { value: "dairy", label: "Dairy" },
                                            { value: "meat", label: "Meat" },
                                            { value: "frozen", label: "Frozen" },
                                            { value: "pantry", label: "Pantry" },
                                            { value: "cleaning", label: "Cleaning" },
                                            { value: "personal care", label: "Personal Care" },
                                            { value: "beverages", label: "Beverages" },
                                            { value: "other", label: "Other" }
                                        ]
                                    }
                                ]
                            },
                            initialData: {
                                id: currentItem.id,
                                name: currentItem.name,
                                quantity: currentItem.quantity,
                                unit: currentItem.unit,
                                category: currentItem.category
                            }
                        };
                    }

                    // Process form submission for update
                    const updatedItem = await this.groceryManager.updateGroceryItem(
                        data.id,
                        {
                            name: data.name?.trim(),
                            quantity: data.quantity ? parseInt(data.quantity) : undefined,
                            unit: data.unit?.trim(),
                            category: data.category || undefined
                        },
                        userId
                    );

                    if (!updatedItem) {
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }

                    this.log('INFO', `Updated grocery item ${data.id} for user ${userId}: "${data.name}"`);
                    return {
                        success: true,
                        message: `Updated "${data.name}" in your grocery list`,
                        item: updatedItem
                    };

                case 'search':
                case 'search_grocery_items':
                    if (!data.query) {
                        throw new Error('Search query is required');
                    }
                    const searchResults = await this.groceryManager.searchGroceryItems(data.query, userId);
                    this.log('INFO', `Search for "${data.query}" returned ${searchResults.length} results for user ${userId}`);
                    return {
                        success: true,
                        message: `Found ${searchResults.length} items matching "${data.query}"`,
                        items: searchResults,
                        query: data.query
                    };

                case 'filter':
                    // Handle filtering by purchase status or category
                    let filteredItems;
                    const allItems = await this.groceryManager.getGroceryItems(userId);

                    if (data.filter === 'purchased') {
                        filteredItems = allItems.filter((item: GroceryItem) => item.purchased);
                    } else if (data.filter === 'pending') {
                        filteredItems = allItems.filter((item: GroceryItem) => !item.purchased);
                    } else if (data.filter === 'all') {
                        filteredItems = allItems;
                    } else if (data.category) {
                        filteredItems = allItems.filter((item: GroceryItem) => item.category === data.category);
                    } else {
                        filteredItems = allItems;
                    }

                    this.log('INFO', `Filter "${data.filter || data.category}" returned ${filteredItems.length} items for user ${userId}`);
                    return {
                        success: true,
                        message: `Showing ${filteredItems.length} items`,
                        items: filteredItems,
                        filter: data.filter || data.category
                    };

                case 'get_stats':
                case 'get_grocery_stats':
                    const stats = await this.groceryManager.getStats(userId);
                    this.log('INFO', `Retrieved grocery stats for user ${userId}`);
                    return {
                        success: true,
                        message: "Statistics retrieved successfully",
                        stats: stats
                    };

                case 'get_categories':
                    const categories = await this.groceryManager.getCategories(userId);
                    this.log('INFO', `Retrieved ${categories.length} categories for user ${userId}`);
                    return {
                        success: true,
                        message: `Found ${categories.length} categories`,
                        categories: categories
                    };

                case 'purchase':
                    // New multi-section action: mark item as purchased
                    this.log('INFO', `[GROCERY-PURCHASE] Manual purchase action called for item ${data.id}`);
                    const purchaseActionResult = await this.groceryManager.purchaseItem(data.id, userId);
                    if (!purchaseActionResult) {
                        this.log('ERROR', `[GROCERY-PURCHASE] Item not found: ${data.id}`);
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }
                    this.log('INFO', `[GROCERY-PURCHASE] Successfully purchased: ${purchaseActionResult.name}`);
                    return {
                        success: true,
                        message: `Marked "${purchaseActionResult.name}" as purchased`,
                        item: { ...purchaseActionResult, completed: purchaseActionResult.purchased }
                    };

                case 'mark_needed':
                    // New multi-section action: mark item as needed (unpurchased)
                    this.log('INFO', `[GROCERY-NEEDED] Manual mark needed action called for item ${data.id}`);
                    const markNeededActionResult = await this.groceryManager.unpurchaseItem(data.id, userId);
                    if (!markNeededActionResult) {
                        this.log('ERROR', `[GROCERY-NEEDED] Item not found: ${data.id}`);
                        throw new Error(`Grocery item with ID ${data.id} not found`);
                    }
                    this.log('INFO', `[GROCERY-NEEDED] Successfully marked as needed: ${markNeededActionResult.name}`);
                    return {
                        success: true,
                        message: `Marked "${markNeededActionResult.name}" as needed`,
                        item: { ...markNeededActionResult, completed: markNeededActionResult.purchased }
                    };

                case 'togglePurchased':
                case 'toggle_purchased':
                    // Handle checkbox toggle - determine action based on current state
                    const checkboxToggleId = data.id;
                    const newPurchasedState = data.purchased !== undefined ? data.purchased : data.value;

                    if (newPurchasedState) {
                        // Mark as purchased
                        const purchaseToggleResult = await this.groceryManager.purchaseItem(checkboxToggleId, userId);
                        if (!purchaseToggleResult) {
                            throw new Error(`Grocery item with ID ${checkboxToggleId} not found`);
                        }
                        this.log('INFO', `Toggled grocery item ${checkboxToggleId} to purchased for user ${userId}`);
                        return {
                            success: true,
                            message: `Marked "${purchaseToggleResult.name}" as purchased`,
                            item: { ...purchaseToggleResult, completed: purchaseToggleResult.purchased }
                        };
                    } else {
                        // Mark as needed
                        const neededToggleResult = await this.groceryManager.unpurchaseItem(checkboxToggleId, userId);
                        if (!neededToggleResult) {
                            throw new Error(`Grocery item with ID ${checkboxToggleId} not found`);
                        }
                        this.log('INFO', `Toggled grocery item ${checkboxToggleId} to needed for user ${userId}`);
                        return {
                            success: true,
                            message: `Marked "${neededToggleResult.name}" as needed`,
                            item: { ...neededToggleResult, completed: neededToggleResult.purchased }
                        };
                    }

                case 'bulk_purchase':
                    if (!data.ids || !Array.isArray(data.ids)) {
                        throw new Error('Item IDs array is required for bulk purchase');
                    }

                    const bulkResults = [];
                    let successCount = 0;
                    let errorCount = 0;

                    for (const id of data.ids) {
                        try {
                            const result = await this.groceryManager.purchaseItem(id, userId);
                            if (result) {
                                bulkResults.push({ id, success: true, item: result });
                                successCount++;
                            } else {
                                bulkResults.push({ id, success: false, error: 'Item not found' });
                                errorCount++;
                            }
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            bulkResults.push({ id, success: false, error: errorMessage });
                            errorCount++;
                        }
                    }

                    this.log('INFO', `Bulk purchase: ${successCount} succeeded, ${errorCount} failed for user ${userId}`);
                    return {
                        success: successCount > 0,
                        message: `Bulk purchase: ${successCount} items purchased${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
                        results: bulkResults,
                        successCount,
                        errorCount
                    };

                case 'bulk_mark_needed':
                    if (!data.ids || !Array.isArray(data.ids)) {
                        throw new Error('Item IDs array is required for bulk mark needed');
                    }

                    const bulkMarkNeededResults = [];
                    let markNeededSuccessCount = 0;
                    let markNeededErrorCount = 0;

                    for (const id of data.ids) {
                        try {
                            const result = await this.groceryManager.unpurchaseItem(id, userId);
                            if (result) {
                                bulkMarkNeededResults.push({ id, success: true, item: result });
                                markNeededSuccessCount++;
                            } else {
                                bulkMarkNeededResults.push({ id, success: false, error: 'Item not found' });
                                markNeededErrorCount++;
                            }
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            bulkMarkNeededResults.push({ id, success: false, error: errorMessage });
                            markNeededErrorCount++;
                        }
                    }

                    this.log('INFO', `Bulk mark needed: ${markNeededSuccessCount} succeeded, ${markNeededErrorCount} failed for user ${userId}`);
                    return {
                        success: markNeededSuccessCount > 0,
                        message: `Bulk mark needed: ${markNeededSuccessCount} items marked as needed${markNeededErrorCount > 0 ? `, ${markNeededErrorCount} failed` : ''}`,
                        results: bulkMarkNeededResults,
                        successCount: markNeededSuccessCount,
                        errorCount: markNeededErrorCount
                    };

                case 'bulk_delete':
                    if (!data.ids || !Array.isArray(data.ids)) {
                        throw new Error('Item IDs array is required for bulk delete');
                    }

                    const deleteResults = [];
                    let deleteSuccessCount = 0;
                    let deleteErrorCount = 0;

                    for (const id of data.ids) {
                        try {
                            const result = await this.groceryManager.deleteGroceryItem(id, userId);
                            if (result.success) {
                                deleteResults.push({ id, success: true, deletedItem: result.deletedItem });
                                deleteSuccessCount++;
                            } else {
                                deleteResults.push({ id, success: false, error: 'Item not found' });
                                deleteErrorCount++;
                            }
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            deleteResults.push({ id, success: false, error: errorMessage });
                            deleteErrorCount++;
                        }
                    }

                    this.log('INFO', `Bulk delete: ${deleteSuccessCount} succeeded, ${deleteErrorCount} failed for user ${userId}`);
                    return {
                        success: deleteSuccessCount > 0,
                        message: `Bulk delete: ${deleteSuccessCount} items deleted${deleteErrorCount > 0 ? `, ${deleteErrorCount} failed` : ''}`,
                        results: deleteResults,
                        successCount: deleteSuccessCount,
                        errorCount: deleteErrorCount
                    };

                case 'clear_purchased':
                    // Delete all purchased items
                    const allGroceries = await this.groceryManager.getGroceryItems(userId);
                    const purchasedItems = allGroceries.filter((item: GroceryItem) => item.purchased);

                    if (purchasedItems.length === 0) {
                        return {
                            success: true,
                            message: "No purchased items to clear",
                            clearedCount: 0
                        };
                    }

                    const clearResults = [];
                    let clearSuccessCount = 0;

                    for (const item of purchasedItems) {
                        try {
                            const result = await this.groceryManager.deleteGroceryItem(item.id, userId);
                            if (result.success) {
                                clearResults.push({ id: item.id, success: true, item: result.deletedItem });
                                clearSuccessCount++;
                            }
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            clearResults.push({ id: item.id, success: false, error: errorMessage });
                        }
                    }

                    this.log('INFO', `Cleared ${clearSuccessCount} purchased items for user ${userId}`);
                    return {
                        success: true,
                        message: `Cleared ${clearSuccessCount} purchased items`,
                        clearedCount: clearSuccessCount,
                        results: clearResults
                    };

                case 'refresh':
                case 'reload':
                    // Trigger a data refresh
                    const refreshedItems = await this.groceryManager.getGroceryItems(userId);
                    this.log('INFO', `Data refreshed for user ${userId}, ${refreshedItems.length} items`);
                    return {
                        success: true,
                        message: `Refreshed ${refreshedItems.length} items`,
                        items: refreshedItems
                    };

                default:
                    this.log('WARN', `[GROCERY-ACTION] Unknown UI action attempted: ${action}`, {
                        action,
                        data,
                        userId,
                        dataType: typeof data,
                        hasId: !!data?.id,
                        hasCompleted: data?.hasOwnProperty('completed'),
                        allDataKeys: Object.keys(data || {}),
                        rawData: JSON.stringify(data)
                    });
                    throw new Error(`Unknown UI action: ${action}`);
            }
        } catch (error) {
            this.log('ERROR', `UI update failed: ${error}`, { action, data, userId });
            throw error;
        }
    }

    /**
     * Simple logging utility
     */
    private log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, data?: any): void {
        if (this.enableLogging) {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}][${level}][GroceryWebUI] ${message}`);

            if (data && process.env.MCP_DEBUG === 'true') {
                console.error(JSON.stringify(data, null, 2));
            }
        }
    }
} 