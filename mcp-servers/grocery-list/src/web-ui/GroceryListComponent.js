/**
 * GroceryListComponent - Multi-Section Implementation Following MCP Web UI Design Document
 * 
 * This component follows the exact patterns from the MCP Web UI Design Document:
 * - Uses ListComponent as base with grocery-specific configuration
 * - Configuration over hardcoding
 * - Security by design
 * - Progressive enhancement
 * - Clean component composition over inheritance
 * 
 * ARCHITECTURE:
 * - Uses generic ListComponent as the base with multi-section configuration
 * - Adds grocery-specific enhancements (category ordering, purchase tracking)
 * - Implements two sections: Shopping List (pending) and Purchased Items (completed)
 * - Reduces code duplication while maintaining rich functionality
 * - Server can still customize through configuration
 * 
 * MULTI-SECTION FEATURES:
 * - Shopping List section: Always visible, contains items to buy
 * - Purchased Items section: Collapsible, contains completed items
 * - Section-specific actions: Purchase, Mark as Needed, etc.
 * - Category-based sorting within each section
 * - Smooth transitions between sections
 */

/**
 * Enhanced Multi-Section Grocery List Component following MCP Web UI patterns
 * Uses composition over inheritance for clean, maintainable code
 * Implements separate sections for pending and completed grocery items
 */
