/**
 * ScheduleListComponent - Scheduled Tasks List Implementation
 * 
 * This component extends the generic ListComponent with scheduled-task-specific configuration:
 * - Configures ListComponent for scheduled tasks (name, schedule, status, next run)
 * - Adds schedule-specific formatting and actions
 * - Maintains schedule display semantics while using generic infrastructure
 * 
 * REFACTORED ARCHITECTURE:
 * - Uses generic ListComponent as the base with configuration
 * - Reduces code duplication and maintenance overhead
 * - Maintains all existing schedule functionality
 * - Server can still customize through configuration
 * 
 * DEPENDENCIES:
 * - Requires ListComponent to be loaded from MCP Web UI Framework
 * - Framework components should be loaded before this component
 */

/**
 * Factory function to create a schedule list using the generic ListComponent
 * @param {HTMLElement} element - DOM element to attach to
 * @param {Array} data - Initial scheduled tasks data
 * @param {Object} config - Configuration options
 * @returns {ListComponent} Configured ListComponent for scheduled tasks
 */
function createScheduleListComponent(element, data, config = {}) {
    // Ensure framework components are available
    if (typeof ListComponent === 'undefined') {
        throw new Error('ListComponent not found. Please ensure the MCP Web UI Framework is loaded before this component.');
    }

    // Define schedule-specific configuration
    const scheduleConfig = {
        list: {
            // Item configuration
            itemType: 'scheduled task',
            itemIdField: 'id',
            itemTextField: 'name',
            itemFields: ['name', 'schedule', 'status', 'nextRun'],

            // Layout and features
            layout: 'list',
            enableCRUD: true,
            enableSearch: true,
            enableFilters: true,
            enableSorting: true,
            enableBulkActions: true,
            enableToggle: {
                field: 'enabled',
                label: 'Enable/Disable task',
                trueLabel: 'Enabled',
                falseLabel: 'Disabled'
            },

            // Actions configuration
            actions: {
                item: ['edit', 'delete', 'run', 'toggle'],
                bulk: ['delete', 'enable', 'disable'],
                global: ['add', 'import']
            },

            // Form configuration
            forms: {
                add: {
                    title: 'Add Scheduled Task',
                    fields: [
                        { key: 'name', label: 'Task Name', type: 'text', required: true, placeholder: 'Enter task name...' },
                        { key: 'description', label: 'Description', type: 'textarea', required: false, placeholder: 'Optional description' },
                        { key: 'schedule', label: 'Schedule', type: 'schedule', required: true },
                        { key: 'enabled', label: 'Enabled', type: 'checkbox', required: false, defaultValue: true }
                    ]
                },
                edit: {
                    title: 'Edit Scheduled Task',
                    fields: [
                        { key: 'name', label: 'Task Name', type: 'text', required: true },
                        { key: 'description', label: 'Description', type: 'textarea', required: false },
                        { key: 'schedule', label: 'Schedule', type: 'schedule', required: true },
                        { key: 'enabled', label: 'Enabled', type: 'checkbox', required: false }
                    ]
                }
            },

            // Display configuration
            emptyStateMessage: 'No scheduled tasks yet. Add your first scheduled task to get started!',
            confirmDeletes: true,
            showItemCount: true,
            showStats: true,

            // Search configuration
            search: {
                placeholder: 'Search scheduled tasks...',
                debounceMs: 300,
                searchFields: ['name', 'description', 'schedule.type']
            },

            // Filter configuration
            filters: {
                defaultFilter: 'all',
                customFilters: [
                    {
                        key: 'enabled',
                        label: 'Status',
                        type: 'select',
                        options: [
                            { value: 'all', label: 'All Tasks' },
                            { value: 'enabled', label: 'Enabled' },
                            { value: 'disabled', label: 'Disabled' }
                        ]
                    },
                    {
                        key: 'schedule.type',
                        label: 'Schedule Type',
                        type: 'select',
                        options: ['all', 'once', 'daily', 'weekly', 'monthly', 'cron', 'interval']
                    },
                    {
                        key: 'nextRun',
                        label: 'Next Run',
                        type: 'select',
                        options: [
                            { value: 'all', label: 'All Times' },
                            { value: 'overdue', label: 'Overdue' },
                            { value: 'today', label: 'Today' },
                            { value: 'week', label: 'This Week' }
                        ]
                    }
                ]
            },

            // Sorting configuration
            defaultSort: { column: 'nextRun', direction: 'asc' },

            // Toggle configuration
            toggle: {
                field: 'enabled',
                label: 'Enable/Disable task',
                trueLabel: 'Enabled',
                falseLabel: 'Disabled'
            },

            // Merge any user-provided configuration
            ...config.list
        },

        // Global config (title, etc.)
        title: 'Scheduled Tasks',
        ...config
    };

    // Create the ListComponent with schedule configuration
    const scheduleList = new ListComponent(element, data, scheduleConfig);

    // Add schedule-specific configuration
    scheduleList.scheduleConfig = {
        showIcon: true,
        showNextRun: true,
        showFrequency: true,
        dateFormat: 'short',
        timeFormat: '12h',
        timezone: 'local',
        locale: 'en-US',
        highlightUpcoming: true,
        autoUpdate: true,
        updateInterval: 30000, // 30 seconds
        ...config.schedule
    };

    // Enhanced field formatting for schedules
    const originalFormatFieldValue = scheduleList.formatFieldValue;
    scheduleList.formatFieldValue = function (value, field) {
        switch (field) {
            case 'schedule':
                return this.formatScheduleDisplay(value);
            case 'status':
                return this.formatTaskStatus(value);
            case 'nextRun':
                return this.formatNextRunTime(value);
            default:
                return originalFormatFieldValue.call(this, value, field);
        }
    };

    // Enhanced item rendering for scheduled tasks
    const originalRenderItemContent = scheduleList.renderItemContent;
    scheduleList.renderItemContent = function (item) {
        const primaryContent = originalRenderItemContent.call(this, item);
        const scheduleInfo = this.formatScheduleInfo(item);
        const statusIndicator = this.formatStatusIndicator(item);

        return `
            ${primaryContent}
            ${scheduleInfo ? `
                <div class="item-schedule-info">
                    ${scheduleInfo}
                </div>
            ` : ''}
            ${statusIndicator ? `
                <div class="item-status-indicator">
                    ${statusIndicator}
                </div>
            ` : ''}
        `;
    };

    // Schedule-specific action handling
    const originalHandleItemAction = scheduleList.handleItemAction;
    scheduleList.handleItemAction = async function (action, id) {
        if (action === 'run') {
            await this.handleRunTask(id);
        } else if (action === 'toggle') {
            await this.handleToggleTask(id);
        } else {
            return originalHandleItemAction.call(this, action, id);
        }
    };

    // Enhanced bulk actions
    const originalHandleBulkAction = scheduleList.handleBulkAction;
    scheduleList.handleBulkAction = async function (action) {
        const selectedIds = Array.from(this.listState.selectedItems);

        switch (action) {
            case 'enable':
                await this.handleBulkEnable(selectedIds);
                break;
            case 'disable':
                await this.handleBulkDisable(selectedIds);
                break;
            default:
                return originalHandleBulkAction.call(this, action);
        }
    };

    // Add schedule-specific methods
    scheduleList.formatScheduleDisplay = function (schedule) {
        if (!schedule) return '';

        const icon = this.getScheduleIcon(schedule.type);
        const description = this.generateHumanReadableSchedule(schedule);

        return `<span class="schedule-display">
            <span class="schedule-icon">${icon}</span>
            <span class="schedule-text">${description}</span>
        </span>`;
    };

    scheduleList.formatTaskStatus = function (item) {
        const enabled = item.enabled !== false;
        const isOverdue = this.isOverdue(item.nextRun);
        const isUpcoming = this.isUpcoming(item.nextRun);

        let statusClass = enabled ? 'enabled' : 'disabled';
        if (enabled && isOverdue) statusClass += ' overdue';
        if (enabled && isUpcoming) statusClass += ' upcoming';

        return `<span class="task-status ${statusClass}">
            ${enabled ? (isOverdue ? '⚠️ Overdue' : '✅ Enabled') : '⏸️ Disabled'}
        </span>`;
    };

    scheduleList.formatNextRunTime = function (nextRun) {
        if (!nextRun) return '<span class="next-run-none">No next run</span>';

        const isOverdue = this.isOverdue(nextRun);
        const formatted = this.formatDateTime(nextRun);

        return `<span class="next-run ${isOverdue ? 'overdue' : ''}">
            ${isOverdue ? '⚠️' : '⏰'} ${formatted}
        </span>`;
    };

    scheduleList.formatScheduleInfo = function (item) {
        if (!item.schedule) return '';

        const frequency = this.calculateFrequency(item.schedule);
        const lastRun = item.lastRun ? this.formatDateTime(item.lastRun) : 'Never';

        return `
            <div class="schedule-meta">
                <span class="frequency">Frequency: ${frequency}</span>
                <span class="last-run">Last run: ${lastRun}</span>
            </div>
        `;
    };

    scheduleList.formatStatusIndicator = function (item) {
        const enabled = item.enabled !== false;
        const isOverdue = this.isOverdue(item.nextRun);
        const isUpcoming = this.isUpcoming(item.nextRun);

        if (!enabled) {
            return '<div class="status-indicator disabled">⏸️ Disabled</div>';
        }
        if (isOverdue) {
            return '<div class="status-indicator overdue">⚠️ Overdue</div>';
        }
        if (isUpcoming) {
            return '<div class="status-indicator upcoming">🔔 Due soon</div>';
        }
        return '';
    };

    scheduleList.getScheduleIcon = function (type) {
        const icons = {
            'once': '⏰',
            'scheduled': '📅',
            'interval': '🔄',
            'daily': '📆',
            'weekly': '📅',
            'monthly': '🗓️',
            'yearly': '📅',
            'cron': '⚙️',
            'custom': '🛠️',
            'unknown': '❓'
        };
        return icons[type] || icons.unknown;
    };

    scheduleList.generateHumanReadableSchedule = function (schedule) {
        if (!schedule || !schedule.type) return 'Unknown schedule';

        switch (schedule.type) {
            case 'once':
                return schedule.datetime ?
                    `Once on ${this.formatDateTime(schedule.datetime)}` :
                    'Run once';

            case 'daily':
                return schedule.time ?
                    `Daily at ${this.formatTime(schedule.time)}` :
                    'Daily';

            case 'weekly':
                const weekdays = schedule.weekdays || ['Sunday'];
                const timeStr = schedule.time ? ` at ${this.formatTime(schedule.time)}` : '';
                return `Weekly on ${this.formatWeekdays(weekdays)}${timeStr}`;

            case 'monthly':
                const dayOfMonth = schedule.dayOfMonth || 1;
                const monthTimeStr = schedule.time ? ` at ${this.formatTime(schedule.time)}` : '';
                return `Monthly on the ${this.formatOrdinal(dayOfMonth)}${monthTimeStr}`;

            case 'interval':
                return `Every ${this.formatInterval(schedule.interval)}`;

            case 'cron':
                return schedule.cronExpression ?
                    `Cron: ${schedule.cronExpression}` :
                    'Custom cron schedule';

            default:
                return schedule.description || 'Custom schedule';
        }
    };

    scheduleList.calculateFrequency = function (schedule) {
        switch (schedule.type) {
            case 'once': return 'One time';
            case 'daily': return 'Daily';
            case 'weekly': return 'Weekly';
            case 'monthly': return 'Monthly';
            case 'yearly': return 'Yearly';
            case 'interval': return this.formatInterval(schedule.interval);
            case 'cron': return 'Custom (Cron)';
            default: return 'Unknown';
        }
    };

    scheduleList.formatDateTime = function (dateTimeStr) {
        if (!dateTimeStr) return '';

        try {
            const date = new Date(dateTimeStr);
            const now = new Date();
            const diffMs = date - now;

            // Show relative time for nearby dates
            if (Math.abs(diffMs) < 24 * 60 * 60 * 1000) { // Within 24 hours
                return this.formatRelativeTime(diffMs);
            }

            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateTimeStr;
        }
    };

    scheduleList.formatTime = function (timeStr) {
        if (!timeStr) return '';

        try {
            // Handle different time formats
            const [hours, minutes] = timeStr.split(':');
            const hour = parseInt(hours);
            const min = minutes || '00';

            if (this.scheduleConfig.timeFormat === '24h') {
                return `${hours.padStart(2, '0')}:${min}`;
            } else {
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                return `${displayHour}:${min} ${ampm}`;
            }
        } catch {
            return timeStr;
        }
    };

    scheduleList.formatWeekdays = function (weekdays) {
        if (!Array.isArray(weekdays)) return '';

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        if (weekdays.length === 7) return 'Every day';
        if (weekdays.length === 5 && !weekdays.includes('Saturday') && !weekdays.includes('Sunday')) {
            return 'Weekdays';
        }
        if (weekdays.length === 2 && weekdays.includes('Saturday') && weekdays.includes('Sunday')) {
            return 'Weekends';
        }

        return weekdays.map(day => {
            const index = dayNames.indexOf(day);
            return index !== -1 ? shortNames[index] : day;
        }).join(', ');
    };

    scheduleList.formatInterval = function (interval) {
        if (!interval) return '';

        const value = interval.value || interval;
        const unit = interval.unit || 'minutes';

        if (value === 1) {
            return `1 ${unit.slice(0, -1)}`; // Remove 's' for singular
        }
        return `${value} ${unit}`;
    };

    scheduleList.formatOrdinal = function (num) {
        const ordinals = ['1st', '2nd', '3rd'];
        return ordinals[num - 1] || `${num}th`;
    };

    scheduleList.formatRelativeTime = function (diffMs) {
        const absDiff = Math.abs(diffMs);
        const isPast = diffMs < 0;

        const minutes = Math.floor(absDiff / (1000 * 60));
        const hours = Math.floor(absDiff / (1000 * 60 * 60));
        const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

        let timeStr;
        if (minutes < 1) timeStr = 'now';
        else if (minutes < 60) timeStr = `${minutes}m`;
        else if (hours < 24) timeStr = `${hours}h`;
        else timeStr = `${days}d`;

        if (timeStr === 'now') return 'Now';
        return isPast ? `${timeStr} ago` : `in ${timeStr}`;
    };

    scheduleList.isOverdue = function (nextRun) {
        if (!nextRun) return false;
        return new Date(nextRun) < new Date();
    };

    scheduleList.isUpcoming = function (nextRun) {
        if (!nextRun) return false;
        const now = new Date();
        const runTime = new Date(nextRun);
        const diffMs = runTime - now;
        return diffMs > 0 && diffMs < (2 * 60 * 60 * 1000); // Within 2 hours
    };

    scheduleList.handleRunTask = async function (id) {
        try {
            await this.handleAction('run_task', { id });
            this.log('INFO', `Task executed: ${id}`);
        } catch (error) {
            this.handleError(error);
        }
    };

    scheduleList.handleToggleTask = async function (id) {
        const item = this.findItemById(id);
        if (!item) return;

        const newEnabledState = !item.enabled;

        try {
            await this.handleToggleItem(id, newEnabledState);
        } catch (error) {
            this.handleError(error);
        }
    };

    scheduleList.handleBulkEnable = async function (selectedIds) {
        try {
            await this.handleAction('bulk_enable', { ids: selectedIds });
            this.listState.selectedItems.clear();
            this.render();
        } catch (error) {
            this.handleError(error);
        }
    };

    scheduleList.handleBulkDisable = async function (selectedIds) {
        try {
            await this.handleAction('bulk_disable', { ids: selectedIds });
            this.listState.selectedItems.clear();
            this.render();
        } catch (error) {
            this.handleError(error);
        }
    };

    // Auto-update for relative times
    if (scheduleList.scheduleConfig.autoUpdate) {
        const originalRender = scheduleList.render;
        scheduleList.render = function () {
            originalRender.call(this);
            this.startAutoUpdate();
        };

        scheduleList.startAutoUpdate = function () {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }

            this.updateInterval = setInterval(() => {
                if (!this.isDestroyed) {
                    this.render();
                }
            }, this.scheduleConfig.updateInterval);
        };

        const originalDestroy = scheduleList.destroy;
        scheduleList.destroy = function () {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            return originalDestroy.call(this);
        };
    }

    // Log successful creation
    scheduleList.log('INFO', 'ScheduleListComponent created using generic ListComponent');

    return scheduleList;
}

// Maintain backwards compatibility with the original class-based approach
class ScheduleListComponent {
    constructor(element, data, config) {
        return createScheduleListComponent(element, data, config);
    }
}

// Legacy compatibility - redirect old component to new one
class ScheduleDisplayComponent {
    constructor(element, data, config) {
        console.warn('ScheduleDisplayComponent is deprecated. Use ScheduleListComponent instead.');
        return createScheduleListComponent(element, [data], config);
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ScheduleListComponent,
        createScheduleListComponent,
        ScheduleDisplayComponent // Legacy compatibility
    };
}

// Make available globally
if (typeof window !== 'undefined') {
    window.ScheduleListComponent = ScheduleListComponent;
    window.createScheduleListComponent = createScheduleListComponent;
    window.ScheduleDisplayComponent = ScheduleDisplayComponent; // Legacy compatibility
} 