# Todoodles - Time-Stamped Todo List MCP Server

A charming and extensible MCP server for managing time-stamped todoodle items. Built with TypeScript and the Model Context Protocol, designed for integration with LibreChat.

## System Architecture

### Core Components

1. **TodoodleListManager Class**
   - Manages todoodle state and persistence
   - Handles sequential ID generation (starting from 1)
   - Implements CRUD operations for todoodles
   - Maintains chronological ordering

2. **Data Model**
   ```typescript
   interface TodoodleItem {
       id: string;           // Sequential numeric ID
       text: string;         // Todoodle content
       createdAt: string;    // ISO timestamp
       completed: boolean;   // Completion status
       completedAt?: string; // Completion timestamp
       timeToComplete?: number; // Time taken in milliseconds
       category?: string;    // Optional category for organization
       priority: 'low' | 'medium' | 'high' | 'urgent'; // Priority level
       dueDate?: string;     // Optional due date in ISO format
   }
   ```

3. **MCP Server Framework**
   - Uses ModelContextProtocol SDK
   - Implements stdio transport
   - Defines clear tool schemas
   - Handles request/response lifecycle

### Features

- **Todoodle Management**
  - Add new todoodles with automatic timestamps, optional categories, priority levels, and due dates
  - Mark todoodles as completed with time tracking
  - Sequential ID generation (1, 2, 3, ...)
  - Organize todoodles with categories (work, personal, shopping, etc.)
  - Prioritize todoodles with four levels: low 🟢, medium 🟡, high 🟠, urgent 🔴
  - Set optional due dates with smart date formatting and overdue detection
  - Sort by priority (urgent first), due date (earliest first), or chronological order
  - Search todoodles by text content
  - Filter by category, priority level, or due date status
  - Complete todoodles by ID or text search

- **Viewing Options**
  - Today's todoodles with category, priority, and due date information
  - All todoodles with enhanced display including due date status
  - Incomplete todoodles with priority and due date sorting
  - Filter todoodles by specific category
  - Filter todoodles by priority level (low, medium, high, urgent)
  - Priority-sorted view (urgent first, then by creation date)
  - Due date filtering: due today ⏰, overdue 🚨, due this week 📅
  - Due date sorted view (earliest due dates first, then by priority)
  - List all available categories
  - Completion status and timing with rich visual indicators
  - Smart due date formatting: "due today", "due tomorrow", "due in X days", "X days overdue"

- **Persistence**
  - Automatic saving to todoodle.json
  - File-based storage
  - Error handling for missing files
  - Data integrity maintenance

## Integration

### LibreChat Configuration
```yaml
mcpServers:
  todoodles:
    type: stdio
    command: node
    args:
      - "/app/mcp-servers/todoodles/dist/index.js"
    timeout: 30000
    initTimeout: 10000
    env:
        TODOS_FILE_PATH: "/app/data/todoodles.json"
    stderr: inherit
```

### Docker Volume Mapping
```yaml
volumes:
  - ../Sizzek/mcp-servers:/app/mcp-servers
  - ../Sizzek/memory_files:/app/data
```

## API Tools

1. **add**
   ```json
        {
       "name": "add",
       "arguments": {
         "text": "Task description",
         "category": "work",      // Optional: organize todoodles
         "priority": "high",      // Optional: low|medium|high|urgent (defaults to medium)
         "dueDate": "2024-12-25"  // Optional: ISO date format or natural language
       }
     }
   ```

2. **get_today**
   ```json
   {
     "name": "get_today",
     "arguments": {}
   }
   ```

3. **get_all**
   ```json
   {
     "name": "get_all",
     "arguments": {}
   }
   ```

4. **get_incomplete**
   ```json
   {
     "name": "get_incomplete",
     "arguments": {}
   }
   ```

5. **get_prioritized** ⭐ NEW
   ```json
   {
     "name": "get_prioritized",
     "arguments": {}
   }
   ```

6. **get_by_category** ⭐ NEW
   ```json
   {
     "name": "get_by_category",
     "arguments": {
       "category": "work"
     }
   }
   ```

7. **get_by_priority** ⭐ NEW
   ```json
   {
     "name": "get_by_priority",
     "arguments": {
       "priority": "urgent"  // low|medium|high|urgent
     }
   }
   ```

8. **get_categories** ⭐ NEW
   ```json
   {
     "name": "get_categories",
     "arguments": {}
   }
   ```

9. **complete**
   ```json
   {
     "name": "complete",
     "arguments": {
       "id": "1"
     }
   }
   ```

10. **search**
    ```json
    {
      "name": "search",
      "arguments": {
        "query": "search text"
      }
    }
    ```

11. **complete_by_text**
    ```json
    {
      "name": "complete_by_text",
      "arguments": {
        "text": "search text"
      }
    }
    ```

12. **get_due_today** ⭐ NEW
    ```json
    {
      "name": "get_due_today",
      "arguments": {}
    }
    ```

13. **get_overdue** ⭐ NEW
    ```json
    {
      "name": "get_overdue",
      "arguments": {}
    }
    ```

