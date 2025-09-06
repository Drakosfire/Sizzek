import { MCPWebUI, UISchema } from 'mcp-web-ui';
import { Task, TaskStatus } from './types/index.js';
import { TaskManager } from './core/task-manager.js';
import { ScheduleValidator } from './core/schedule-validator.js';

interface TaskDisplayData extends Task {
    scheduleReadable: string;
    successRate: number;
    nextRunFormatted: string;
    descriptionShort: string;
    statusBadge: {
        text: string;
        color: string;
    };
}

export class ScheduledTasksWebUIManager {
    private webUI: MCPWebUI<TaskDisplayData>;
    private validator = new ScheduleValidator();
    private currentUserId?: string;

    constructor(
        private taskManager: TaskManager,
        private enableLogging = true
    ) {
        const schema = this.createScheduledTasksUISchema();

        // Log web UI environment variables for debugging
        if (this.enableLogging) {
            console.log('DEBUG: [WEB-UI-ENV] Environment variables:', {
                MCP_WEB_UI_USE_GATEWAY: process.env.MCP_WEB_UI_USE_GATEWAY,
                MCP_WEB_UI_GATEWAY_URL: process.env.MCP_WEB_UI_GATEWAY_URL,
                MCP_WEB_UI_BASE_URL: process.env.MCP_WEB_UI_BASE_URL,
                MCP_WEB_UI_PROXY_PREFIX: process.env.MCP_WEB_UI_PROXY_PREFIX,
                MCP_WEB_UI_BIND_ADDRESS: process.env.MCP_WEB_UI_BIND_ADDRESS,
                MCP_WEB_UI_PORT_MIN: process.env.MCP_WEB_UI_PORT_MIN,
                MCP_WEB_UI_PORT_MAX: process.env.MCP_WEB_UI_PORT_MAX
            });
        }

        this.webUI = new MCPWebUI<TaskDisplayData>({
            dataSource: this.getDataSource.bind(this) as any,
            schema,
            onUpdate: this.handleUIUpdate.bind(this) as any,
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            pollInterval: 5000, // 5 seconds
            enableLogging: this.enableLogging
        });
    }

    getMCPToolDefinition() {
        return this.webUI.getMCPToolDefinition();
    }

    async handleGetWebUI(userId: string = 'default') {
        // Store the current user ID for filtering
        this.currentUserId = userId;
        return this.webUI.handleGetWebUI(userId);
    }

    private createScheduledTasksUISchema(): UISchema {
        const schema: UISchema = {
            title: "Scheduled Tasks Dashboard",
            description: "Monitor and manage your scheduled tasks",
            components: [
                {
                    type: "stats",
                    id: "task-overview",
                    title: "System Overview",
                    config: {
                        metrics: ["total", "active", "scheduled", "failed"]
                    }
                },
                {
                    type: "table",
                    id: "tasks-list",
                    title: "Active Tasks",
                    config: {
                        fields: [
                            {
                                key: "name",
                                label: "Task",
                                type: "text",
                                sortable: true
                            },
                            {
                                key: "descriptionShort",
                                label: "Description",
                                type: "text"
                            },
                            {
                                key: "scheduleReadable",
                                label: "Schedule",
                                type: "text"
                            },
                            {
                                key: "statusBadge",
                                label: "Status",
                                type: "badge",
                                badgeConfig: {
                                    colorMap: {
                                        "Pending": "#ffc107",
                                        "Scheduled": "#007bff",
                                        "Running": "#fd7e14",
                                        "Completed": "#28a745",
                                        "Failed": "#dc3545",
                                        "Paused": "#6c757d"
                                    }
                                }
                            },
                            {
                                key: "nextRunFormatted",
                                label: "Next Run",
                                type: "text"
                            },
                            {
                                key: "successRate",
                                label: "Success %",
                                type: "number"
                            }
                        ],
                        sortable: true,
                        filterable: true
                    }
                }
            ],
            actions: [
                {
                    id: "create-task",
                    label: "Create New Task",
                    type: "button",
                    handler: "create-task",
                    icon: "➕"
                },
                {
                    id: "toggle-enabled",
                    label: "Enable/Disable",
                    type: "inline",
                    handler: "toggle",
                    icon: "⏯️"
                },
                {
                    id: "run-now",
                    label: "Run Now",
                    type: "inline",
                    handler: "run-now",
                    confirm: "Are you sure you want to run this task immediately?",
                    icon: "▶️"
                },
                {
                    id: "delete",
                    label: "Delete",
                    type: "inline",
                    handler: "delete",
                    confirm: "Are you sure you want to delete this task? This action cannot be undone.",
                    icon: "🗑️"
                }
            ],
            polling: {
                enabled: true,
                intervalMs: 5000
            }
        };



        return schema;
    }

