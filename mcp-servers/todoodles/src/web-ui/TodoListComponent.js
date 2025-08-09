/**
 * TodoListComponent - Todo-Specific List Implementation
 * 
 * This component extends the generic ListComponent with todo-specific configuration:
 * - Configures ListComponent for todo items (text, priority, category, due dates)
 * - Adds advanced todo features like undo system and smart notifications
 * - Maintains all existing todo functionality while using generic infrastructure
 * 
 * REFACTORED ARCHITECTURE:
 * - Uses generic ListComponent as the base with configuration
 * - Adds todo-specific enhancements (undo, priority handling, smart dates)
 * - Reduces code duplication while maintaining rich functionality
 * - Server can still customize through configuration
 * 
 * DEPENDENCIES:
 * - Requires ListComponent to be loaded from MCP Web UI Framework
 * - Framework components should be loaded before this component
 */

/**
 * Factory function to create a todo list using the generic ListComponent
 * @param {HTMLElement} element - DOM element to attach to
 * @param {Array} data - Initial todo data
 * @param {Object} config - Configuration options
 * @returns {ListComponent} Enhanced ListComponent for todo lists
 */
function createTodoListComponent(element, data, config = {}) {
    // Ensure framework components are available
    if (typeof ListComponent === 'undefined') {
        throw new Error('ListComponent not found. Please ensure the MCP Web UI Framework is loaded before this component.');
    }

    // Define todo-specific configuration
    const todoConfig = {
        list: {
            // Item configuration
            itemType: 'todo',
            itemIdField: 'id',
            itemTextField: 'text',
            itemFields: ['text', 'priority', 'category', 'dueDate'],

            // Layout and features
            layout: 'list',
            enableCRUD: true,
            enableSearch: true,
            enableFilters: true,
            enableSorting: true,
            enableBulkActions: true,
            enableToggle: false,

            // Actions configuration
            actions: {
                item: ['edit', 'complete', 'delete', 'duplicate'],
                bulk: ['delete', 'complete', 'archive'],
                global: ['add', 'import']
            },

            // Form configuration
            forms: {
                add: {
                    title: 'Add New Todo',
                    fields: [
                        { key: 'text', label: 'What needs to be done?', type: 'text', required: true, placeholder: 'Enter your todo...' },
                        { key: 'priority', label: 'Priority', type: 'select', required: false, options: ['low', 'medium', 'high', 'urgent'] },
                        { key: 'category', label: 'Category', type: 'text', required: false, placeholder: 'Optional category' },
                        { key: 'dueDate', label: 'Due Date', type: 'date', required: false }
                    ]
                },
                edit: {
                    title: 'Edit Todo',
                    fields: [
                        { key: 'text', label: 'What needs to be done?', type: 'text', required: true },
                        { key: 'priority', label: 'Priority', type: 'select', required: false, options: ['low', 'medium', 'high', 'urgent'] },
                        { key: 'category', label: 'Category', type: 'text', required: false },
                        { key: 'dueDate', label: 'Due Date', type: 'date', required: false }
                    ]
                }
            },

            // Display configuration
            emptyStateMessage: 'No todos yet! Add your first one to get started.',
            confirmDeletes: true,
            showItemCount: true,
            showStats: true,

            // Search configuration
            search: {
                placeholder: 'Search todos...',
                debounceMs: 300,
                searchFields: ['text', 'category']
            },

            // Filter configuration
            filters: {
                defaultFilter: 'all',
                customFilters: [
                    {
                        key: 'priority',
                        label: 'Priority',
                        type: 'select',
                        options: ['all', 'low', 'medium', 'high', 'urgent']
                    },
                    {
                        key: 'completed',
                        label: 'Status',
                        type: 'select',
                        options: [
                            { value: 'all', label: 'All Todos' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'completed', label: 'Completed' }
                        ]
                    },
                    {
                        key: 'dueDate',
                        label: 'Due Date',
                        type: 'select',
                        options: [
                            { value: 'all', label: 'All Dates' },
                            { value: 'overdue', label: 'Overdue' },
                            { value: 'today', label: 'Due Today' },
                            { value: 'week', label: 'This Week' }
                        ]
                    }
                ]
            },

            // Sorting configuration
            defaultSort: { column: 'priority', direction: 'desc' },

            // Merge any user-provided configuration
            ...config.list
        },

        // Global config (title, etc.)
        title: 'Your Todos',
        ...config
    };

    // Create the ListComponent with todo configuration
    const todoList = new ListComponent(element, data, todoConfig);

    // Add todo-specific state and functionality
    todoList.todoConfig = {
        enableUndo: true,
        undoTimeout: 5000,
        maxTodoLength: 500,
        priorityLevels: ['low', 'medium', 'high', 'urgent'],
        defaultPriority: 'medium',
        ...config.todo
    };

    // Undo system
    todoList.undoSystem = {
        actions: [],
        pendingCompletes: new Set(),
        maxUndoActions: 5
    };

    // Enhanced item rendering for todos
    const originalRenderItemContent = todoList.renderItemContent;
    todoList.renderItemContent = function (item) {
        const primaryContent = originalRenderItemContent.call(this, item);
        const dueDate = item.dueDate ? this.formatDueDate(item.dueDate) : '';
        const isOverdue = item.dueDate && this.isOverdue(item.dueDate);

        return `
            ${primaryContent}
            ${dueDate ? `
                <div class="item-due-date ${isOverdue ? 'overdue' : ''}">
                    📅 ${dueDate}
                </div>
            ` : ''}
        `;
    };

    // Enhanced field formatting for todos
    const originalFormatFieldValue = todoList.formatFieldValue;
    todoList.formatFieldValue = function (value, field) {
        switch (field) {
            case 'priority':
                return this.formatPriorityBadge(value);
            case 'category':
                return this.formatCategoryBadge(value);
            case 'dueDate':
                return this.formatDueDate(value);
            default:
                return originalFormatFieldValue.call(this, value, field);
        }
    };

    // Todo-specific action handling
    const originalHandleItemAction = todoList.handleItemAction;
    todoList.handleItemAction = async function (action, id) {
        if (action === 'duplicate') {
            await this.handleDuplicateTodo(id);
        } else if (action === 'delete') {
            console.log('DEBUG: handleItemAction called with action:', action, 'and id:', id);
            await this.handleDeleteWithUndo(id);
        } else {
            return originalHandleItemAction.call(this, action, id);
        }
    };

    // Enhanced bulk actions
    const originalHandleBulkAction = todoList.handleBulkAction;
    todoList.handleBulkAction = async function (action) {
        const selectedIds = Array.from(this.listState.selectedItems);

        switch (action) {
            case 'complete':
                await this.handleBulkComplete(selectedIds);
                break;
            case 'archive':
                await this.handleBulkArchive(selectedIds);
                break;
            default:
                return originalHandleBulkAction.call(this, action);
        }
    };

    // Override sorting to prioritize by priority and completion
    const originalApplySorting = todoList.applySorting;
    todoList.applySorting = function (items) {
        if (!this.listState.sortColumn) {
            // Default smart sorting: incomplete first, then by priority
            return this.smartSortTodos(items);
        }
        return originalApplySorting.call(this, items);
    };

    // Add todo-specific methods
    todoList.smartSortTodos = function (todos) {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };

        return [...todos].sort((a, b) => {
            // Incomplete todos first
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            // Then by priority
            const aPriority = priorityOrder[a.priority] || 2;
            const bPriority = priorityOrder[b.priority] || 2;

            return bPriority - aPriority;
        });
    };

    todoList.formatPriorityBadge = function (priority) {
        if (!priority) return '';

        const priorityConfig = {
            urgent: { color: '#dc2626', emoji: '🔴' },
            high: { color: '#ea580c', emoji: '🟠' },
            medium: { color: '#0891b2', emoji: '🟡' },
            low: { color: '#059669', emoji: '🟢' }
        };

        const config = priorityConfig[priority] || priorityConfig.medium;
        return `<span class="priority-badge priority-${priority}" style="background-color: ${config.color}">
            ${config.emoji} ${this.capitalizePriority(priority)}
        </span>`;
    };

    todoList.formatCategoryBadge = function (category) {
        if (!category) return '';
        return `<span class="category-badge">#${category}</span>`;
    };

    todoList.formatDueDate = function (dateString) {
        if (!dateString) return '';

        try {
            const date = new Date(dateString);
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (date.toDateString() === today.toDateString()) {
                return 'Today';
            } else if (date.toDateString() === tomorrow.toDateString()) {
                return 'Tomorrow';
            } else {
                return date.toLocaleDateString();
            }
        } catch {
            return dateString;
        }
    };

    todoList.isOverdue = function (dueDate) {
        if (!dueDate) return false;
        const due = new Date(dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return due < today;
    };

    todoList.capitalizePriority = function (priority) {
        return priority.charAt(0).toUpperCase() + priority.slice(1);
    };

    // Undo system methods

    todoList.addUndoAction = function (id, type, originalState) {
        const undoId = Date.now() + Math.random();

        const undoAction = {
            id: undoId,
            todoId: id,
            type,
            originalState,
            timeoutId: setTimeout(() => {
                this.removeUndoAction(undoId);
            }, this.todoConfig.undoTimeout)
        };

        this.undoSystem.actions.push(undoAction);

        // Limit undo history
        if (this.undoSystem.actions.length > this.undoSystem.maxUndoActions) {
            const oldest = this.undoSystem.actions.shift();
            if (oldest?.timeoutId) {
                clearTimeout(oldest.timeoutId);
            }
        }

        this.render();
    };

    todoList.removeUndoAction = function (undoId) {
        const index = this.undoSystem.actions.findIndex(action => action.id === undoId);
        if (index !== -1) {
            const action = this.undoSystem.actions[index];
            if (action.timeoutId) {
                clearTimeout(action.timeoutId);
            }
            this.undoSystem.actions.splice(index, 1);
            this.undoSystem.pendingCompletes.delete(action.todoId);
            this.render();
        }
    };

    todoList.handleUndo = async function (undoId) {
        const action = this.undoSystem.actions.find(a => a.id === undoId);
        if (!action) return;

        try {
            if (action.type === 'delete' || action.type === 'complete') {
                // Restore the deleted/completed item by adding it back
                const restoredData = {
                    ...action.originalState,
                    // Ensure we restore with the original ID and mark as incomplete
                    id: action.todoId,
                    completed: false
                };
                await this.handleAction('add', restoredData);
            }

            this.removeUndoAction(undoId);
            this.log('INFO', `Undid action: ${action.type}`);
        } catch (error) {
            this.handleError(error);
        }
    };

    // Override handleDeleteItem to add undo functionality and use schema confirm message
    const originalHandleDeleteItem = todoList.handleDeleteItem;
    todoList.handleDeleteItem = async function (id) {
        console.log('DEBUG: TodoList handleDeleteItem called with id:', id);
        const item = this.findItemById(id);
        if (!item) {
            console.log('DEBUG: Item not found');
            return;
        }

        // Show confirmation dialog using schema confirm message
        if (this.listConfig.confirmDeletes) {
            if (!window.MCPModal) {
                // Fallback to native confirm if modal not available
                const confirmMessage = this.getDeleteConfirmMessage(item);
                if (!confirm(confirmMessage)) return;
            } else {
                console.log('DEBUG: Creating delete confirmation modal');
                const modalConfig = {
                    title: 'Confirm Delete',
                    message: this.getDeleteConfirmMessage(item),
                    confirmText: 'Delete',
                    cancelText: 'Cancel'
                };
                console.log('DEBUG: Modal config:', modalConfig);

                const confirmed = await window.MCPModal.confirm(modalConfig);
                console.log('DEBUG: Modal result:', confirmed);

                if (!confirmed || confirmed.action !== 'confirm') {
                    console.log('DEBUG: Delete cancelled or failed');
                    return;
                }
                console.log('DEBUG: Delete confirmed, proceeding...');
            }
        }

        if (this.todoConfig.enableUndo) {
            // Add to undo system before deleting
            this.addUndoAction(id, 'delete', { ...item });
        }

        try {
            // Call the backend to delete the todo
            await this.handleAction('delete', { id });
            this.log('INFO', `Todo deleted: ${id}`);
        } catch (error) {
            // Remove from undo system if delete failed
            if (this.todoConfig.enableUndo) {
                this.removeUndoAction(id);
            }
            this.handleError(error);
        }
    };

    // Add complete action handler
    todoList.handleCompleteItem = async function (id) {
        console.log('DEBUG: TodoList handleCompleteItem called with id:', id);
        const item = this.findItemById(id);
        if (!item) {
            console.log('DEBUG: Item not found');
            return;
        }

        // Show confirmation dialog for completion
        if (!window.MCPModal) {
            // Fallback to native confirm if modal not available
            const confirmMessage = `Mark "${item.text}" as complete? This will delete it from your list.`;
            if (!confirm(confirmMessage)) return;
        } else {
            console.log('DEBUG: Creating complete confirmation modal');
            const modalConfig = {
                title: 'Complete Todo',
                message: `Mark "${item.text}" as complete? This will delete it from your list.`,
                confirmText: 'Complete',
                cancelText: 'Cancel'
            };
            console.log('DEBUG: Modal config:', modalConfig);

            const confirmed = await window.MCPModal.confirm(modalConfig);
            console.log('DEBUG: Modal result:', confirmed);

            if (!confirmed || confirmed.action !== 'confirm') {
                console.log('DEBUG: Complete cancelled or failed');
                return;
            }
            console.log('DEBUG: Complete confirmed, proceeding...');
        }

        if (this.todoConfig.enableUndo) {
            // Add to undo system before completing
            this.addUndoAction(id, 'complete', { ...item });
        }

        try {
            // Call the backend to complete the todo
            await this.handleAction('complete', { id });
            this.log('INFO', `Todo completed: ${id}`);
        } catch (error) {
            // Remove from undo system if complete failed
            if (this.todoConfig.enableUndo) {
                this.removeUndoAction(id);
            }
            this.handleError(error);
        }
    };

    todoList.handleDuplicateTodo = async function (id) {
        const item = this.findItemById(id);
        if (!item) return;

        const duplicatedData = {
            text: `${item.text} (copy)`,
            priority: item.priority,
            category: item.category,
            dueDate: item.dueDate,
            completed: false
        };

        try {
            await this.handleAction('add', duplicatedData);
            this.log('INFO', `Todo duplicated: ${id}`);
        } catch (error) {
            this.handleError(error);
        }
    };

    todoList.handleBulkComplete = async function (selectedIds) {
        try {
            await this.handleAction('bulk_complete', { ids: selectedIds });
            this.listState.selectedItems.clear();
            this.render();
        } catch (error) {
            this.handleError(error);
        }
    };

    todoList.handleBulkArchive = async function (selectedIds) {
        try {
            await this.handleAction('bulk_archive', { ids: selectedIds });
            this.listState.selectedItems.clear();
            this.render();
        } catch (error) {
            this.handleError(error);
        }
    };

    // Enhanced rendering with undo notifications
    const originalRender = todoList.render;
    todoList.render = function () {
        originalRender.call(this);

        // Add undo notifications if present
        if (this.todoConfig.enableUndo && this.undoSystem.actions.length > 0) {
            const undoNotifications = this.renderUndoNotifications();
            if (undoNotifications) {
                this.element.insertAdjacentHTML('afterbegin', undoNotifications);
            }
        }
    };

    todoList.renderUndoNotifications = function () {
        if (!this.undoSystem || this.undoSystem.actions.length === 0) {
            return '';
        }

        return `
            <div class="undo-container">
                ${this.undoSystem.actions.map(action => `
                    <div class="undo-toast" data-undo-id="${action.id}">
                        <div class="undo-content">
                            <span class="undo-message">✓ ${this.getUndoMessage(action)}</span>
                            <button class="undo-button" onclick="this.closest('.component').todoComponent.handleUndo('${action.id}')">
                                Undo
                            </button>
                        </div>
                        <div class="undo-progress">
                            <div class="undo-progress-bar"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    todoList.getUndoMessage = function (action) {
        switch (action.type) {
            case 'delete':
                return `"${action.originalState.text}" deleted`;
            case 'complete':
                return `"${action.originalState.text}" completed`;
            default:
                return 'Action completed';
        }
    };

    // Store reference for undo button callbacks
    element.todoComponent = todoList;

    // Enhanced cleanup
    const originalDestroy = todoList.destroy;
    todoList.destroy = function () {
        // Clear undo timeouts
        this.undoSystem.actions.forEach(action => {
            if (action.timeoutId) {
                clearTimeout(action.timeoutId);
            }
        });

        this.undoSystem = null;
        this.todoConfig = null;

        return originalDestroy.call(this);
    };

    // Log successful creation
    todoList.log('INFO', 'TodoListComponent created using generic ListComponent with advanced features');

    return todoList;
}

// Maintain backwards compatibility with the original class-based approach
class TodoListComponent {
    constructor(element, data, config) {
        return createTodoListComponent(element, data, config);
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TodoListComponent, createTodoListComponent };
}

// Make available globally
if (typeof window !== 'undefined') {
    window.TodoListComponent = TodoListComponent;
    window.createTodoListComponent = createTodoListComponent;
} 