14. **get_due_this_week** ⭐ NEW
    ```json
    {
      "name": "get_due_this_week",
      "arguments": {}
    }
    ```

15. **get_sorted_by_due_date** ⭐ NEW
    ```json
    {
      "name": "get_sorted_by_due_date",
      "arguments": {}
    }
    ```

16. **delete**
    ```json
    {
      "name": "delete",
      "arguments": {
        "id": "1"
      }
    }
    ```

## Development Setup

1. **Installation**
   ```bash
   npm install
   ```

2. **Build**
   ```bash
   npm run build
   ```

3. **Run**
   ```bash
   npm start
   ```

## Implementation Notes

### ID Management
- Sequential numeric IDs starting from 1
- IDs persist between server restarts
- Automatic ID incrementation
- String representation for consistency

### Time Tracking
- Creation timestamps in ISO format
- Completion timestamps when marked done
- Time-to-complete calculation in milliseconds
- Human-readable duration display

### Error Handling
- Graceful file system error handling
- Null returns for invalid operations
- Clear error messages
- State consistency maintenance

## Recent Enhancements ⭐

### Category & Priority System
- **Categories**: Optional organization system (e.g., 'work', 'personal', 'shopping')
- **Priority Levels**: Four levels with visual indicators:
  - 🔴 Urgent - Critical tasks requiring immediate attention
  - 🟠 High - Important tasks to complete soon
  - 🟡 Medium - Regular tasks (default level)
  - 🟢 Low - Tasks that can wait
- **Smart Sorting**: Priority-first sorting with urgent tasks at the top
- **Enhanced Display**: Rich visual output with emojis and category labels
- **New Filtering**: Get todoodles by category or priority level
- **Category Management**: List all available categories

### Due Date System ⭐ NEW
- **Optional Due Dates**: Add due dates to todoodles in ISO format (YYYY-MM-DD)
- **Smart Date Display**: Intelligent formatting with visual cues:
  - ⏰ "due today" - Tasks due today
  - 📅 "due tomorrow" - Tasks due tomorrow
  - 📅 "due in X days" - Tasks due within a week
  - 📅 "due MM/DD/YYYY" - Tasks due later
  - 🚨 "X days overdue" - Overdue tasks with urgent styling
- **Due Date Filtering**: Find todoodles by due date status:
  - Tasks due today
  - Overdue tasks
  - Tasks due this week
- **Due Date Sorting**: Sort by due date (earliest first) with priority as secondary sort
- **Overdue Detection**: Automatic detection and highlighting of overdue tasks

### Usage Examples

**Adding categorized, prioritized, and scheduled todoodles:**
```bash
# Urgent work task due tomorrow
add("Complete quarterly report", "work", "urgent", "2024-12-16")

# High priority personal task due today
add("Buy birthday gift for mom", "personal", "high", "2024-12-15")

# Low priority shopping item due next week
add("Research new coffee maker", "shopping", "low", "2024-12-22")

# Medium priority task (default) with no due date
add("Clean garage", "household")

# Task with due date but default priority
add("Doctor appointment", "health", "medium", "2024-12-20")
```

**Filtering and viewing:**
```bash
# Get all urgent tasks
get_by_priority("urgent")

# Get all work-related todoodles
get_by_category("work")

# Get prioritized view (urgent first)
get_prioritized()

# Get tasks due today
get_due_today()

# Get overdue tasks (important!)
get_overdue()

# Get tasks due this week
get_due_this_week()

# Get all tasks sorted by due date (earliest first)
get_sorted_by_due_date()

# List all categories in use
get_categories()
```

## Next Steps

1. **Core Features**
   - Build out a system for saving user-specific memory files
   - Organize todoodles into projects
   - ✅ ~~Add todoodle categories and tags~~ **COMPLETED**
   - ✅ ~~Implement priority levels~~ **COMPLETED**
   - ✅ ~~Add due dates and reminders~~ **COMPLETED** (due dates implemented)
   - Add recurring todoodles
   - Add reminder notifications
   - Create todoodle templates

2. **Agent Integration**
   - Enable AI agents to create and manage their own todoodles
   - Allow agents to track their own tasks and progress
   - Implement agent-specific task prioritization
   - Create agent memory persistence through todoodles
   - Develop agent task delegation capabilities
   - Enable agent-to-agent task sharing
   - Implement agent task completion verification
   - Create agent performance analytics through task tracking

3. **User Experience**
   - Add ASCII art representation of todoodles
   - Implement simple animation for completion
   - Create visual progress indicators
   - Add emoji-based status indicators
   - Interactive CLI interface
   - Rich text formatting
   - Customizable themes
   - Keyboard shortcuts

4. **Integration & Collaboration**
   - Calendar integration
   - Email notifications
   - Mobile app companion
   - Web interface
   - Multi-user support
   - Sharing capabilities
   - Team collaboration features

5. **Advanced Features**
   - Todoodle dependencies
   - Progress tracking
   - Time estimates
   - Analytics and reporting
   - Export/Import functionality
   - Backup and restore
   - Version history
   - Search and filtering enhancements

## License

ISC 