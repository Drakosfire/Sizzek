import express from 'express';
import { Server } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    WebUISession,
    UISchema,
    TemplateData,
    APIResponse,
    DataSourceFunction,
    UpdateHandler
} from '../types/index.js';

// Add HTML escaping utility
const escapeHtml = (unsafe: string): string => {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Add JSON sanitization for safe embedding
const safeJsonStringify = (data: any): string => {
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Individual UI server instance for a session
 */
export class UIServer {
    private app: express.Application;
    private server: Server | null = null;
    private dataPollingInterval: NodeJS.Timeout | null = null;

    constructor(
        private session: WebUISession,
        private schema: UISchema,
        private dataSource: DataSourceFunction,
        private onUpdate: UpdateHandler,
        private pollInterval = 2000,
        private bindAddress = 'localhost'
    ) {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Start the server on the session's assigned port
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.session.port, this.bindAddress, () => {
                    this.log('INFO', `UI server started on ${this.bindAddress}:${this.session.port}`);
                    this.startDataPolling();
                    resolve();
                });

                this.server.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        this.log('ERROR', `Port ${this.session.port} already in use`);
                        reject(new Error(`Port ${this.session.port} already in use`));
                    } else {
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop the server and cleanup
     */
    async stop(): Promise<void> {
        return new Promise((resolve) => {
            // Stop data polling
            if (this.dataPollingInterval) {
                clearInterval(this.dataPollingInterval);
                this.dataPollingInterval = null;
            }

            // Close HTTP server
            if (this.server) {
                this.server.close(() => {
                    this.log('INFO', `UI server stopped on port ${this.session.port}`);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware(): void {
        // Security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            res.setHeader('Content-Security-Policy',
                "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline' https://unpkg.com; " +
                "style-src 'self' 'unsafe-inline'; " +
                "connect-src 'self';"
            );
            next();
        });

        // Body parser with limits
        this.app.use(express.json({ limit: '1mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

        // Secure token-based authentication middleware
        this.app.use((req, res, next) => {
            // Allow only static files without token (health check now requires auth)
            if (req.path.startsWith('/static/')) {
                return next();
            }

            const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication token required',
                    timestamp: new Date().toISOString()
                });
            }

            // Timing-safe token comparison to prevent timing attacks
            const expectedToken = this.session.token;
            if (token.length !== expectedToken.length) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid token',
                    timestamp: new Date().toISOString()
                });
            }

            let isValid = true;
            for (let i = 0; i < token.length; i++) {
                if (token[i] !== expectedToken[i]) {
                    isValid = false;
                }
            }

            if (!isValid) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid token',
                    timestamp: new Date().toISOString()
                });
            }

            // Check if this is a user action (updates) vs polling (data fetch)
            const isUserAction = req.method === 'POST' || req.path.includes('/update') || req.path.includes('/extend');

            // Update activity only for user actions, not data polling
            if (isUserAction) {
                this.session.lastActivity = new Date();
                this.log('INFO', `User action detected: ${req.method} ${req.path}`);
            }

            next();
        });
    }

    /**
     * Setup API routes
     */
    private setupRoutes(): void {
        // Main UI route
        this.app.get('/', async (req, res) => {
            try {
                const initialData = await this.dataSource(this.session.userId);
                const templateData: TemplateData = {
                    session: this.session,
                    schema: this.schema,
                    initialData,
                    config: {
                        pollInterval: this.pollInterval,
                        apiBase: `/api`
                    }
                };

                // Render HTML template (we'll create this next)
                const html = this.renderTemplate(templateData);
                res.send(html);
            } catch (error) {
                this.log('ERROR', `Failed to render UI: ${error}`);
                res.status(500).send('Internal Server Error');
            }
        });

        // API endpoint to get current data
        this.app.get('/api/data', async (req, res) => {
            try {
                const data = await this.dataSource(this.session.userId);
                const response: APIResponse = {
                    success: true,
                    data,
                    timestamp: new Date().toISOString()
                };
                res.json(response);
            } catch (error) {
                const response: APIResponse = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                };
                res.status(500).json(response);
            }
        });

        // API endpoint to handle updates
        this.app.post('/api/update', async (req, res) => {
            try {
                const { action, data } = req.body;
                const result = await this.onUpdate(action, data, this.session.userId);

                const response: APIResponse = {
                    success: true,
                    data: result,
                    timestamp: new Date().toISOString()
                };
                res.json(response);
            } catch (error) {
                const response: APIResponse = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                };
                res.status(500).json(response);
            }
        });

        // API endpoint to extend session
        this.app.post('/api/extend-session', (req, res) => {
            const { minutes = 30 } = req.body;

            // Validate extension minutes
            if (typeof minutes !== 'number' || minutes < 5 || minutes > 120) {
                return res.status(400).json({
                    success: false,
                    error: 'Extension minutes must be between 5 and 120',
                    timestamp: new Date().toISOString()
                });
            }

            // Check if session can be extended (not expired)
            if (new Date() > this.session.expiresAt) {
                return res.status(410).json({
                    success: false,
                    error: 'Session has already expired',
                    timestamp: new Date().toISOString()
                });
            }

            this.session.expiresAt = new Date(this.session.expiresAt.getTime() + minutes * 60 * 1000);
            this.session.lastActivity = new Date();

            const response: APIResponse = {
                success: true,
                data: { expiresAt: this.session.expiresAt },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        });

        // Health check (now requires authentication)
        this.app.get('/api/health', (req, res) => {
            res.json({
                success: true,
                data: {
                    // Don't expose sensitive session ID or user ID
                    status: 'active',
                    expiresAt: this.session.expiresAt,
                    uptime: Date.now() - this.session.startTime.getTime()
                },
                timestamp: new Date().toISOString()
            });
        });

        // Serve static files
        const templatesPath = path.resolve(__dirname, '..', '..', 'templates', 'static');
        this.log('INFO', `Serving static files from: ${templatesPath}`);

        // Check if the templates directory exists
        try {
            if (fs.existsSync(templatesPath)) {
                this.app.use('/static', express.static(templatesPath));
                this.log('INFO', 'Static file serving configured successfully');
            } else {
                this.log('ERROR', `Templates directory not found at: ${templatesPath}`);
                // Fallback: try to serve CSS inline if templates directory is missing
                this.app.get('/static/styles.css', (req, res) => {
                    res.type('text/css');
                    res.send(this.getFallbackCSS());
                });
            }
        } catch (error) {
            this.log('ERROR', `Error setting up static file serving: ${error}`);
        }
    }

    /**
     * Start polling for data changes
     */
    private startDataPolling(): void {
        if (this.schema.polling?.enabled !== false) {
            this.dataPollingInterval = setInterval(async () => {
                // This would trigger real-time updates via SSE or WebSocket
                // For now, the client will poll /api/data
            }, this.pollInterval);
        }
    }

    /**
     * Render HTML template with data
     */
    private renderTemplate(data: TemplateData): string {
        // Secure template rendering with proper escaping
        const safeTitle = escapeHtml(data.schema.title);
        const safeDescription = data.schema.description ? escapeHtml(data.schema.description) : '';

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <link href="/static/styles.css" rel="stylesheet">
</head>
<body>
    <div id="app" x-data="mcpUI()" x-init="init()">
        <header class="header">
            <h1>${safeTitle}</h1>
            ${safeDescription ? `<p class="description">${safeDescription}</p>` : ''}
            <div class="session-info">
                <span>Session expires: <span x-text="formatTime(expiresAt)"></span></span>
                <button @click="extendSession()" class="btn-extend">Extend</button>
            </div>
        </header>

        <!-- Undo Toast Notifications -->
        <div class="undo-container">
            <template x-for="undoAction in undoActions" :key="undoAction.id">
                <div class="undo-toast" x-transition>
                    <div class="undo-content">
                        <span class="undo-message">✓ Todoodle completed</span>
                        <button @click="undoComplete(undoAction.id)" class="undo-button">
                            Undo
                        </button>
                    </div>
                    <div class="undo-progress">
                        <div class="undo-progress-bar"></div>
                    </div>
                </div>
            </template>
        </div>

        <main class="main">
            <div x-show="loading" class="loading">Loading...</div>
            <div x-show="!loading">
                ${this.renderComponents(data.schema.components)}
            </div>
        </main>
    </div>

    <script>
        function mcpUI() {
            return {
                data: ${safeJsonStringify(data.initialData)},
                loading: false,
                expiresAt: new Date('${data.session.expiresAt.toISOString()}'),
                scrollPosition: 0,
                
                // Add form state
                showAddForm: false,
                newTodoText: '',
                newTodoCategory: '',
                newTodoPriority: 'medium',
                newTodoDueDate: '',
                
                // Undo system state
                undoActions: [], // Array of undo actions: {id, type, originalState, timeoutId}
                pendingCompletes: new Set(), // Track items with pending completion
                
                init() {
                    this.startPolling();
                    // Enhanced scroll position preservation
                    this.initScrollPreservation();
                },
                
                initScrollPreservation() {
                    // Better scroll position tracking
                    let ticking = false;
                    const updateScrollPosition = () => {
                        this.scrollPosition = window.scrollY;
                        ticking = false;
                    };
                    
                    window.addEventListener('scroll', () => {
                        if (!ticking) {
                            requestAnimationFrame(updateScrollPosition);
                            ticking = true;
                        }
                    });
                },
                
                startPolling() {
                    // Only poll when tab is active
                    let isActive = true;
                    document.addEventListener('visibilitychange', () => {
                        isActive = !document.hidden;
                        if (isActive) {
                            this.fetchData(); // Immediate fetch when tab becomes active
                        }
                    });
                    
                    setInterval(() => {
                        if (isActive) {
                            this.fetchData();
                        }
                    }, ${data.config.pollInterval});
                },
                
                async fetchData() {
                    try {
                        const response = await fetch('/api/data?token=${data.session.token}');
                        const result = await response.json();
                        if (result.success) {
                            const newData = result.data;
                            // Smart diff - only update if data actually changed
                            if (!this.dataEquals(this.data, newData)) {
                                this.updateDataSmart(newData);
                            }
                        }
                    } catch (error) {
                        console.error('Failed to fetch data:', error);
                    }
                },
                
                // Smart data comparison
                dataEquals(oldData, newData) {
                    if (oldData.length !== newData.length) return false;
                    
                    for (let i = 0; i < oldData.length; i++) {
                        const oldItem = oldData[i];
                        const newItem = newData[i];
                        
                        // Compare key fields that matter for UI
                        if (oldItem.id !== newItem.id ||
                            oldItem.text !== newItem.text ||
                            oldItem.completed !== newItem.completed ||
                            oldItem.priority !== newItem.priority ||
                            oldItem.category !== newItem.category ||
                            oldItem.dueDate !== newItem.dueDate) {
                            return false;
                        }
                    }
                    return true;
                },
                
                // Smart data update with smooth transitions
                updateDataSmart(newData) {
                    const currentScroll = window.scrollY;
                    const focusedElement = document.activeElement;
                    const focusedId = focusedElement?.id;
                    
                    // Use Alpine.js reactivity properly
                    this.data.splice(0, this.data.length, ...newData);
                    
                    // Restore focus and scroll after DOM update
                    this.$nextTick(() => {
                        // Restore focus if it was on a specific element
                        if (focusedId && document.getElementById(focusedId)) {
                            document.getElementById(focusedId).focus();
                        }
                        
                        // Restore scroll position
                        window.scrollTo(0, currentScroll);
                    });
                },
                
                // Optimistic update for better responsiveness
                async updateData(action, updateData) {
                    const currentScroll = window.scrollY;
                    let optimisticUpdate = null;
                    
                    // Apply optimistic update immediately
                    if (action === 'toggle') {
                        optimisticUpdate = this.applyOptimisticToggle(updateData);
                        
                        // For complete actions, don't send to server immediately - wait for undo timeout
                        if (updateData.completed) {
                            // Find the undo action we just created
                            const undoAction = this.undoActions.find(a => a.id === updateData.id);
                            if (undoAction) {
                                // Set up delayed server call
                                const originalTimeoutId = undoAction.timeoutId;
                                undoAction.timeoutId = setTimeout(async () => {
                                    // Send to server after undo timeout
                                    try {
                                        const response = await fetch('/api/update?token=${data.session.token}', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ action, data: updateData })
                                        });
                                        const result = await response.json();
                                        
                                        if (result.success) {
                                            undoAction.serverConfirmed = true;
                                            this.confirmUndoAction(undoAction);
                                        } else {
                                            // Server failed, revert the action
                                            this.performUndo(undoAction);
                                        }
                                    } catch (error) {
                                        console.error('Failed to confirm completion:', error);
                                        this.performUndo(undoAction);
                                    }
                                }, 5000);
                            }
                            return; // Don't proceed with normal server call
                        }
                    } else if (action === 'delete') {
                        optimisticUpdate = this.applyOptimisticDelete(updateData);
                    }
                    
                    // Normal server call for non-completion actions
                    try {
                        const response = await fetch('/api/update?token=${data.session.token}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action, data: updateData })
                        });
                        const result = await response.json();
                        
                        if (!result.success) {
                            // Revert optimistic update on failure
                            if (optimisticUpdate) {
                                this.revertOptimisticUpdate(optimisticUpdate);
                            }
                            throw new Error(result.error);
                        }
                        
                        // Success - the optimistic update is confirmed
                        // Refresh data after a short delay to get any server-side changes
                        setTimeout(() => this.fetchData(), 100);
                        
                    } catch (error) {
                        console.error('Failed to update data:', error);
                        // Revert optimistic update on error
                        if (optimisticUpdate) {
                            this.revertOptimisticUpdate(optimisticUpdate);
                        }
                    } finally {
                        // Restore scroll position
                        requestAnimationFrame(() => {
                            window.scrollTo(0, currentScroll);
                        });
                    }
                },
                
                // Apply optimistic toggle update
                applyOptimisticToggle(updateData) {
                    const item = this.data.find(i => i.id === updateData.id);
                    if (item) {
                        const originalCompleted = item.completed;
                        
                        if (updateData.completed) {
                            // Completing an item - use undo system
                            return this.handleCompleteWithUndo(item);
                        } else {
                            // Uncompleting an item - direct action (no undo needed)
                            item.completed = updateData.completed;
                            return () => { item.completed = originalCompleted; };
                        }
                    }
                    return null;
                },
                
                // Apply optimistic delete update  
                applyOptimisticDelete(updateData) {
                    const index = this.data.findIndex(i => i.id === updateData.id);
                    if (index !== -1) {
                        const removedItem = this.data.splice(index, 1)[0];
                        
                        // Return undo function
                        return () => {
                            this.data.splice(index, 0, removedItem);
                        };
                    }
                    return null;
                },
                
                // Revert optimistic update
                revertOptimisticUpdate(undoFn) {
                    if (undoFn) {
                        undoFn();
                    }
                },
                
                // Undo system methods
                handleCompleteWithUndo(item) {
                    // Mark as pending completion
                    this.pendingCompletes.add(item.id);
                    
                    // Apply the visual change immediately
                    item.completed = true;
                    
                    // Create undo action with 5-second timeout
                    const undoAction = {
                        id: item.id,
                        type: 'complete',
                        originalState: { ...item, completed: false },
                        timeoutId: null,
                        serverConfirmed: false
                    };
                    
                    // Set up auto-confirm timeout
                    undoAction.timeoutId = setTimeout(() => {
                        this.confirmUndoAction(undoAction);
                    }, 5000);
                    
                    // Add to undo actions array
                    this.undoActions.push(undoAction);
                    
                    // Return undo function for error cases
                    return () => {
                        this.performUndo(undoAction);
                    };
                },
                
                performUndo(undoAction) {
                    // Find the item and revert it
                    const item = this.data.find(i => i.id === undoAction.id);
                    if (item) {
                        Object.assign(item, undoAction.originalState);
                    }
                    
                    // Clear timeout
                    if (undoAction.timeoutId) {
                        clearTimeout(undoAction.timeoutId);
                    }
                    
                    // Remove from pending and undo actions
                    this.pendingCompletes.delete(undoAction.id);
                    this.undoActions = this.undoActions.filter(action => action.id !== undoAction.id);
                    
                    // If server confirmed, need to send uncomplete request
                    if (undoAction.serverConfirmed) {
                        // Note: Current server doesn't support uncomplete, so we'll refresh data
                        this.fetchData();
                    }
                },
                
                confirmUndoAction(undoAction) {
                    // Remove from undo actions
                    this.undoActions = this.undoActions.filter(action => action.id !== undoAction.id);
                    this.pendingCompletes.delete(undoAction.id);
                },
                
                undoComplete(itemId) {
                    const undoAction = this.undoActions.find(action => action.id === itemId);
                    if (undoAction) {
                        this.performUndo(undoAction);
                    }
                },
                
                // Check if item has pending undo
                hasPendingUndo(itemId) {
                    return this.undoActions.some(action => action.id === itemId);
                },
                
                // Add new todoodle functionality
                async addTodoodle(text, category = '', priority = 'medium', dueDate = '') {
                    if (!text.trim()) return;
                    
                    const currentScroll = window.scrollY;
                    
                    // Create optimistic new item
                    const tempId = 'temp-' + Date.now();
                    const newItem = {
                        id: tempId,
                        text: text.trim(),
                        category: category.trim(),
                        priority: priority,
                        dueDate: dueDate,
                        completed: false,
                        createdAt: new Date().toISOString()
                    };
                    
                    // Add optimistically to the top of the list
                    this.data.unshift(newItem);
                    
                    try {
                        const response = await fetch('/api/update?token=${data.session.token}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                action: 'add', 
                                data: {
                                    text: text.trim(),
                                    category: category.trim(),
                                    priority: priority,
                                    dueDate: dueDate
                                }
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            // Replace temp item with real item from server
                            const index = this.data.findIndex(item => item.id === tempId);
                            if (index !== -1) {
                                this.data.splice(index, 1, result.data);
                            }
                            
                            // Clear the form
                            this.resetAddForm();
                            
                            // Refresh data to get proper order
                            setTimeout(() => this.fetchData(), 100);
                        } else {
                            throw new Error(result.error);
                        }
                        
                    } catch (error) {
                        console.error('Failed to add todoodle:', error);
                        // Remove optimistic item on failure
                        const index = this.data.findIndex(item => item.id === tempId);
                        if (index !== -1) {
                            this.data.splice(index, 1);
                        }
                    } finally {
                        // Restore scroll position
                        requestAnimationFrame(() => {
                            window.scrollTo(0, currentScroll);
                        });
                    }
                },
                
                toggleAddForm() {
                    this.showAddForm = !this.showAddForm;
                    if (this.showAddForm) {
                        // Focus on the text input when form is shown
                        this.$nextTick(() => {
                            const input = document.getElementById('new-todo-text');
                            if (input) input.focus();
                        });
                    }
                },
                
                resetAddForm() {
                    this.newTodoText = '';
                    this.newTodoCategory = '';
                    this.newTodoPriority = 'medium';
                    this.newTodoDueDate = '';
                    this.showAddForm = false;
                },
                
                async submitAddForm() {
                    await this.addTodoodle(
                        this.newTodoText,
                        this.newTodoCategory,
                        this.newTodoPriority,
                        this.newTodoDueDate
                    );
                },
                
                async extendSession() {
                    try {
                        const response = await fetch('/api/extend-session?token=${data.session.token}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ minutes: 30 })
                        });
                        const result = await response.json();
                        if (result.success) {
                            this.expiresAt = new Date(result.data.expiresAt);
                        }
                    } catch (error) {
                        console.error('Failed to extend session:', error);
                    }
                },
                
                formatTime(date) {
                    return new Date(date).toLocaleTimeString();
                },
                
                formatDueDate(dueDate) {
                    if (!dueDate) return '';
                    
                    const due = new Date(dueDate);
                    const today = new Date();
                    const tomorrow = new Date(today);
                    tomorrow.setDate(today.getDate() + 1);
                    
                    // Reset times for accurate date comparison
                    due.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    tomorrow.setHours(0, 0, 0, 0);
                    
                    if (due.getTime() === today.getTime()) {
                        return 'Due Today';
                    } else if (due.getTime() === tomorrow.getTime()) {
                        return 'Due Tomorrow';
                    } else if (due < today) {
                        const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
                        return diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' overdue';
                    } else {
                        const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 7) {
                            return 'Due in ' + diffDays + ' day' + (diffDays > 1 ? 's' : '');
                        } else {
                            return 'Due ' + due.toLocaleDateString();
                        }
                    }
                }
            }
        }
    </script>
