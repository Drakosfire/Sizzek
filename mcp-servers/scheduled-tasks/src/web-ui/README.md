# Scheduled Tasks Web UI Components

## Architecture

This directory contains scheduled-tasks-specific web UI components that extend the generic MCP Web UI Framework.

### Dependency Structure

```
MCP Web UI Framework (main framework)
├── BaseComponent.js          (Core component foundation)
└── ListComponent.js          (Generic list functionality)
    │
    └── Schedule-Specific Components (this directory)
        ├── ScheduleListComponent.js    (Scheduled tasks list implementation)
        ├── ScheduleDisplayComponent.js.bak (Legacy component - backed up)
        └── index.html                  (Example integration)
```

## Component Migration

**ScheduleDisplayComponent** → **ScheduleListComponent**

- **Old**: Single-item display component (693 lines)
- **New**: List-based component using generic infrastructure (~500 lines)
- **Improvement**: 28% code reduction + list functionality (search, filtering, bulk actions)

## Loading Order

**Critical:** Framework components must be loaded BEFORE server-specific components.

```html
<!-- 1. Load framework components FIRST -->
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/core/BaseComponent.js"></script>
<script src="../../../../../mcp-web-ui-standalone/src/vanilla/components/ListComponent.js"></script>

<!-- 2. Load server-specific components AFTER -->
<script src="ScheduleListComponent.js"></script>
```

## Usage

### Basic Schedule List

```javascript
const scheduleList = createScheduleListComponent(element, data, {
    list: {
        itemFields: ['name', 'schedule', 'nextRun'],
        enableToggle: true,
        actions: { item: ['edit', 'delete', 'run', 'toggle'] }
    }
});
```

### Advanced Schedule List with All Features

```javascript
const advancedScheduleList = createScheduleListComponent(element, data, {
    list: {
        itemFields: ['name', 'schedule', 'status', 'nextRun'],
        enableSearch: true,
        enableFilters: true,
        enableBulkActions: true,
        enableSorting: true,
        actions: {
            item: ['edit', 'delete', 'run', 'toggle'],
            bulk: ['delete', 'enable', 'disable'],
            global: ['add', 'import']
        }
    },
    schedule: {
        autoUpdate: true,
        updateInterval: 30000,
        timeFormat: '12h',
        highlightUpcoming: true
    }
});
```

## Schedule Features

### Schedule Types Supported
- **Once**: One-time execution
- **Daily**: Every day at specified time
- **Weekly**: Specific days of the week
- **Monthly**: Specific day of the month
- **Interval**: Every X minutes/hours/days
- **Cron**: Complex cron expressions
- **Custom**: User-defined schedules

### Human-Readable Display
- **Daily at 9:00 AM** - Simple daily schedule
- **Weekly on Mon, Wed, Fri at 2:00 PM** - Multi-day weekly
- **Monthly on the 1st at 1:00 AM** - Monthly schedule
- **Every 30 minutes** - Interval-based
- **Cron: 0 */4 * * 1-5** - Complex cron expression

### Status Indicators
- **✅ Enabled** - Active and ready to run
- **⚠️ Overdue** - Past scheduled time
- **🔔 Due soon** - Within 2 hours of execution
- **⏸️ Disabled** - Paused/inactive

### Time Formatting
- **Relative times**: "in 2h", "5m ago", "Now"
- **Smart dates**: "Today", "Tomorrow", or full date
- **12h/24h format** support
- **Timezone-aware** display

## Configuration Options

### List Configuration
- `itemFields` - Which fields to display/edit
- `enableSearch` - Enable search functionality
- `enableFilters` - Enable filtering controls
- `enableBulkActions` - Enable bulk operations
- `enableSorting` - Enable column sorting
- `actions` - Customize available actions per context

### Schedule-Specific Configuration
- `autoUpdate` - Auto-refresh for relative times (default: true)
- `updateInterval` - Update frequency in milliseconds (default: 30000)
- `timeFormat` - '12h' or '24h' format (default: '12h')
- `dateFormat` - 'short', 'long', 'relative', 'iso'
- `highlightUpcoming` - Highlight tasks due soon (default: true)
- `showIcon` - Show schedule type icons (default: true)

### Filtering Options
- **Status**: All, Enabled, Disabled
- **Schedule Type**: All, Once, Daily, Weekly, Monthly, Cron, Interval
- **Next Run**: All, Overdue, Today, This Week

## Actions Available

### Item Actions
- **Edit** - Modify task settings
- **Delete** - Remove task
- **Run** - Execute task immediately
- **Toggle** - Enable/disable task

### Bulk Actions
- **Delete** - Remove multiple tasks
- **Enable** - Activate multiple tasks
- **Disable** - Deactivate multiple tasks

### Global Actions
- **Add** - Create new scheduled task
- **Import** - Import tasks from file

## Code Reduction Achievement

**ScheduleDisplayComponent**: 693 lines → **ScheduleListComponent**: ~500 lines (**28% reduction**)

Plus gained all the list functionality:
- ✅ Search and filtering
- ✅ Bulk operations
- ✅ Sorting capabilities
- ✅ CRUD operations
- ✅ Configuration-driven behavior

## Framework Relationship

The **ScheduleListComponent** (~500 lines) configures and extends the generic **ListComponent** (1,243 lines) with schedule-specific features:

- **Base functionality** (CRUD, search, filters, etc.) provided by framework
- **Schedule enhancements** (time formatting, status indicators, schedule parsing) added by this component
- **Configuration-driven** behavior allows customization without code changes

## Legacy Compatibility

The old `ScheduleDisplayComponent` is preserved as `ScheduleDisplayComponent.js.bak` and a compatibility layer redirects old usage to the new component:

```javascript
// Legacy usage still works
const oldComponent = new ScheduleDisplayComponent(element, scheduleData);
// Automatically redirects to new ScheduleListComponent
```

## Auto-Update Feature

The component automatically updates relative times every 30 seconds to keep "in 5m", "overdue", etc. current without manual refresh. 