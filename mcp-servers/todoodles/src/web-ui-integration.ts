import { MCPWebUI, createTodoSchema, UISchema } from 'mcp-web-ui';

// TodoodleItem interface (matching the main file)
interface TodoodleItem {
    id: string;
    text: string;
    createdAt: string;
    completed: boolean;
    completedAt?: string;
    timeToComplete?: number;
    category?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: string;
}

/**
 * Clean, separate web UI integration for Todoodles
 * Keeps all web UI logic isolated from the main MCP server
 */
export class TodoodlesWebUIManager {
    private webUI: MCPWebUI<TodoodleItem>;

    constructor(
        private todoodlesManager: any, // The main UserAwareTodoodlesManager instance
        private enableLogging = true
    ) {
        // Create the UI schema specifically for todoodles
        const schema = this.createTodoodlesUISchema();

        // Initialize the web UI framework
        this.webUI = new MCPWebUI<TodoodleItem>({
            dataSource: this.getDataSource.bind(this),
            schema,
            onUpdate: this.handleUIUpdate.bind(this),
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            pollInterval: 2000, // 2 seconds
            enableLogging: this.enableLogging,
            baseUrl: process.env.MCP_WEB_UI_BASE_URL || 'localhost'
        });

        this.log('INFO', 'TodoodlesWebUIManager initialized');
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
    async handleGetWebUI(userId: string): Promise<{
        content: Array<{ type: string; text: string }>;
    }> {
        this.log('INFO', `[TODOODLES-WEB-UI] handleGetWebUI called with userId: "${userId}"`);

        // Debug: Check how many todos this user ID has
        try {
            const userTodos = await this.todoodlesManager.getTodos(userId);
            this.log('INFO', `[TODOODLES-WEB-UI] User "${userId}" has ${userTodos.length} todos`);

            // If user has no todos, let's check what user IDs do have data (debug helper)
            if (userTodos.length === 0 && process.env.MCP_DEBUG === 'true') {
                this.log('WARN', `[TODOODLES-WEB-UI] User "${userId}" has no todos. Checking for other user data...`);
                await this.debugCheckOtherUsers();
            }
        } catch (error) {
            this.log('ERROR', `[TODOODLES-WEB-UI] Error checking user todos: ${error}`);
        }

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

            this.log('DEBUG', `[TODOODLES-WEB-UI] Checking data for user IDs: ${JSON.stringify(testUserIds)}`);

            for (const testUserId of testUserIds) {
                try {
                    const todos = await this.todoodlesManager.getTodos(testUserId as string);
                    if (todos.length > 0) {
                        this.log('WARN', `[TODOODLES-WEB-UI] Found ${todos.length} todos for user "${testUserId}"`);
                    }
                } catch (error) {
                    // Ignore errors for individual user checks
                }
            }
        } catch (error) {
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
    private createTodoodlesUISchema(): UISchema {
        return {
            title: "Todoodles Dashboard",
            description: "Manage your todoodles with an interactive web interface",
            components: [{
                type: "list",
                id: "todoodles-list",
                title: "Your Todoodles",
                config: {
                    fields: [
                        { key: "id", label: "ID", type: "text" },
                        { key: "text", label: "Task", type: "text" },
                        { key: "completed", label: "Done", type: "checkbox", editable: true },
                        {
                            key: "priority",
                            label: "Priority",
                            type: "badge",
                            format: (value: string) => value.toUpperCase()
                        },
                        { key: "category", label: "Category", type: "text" },
                        {
                            key: "dueDate",
                            label: "Due Date",
                            type: "date",
                            format: (value: string) => value ? new Date(value).toLocaleDateString() : ''
                        },
                        {
                            key: "createdAt",
                            label: "Created",
                            type: "date",
                            format: (value: string) => new Date(value).toLocaleDateString()
                        }
                    ],
                    sortable: true,
                    filterable: true
                }
            }],
            actions: [
                {
                    id: "toggle",
                    label: "Toggle Complete",
                    type: "inline",
                    handler: "toggle"
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
    private async getDataSource(userId?: string): Promise<TodoodleItem[]> {
        try {
            // this.log('INFO', `[TODOODLES-WEB-UI] Getting todoodles data for user: "${userId}"`);

            // Call the manager's getTodos method with the userId, but filter to only incomplete todos
            const allTodos = await this.todoodlesManager.getTodos(userId);
            const incompleteTodos = allTodos.filter((todo: TodoodleItem) => !todo.completed);

            // Sort by priority: urgent > high > medium > low
            const priorityOrder: Record<string, number> = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
            const sortedTodos = incompleteTodos.sort((a: TodoodleItem, b: TodoodleItem) => {
                const aPriority = priorityOrder[a.priority] ?? 4; // Unknown priorities go to the end
                const bPriority = priorityOrder[b.priority] ?? 4;
                return aPriority - bPriority;
            });

            // this.log('INFO', `[TODOODLES-WEB-UI] Retrieved ${sortedTodos.length} incomplete todos for user: "${userId}"`);

            // Log first few todos for debugging if in debug mode
            if (process.env.MCP_DEBUG === 'true' && sortedTodos.length > 0) {
                this.log('DEBUG', `[TODOODLES-WEB-UI] First 3 incomplete todos (sorted by priority):`, {
                    todos: sortedTodos.slice(0, 3).map((t: TodoodleItem) => ({ id: t.id, text: t.text, priority: t.priority, completed: t.completed }))
                });
            }

            return sortedTodos;
        } catch (error) {
            this.log('ERROR', `[TODOODLES-WEB-UI] Failed to get todoodles data for user "${userId}": ${error}`);
            return [];
        }
    }

    /**
     * Handle UI updates (checkbox toggles, deletes, etc.)
     */
    private async handleUIUpdate(action: string, data: any, userId: string): Promise<any> {
        try {
            this.log('DEBUG', `Handling UI update: ${action} for user: ${userId}`, { data });

            switch (action) {
                case 'toggle':
                    const { id, completed } = data;
                    if (completed) {
                        // Complete the todo
                        const result = await this.todoodlesManager.completeTodo(id, userId);
                        if (!result) {
                            throw new Error(`Todo with ID ${id} not found`);
                        }
                        this.log('INFO', `Completed todo ${id} for user ${userId}`);
                        return result;
                    } else {
                        // TODO: Implement uncomplete functionality if needed
                        throw new Error('Uncompleting todoodles not yet supported');
                    }

                case 'delete':
                    const deleteResult = await this.todoodlesManager.deleteTodo(data.id, userId);
                    if (!deleteResult.success) {
                        throw new Error(`Todo with ID ${data.id} not found`);
                    }
                    this.log('INFO', `Deleted todo ${data.id} for user ${userId}`);
                    return deleteResult;

                case 'add':
                    const addedTodo = await this.todoodlesManager.addTodo(
                        data.text,
                        data.category,
                        data.priority,
                        data.dueDate,
                        userId
                    );
                    this.log('INFO', `Added new todo for user ${userId}: "${data.text}"`);
                    return addedTodo;

                default:
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
            console.error(`[${timestamp}][${level}][TodoodlesWebUI] ${message}`);

            if (data && process.env.MCP_DEBUG === 'true') {
                console.error(JSON.stringify(data, null, 2));
            }
        }
    }
} 