</body>
</html>`;
    }

    /**
     * Render UI components based on schema
     */
    private renderComponents(components: any[]): string {
        return components.map(component => {
            switch (component.type) {
                case 'list':
                    return this.renderListComponent(component);
                default:
                    return `<div>Unsupported component type: ${component.type}</div>`;
            }
        }).join('\n');
    }

    /**
     * Render a list component (like todo list)
     */
    private renderListComponent(component: any): string {
        return `
      <div class="component component-list" id="${component.id}">
        ${component.title ? `<h2>${component.title}</h2>` : ''}
        
        <!-- Add New Todoodle Section -->
        <div class="add-todoodle-section">
          <button @click="toggleAddForm()" class="btn-add-todo" :class="{ 'active': showAddForm }">
            <span x-show="!showAddForm">+ Add New Todoodle</span>
            <span x-show="showAddForm">Cancel</span>
          </button>
          
          <!-- Add Form (collapsible) -->
          <div x-show="showAddForm" x-transition class="add-form">
            <form @submit.prevent="submitAddForm()">
              <div class="form-row">
                <input 
                  type="text" 
                  id="new-todo-text"
                  x-model="newTodoText"
                  placeholder="What needs to be done?"
                  class="form-input form-input-main"
                  required
                >
              </div>
              
              <div class="form-row form-row-secondary">
                <div class="form-group">
                  <label for="new-todo-category">Category</label>
                  <input 
                    type="text" 
                    id="new-todo-category"
                    x-model="newTodoCategory"
                    placeholder="e.g. work, personal"
                    class="form-input form-input-small"
                  >
                </div>
                
                <div class="form-group">
                  <label for="new-todo-priority">Priority</label>
                  <select 
                    id="new-todo-priority"
                    x-model="newTodoPriority"
                    class="form-input form-input-small"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label for="new-todo-duedate">Due Date</label>
                  <input 
                    type="date" 
                    id="new-todo-duedate"
                    x-model="newTodoDueDate"
                    class="form-input form-input-small"
                  >
                </div>
              </div>
              
              <div class="form-actions">
                <button type="submit" class="btn-submit" :disabled="!newTodoText.trim()">
                  Add Todoodle
                </button>
                <button type="button" @click="resetAddForm()" class="btn-cancel">
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
        
        <!-- Todoodles List -->
        <div class="list-container">
          <div x-show="data.length === 0" class="empty-state">
            <p>No todoodles yet! Add your first one above.</p>
          </div>
          
          <template x-for="item in data" :key="item.id">
            <div class="list-item" :class="{ 'completed': item.completed, 'temp-item': item.id && item.id.startsWith('temp-') }">
              <div class="item-checkbox">
                <input 
                  type="checkbox" 
                  :checked="item.completed"
                  @change="updateData('toggle', {id: item.id, completed: $event.target.checked})"
                  :id="'item-' + item.id"
                >
              </div>
              
              <div class="item-content">
                <div class="item-main">
                  <label :for="'item-' + item.id" class="item-text" x-text="item.text"></label>
                  <div class="item-meta">
                    <span x-show="item.category" x-text="item.category" class="badge badge-category"></span>
                    <span x-show="item.priority" x-text="item.priority.toUpperCase()" :class="'badge badge-priority priority-' + item.priority"></span>
                    <span x-show="item.dueDate" x-text="formatDueDate(item.dueDate)" class="badge badge-due"></span>
                  </div>
                </div>
              </div>
              
              <div class="item-actions">
                <button @click="updateData('delete', {id: item.id})" class="btn-delete" title="Delete">
                  ×
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>`;
    }

    /**
     * Simple logging utility
     */
    private log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}][${level}][UIServer:${this.session.port}] ${message}`);
    }

    /**
     * Fallback CSS when templates directory is not found
     */
    private getFallbackCSS(): string {
        return `
/* Fallback CSS for MCP Web UI */
* { box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f8fafc;
    color: #334155;
    line-height: 1.6;
}
.header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.header h1 {
    margin: 0;
    color: #1e293b;
    font-size: 1.5rem;
    font-weight: 600;
}
.main {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
}
.component {
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
    overflow: hidden;
}
.list-container {
    padding: 1rem;
}
.list-item {
    display: flex;
    align-items: flex-start;
    padding: 1rem 0.75rem;
    border-bottom: 1px solid #f1f5f9;
    transition: all 0.3s ease;
}
.list-item:hover {
    background-color: #f8fafc;
}
.item-content {
    flex: 1;
    min-width: 0;
}
.item-text {
    font-weight: 500;
    color: #1e293b;
    cursor: pointer;
}
.add-todoodle-section {
    padding: 1.5rem 2rem;
    border-bottom: 1px solid #e2e8f0;
    background: #fefefe;
}
.btn-add-todo {
    background: #10b981;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
}
.add-form {
    margin-top: 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    padding: 1.5rem;
}
.form-input {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: white;
    width: 100%;
    margin-bottom: 1rem;
}
.btn-submit {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 600;
}
`;
    }
} 