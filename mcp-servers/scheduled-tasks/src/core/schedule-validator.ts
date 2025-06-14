import { Schedule, ValidationResult, OneTimeSchedule, IntervalSchedule, DailySchedule, WeeklySchedule, MonthlySchedule } from '../types/index.js';

export class ScheduleValidator {
    validate(schedule: Schedule): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            switch (schedule.type) {
                case 'once':
                    this.validateOneTime(schedule, result);
                    break;
                case 'interval':
                    this.validateInterval(schedule, result);
                    break;
                case 'daily':
                    this.validateDaily(schedule, result);
                    break;
                case 'weekly':
                    this.validateWeekly(schedule, result);
                    break;
                case 'monthly':
                    this.validateMonthly(schedule, result);
                    break;
                default:
                    result.isValid = false;
                    result.errors.push('Unknown schedule type');
            }
        } catch (error) {
            result.isValid = false;
            result.errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
        }

        return result;
    }

    private validateOneTime(schedule: OneTimeSchedule, result: ValidationResult): void {
        if (typeof schedule.delayMinutes !== 'number' || schedule.delayMinutes < 0.1) {
            result.isValid = false;
            result.errors.push('delayMinutes must be a number >= 0.1 (minimum 6 seconds)');
            result.suggestion = 'Use delayMinutes: 1 for 1 minute, delayMinutes: 0.5 for 30 seconds, etc.';
            return;
        }
    }

    private validateInterval(schedule: IntervalSchedule, result: ValidationResult): void {
        if (!Number.isInteger(schedule.every) || schedule.every <= 0) {
            result.isValid = false;
            result.errors.push('Interval "every" must be a positive integer');
            return;
        }

        if (!['minutes', 'hours', 'days'].includes(schedule.unit)) {
            result.isValid = false;
            result.errors.push('Interval unit must be "minutes", "hours", or "days"');
            return;
        }

        // Validate start time if provided
        if (schedule.startTime) {
            if (!this.isValidTimeFormat(schedule.startTime)) {
                result.isValid = false;
                result.errors.push('Start time must be in HH:MM format (e.g., "09:30")');
                return;
            }
        }

        // Warning for very frequent intervals
        if (schedule.unit === 'minutes' && schedule.every < 5) {
            result.warnings.push('Very frequent intervals (< 5 minutes) may impact performance');
        }

        // Warning for intervals that don't make sense with start time
        if (schedule.startTime && schedule.unit === 'minutes') {
            result.warnings.push('Start time is ignored for minute-based intervals');
        }
    }

    private validateDaily(schedule: DailySchedule, result: ValidationResult): void {
        if (!this.isValidTimeFormat(schedule.time)) {
            result.isValid = false;
            result.errors.push('Daily time must be in HH:MM format (e.g., "08:00")');
            return;
        }
    }

    private validateWeekly(schedule: WeeklySchedule, result: ValidationResult): void {
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        if (!validDays.includes(schedule.dayOfWeek)) {
            result.isValid = false;
            result.errors.push(`Day of week must be one of: ${validDays.join(', ')}`);
            return;
        }

        if (!this.isValidTimeFormat(schedule.time)) {
            result.isValid = false;
            result.errors.push('Weekly time must be in HH:MM format (e.g., "09:00")');
            return;
        }
    }

    private validateMonthly(schedule: MonthlySchedule, result: ValidationResult): void {
        if (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
            result.isValid = false;
            result.errors.push('Day of month must be between 1 and 31');
            return;
        }

        if (!this.isValidTimeFormat(schedule.time)) {
            result.isValid = false;
            result.errors.push('Monthly time must be in HH:MM format (e.g., "10:00")');
            return;
        }

        // Warning for days that don't exist in all months
        if (schedule.dayOfMonth > 28) {
            result.warnings.push(`Day ${schedule.dayOfMonth} may not exist in all months (e.g., February)`);
        }
    }

    private isValidTimeFormat(time: string): boolean {
        const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
        return timeRegex.test(time);
    }

    generateHumanReadable(schedule: Schedule): string {
        switch (schedule.type) {
            case 'once':
                return `Once in ${schedule.delayMinutes} minutes`;

            case 'interval':
                const unit = schedule.every === 1 ? schedule.unit.slice(0, -1) : schedule.unit; // Remove 's' for singular
                let desc = `Every ${schedule.every} ${unit}`;
                if (schedule.startTime) {
                    desc += ` starting at ${schedule.startTime}`;
                }
                return desc;

            case 'daily':
                let dailyDesc = `Daily at ${schedule.time}`;
                if (schedule.weekdaysOnly) {
                    dailyDesc += ' (weekdays only)';
                }
                return dailyDesc;

            case 'weekly':
                const dayCapitalized = schedule.dayOfWeek.charAt(0).toUpperCase() + schedule.dayOfWeek.slice(1);
                return `Weekly on ${dayCapitalized} at ${schedule.time}`;

            case 'monthly':
                return `Monthly on the ${this.getOrdinal(schedule.dayOfMonth)} at ${schedule.time}`;

            default:
                return 'Unknown schedule';
        }
    }

    private getOrdinal(n: number): string {
        const suffixes = ['th', 'st', 'nd', 'rd'];
        const remainder = n % 100;
        return n + (suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]);
    }
} 