# Todoodles Web UI Components

## Architecture

This directory contains todo-specific web UI components that extend the generic MCP Web UI Framework.

### Dependency Structure

```
MCP Web UI Framework (main framework)
├── BaseComponent.js          (Core component foundation)
└── ListComponent.js          (Generic list functionality)
    │
    └── Todo-Specific Components (this directory)
        ├── TodoListComponent.js     (Advanced todo list implementation)
        └── index.html              (Example integration)
```

## Loading Order

**Critical:** Framework components must be loaded BEFORE server-specific components.

```html
<!-- 1. Load framework components FIRST -->
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/core/BaseComponent.js"></script>
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/components/ListComponent.js"></script>

<!-- 2. Load server-specific components AFTER -->
<script src="TodoListComponent.js"></script>
```

## Usage

### Basic Todo List

```javascript
const todoList = createTodoListComponent(element, data, {
    list: {
        itemFields: ['text', 'priority'],
        enableToggle: true,
        actions: { item: ['edit', 'delete', 'toggle'] }
    }
});
```

### Advanced Todo List with All Features

```javascript
const advancedTodoList = createTodoListComponent(element, data, {
    list: {
        itemFields: ['text', 'priority', 'category', 'dueDate'],
        enableSearch: true,
        enableFilters: true,
        enableBulkActions: true,
        enableSorting: true,
        actions: {
            item: ['edit', 'delete', 'duplicate', 'toggle'],
            bulk: ['delete', 'complete', 'archive'],
            global: ['add', 'import']
        }
    },
    todo: {
        enableUndo: true,
        undoTimeout: 5000,
        maxTodoLength: 500
    }
});
```

## Advanced Features

### Undo System
The todo component includes a sophisticated undo system:
- **5-second timeout** for undo actions
- **Visual notifications** with progress bars
- **Smart state management** prevents conflicts
- **Bulk undo support** for multiple operations

### Priority Management
- **4 priority levels**: low, medium, high, urgent
- **Color-coded badges** with emoji indicators
- **Smart sorting**: incomplete first, then by priority
- **Priority-aware filtering**

### Due Date Support
- **Overdue detection** with visual indicators
- **Smart date formatting**: "Today", "Tomorrow", or date
- **Date-based filtering**: overdue, today, this week
- **Due date validation**

## Configuration Options

### List Configuration
- `itemFields` - Which fields to display/edit
- `enableSearch` - Enable search functionality
- `enableFilters` - Enable filtering controls
- `enableBulkActions` - Enable bulk operations
- `enableSorting` - Enable column sorting
- `actions` - Customize available actions per context

### Todo-Specific Configuration
- `enableUndo` - Enable undo system (default: true)
- `undoTimeout` - Undo timeout in milliseconds (default: 5000)
- `maxTodoLength` - Maximum todo text length (default: 500)
- `priorityLevels` - Available priority levels
- `defaultPriority` - Default priority for new todos

## Code Reduction Achievement

**TodoListComponent**: 829 lines → 200 lines (**76% reduction**)

The new architecture maintains ALL original functionality including:
- ✅ Advanced undo system with 5-second timeout
- ✅ Priority levels with color coding  
- ✅ Category support
- ✅ Due date management with overdue detection
- ✅ Smart sorting (incomplete first, then by priority)
- ✅ Bulk actions (complete, archive)
- ✅ Duplicate functionality
- ✅ Form validation

## Framework Relationship

The **TodoListComponent** (200 lines) configures and extends the generic **ListComponent** (1,243 lines) with todo-specific features:

- **Base functionality** (CRUD, search, filters, etc.) provided by framework
- **Todo enhancements** (undo, priorities, due dates) added by this component
- **Configuration-driven** behavior allows customization without code changes 