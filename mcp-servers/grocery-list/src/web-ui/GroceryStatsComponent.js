/**
 * GroceryStatsComponent - Clean Implementation Following MCP Web UI Design Document
 * 
 * This component follows the exact patterns from the MCP Web UI Design Document:
 * - Proper JavaScript inheritance timing pattern
 * - Configuration over hardcoding
 * - Security by design
 * - Progressive enhancement
 * - Clean component composition
 * 
 * CRITICAL: This follows the #1 pattern from the design doc - proper constructor/init timing
 */

/**
 * Enhanced Grocery Stats Component following MCP Web UI patterns
 * Uses composition over inheritance for clean, maintainable code
 */
function createGroceryStatsComponent(element, data, config = {}) {
    // Ensure framework components are available
    if (typeof StatsComponent === 'undefined') {
        throw new Error('StatsComponent not found. Please ensure the MCP Web UI Framework is loaded before this component.');
    }

    // Define grocery-specific stats configuration following design document patterns
    const groceryStatsConfig = {
        stats: {
            // Layout and display
            layout: 'grid',
            showTrends: false,
            animate: true,

            // Grocery-specific metrics
            fields: [
                { key: 'totalItems', label: 'Total Items', type: 'number' },
                { key: 'pendingItems', label: 'Pending', type: 'number' },
                { key: 'purchasedItems', label: 'Purchased', type: 'number' },
                { key: 'completionRate', label: 'Complete', type: 'percentage' }
            ],

            // Merge any user-provided configuration
            ...config.stats
        },

        // Polling configuration
        polling: {
            enabled: true,
            intervalMs: 5000
        },

        // Global config
        title: 'Grocery List Statistics',
        ...config
    };

    // Process grocery data into stats format
    const processedData = processGroceryDataForStats(data);

    // Create the StatsComponent with grocery configuration
    const groceryStats = new StatsComponent(element, processedData, groceryStatsConfig);

    // Add grocery-specific enhancements
    const originalUpdate = groceryStats.update;
    groceryStats.update = function (newData) {
        // Process grocery data before updating stats
        const processedStats = processGroceryDataForStats(newData);
        return originalUpdate.call(this, processedStats);
    };

    // Add grocery-specific methods
    groceryStats.getCategoryBreakdown = function () {
        const items = this.data || [];
        const categoryMap = new Map();

        items.forEach(item => {
            const category = item.category || 'other';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, {
                    total: 0,
                    purchased: 0,
                    pending: 0
                });
            }
            const catStats = categoryMap.get(category);
            catStats.total++;
            if (item.purchased) {
                catStats.purchased++;
            } else {
                catStats.pending++;
            }
        });

        return Array.from(categoryMap.entries()).map(([category, stats]) => ({
            category,
            ...stats,
            completionRate: stats.total > 0 ? Math.round((stats.purchased / stats.total) * 100) : 0
        }));
    };

    // Log successful creation
    groceryStats.log('INFO', 'GroceryStatsComponent created using clean MCP Web UI patterns');

    return groceryStats;
}

/**
 * Process grocery list data into statistics format
 * @param {Array} groceryData - Array of grocery items
 * @returns {Object} Processed statistics data
 */
function processGroceryDataForStats(groceryData) {
    const items = groceryData || [];

    const stats = {
        totalItems: items.length,
        pendingItems: items.filter(item => !item.purchased).length,
        purchasedItems: items.filter(item => item.purchased).length
    };

    // Calculate completion rate
    stats.completionRate = stats.totalItems > 0
        ? Math.round((stats.purchasedItems / stats.totalItems) * 100)
        : 0;

    return stats;
}

/**
 * Class-based wrapper for backwards compatibility
 * Follows the proper inheritance pattern from the design document
 */
class GroceryStatsComponent extends BaseComponent {
    constructor(element, data, config) {
        // 1. ALWAYS call super() FIRST (JavaScript requirement)
        super(element, data, config);

        // 2. Set component properties AFTER super()
        this.componentConfig = {
            // Core stats features
            showTrends: false,
            animate: true,
            layout: 'grid',

            // Grocery-specific settings
            showCategoryBreakdown: true,
            showRecentActivity: false,

            // Override with user config
            ...config.groceryStats
        };

        this.componentState = {
            currentStats: {
                totalItems: 0,
                pendingItems: 0,
                purchasedItems: 0,
                completionRate: 0
            },
            categoryBreakdown: []
        };

        // 3. Re-render manually AFTER properties are set
        this.render();

        this.log('INFO', 'GroceryStatsComponent initialized with clean patterns');
    }

    /**
     * 4. ALWAYS override init() to prevent premature rendering
     */
    init() {
        if (this.isDestroyed) return;

        // DON'T call render() here - constructor handles it
        this.bindEvents();
        this.startPolling();
        this.updateStats();
        this.log('INFO', 'GroceryStatsComponent events bound and polling started');
    }

