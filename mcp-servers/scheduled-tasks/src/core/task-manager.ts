import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, CreateTaskRequest, TaskExecution, Schedule, IntervalSchedule, DailySchedule, WeeklySchedule, MonthlySchedule } from '../types/index.js';
import { ScheduleValidator } from './schedule-validator.js';
import { LibreChatClient } from '../http/librechat-client.js';
import { TaskStore } from '../storage/task-store.js';

export class TaskManager {
    private tasks = new Map<string, Task>();
    private taskStore: TaskStore;
    private scheduledTimeouts = new Map<string, NodeJS.Timeout>();
    private runningTasks = new Set<string>();
    private validator = new ScheduleValidator();
    private librechatClient: LibreChatClient | undefined;

    constructor(librechatClient?: LibreChatClient, taskStoreConfig?: Partial<import('../storage/task-store.js').TaskStoreConfig>) {
        this.librechatClient = librechatClient;
        this.taskStore = new TaskStore(taskStoreConfig);
    }

    async initialize(): Promise<void> {
        console.log('🔧 Initializing TaskManager with persistent storage...');

        // Initialize the task store
        await this.taskStore.initialize();

        // Load existing tasks from storage
        const savedTasks = await this.taskStore.loadTasks();

        // Populate in-memory map for quick access
        this.tasks.clear();
        for (const task of savedTasks) {
            this.tasks.set(task.id, task);

            // Reschedule enabled tasks that were scheduled
            if (task.enabled && task.status === TaskStatus.SCHEDULED && task.nextRun) {
                await this.scheduleTask(task);
            }
        }

        console.log(`✅ TaskManager initialized with ${savedTasks.length} tasks`);
    }

    private async persistTasks(): Promise<void> {
        const tasks = Array.from(this.tasks.values());
        await this.taskStore.saveTasks(tasks);
    }

    async createTask(request: CreateTaskRequest): Promise<Task> {
        // Validate schedule
        const validation = this.validator.validate(request.schedule);
        if (!validation.isValid) {
            throw new Error(`Invalid schedule: ${validation.errors.join(', ')}`);
        }

        // Create task with explicit undefined values for optional properties
        const task: Task = {
            id: uuidv4(),
            name: request.name,
            description: request.description,
            schedule: request.schedule,
            message: request.message,
            enabled: request.enabled ?? true,
            status: TaskStatus.PENDING,
            createdAt: new Date(),
            updatedAt: new Date(),
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            lastRun: undefined,
            nextRun: undefined,
            lastError: undefined
        };

        // Store task in memory and persist to storage
        this.tasks.set(task.id, task);
        await this.persistTasks();

        // Schedule if enabled
        if (task.enabled) {
            await this.scheduleTask(task);
        }

        console.log(`✅ Created task: ${task.name} (${task.id})`);
        console.log(`📋 Schedule: ${this.validator.generateHumanReadable(task.schedule)}`);

        if (validation.warnings.length > 0) {
            console.warn(`⚠️  Warnings: ${validation.warnings.join(', ')}`);
        }

        return task;
    }

    private async scheduleTask(task: Task): Promise<void> {
        // Clear any existing timeout
        if (this.scheduledTimeouts.has(task.id)) {
            const existingTimeout = this.scheduledTimeouts.get(task.id);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
            }
        }

        const nextRun = this.calculateNextRun(task.schedule);
        if (!nextRun) {
            console.warn(`⚠️  Cannot calculate next run for task: ${task.name}`);
            return;
        }

        task.nextRun = nextRun;
        task.status = TaskStatus.SCHEDULED;
        task.updatedAt = new Date();

        // Persist updated task
        await this.persistTasks();

        const msUntilRun = nextRun.getTime() - Date.now();

        console.log(`📅 Scheduled task: ${task.name} (next run: ${nextRun.toISOString()})`);
        console.log(`⏰ Time until execution: ${this.formatDuration(msUntilRun)}`);

        // Set timeout for execution
        const timeout = setTimeout(async () => {
            await this.executeTask(task);
        }, msUntilRun);