    private async getDataSource(): Promise<TaskDisplayData[]> {
        console.log('=== WEB-UI INTEGRATION DEBUG ===');
        console.log('getDataSource called');

        const allTasks = this.taskManager.getAllTasks();
        console.log('Raw tasks from TaskManager:', allTasks.length);

        // Apply user filtering if we have a current user ID
        let tasks = allTasks;
        if (this.currentUserId) {
            const userId = this.currentUserId;
            // Filter tasks based on user access
            tasks = allTasks.filter(task => this.hasUserAccess(task, userId));
            console.log(`Filtered tasks for user ${userId}: ${tasks.length}/${allTasks.length}`);
        }

        // Transform tasks for UI display
        const transformedTasks = tasks.map(task => ({
            ...task,
            scheduleReadable: this.validator.generateHumanReadable(task.schedule),
            successRate: this.calculateSuccessRate(task),
            nextRunFormatted: task.nextRun ? this.formatDateTime(task.nextRun) : 'Not scheduled',
            descriptionShort: this.truncateDescription(task.description || 'No description', 60),
            statusBadge: {
                text: this.capitalizeFirst(task.status),
                color: this.getStatusColor(task.status)
            },
            description: task.description || 'No description'
        }));

        console.log('Transformed tasks:', transformedTasks.length);
        console.log('Sample transformed task:', transformedTasks[0] || 'No tasks');
        console.log('===============================');

        return transformedTasks;
    }

    /**
     * Check if a user has access to a task
     * User has access if they are the creator or if the task is shared with them
     */
    private hasUserAccess(task: Task, userId: string): boolean {
        // User is the creator
        if (task.creatorUserId === userId) {
            return true;
        }

        // User is in the shared list (with null/undefined check)
        if (task.sharedWith && task.sharedWith.includes(userId)) {
            return true;
        }

        return false;
    }

    private getStatusColor(status: TaskStatus): string {
        const colorMap = {
            [TaskStatus.PENDING]: "#ffc107",
            [TaskStatus.SCHEDULED]: "#007bff",
            [TaskStatus.RUNNING]: "#fd7e14",
            [TaskStatus.COMPLETED]: "#28a745",
            [TaskStatus.FAILED]: "#dc3545",
            [TaskStatus.PAUSED]: "#6c757d"
        };
        return colorMap[status] || "#6c757d";
    }

    private calculateSuccessRate(task: Task): number {
        if (task.totalRuns === 0) return 100;
        return Math.round((task.successfulRuns / task.totalRuns) * 100);
    }

