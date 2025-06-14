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
    | IntervalSchedule
    | DailySchedule
    | WeeklySchedule
    | MonthlySchedule;

export interface OneTimeSchedule {
    type: 'once';
    delayMinutes: number; // Delay in minutes from current server time (supports decimals, e.g., 0.5 = 30 seconds)
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
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestion?: string;
} 