        this.scheduledTimeouts.set(task.id, timeout);
    }

    private calculateNextRun(schedule: Schedule): Date | null {
        const now = new Date();

        switch (schedule.type) {
            case 'once':
                return new Date(now.getTime() + schedule.delayMinutes * 60 * 1000);

            case 'scheduled':
                return new Date(schedule.datetime);

            case 'interval':
                return this.calculateIntervalNextRun(schedule, now);

            case 'daily':
                return this.calculateDailyNextRun(schedule, now);

            case 'weekly':
                return this.calculateWeeklyNextRun(schedule, now);

            case 'monthly':
                return this.calculateMonthlyNextRun(schedule, now);

            default:
                return null;
        }
    }

    private calculateIntervalNextRun(schedule: IntervalSchedule, now: Date): Date {
        const msPerUnit: Record<string, number> = {
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000
        };

        const interval = schedule.every * msPerUnit[schedule.unit];
        return new Date(now.getTime() + interval);
    }

    private calculateDailyNextRun(schedule: DailySchedule, now: Date): Date {
        const [hours, minutes] = schedule.time.split(':').map(Number);
        const nextRun = new Date(now);
        nextRun.setHours(hours, minutes, 0, 0);

        // If the time has passed today, schedule for tomorrow
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
        }

        // Handle weekdays only
        if (schedule.weekdaysOnly) {
            while (nextRun.getDay() === 0 || nextRun.getDay() === 6) {
                nextRun.setDate(nextRun.getDate() + 1);
            }
        }

        return nextRun;
    }

    private calculateWeeklyNextRun(schedule: WeeklySchedule, now: Date): Date {
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = daysOfWeek.indexOf(schedule.dayOfWeek);
        const [hours, minutes] = schedule.time.split(':').map(Number);

        const nextRun = new Date(now);
        const currentDay = nextRun.getDay();

        let daysUntilTarget = targetDay - currentDay;
        if (daysUntilTarget < 0 || (daysUntilTarget === 0 && (nextRun.getHours() > hours || (nextRun.getHours() === hours && nextRun.getMinutes() >= minutes)))) {
            daysUntilTarget += 7;
        }

        nextRun.setDate(nextRun.getDate() + daysUntilTarget);
        nextRun.setHours(hours, minutes, 0, 0);

        return nextRun;
    }

    private calculateMonthlyNextRun(schedule: MonthlySchedule, now: Date): Date {
        const [hours, minutes] = schedule.time.split(':').map(Number);
        const nextRun = new Date(now);

        nextRun.setDate(schedule.dayOfMonth);
        nextRun.setHours(hours, minutes, 0, 0);

        // If the date has passed this month or is today but time has passed, move to next month
        if (nextRun <= now) {
            nextRun.setMonth(nextRun.getMonth() + 1);
            nextRun.setDate(schedule.dayOfMonth);
        }

        // Handle months that don't have the target day (e.g., Feb 30th)
        if (nextRun.getDate() !== schedule.dayOfMonth) {
            nextRun.setDate(0); // Go to last day of previous month
        }

        return nextRun;
    }

    private async executeTask(task: Task): Promise<void> {
        if (this.runningTasks.has(task.id)) {
            console.warn(`⚠️  Task ${task.name} already running, skipping execution`);
            return;
        }

        const execution: TaskExecution = {
            id: uuidv4(),
            taskId: task.id,
            startTime: new Date(),
            endTime: undefined,
            status: 'running',
            duration: undefined,
            error: undefined
        };

        console.log(`🚀 Executing task: ${task.name}`);

        this.runningTasks.add(task.id);
        task.status = TaskStatus.RUNNING;
        task.lastRun = execution.startTime;
        task.totalRuns++;

        // Persist task state before execution
        await this.persistTasks();

        try {
            // Execute task action (LibreChat API call or fallback to logging)
            await this.performTaskAction(task);

            execution.endTime = new Date();
            execution.status = 'success';
            execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

            task.status = TaskStatus.COMPLETED;
            task.successfulRuns++;
            task.lastError = undefined;

            console.log(`✅ Task completed: ${task.name} (${execution.duration}ms)`);

            // For recurring tasks, schedule the next run
            if (task.schedule.type !== 'once' && task.schedule.type !== 'scheduled') {
                task.status = TaskStatus.SCHEDULED;
                await this.scheduleTask(task);
            } else {
                // For one-time tasks, mark as completed and persist
                await this.persistTasks();
            }

        } catch (error) {
            execution.endTime = new Date();
            execution.status = 'failed';
            execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            execution.error = {
                message: errorMessage,
                code: undefined,
                stack: errorStack
            };

            task.status = TaskStatus.FAILED;
            task.failedRuns++;
            task.lastError = errorMessage;

            console.error(`❌ Task failed: ${task.name} - ${errorMessage}`);

            // For recurring tasks, schedule the next run even after failure
            if (task.schedule.type !== 'once' && task.schedule.type !== 'scheduled') {
                task.status = TaskStatus.SCHEDULED;
                await this.scheduleTask(task);
            } else {
                // For one-time tasks, persist the failed state
                await this.persistTasks();
            }
        } finally {
            this.runningTasks.delete(task.id);
        }
    }

    private async performTaskAction(task: Task): Promise<void> {
        if (this.librechatClient) {
            // Use LibreChat integration to trigger agent
            console.log(`🔗 Triggering LibreChat for task: ${task.name}`);
            await this.librechatClient.triggerTask(task);
        } else {
            // Fallback to logging when no LibreChat client available
            console.log(`📝 Task action (no LibreChat integration): ${task.message}`);

            // Simulate some work
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    async enableTask(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (!task.enabled) {
            task.enabled = true;
            task.updatedAt = new Date();
            await this.persistTasks();
            await this.scheduleTask(task);
            console.log(`✅ Enabled task: ${task.name}`);
        }
    }

    async disableTask(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (task.enabled) {
            // Clear timeout
            const timeout = this.scheduledTimeouts.get(taskId);
            if (timeout) {
                clearTimeout(timeout);
                this.scheduledTimeouts.delete(taskId);
            }

            task.enabled = false;
            task.status = TaskStatus.PAUSED;
            task.nextRun = undefined;
            task.updatedAt = new Date();
            await this.persistTasks();

            console.log(`⏸️  Disabled task: ${task.name}`);
        }
    }

    async deleteTask(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        // Clear timeout
        const timeout = this.scheduledTimeouts.get(taskId);
        if (timeout) {
            clearTimeout(timeout);
            this.scheduledTimeouts.delete(taskId);
        }

        // Remove from maps
        this.tasks.delete(taskId);
        this.runningTasks.delete(taskId);

        // Persist the updated tasks list
        await this.persistTasks();

        console.log(`🗑️  Deleted task: ${task.name}`);
    }

    getAllTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    getTasksByStatus(status: TaskStatus): Task[] {
        return this.getAllTasks().filter(task => task.status === status);
    }
} 