    private formatDateTime(date: Date): string {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(date);
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    private truncateDescription(description: string, maxLength: number): string {
        if (description.length <= maxLength) {
            return description;
        }
        return description.substring(0, maxLength - 3) + '...';
    }

    private async handleCreateTask(formData: any, userId?: string): Promise<any> {
        try {
            // If no form data provided, return form schema for UI to render
            if (!formData || Object.keys(formData).length === 0) {
                return {
                    success: true,
                    showForm: true,
                    form: {
                        title: "Create New Scheduled Task",
                        fields: [
                            {
                                key: "name",
                                label: "Task Name",
                                type: "text",
                                required: true,
                                placeholder: "Enter a descriptive name for your task"
                            },
                            {
                                key: "description",
                                label: "Description",
                                type: "textarea",
                                required: true,
                                placeholder: "Describe what this task will do"
                            },
                            {
                                key: "message",
                                label: "SMS Message",
                                type: "textarea",
                                required: true,
                                placeholder: "Message to send when task runs"
                            },
                            {
                                key: "scheduleType",
                                label: "Schedule Type",
                                type: "select",
                                required: true,
                                options: ["once", "daily", "weekly", "monthly"]
                            },
                            {
                                key: "scheduleTime",
                                label: "Time (HH:MM)",
                                type: "text",
                                required: true,
                                placeholder: "14:30"
                            },
                            {
                                key: "scheduleDate",
                                label: "Date (YYYY-MM-DD, for one-time tasks)",
                                type: "text",
                                required: false,
                                placeholder: "2024-12-31"
                            }
                        ]
                    }
                };
            }

            // Validate required fields
            const required = ['name', 'description', 'message', 'scheduleType', 'scheduleTime'];
            for (const field of required) {
                if (!formData[field]) {
                    throw new Error(`${field} is required`);
                }
            }

            // Parse schedule based on type
            const schedule = this.parseScheduleFromForm(formData);

            // Create the task
            const newTask = await this.taskManager.createTask({
                name: formData.name,
                description: formData.description,
                schedule: schedule,
                message: formData.message,
                enabled: true,
                creatorUserId: userId || process.env.MCP_USER_ID || 'web-ui-user'
            });

            return {
                success: true,
                message: `Task "${newTask.name}" created successfully`,
                data: newTask
            };

        } catch (error) {
            console.error('Error creating task:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create task'
            };
        }
    }

    private parseScheduleFromForm(formData: any): any {
        const { scheduleType, scheduleTime, scheduleDate } = formData;

        // Parse time
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new Error('Invalid time format. Use HH:MM (24-hour format)');
        }

        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        switch (scheduleType) {
            case 'once':
                if (!scheduleDate) {
                    throw new Error('Date is required for one-time tasks');
                }
                return {
                    type: 'once',
                    date: scheduleDate,
                    time: timeString
                };

            case 'daily':
                return {
                    type: 'daily',
                    time: timeString
                };

            case 'weekly':
                // Default to current day of week for now
                const dayOfWeek = new Date().getDay(); // 0 = Sunday
                return {
                    type: 'weekly',
                    dayOfWeek: dayOfWeek,
                    time: timeString
                };

            case 'monthly':
                // Default to current day of month for now
                const dayOfMonth = new Date().getDate();
                return {
                    type: 'monthly',
                    dayOfMonth: dayOfMonth,
                    time: timeString
                };

            default:
                throw new Error(`Unknown schedule type: ${scheduleType}`);
        }
    }

    private async handleUIUpdate(action: string, data: any, userId?: string): Promise<any> {
        try {
            switch (action) {
                case 'create-task':
                    return await this.handleCreateTask(data, userId);

                case 'toggle':
                    if (data.enabled) {
                        await this.taskManager.disableTask(data.id);
                        return {
                            success: true,
                            message: `Task "${data.name}" disabled`
                        };
                    } else {
                        await this.taskManager.enableTask(data.id);
                        return {
                            success: true,
                            message: `Task "${data.name}" enabled`
                        };
                    }

                case 'delete':
                    await this.taskManager.deleteTask(data.id);
                    return {
                        success: true,
                        message: `Task "${data.name}" deleted successfully`
                    };

                case 'run-now':
                    // For immediate execution, we'll create a copy with a very short delay
                    const task = this.taskManager.getTask(data.id);
                    if (!task) {
                        throw new Error('Task not found');
                    }

                    // Create a temporary task for immediate execution
                    await this.taskManager.createTask({
                        name: `${task.name} (Manual Run)`,
                        description: `Manual execution of: ${task.description || task.name}`,
                        schedule: { type: 'once', delayMinutes: 0.05 }, // 3 seconds
                        message: task.message,
                        enabled: true,
                        creatorUserId: task.creatorUserId // Use the original task's creator
                    });

                    return {
                        success: true,
                        message: `Task "${task.name}" will execute in 3 seconds`
                    };

                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        } catch (error) {
            console.error(`Error handling UI action ${action}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

} 