export interface Task {
    id: string;
    name: string;
    description: string | undefined;
    schedule: Schedule;
    message: string;
    enabled: boolean;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    lastRun: Date | undefined;
    nextRun: Date | undefined;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastError: string | undefined;

    // NEW: User context and sharing
    creatorUserId: string;              // Who created this task
    tenantId?: string;                  // Multi-tenant isolation (future)
    sharedWith: string[];               // Array of user IDs who can access this task
    contextType: 'user' | 'shared';    // Type of context (extensible for groups later)
}

export enum TaskStatus {
    PENDING = 'pending',
    SCHEDULED = 'scheduled',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    PAUSED = 'paused'
}

// Simple scheduling system - much easier than cron!
export type Schedule =
    | OneTimeSchedule
    | ScheduledTaskSchedule
    | IntervalSchedule
    | DailySchedule
    | WeeklySchedule
    | MonthlySchedule;

export interface OneTimeSchedule {
    type: 'once';
    delayMinutes: number; // Delay in minutes from current server time (supports decimals, e.g., 0.5 = 30 seconds)
}

export interface ScheduledTaskSchedule {
    type: 'scheduled';
    datetime: string; // ISO 8601 format date/time string (YYYY-MM-DDTHH:MM:SS)
}

export interface IntervalSchedule {
    type: 'interval';
    every: number; // Number of units
    unit: 'minutes' | 'hours' | 'days';
    startTime: string | undefined; // Optional start time like "09:00"
}

export interface DailySchedule {
    type: 'daily';
    time: string; // "HH:MM" format like "08:00"
    weekdaysOnly: boolean | undefined; // Skip weekends
}

export interface WeeklySchedule {
    type: 'weekly';
    dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    time: string; // "HH:MM" format
}

export interface MonthlySchedule {
    type: 'monthly';
    dayOfMonth: number; // 1-31
    time: string; // "HH:MM" format
}

export interface TaskExecution {
    id: string;
    taskId: string;
    startTime: Date;
    endTime: Date | undefined;
    status: 'running' | 'success' | 'failed';
    duration: number | undefined;
    error: {
        message: string;
        code: string | undefined;
        stack: string | undefined;
    } | undefined;
}

export interface CreateTaskRequest {
    name: string;
    description: string | undefined;
    schedule: Schedule;
    message: string;
    enabled: boolean | undefined;

    // NEW: Context information
    creatorUserId?: string;             // Will be extracted from request
    sharedWith?: string[];              // Optional sharing
}

export interface UpdateTaskRequest {
    name?: string;
    description?: string;
    schedule?: Schedule;
    message?: string;
    enabled?: boolean;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestion?: string;
}

// NEW: User context interfaces
export interface UserContext {
    userId: string;
    tenantId?: string;
    originalUserId?: string;        // For shared contexts
    sharedWith?: string[];          // Who has access
    isSharedContext: boolean;       // Whether this is a shared operation
    effectiveUserId: string;        // The user ID to use for data operations
} 