    render() {
        if (this.isDestroyed) return;

        this.element.innerHTML = this.html`
            <div class="component-grocery-stats">
                ${this.trustedHtml(this.renderStatsOverview())}
                ${this.componentConfig.showCategoryBreakdown ? this.trustedHtml(this.renderCategoryBreakdown()) : ''}
            </div>
        `;

        this.postRenderSetup();
    }

    renderStatsOverview() {
        const stats = this.componentState.currentStats;

        return `
            <div class="stats-overview">
                <div class="stat-card total">
                    <div class="stat-content">
                        <div class="stat-icon">🛒</div>
                        <div class="stat-number">${stats.totalItems}</div>
                        <div class="stat-label">Total Items</div>
                    </div>
                </div>
                
                <div class="stat-card pending">
                    <div class="stat-content">
                        <div class="stat-icon">⏳</div>
                        <div class="stat-number">${stats.pendingItems}</div>
                        <div class="stat-label">Pending</div>
                    </div>
                </div>
                
                <div class="stat-card purchased">
                    <div class="stat-content">
                        <div class="stat-icon">✅</div>
                        <div class="stat-number">${stats.purchasedItems}</div>
                        <div class="stat-label">Purchased</div>
                    </div>
                </div>
                
                <div class="stat-card completion">
                    <div class="stat-content">
                        <div class="stat-icon">📊</div>
                        <div class="stat-number">${stats.completionRate}%</div>
                        <div class="stat-label">Complete</div>
                        <div class="stat-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${stats.completionRate}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderCategoryBreakdown() {
        const categories = this.componentState.categoryBreakdown;

        if (categories.length === 0) {
            return '';
        }

        return `
            <div class="category-breakdown">
                <h3>Category Breakdown</h3>
                <div class="category-list">
                    ${categories.map(cat => this.renderCategoryItem(cat)).join('')}
                </div>
            </div>
        `;
    }

    renderCategoryItem(category) {
        const icon = this.getCategoryIcon(category.category);

        return `
            <div class="category-item">
                <div class="category-header">
                    <div class="category-icon">${icon}</div>
                    <div class="category-name">${this.capitalizeFirst(category.category)}</div>
                    <div class="category-count">${category.total}</div>
                </div>
                <div class="category-details">
                    <span class="category-pending">${category.pending} pending</span>
                    <span class="category-purchased">${category.purchased} purchased</span>
                    <span class="category-rate">${category.completionRate}% complete</span>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Category item clicks for filtering
        this.on('click', '.category-item', (e) => {
            const category = e.target.closest('.category-item').dataset.category;
            this.handleCategoryClick(category);
        });
    }

    // Helper methods
    getCategoryIcon(category) {
        const icons = {
            produce: '🥕', dairy: '🥛', meat: '🥩', frozen: '🧊',
            pantry: '🥫', cleaning: '🧽', 'personal care': '🧴',
            beverages: '🥤', other: '📦'
        };
        return icons[category] || icons.other;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    updateStats() {
        const items = this.data || [];

        this.componentState.currentStats = {
            totalItems: items.length,
            pendingItems: items.filter(item => !item.purchased).length,
            purchasedItems: items.filter(item => item.purchased).length,
            completionRate: items.length > 0 ? Math.round((items.filter(item => item.purchased).length / items.length) * 100) : 0
        };

        // Update category breakdown
        this.componentState.categoryBreakdown = this.getCategoryBreakdown();
    }

    getCategoryBreakdown() {
        const items = this.data || [];
        const categoryMap = new Map();

        items.forEach(item => {
            const category = item.category || 'other';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, {
                    total: 0,
                    purchased: 0,
                    pending: 0
                });
            }
            const catStats = categoryMap.get(category);
            catStats.total++;
            if (item.purchased) {
                catStats.purchased++;
            } else {
                catStats.pending++;
            }
        });

        return Array.from(categoryMap.entries())
            .map(([category, stats]) => ({
                category,
                ...stats,
                completionRate: stats.total > 0 ? Math.round((stats.purchased / stats.total) * 100) : 0
            }))
            .sort((a, b) => b.total - a.total); // Sort by total items descending
    }

    // Action handlers
    handleCategoryClick(category) {
        // Emit event for other components to handle category filtering
        this.emit('categoryFilter', { category });
    }

    // Data update handler
    update(newData) {
        this.data = newData;
        this.updateStats();
        this.render();
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GroceryStatsComponent, createGroceryStatsComponent };
}

// Make available globally
if (typeof window !== 'undefined') {
    window.GroceryStatsComponent = GroceryStatsComponent;
    window.createGroceryStatsComponent = createGroceryStatsComponent;
} 