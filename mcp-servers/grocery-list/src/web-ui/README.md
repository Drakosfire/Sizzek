# Grocery List Web UI Components

## Architecture

This directory contains grocery-specific web UI components that extend the generic MCP Web UI Framework. 

### Dependency Structure

```
MCP Web UI Framework (main framework)
├── BaseComponent.js          (Core component foundation)
├── ListComponent.js          (Generic list functionality)
└── StatsComponent.js         (Generic statistics functionality)
    │
    └── Grocery-Specific Components (this directory)
        ├── GroceryListComponent.js   (Grocery list implementation)
        ├── GroceryStatsComponent.js  (Grocery stats implementation)
        └── index.html               (Example integration)
```

## Loading Order

**Critical:** Framework components must be loaded BEFORE server-specific components.

```html
<!-- 1. Load framework components FIRST -->
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/core/BaseComponent.js"></script>
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/components/ListComponent.js"></script>
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/components/StatsComponent.js"></script>

<!-- 2. Load server-specific components AFTER -->
<script src="GroceryListComponent.js"></script>
<script src="GroceryStatsComponent.js"></script>
```

## Usage

### Grocery List Component

```javascript
const groceryList = createGroceryListComponent(element, data, {
    list: {
        enableSearch: true,
        enableFilters: true,
        enableBulkActions: true,
        actions: {
            item: ['edit', 'delete', 'purchase'],
            bulk: ['delete', 'purchase'],
            global: ['add', 'import']
        }
    }
});
```

### Grocery Stats Component

```javascript
const groceryStats = createGroceryStatsComponent(element, data, {
    stats: {
        layout: 'grid',
        animate: true
    }
});
```

## Configuration Options

### List Configuration
- `enableSearch` - Enable search functionality
- `enableFilters` - Enable filtering controls
- `enableBulkActions` - Enable bulk operations
- `layout` - 'list' or 'grid' layout
- `actions` - Customize available actions

### Stats Configuration  
- `layout` - 'grid' or 'list' layout for metrics
- `animate` - Enable metric animations
- `showTrends` - Show trend indicators

## Benefits

- **75% code reduction** compared to previous hardcoded implementation
- **Configuration-driven** - customize behavior without code changes
- **Maintains all functionality** - no feature loss during refactoring
- **Framework updates automatically benefit** server components
- **Single source of truth** for list/stats logic

## Framework Relationship

These components are **thin configuration layers** over the generic framework components:

- **GroceryListComponent** (150 lines) configures **ListComponent** (1,243 lines)
- **GroceryStatsComponent** (100 lines) configures **StatsComponent** (580 lines)

The framework handles all the complex functionality (CRUD, filtering, sorting, etc.) while these components provide grocery-specific enhancements (category icons, purchase actions, etc.). 