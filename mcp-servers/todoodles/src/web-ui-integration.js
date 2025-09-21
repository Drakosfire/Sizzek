import { MCPWebUI } from 'mcp-web-ui';
import path from 'path';
/**
 * Clean, separate web UI integration for Todoodles
 * Keeps all web UI logic isolated from the main MCP server
 */
export class TodoodlesWebUIManager {
    constructor(todoodlesManager, // The main UserAwareTodoodlesManager instance
        enableLogging = true) {
        this.todoodlesManager = todoodlesManager;
        this.enableLogging = enableLogging;
        // Create the UI schema specifically for todoodles
        const schema = this.createTodoodlesUISchema();
        // Configure the web UI with proper CSS path
        this.webUI = new MCPWebUI({
            dataSource: this.getDataSource.bind(this),
            schema,
            onUpdate: this.handleUIUpdate.bind(this),
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            pollInterval: 2000, // 2 seconds
            enableLogging: this.enableLogging,
            baseUrl: process.env.MCP_WEB_UI_BASE_URL || 'localhost',
            // Use correct path for CSS so MCPWebUI can properly set mcpServerDirectory
            cssPath: path.join(process.cwd(), 'mcp-servers', 'todoodles', 'static'),
            portRange: [parseInt(process.env.MCP_WEB_UI_PORT_MIN || '12000'), parseInt(process.env.MCP_WEB_UI_PORT_MAX || '13000')],
            blockedPorts: process.env.MCP_WEB_UI_BLOCKED_PORTS ?
                process.env.MCP_WEB_UI_BLOCKED_PORTS.split(',')
                    .map(p => parseInt(p.trim()))
                    .filter(p => !isNaN(p)) : [],
            serverName: 'todoodles' // Set explicit server name for session isolation
        });
        this.log('INFO', 'TodoodlesWebUIManager initialized');
        // Log web UI environment variables for debugging
        this.log('DEBUG', '[WEB-UI-ENV] Environment variables:', {
            MCP_WEB_UI_USE_GATEWAY: process.env.MCP_WEB_UI_USE_GATEWAY,
            MCP_WEB_UI_GATEWAY_URL: process.env.MCP_WEB_UI_GATEWAY_URL,
            MCP_WEB_UI_MONGO_URL: process.env.MCP_WEB_UI_MONGO_URL,
            MCP_WEB_UI_BASE_URL: process.env.MCP_WEB_UI_BASE_URL,
            MCP_WEB_UI_PROXY_PREFIX: process.env.MCP_WEB_UI_PROXY_PREFIX,
            MCP_WEB_UI_BIND_ADDRESS: process.env.MCP_WEB_UI_BIND_ADDRESS,
            MCP_WEB_UI_PORT_MIN: process.env.MCP_WEB_UI_PORT_MIN,
            MCP_WEB_UI_PORT_MAX: process.env.MCP_WEB_UI_PORT_MAX
        });
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
    async handleGetWebUI(userId, extendMinutes = 30) {
        this.log('INFO', `[TODOODLES-WEB-UI] handleGetWebUI called with userId: "${userId}" and extendMinutes: ${extendMinutes}`);
        // Debug: Check how many todos this user ID has
        try {
            const userTodos = await this.todoodlesManager.getTodos(userId);
            this.log('INFO', `[TODOODLES-WEB-UI] User "${userId}" has ${userTodos.length} todos`);
            // If user has no todos, let's check what user IDs do have data (debug helper)
            if (userTodos.length === 0 && process.env.MCP_DEBUG === 'true') {
                this.log('WARN', `[TODOODLES-WEB-UI] User "${userId}" has no todos. Checking for other user data...`);
                await this.debugCheckOtherUsers();
            }
        }
        catch (error) {
            this.log('ERROR', `[TODOODLES-WEB-UI] Error checking user todos: ${error}`);
        }
        return this.webUI.handleGetWebUI(userId, extendMinutes);
    }
    /**
     * Debug helper to check what user IDs have data in the system
     */
    async debugCheckOtherUsers() {
        try {
            // Check common user ID patterns
            const testUserIds = [
                undefined, // Default user
                'default',
                process.env.MCP_USER_ID,
                // Add more user IDs to check based on your context
            ].filter(Boolean);
            this.log('DEBUG', `[TODOODLES-WEB-UI] Checking data for user IDs: ${JSON.stringify(testUserIds)}`);
            for (const testUserId of testUserIds) {
                try {
                    const todos = await this.todoodlesManager.getTodos(testUserId);
                    if (todos.length > 0) {
                        this.log('WARN', `[TODOODLES-WEB-UI] Found ${todos.length} todos for user "${testUserId}"`);
                    }
                }
                catch (error) {
                    // Ignore errors for individual user checks
                }
            }
        }
        catch (error) {
            this.log('ERROR', `[TODOODLES-WEB-UI] Debug check failed: ${error}`);
        }
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
        this.log('INFO', 'TodoodlesWebUIManager cleaned up');
    }
    /**
     * Create todoodles-specific UI schema
     */
    createTodoodlesUISchema() {
        return {
            title: "Todoodles Dashboard",
            description: "Manage your todoodles with an interactive web interface",
            components: [{
                type: "list",
                id: "todoodles-list",
                title: "Your Todoodles",
                config: {
                    showItemCount: true,
                    fields: [
                        { key: "id", label: "ID", type: "text" },
                        { key: "text", label: "Task", type: "text" },
                        {
                            key: "priority",
                            label: "Priority",
                            type: "badge",
                            format: (value) => value.toUpperCase()
                        },
                        { key: "category", label: "Category", type: "text" },
                        {
                            key: "dueDate",
                            label: "Due Date",
                            type: "date",
                            format: (value) => value ? new Date(value).toLocaleDateString() : ''
                        },
                        {
                            key: "createdAt",
                            label: "Created",
                            type: "date",
                            format: (value) => new Date(value).toLocaleDateString()
                        }
                    ],
                    sortable: true,
                    filterable: true
                }
            }],
            actions: [
                {
                    id: "add",
                    label: "Add Todo",
                    type: "button",
                    handler: "add"
                },
                {
                    id: "complete",
                    label: "Complete",
                    type: "inline",
                    handler: "complete",
                    confirm: "Mark this todoodle as complete? This will delete it from your list."
                },
                {
                    id: "delete",
                    label: "Delete",
                    type: "inline",
                    handler: "delete",
                    confirm: "Are you sure you want to delete this todoodle?"
                }
            ],
            polling: {
                enabled: true,
                intervalMs: 2000
            }
        };
    }
    /**
     * Data source function - gets todoodles for the specified user
     * The user context is automatically provided by the web UI framework
     */
    async getDataSource(userId) {
        try {
            // this.log('INFO', `[TODOODLES-WEB-UI] Getting todoodles data for user: "${userId}"`);
            // Call the manager's getTodos method with the userId, but filter to only incomplete todos
            const allTodos = await this.todoodlesManager.getTodos(userId);
            const incompleteTodos = allTodos.filter((todo) => !todo.completed);
            // Sort by priority: urgent > high > medium > low
            const priorityOrder = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
            const sortedTodos = incompleteTodos.sort((a, b) => {
                const aPriority = priorityOrder[a.priority] ?? 4; // Unknown priorities go to the end
                const bPriority = priorityOrder[b.priority] ?? 4;
                return aPriority - bPriority;
            });
            // this.log('INFO', `[TODOODLES-WEB-UI] Retrieved ${sortedTodos.length} incomplete todos for user: "${userId}"`);
            // Log first few todos for debugging if in debug mode
            if (process.env.MCP_DEBUG === 'true' && sortedTodos.length > 0) {
                this.log('DEBUG', `[TODOODLES-WEB-UI] First 3 incomplete todos (sorted by priority):`, {
                    todos: sortedTodos.slice(0, 3).map((t) => ({ id: t.id, text: t.text, priority: t.priority, completed: t.completed }))
                });
            }
            return sortedTodos;
        }
        catch (error) {
            this.log('ERROR', `[TODOODLES-WEB-UI] Failed to get todoodles data for user "${userId}": ${error}`);
            return [];
        }
    }
    /**
     * Handle UI updates (checkbox toggles, deletes, etc.)
     */
    async handleUIUpdate(action, data, userId) {
        try {
            this.log('DEBUG', `Handling UI update: ${action} for user: ${userId}`, { data });
            switch (action) {
                case 'update':
                    const { id: updateId, text, category, priority, dueDate } = data;
                    const updates = {};
                    // Only include fields that are provided
                    if (text !== undefined)
                        updates.text = text;
                    if (category !== undefined)
                        updates.category = category;
                    if (priority !== undefined)
                        updates.priority = priority;
                    if (dueDate !== undefined)
                        updates.dueDate = dueDate;
                    const updateResult = await this.todoodlesManager.updateTodo(updateId, updates, userId);
                    if (!updateResult.success) {
                        throw new Error(`Todo with ID ${updateId} not found`);
                    }
                    this.log('INFO', `Updated todo ${updateId} for user ${userId}`, { updates });
                    return updateResult.updatedTodo;
                case 'complete':
                    // Mark as completed and then delete
                    const completeResult = await this.todoodlesManager.updateTodo(data.id, { completed: true }, userId);
                    if (!completeResult.success) {
                        throw new Error(`Todo with ID ${data.id} not found`);
                    }
                    // Now delete the completed todo
                    const deleteAfterCompleteResult = await this.todoodlesManager.deleteTodo(data.id, userId);
                    if (!deleteAfterCompleteResult.success) {
                        this.log('WARN', `Todo ${data.id} was marked complete but could not be deleted`);
                    }
                    this.log('INFO', `Completed and deleted todo ${data.id} for user ${userId}`);
                    return deleteAfterCompleteResult;
                case 'delete':
                    const deleteResult = await this.todoodlesManager.deleteTodo(data.id, userId);
                    if (!deleteResult.success) {
                        throw new Error(`Todo with ID ${data.id} not found`);
                    }
                    this.log('INFO', `Deleted todo ${data.id} for user ${userId}`);
                    return deleteResult;
                case 'add':
                    this.log('DEBUG', `Processing add action for user ${userId}`, {
                        data,
                        dataKeys: Object.keys(data || {}),
                        text: data?.text,
                        category: data?.category,
                        priority: data?.priority,
                        dueDate: data?.dueDate
                    });
                    // Validate required fields
                    if (!data || !data.text || typeof data.text !== 'string') {
                        throw new Error('Text is required and must be a string');
                    }
                    // Validate priority if provided
                    if (data.priority && !['low', 'medium', 'high', 'urgent'].includes(data.priority)) {
                        throw new Error(`Invalid priority: ${data.priority}. Must be one of: low, medium, high, urgent`);
                    }
                    // Validate date format if provided
                    if (data.dueDate && data.dueDate.trim() !== '') {
                        try {
                            new Date(data.dueDate);
                        }
                        catch (error) {
                            throw new Error(`Invalid due date format: ${data.dueDate}`);
                        }
                    }
                    try {
                        const addedTodo = await this.todoodlesManager.addTodo(data.text.trim(), data.category?.trim() || undefined, data.priority || 'medium', data.dueDate?.trim() || undefined, userId);
                        this.log('INFO', `Added new todo for user ${userId}: "${data.text}"`);
                        return addedTodo;
                    }
                    catch (addError) {
                        this.log('ERROR', `addTodo method failed for user ${userId}:`, {
                            error: addError.message,
                            stack: addError.stack,
                            data
                        });
                        throw addError;
                    }
                default:
                    throw new Error(`Unknown UI action: ${action}`);
            }
        }
        catch (error) {
            this.log('ERROR', `UI update failed: ${error}`, { action, data, userId });
            throw error;
        }
    }
    /**
     * Simple logging utility
     */
    log(level, message, data) {
        if (this.enableLogging) {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}][${level}][TodoodlesWebUI] ${message}`);
            if (data && process.env.MCP_DEBUG === 'true') {
                console.error(JSON.stringify(data, null, 2));
            }
        }
    }
}