function createGroceryListComponent(element, data, config = {}) {
    // Ensure framework components are available
    if (typeof ListComponent === 'undefined') {
        throw new Error('ListComponent not found. Please ensure the MCP Web UI Framework is loaded before this component.');
    }

    // Define grocery-specific configuration following design document patterns
    const groceryConfig = {
        list: {
            // Enable multi-section mode for pending vs completed items
            mode: 'multi',
            groupBy: 'completed',

            // Core item configuration
            itemType: 'grocery item',
            itemIdField: 'id',
            itemTextField: 'name',
            itemFields: ['name', 'completed', 'quantity', 'unit', 'category'],

            // Layout and core features
            layout: 'list',
            showItemCount: true,
            enableSearch: true,
            enableSorting: true,
            confirmDeletes: true,

            // Multi-section configuration
            sections: {
                'false': {
                    name: 'Shopping List',
                    icon: '🛒',
                    collapsible: false,
                    sortOrder: 0,
                    description: 'Items you need to buy'
                },
                'true': {
                    name: 'Purchased Items',
                    icon: '✅',
                    collapsible: true,
                    sortOrder: 1,
                    description: 'Items you\'ve already bought'
                }
            },

            // Section transitions
            sectionTransitions: {
                enabled: true,
                duration: 300,
                easing: 'ease-in-out'
            },

            // Field configuration for display
            fields: [
                { key: 'name', label: 'Item', type: 'text', primary: true },
                { key: 'completed', label: 'Done', type: 'checkbox', editable: true },
                { key: 'quantity', label: 'Qty', type: 'number' },
                { key: 'unit', label: 'Unit', type: 'text' },
                {
                    key: 'category',
                    label: 'Category',
                    type: 'badge',
                    format: (value) => {
                        const icons = {
                            produce: '🥕', dairy: '🥛', meat: '🥩', frozen: '🧊',
                            pantry: '🥫', cleaning: '🧽', 'personal care': '🧴',
                            beverages: '🥤', other: '📦'
                        };
                        const icon = icons[value] || icons.other;
                        return `${icon} ${value.charAt(0).toUpperCase() + value.slice(1)}`;
                    }
                }
            ],

            // Actions configuration
            actions: {
                item: ['edit', 'delete'],
                bulk: ['delete', 'purchase'],
                global: ['add', 'import']
            },

            // Section-specific actions
            sectionActions: {
                'false': {
                    item: ['edit', 'delete', 'purchase'],
                    bulk: ['delete', 'purchase'],
                    global: ['add', 'import']
                },
                'true': {
                    item: ['delete', 'mark_needed'],
                    bulk: ['delete', 'mark_needed'],
                    global: []
                }
            },

            // Form configuration
            forms: {
                add: {
                    title: 'Add Grocery Item',
                    fields: [
                        { key: 'name', label: 'Item Name', type: 'text', required: true, placeholder: 'Enter grocery item...' },
                        { key: 'quantity', label: 'Quantity', type: 'number', required: false, placeholder: '1', min: 1, max: 99 },
                        { key: 'unit', label: 'Unit', type: 'text', required: false, placeholder: 'lbs, oz, etc.' },
                        {
                            key: 'category',
                            label: 'Category',
                            type: 'select',
                            required: false,
                            options: [
                                { value: '', label: 'Auto-detect' },
                                { value: 'produce', label: 'Produce' },
                                { value: 'dairy', label: 'Dairy' },
                                { value: 'meat', label: 'Meat' },
                                { value: 'frozen', label: 'Frozen' },
                                { value: 'pantry', label: 'Pantry' },
                                { value: 'cleaning', label: 'Cleaning' },
                                { value: 'personal care', label: 'Personal Care' },
                                { value: 'beverages', label: 'Beverages' },
                                { value: 'other', label: 'Other' }
                            ]
                        }
                    ]
                },
                edit: {
                    title: 'Edit Grocery Item',
                    fields: [
                        { key: 'name', label: 'Item Name', type: 'text', required: true },
                        { key: 'quantity', label: 'Quantity', type: 'number', required: false, min: 1, max: 99 },
                        { key: 'unit', label: 'Unit', type: 'text', required: false },
                        {
                            key: 'category',
                            label: 'Category',
                            type: 'select',
                            required: false,
                            options: [
                                { value: '', label: 'Auto-detect' },
                                { value: 'produce', label: 'Produce' },
                                { value: 'dairy', label: 'Dairy' },
                                { value: 'meat', label: 'Meat' },
                                { value: 'frozen', label: 'Frozen' },
                                { value: 'pantry', label: 'Pantry' },
                                { value: 'cleaning', label: 'Cleaning' },
                                { value: 'personal care', label: 'Personal Care' },
                                { value: 'beverages', label: 'Beverages' },
                                { value: 'other', label: 'Other' }
                            ]
                        }
                    ]
                }
            },

            // Display configuration
            emptyStateMessage: 'Your grocery list is empty. Add your first item to get started!',
            confirmDeletes: true,
            showItemCount: true,
            showStats: true,

            // Search configuration
            search: {
                placeholder: 'Search grocery items...',
                debounceMs: 300,
                searchFields: ['name', 'category']
            },

            // Filter configuration
            filters: {
                defaultFilter: 'all',
                customFilters: [
                    {
                        key: 'category',
                        label: 'Category',
                        type: 'select',
                        options: ['all', 'produce', 'dairy', 'meat', 'frozen', 'pantry', 'cleaning', 'personal care', 'beverages', 'other']
                    },
                    {
                        key: 'completed',
                        label: 'Status',
                        type: 'select',
                        options: [
                            { value: 'all', label: 'All Items' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'completed', label: 'Purchased' }
                        ]
                    }
                ]
            },

            // Sorting configuration
            defaultSort: { column: 'name', direction: 'asc' },

            // Merge any user-provided configuration
            ...config.list
        },

        // Polling configuration
        polling: {
            enabled: true,
            intervalMs: 5000
        },

        // Global config
        title: 'Grocery List',
        ...config
    };

    // Create the ListComponent with grocery configuration
    const groceryList = new ListComponent(element, data, groceryConfig);

    // Add grocery-specific method enhancements
    groceryList.getGroceryStats = function () {
        const items = this.data || [];
        return {
            totalItems: items.length,
            pendingItems: items.filter(item => !item.completed).length,
            purchasedItems: items.filter(item => item.completed).length,
            completionRate: items.length > 0 ? Math.round((items.filter(item => item.completed).length / items.length) * 100) : 0
        };
    };

    // Add grocery-specific category helpers
    groceryList.getCategories = function () {
        const items = this.data || [];
        const categories = new Set();
        items.forEach(item => {
            if (item.category) {
                categories.add(item.category);
            }
        });
        return Array.from(categories).sort();
    };

    // Enhanced field formatting for grocery items
    const originalFormatFieldValue = groceryList.formatFieldValue;
    groceryList.formatFieldValue = function (value, field) {
        switch (field) {
            case 'category':
                return this.formatCategoryBadge(value);
            case 'quantity':
                return this.formatQuantity(value);
            default:
                return originalFormatFieldValue.call(this, value, field);
        }
    };

    // Grocery-specific action handling
    const originalHandleItemAction = groceryList.handleItemAction;
    groceryList.handleItemAction = async function (action, id) {
        if (action === 'purchase') {
            await this.handlePurchaseItem(id);
        } else if (action === 'mark_needed') {
            await this.handleMarkNeededItem(id);
        } else {
            return originalHandleItemAction.call(this, action, id);
        }
    };

    // Enhanced bulk actions
    const originalHandleBulkAction = groceryList.handleBulkAction;
    groceryList.handleBulkAction = async function (action) {
        const selectedIds = Array.from(this.listState.selectedItems);

        switch (action) {
            case 'purchase':
                await this.handleBulkPurchase(selectedIds);
                break;
            case 'mark_needed':
                await this.handleBulkMarkNeeded(selectedIds);
                break;
            default:
                return originalHandleBulkAction.call(this, action);
        }
    };

    // Add grocery-specific formatting methods
    groceryList.formatCategoryBadge = function (category) {
        if (!category) return '';

        const categoryIcons = {
            produce: '🥕',
            dairy: '🥛',
            meat: '🥩',
            frozen: '🧊',
            pantry: '🥫',
            cleaning: '🧽',
            'personal care': '🧴',
            beverages: '🥤',
            other: '📦'
        };

        const icon = categoryIcons[category] || categoryIcons.other;
        return `<span class="category-badge category-${category}">${icon} ${this.capitalizeFirst(category)}</span>`;
    };

    groceryList.formatQuantity = function (quantity, unit) {
        if (!quantity || quantity === 1) {
            return unit ? `1 ${unit}` : '';
        }
        return unit ? `${quantity} ${unit}` : `×${quantity}`;
    };

    groceryList.capitalizeFirst = function (str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    // Add grocery-specific action methods

    groceryList.handleBulkPurchase = async function (selectedIds) {
        try {
            await this.handleAction('bulk_purchase', { ids: selectedIds });
            this.listState.selectedItems.clear();
            this.render();
        } catch (error) {
            this.handleError(error);
        }
    };

    // New action methods for multi-section functionality
    groceryList.handlePurchaseItem = async function (id) {
        try {
            await this.handleAction('update', { id, completed: true });
            this.log('INFO', `Grocery item purchased: ${id}`);
        } catch (error) {
            this.handleError(error);
        }
    };

    groceryList.handleMarkNeededItem = async function (id) {
        try {
            await this.handleAction('update', { id, completed: false });
            this.log('INFO', `Grocery item marked as needed: ${id}`);
        } catch (error) {
            this.handleError(error);
        }
    };

    groceryList.handleBulkMarkNeeded = async function (selectedIds) {
        try {
            await this.handleAction('bulk_mark_needed', { ids: selectedIds });
            this.listState.selectedItems.clear();
            this.render();
        } catch (error) {
            this.handleError(error);
        }
    };

    // Add grocery-specific validation
    const originalValidateInput = groceryList.validateInput || function (data) { return data; };
    groceryList.validateInput = function (data) {
        const validated = originalValidateInput.call(this, data);

        // Grocery-specific validation
        if (validated.name) {
            validated.name = this.sanitize(validated.name.trim()).substring(0, 500);
        }

        if (validated.quantity) {
            validated.quantity = Math.max(1, Math.min(99, parseInt(validated.quantity) || 1));
        }

        if (validated.category) {
            const validCategories = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'cleaning', 'personal care', 'beverages', 'other'];
            validated.category = validCategories.includes(validated.category) ? validated.category : 'other';
        }

        return validated;
    };

    /**
     * Get the prescribed category order
     * You can modify this array to define your preferred category ordering
     */
    groceryList.getCategoryOrder = function () {
        // Default grocery shopping order (modify this array to your preference)
        return [
            'produce',      // Fresh items first
            'dairy',        // Refrigerated section
            'meat',         // Meat/deli counter
            'frozen',       // Frozen section
            'pantry',       // Dry goods/canned items
            'beverages',    // Drinks
            'cleaning',     // Household items
            'personal care', // Personal care items
            'other'         // Everything else
        ];
    };

    // Override getProcessedItems to include enhanced grocery sorting for multi-section mode
    const originalGetProcessedItems = groceryList.getProcessedItems;
    groceryList.getProcessedItems = function () {
        let items = [...this.data];

        // Apply search filter
        if (this.listState.filterQuery) {
            items = this.applySearch(items);
        }

        // For multi-section mode, apply grocery sorting within sections
        if (this.listConfig.mode === 'multi') {
            items = this.applyGrocerySortingWithinSections(items);
        } else {
            // Apply grocery-specific enhanced sorting (always applied for single section)
            items = this.applyGrocerySorting(items);
        }

        // Apply user-selected sorting if enabled (this will override the default sorting)
        if (this.listState.sortColumn && this.listConfig.enableSorting) {
            items = this.applySorting(items);
        }

        // Apply pagination
        if (this.listConfig.enablePagination) {
            items = this.applyPagination(items);
        }

        return items;
    };

    // Add grocery-specific sorting logic
    groceryList.applyGrocerySorting = function (items) {
        return [...items].sort((a, b) => {
            // 1. First priority: completed items always go to bottom
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            // 2. Second priority: custom category ordering
            const categoryOrder = this.getCategoryOrder();
            const aCategoryIndex = categoryOrder.indexOf(a.category || 'other');
            const bCategoryIndex = categoryOrder.indexOf(b.category || 'other');

            if (aCategoryIndex !== bCategoryIndex) {
                // If category not found in order, put it at the end
                const aIndex = aCategoryIndex === -1 ? categoryOrder.length : aCategoryIndex;
                const bIndex = bCategoryIndex === -1 ? categoryOrder.length : bCategoryIndex;
                return aIndex - bIndex;
            }

            // 3. Third priority: creation date (newest first within same category)
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    };

    // Add grocery-specific sorting logic for multi-section mode
    groceryList.applyGrocerySortingWithinSections = function (items) {
        return [...items].sort((a, b) => {
            // Items are already separated by section (completed status)
            // So we only need to sort by category and creation date within each section

            // 1. First priority: custom category ordering
            const categoryOrder = this.getCategoryOrder();
            const aCategoryIndex = categoryOrder.indexOf(a.category || 'other');
            const bCategoryIndex = categoryOrder.indexOf(b.category || 'other');

            if (aCategoryIndex !== bCategoryIndex) {
                // If category not found in order, put it at the end
                const aIndex = aCategoryIndex === -1 ? categoryOrder.length : aCategoryIndex;
                const bIndex = bCategoryIndex === -1 ? categoryOrder.length : bCategoryIndex;
                return aIndex - bIndex;
            }

            // 2. Second priority: creation date (newest first within same category)
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    };

    // Log successful creation
    groceryList.log('INFO', 'Multi-section GroceryListComponent created using clean MCP Web UI patterns');

    return groceryList;
}

// Maintain backwards compatibility with the original class-based approach
class GroceryListComponent {
    constructor(element, data, config) {
        return createGroceryListComponent(element, data, config);
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GroceryListComponent, createGroceryListComponent };
}

// Make available globally
if (typeof window !== 'undefined') {
    window.GroceryListComponent = GroceryListComponent;
    window.createGroceryListComponent = createGroceryListComponent;
} 