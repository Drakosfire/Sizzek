# Todoodles - Time-Stamped Todo List MCP Server

A charming and extensible MCP server for managing time-stamped todoodle items with **MongoDB integration and user isolation**. Built with TypeScript and the Model Context Protocol, designed for seamless integration with LibreChat and SMS user management.

## 🎯 Key Features

- **🔄 Dual Storage Support**: JSON files for development, MongoDB for production
- **👥 User Isolation**: Each user gets their own private todoodles (perfect for SMS users)
- **🚀 LibreChat Integration**: Automatic user context extraction from requests
- **📱 SMS User Support**: Works seamlessly with phone-number-based users
- **⚡ Real-time Persistence**: Todoodles survive server restarts
- **🎨 Rich Categorization**: Organize with categories, priorities, and due dates
- **🔍 Advanced Search**: Find todoodles by text, category, priority, or due date
- **🌐 Enhanced Web UI Framework**: Interactive, responsive web interface with modern UX
- **📱 Mobile-Optimized Interface**: Perfect touch experience for phones and tablets
- **✨ Smart Undo System**: 5-second grace period with beautiful toast notifications
- **🔗 Dynamic URL Generation**: On-demand web UI with secure session management

## System Architecture

### Storage Abstraction Layer

The server supports two storage backends through a unified interface:

1. **JSON Storage** (Development)
   - File-based storage with user subdirectories
   - Automatic backups and atomic writes
   - Perfect for development and single-user scenarios

2. **MongoDB Storage** (Production)
   - User-isolated collections in MongoDB
   - Optimized for multi-user environments
   - LibreChat-compatible with shared database

### Core Components

1. **UserAwareTodoodlesManager Class**
   - Manages user-isolated todoodle state and persistence
   - Handles automatic user context detection from LibreChat
   - Implements dual storage backend switching
   - Maintains sequential ID generation per user

2. **Enhanced Data Model**
   ```typescript
   interface TodoodleItem {
       id: string;           // Sequential numeric ID (per user)
       text: string;         // Todoodle content
       createdAt: string;    // ISO timestamp
       completed: boolean;   // Completion status
       completedAt?: string; // Completion timestamp
       timeToComplete?: number; // Time taken in milliseconds
       category?: string;    // Optional category for organization
       priority: 'low' | 'medium' | 'high' | 'urgent'; // Priority level
       dueDate?: string;     // Optional due date in ISO format
   }

   interface TodoodleData {
       items: TodoodleItem[];
       metadata: {
           lastId: number;        // Per-user ID counter
           version: string;       // Schema version
           updatedAt: string;     // Last update timestamp
           totalItems: number;    // Total item count
           completedItems: number; // Completed item count
       };
   }
   ```

3. **User Context Integration**
   - Automatic user ID extraction from LibreChat requests
   - Support for SMS users (phone number as user ID)
   - Fallback to default user for standalone usage
   - Environment-driven user isolation control

4. **Web UI Framework Integration**
   - Built with `@sizzek/mcp-web-ui` framework
   - On-demand web server generation with dynamic port allocation
   - Session-based security with UUID tokens and 30-minute expiration
   - Real-time data polling with Alpine.js reactive frontend
   - Mobile-first responsive design with touch-optimized interface
   - Enhanced UX with smooth animations and modern styling
   - Intelligent undo system with visual feedback
   - Optimistic updates for instant responsiveness
   - Automatic cleanup and resource management

## Configuration

### Environment Variables

Create a `.env` file in the server root directory:

```env
# ===== STORAGE CONFIGURATION =====
# Storage type: 'json' or 'mongodb'
MCP_STORAGE_TYPE=mongodb

# ===== JSON FILE STORAGE (when MCP_STORAGE_TYPE=json) =====
TODOS_FILE_PATH=./todoodle.json

# ===== MONGODB STORAGE (when MCP_STORAGE_TYPE=mongodb) =====
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=user_todoodles
MCP_MONGODB_TIMEOUT=10000
MCP_MONGODB_RETRIES=3

# ===== USER ISOLATION =====
MCP_USER_BASED=true           # Enable user-based storage
MCP_USER_ID=${USER_ID}        # User ID (passed by LibreChat)

# ===== ENCRYPTION (Optional) =====
CREDS_KEY=your-64-character-hex-encryption-key

# ===== WEB UI CONFIGURATION =====
MCP_WEB_UI_BASE_URL=http://localhost  # Base URL for web UI access (use Tailscale URL for remote access)

# ===== DEVELOPMENT/DEBUGGING =====
MCP_DEBUG=true                # Enable debug logging
MCP_BACKUP_ENABLED=true       # Enable automatic backups (JSON only)
MCP_BACKUP_MAX_FILES=5        # Maximum backup files to keep
```

### Development vs Production Configuration

**Development (JSON Storage)**:
```env
MCP_STORAGE_TYPE=json
TODOS_FILE_PATH=./todoodle.json
MCP_USER_BASED=false
MCP_DEBUG=true
```

**Production (MongoDB with LibreChat)**:
```env
MCP_STORAGE_TYPE=mongodb
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/LibreChat
MONGODB_DATABASE=LibreChat
MONGODB_COLLECTION=user_todoodles
MCP_USER_BASED=true
MCP_USER_ID=${USER_ID}
```

## Integration

### LibreChat Configuration

Add to your `librechat.yaml`:

```yaml
mcpServers:
  todoodles:
    type: stdio
    command: node
    args:
      - "../Sizzek/mcp-servers/todoodles/dist/user-aware-index.js"
    timeout: 30000
    initTimeout: 10000
    env:
      # Storage configuration
      MCP_STORAGE_TYPE: "mongodb"
      MCP_USER_BASED: "true"
      
      # MongoDB configuration
      MONGODB_CONNECTION_STRING: "mongodb://localhost:27017/LibreChat"
      MONGODB_DATABASE: "LibreChat"
      MONGODB_COLLECTION: "user_todoodles"
      
      # User context (passed by LibreChat)
      MCP_USER_ID: "${USER_ID}"
      
      # Optional encryption
      CREDS_KEY: "${CREDS_KEY}"
      
      # Web UI configuration
      MCP_WEB_UI_BASE_URL: "http://localhost"
      
      # Debug settings
      MCP_DEBUG: "false"
    stderr: inherit
```

### SMS User Integration

For SMS users, todoodles automatically isolate data per phone number:

```yaml
# SMS users get user IDs like "+1234567890"
# Each phone number gets completely separate todoodles
# Perfect for multi-tenant SMS bot scenarios
```

### Docker Integration

```yaml
volumes:
  - ../Sizzek/mcp-servers:/app/mcp-servers
  - ../Sizzek/memory_files:/app/data  # For JSON storage fallback
```

## Enhanced API Tools

### Core Operations

1. **add_todoodle** (Enhanced)
   ```json
   {
     "name": "add_todoodle",
     "arguments": {
       "text": "Task description",
       "category": "work",      // Optional: organize todoodles
       "priority": "high",      // Optional: low|medium|high|urgent (defaults to medium)
       "dueDate": "2024-12-25"  // Optional: ISO date format
     }
   }
   ```

2. **complete_todoodle**
   ```json
   {
     "name": "complete_todoodle",
     "arguments": {
       "id": "1"
     }
   }
   ```

3. **get_todoodles** (Enhanced with filtering)
   ```json
   {
     "name": "get_todoodles",
     "arguments": {
       "completed": false  // Optional: true=completed, false=incomplete, omit=all
     }
   }
   ```

4. **delete_todoodle**
   ```json
   {
     "name": "delete_todoodle",
     "arguments": {
       "id": "1"
     }
   }
   ```

### Search & Filter Operations

5. **search_todoodles**
   ```json
   {
     "name": "search_todoodles",
     "arguments": {
       "query": "search text"
     }
   }
   ```

6. **get_todoodles_by_category**
   ```json
   {
     "name": "get_todoodles_by_category",
     "arguments": {
       "category": "work"
     }
   }
   ```

7. **get_todoodles_by_priority**
   ```json
   {
     "name": "get_todoodles_by_priority",
     "arguments": {
       "priority": "urgent"  // low|medium|high|urgent
     }
   }
   ```

### Due Date Operations

8. **get_due_todoodles**
   ```json
   {
     "name": "get_due_todoodles",
     "arguments": {
       "overdue_only": false  // true=only overdue, false=due today + overdue
     }
   }
   ```

### Utility Operations

9. **get_categories**
   ```json
   {
     "name": "get_categories",
     "arguments": {}
   }
   ```

10. **get_todoodles_stats**
    ```json
    {
      "name": "get_todoodles_stats",
      "arguments": {}
    }
    ```

### Web UI Access

11. **get_web_ui**
    ```json
    {
      "name": "get_web_ui",
      "arguments": {}
    }
    ```
    Returns a secure URL to access your todoodles through a web interface. The URL is unique to your session and expires automatically after 30 minutes for security.

## User Isolation Features

### Automatic User Detection

The server automatically detects user context from:
1. **LibreChat metadata**: `request.meta.user_id`
2. **SMS phone numbers**: `request.meta.phone_number`
3. **Environment variable**: `MCP_USER_ID`
4. **Fallback**: `'default'` for standalone usage

### Per-User Data Isolation

- **Separate ID sequences**: Each user gets their own 1, 2, 3... sequence
- **Independent categories**: Users can't see each other's categories
- **Isolated search**: Search only within user's own todoodles
- **Private statistics**: Stats calculated per user

### Storage Structure

**MongoDB Collections**:
```javascript
// Collection: user_todoodles
{
  "userId": "+1234567890",          // Phone number or user ID
  "data": {                         // TodoodleData object
    "items": [...],
    "metadata": {
      "lastId": 5,
      "version": "2.1.0",
      "updatedAt": "2024-12-15T...",
      "totalItems": 5,
      "completedItems": 2
    }
  },
  "updatedAt": "2024-12-15T...",
  "createdAt": "2024-12-15T..."
}
```

**JSON Storage Structure**:
```
todoodle_data/
├── users/
│   ├── default/
│   │   └── data.json
│   ├── +1234567890/
│   │   └── data.json
│   └── user123/
│       └── data.json
└── backups/
```

## Development Setup

### Prerequisites

- Node.js 18+
- MongoDB (for production testing)
- TypeScript 5.3+

### Installation

1. **Clone and install dependencies**
   ```bash
   cd mcp-servers/todoodles
   npm install
   ```

2. **Create environment configuration**
   ```bash
   cp env.example .env
   # Edit .env for your environment
   ```

3. **Build the server**
   ```bash
   npm run build
   ```

4. **Run locally**
   ```bash
   npm start
   ```

### Development Workflow

**JSON Storage (Development)**:
```bash
# Edit .env
MCP_STORAGE_TYPE=json
MCP_USER_BASED=false
MCP_DEBUG=true

# Build and test
npm run build
npm start
```

**MongoDB Testing**:
```bash
# Start MongoDB locally
docker run -d -p 27017:27017 mongo:7.0

# Edit .env
MCP_STORAGE_TYPE=mongodb
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/test_todoodles
MCP_USER_BASED=true
MCP_USER_ID=test-user

# Test with MongoDB
npm run build
npm start
```

## Deployment

### Production MongoDB Setup

1. **Database Preparation**
   ```javascript
   // MongoDB indexes for performance
   db.user_todoodles.createIndex({ "userId": 1 })
   db.user_todoodles.createIndex({ "updatedAt": -1 })
   db.user_todoodles.createIndex({ "userId": 1, "updatedAt": -1 })
   ```

2. **LibreChat Integration**
   - Add MCP server configuration to `librechat.yaml`
   - Ensure MongoDB connection string matches LibreChat's database
   - Set `MCP_USER_BASED=true` for user isolation
   - Use `${USER_ID}` for automatic user context

3. **SMS User Support**
   - Automatic integration with SMS user management system
   - Phone numbers become user IDs (e.g., "+1234567890")
   - Complete data isolation per phone number
   - Persistent across SMS conversations

### Performance Considerations

- **MongoDB Indexing**: Proper indexes on `userId` and `updatedAt`
- **Connection Pooling**: Reuse connections for multiple operations
- **Error Handling**: Graceful fallback to JSON storage if MongoDB unavailable
- **Logging**: Comprehensive debug logging for troubleshooting

## Web UI Framework

### Overview

The todoodles server includes a built-in web UI framework powered by `@sizzek/mcp-web-ui` that allows users to interact with their todoodles through a modern web interface instead of just chat commands.

### 🎯 Key Features

- **On-Demand Access**: Web UI servers are created dynamically when requested
- **Secure Sessions**: Each session has a unique UUID token with 30-minute expiration
- **User Isolation**: Web UI automatically respects user boundaries - each user only sees their own todoodles
- **Real-Time Updates**: Interface polls for changes every 2 seconds with smart data diffing
- **Mobile Optimized**: Fully responsive design works perfectly on phones via Tailscale/VPN
- **Auto Cleanup**: Sessions automatically terminate and clean up resources

### ✨ Enhanced UI Features (v2.1+)

#### **Responsive Design & Mobile Experience**
- **📱 Mobile-First**: Optimized touch targets and mobile-friendly layouts
- **💫 Smooth Animations**: Polished transitions and hover effects
- **🌙 Dark Mode Support**: Automatic light/dark theme adaptation
- **📐 Adaptive Layout**: Clean, modern design that works on all screen sizes
- **⚡ Performance Optimized**: Smart polling only when tab is active

#### **Add New Todoodles Interface**
- **🎨 Collapsible Form**: Beautiful, space-efficient add form
- **📝 Complete Field Support**: Text, category, priority, and due date inputs
- **✅ Optimistic Updates**: New todoodles appear instantly while saving
- **🔍 Input Validation**: Client and server-side validation with helpful error messages
- **🎯 Smart Focus Management**: Automatic input focus and form navigation

#### **Intelligent Completion System**
- **⚡ Immediate Feedback**: Checkboxes respond instantly when clicked
- **🔔 Undo Toast Notifications**: Beautiful, non-intrusive undo system
- **⏱️ 5-Second Grace Period**: Perfect balance between speed and safety
- **📊 Animated Progress Bar**: Visual countdown with gradient effects
- **🔄 Smart State Management**: Handles multiple pending actions simultaneously

### Usage

1. **Request Web UI Access**:
   Ask your AI agent: "Can I get a web interface for my todoodles?"
   
2. **Agent Response**:
   The agent will call the `get_web_ui` tool and return a secure URL like:
   ```
   http://localhost:3247/ui/f47ac10b-58cc-4372-a567-0e02b2c3d479
   ```

3. **Enhanced Web Interface**:
   - **Add Todoodles**: Click the green "+ Add New Todoodle" button
   - **Complete Items**: Check off todoodles with instant undo option
   - **Undo Actions**: Click "UNDO" in the toast notification within 5 seconds
   - **Visual Feedback**: Watch the animated progress bar countdown
   - **Mobile Support**: Use pinch-to-zoom and touch gestures naturally

4. **Automatic Security**:
   - URL expires after 30 minutes
   - Session automatically terminates
   - No persistent servers running

### 🎮 Interactive Features

#### **Add Todoodle Flow**
1. **Click Add Button** → Collapsible form slides down smoothly
2. **Fill Details** → Text (required), category, priority, due date (all optional)
3. **Submit** → New item appears at top of list instantly
4. **Auto-Focus** → Form automatically focuses on text input
5. **Error Handling** → Clear validation messages if something goes wrong

#### **Complete Todoodle Flow**
1. **Check Checkbox** → Item immediately shows as completed
2. **Undo Toast Appears** → "✓ Todoodle completed" with blue "UNDO" button
3. **Progress Bar Countdown** → 5-second animated timer with glow effect
4. **Choose Action**:
   - **Click "UNDO"** → Instantly reverts completion
   - **Wait 5 seconds** → Automatically confirms and syncs to server
5. **Multiple Items** → Can handle several completed items with stacked toasts

### Technical Implementation

#### **Smart Data Management**
- **Optimistic Updates**: UI responds immediately to user actions
- **Intelligent Polling**: Only fetches data when tab is active
- **Data Diffing**: Only updates changed items to prevent unnecessary re-renders
- **Scroll Preservation**: Maintains scroll position during all operations
- **Error Recovery**: Graceful fallback with automatic retry mechanisms

#### **Undo System Architecture**
- **Delayed Server Sync**: Completion only sent to server after undo timeout
- **State Tracking**: Manages pending actions with unique IDs
- **Memory Management**: Automatic cleanup of expired undo actions
- **Visual Feedback**: Real-time progress indication with CSS animations
- **Error Handling**: Reverts optimistic updates on server failures

### Remote Access Configuration

For accessing todoodles from mobile devices over Tailscale or VPN:

```env
# Set your Tailscale machine URL
MCP_WEB_UI_BASE_URL=http://your-machine.tailscale-network.ts.net

# Or your VPN/network address
MCP_WEB_UI_BASE_URL=http://192.168.1.100
```

The framework automatically:
- Binds to all interfaces (0.0.0.0) for network URLs
- Binds to localhost (127.0.0.1) for localhost URLs
- Generates URLs with the configured base URL

### Web UI Architecture

The web UI integration follows a clean separation pattern:

1. **TodoodlesWebUIManager**: Handles all web UI logic separately from main MCP server
2. **Minimal Integration**: Only one new tool (`get_web_ui`) added to existing server
3. **Clean Shutdown**: Automatic cleanup when MCP server terminates
4. **User Context**: Automatically inherits user isolation from parent MCP server

### Technical Details

- **Framework**: Express.js server with Alpine.js frontend
- **Port Range**: Dynamic allocation from 3000-65535
- **Session Management**: In-memory session store with automatic cleanup
- **Frontend**: Vanilla HTML/CSS/JS with Alpine.js reactivity
- **Security**: Token-based authentication with static file serving
- **Styling**: Modern CSS with animations, gradients, and responsive design

## Migration from Legacy Version

### JSON to MongoDB Migration

```bash
# Export existing JSON data
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./todoodle.json', 'utf8'));
console.log(JSON.stringify({
  userId: 'default',
  data: {
    items: data,
    metadata: {
      lastId: Math.max(...data.map(i => parseInt(i.id))) || 0,
      version: '2.1.0',
      updatedAt: new Date().toISOString(),
      totalItems: data.length,
      completedItems: data.filter(i => i.completed).length
    }
  }
}, null, 2));
"
```

### Tool Name Migration

Old tools → New tools:
- `add` → `add_todoodle`
- `complete` → `complete_todoodle`
- `get_all` → `get_todoodles`
- `get_incomplete` → `get_todoodles` (with `completed: false`)
- `delete` → `delete_todoodle`
- `search` → `search_todoodles`
- `get_by_category` → `get_todoodles_by_category`
- `get_by_priority` → `get_todoodles_by_priority`
- `get_due_today` → `get_due_todoodles`
- `get_overdue` → `get_due_todoodles` (with `overdue_only: true`)

## Enhanced Features

### Advanced Categorization & Priority System
- **Categories**: Optional organization system (e.g., 'work', 'personal', 'shopping')
- **Priority Levels**: Four levels with visual indicators:
  - 🔴 Urgent - Critical tasks requiring immediate attention
  - 🟠 High - Important tasks to complete soon
  - 🟡 Medium - Regular tasks (default level)
  - 🟢 Low - Tasks that can wait
- **Smart Sorting**: Priority-first sorting with urgent tasks at the top
- **Enhanced Display**: Rich visual output with emojis and category labels

### Due Date System
- **Optional Due Dates**: Add due dates to todoodles in ISO format (YYYY-MM-DD)
- **Smart Date Display**: Intelligent formatting with visual cues:
  - ⏰ "due today" - Tasks due today
  - 📅 "due tomorrow" - Tasks due tomorrow
  - 📅 "due in X days" - Tasks due within a week
  - 📅 "due MM/DD/YYYY" - Tasks due later
  - 🚨 "X days overdue" - Overdue tasks with urgent styling
- **Due Date Filtering**: Find todoodles by due date status
- **Overdue Detection**: Automatic detection and highlighting

### Statistics & Analytics
- Total, completed, incomplete, and overdue counts
- Category usage analytics
- Average completion time tracking
- Last updated timestamps
- User-specific metrics

## Usage Examples

### Multi-User Scenarios

**SMS User Integration**:
```bash
# User +1234567890 adds a todo
add_todoodle("Buy groceries", "personal", "medium", "2024-12-16")

# User +0987654321 adds a todo (completely isolated)
add_todoodle("Finish report", "work", "urgent", "2024-12-15")

# Each user only sees their own todoodles
get_todoodles()  # Returns different results per user
```

**Development Testing**:
```bash
# Test as different users
MCP_USER_ID=alice npm start
MCP_USER_ID=bob npm start
MCP_USER_ID=charlie npm start
```

**Web UI Usage**:
```bash
# User requests web interface through chat
"Can I get a web interface for my todoodles?"

# Agent calls get_web_ui tool and returns secure URL
# User clicks URL and gets personal todoodles interface
# Each user sees only their own data, even through web UI
```

## Troubleshooting

### Common Issues

1. **MongoDB Connection Errors**
   ```bash
   # Check MongoDB is running
   docker ps | grep mongo
   
   # Test connection
   mongosh mongodb://localhost:27017/LibreChat
   ```

2. **Environment Variable Issues**
   ```bash
   # Verify .env loading
   MCP_DEBUG=true npm start
   # Check console for environment variable dump
   ```

3. **User Isolation Not Working**
   ```bash
   # Ensure MCP_USER_BASED=true
   # Check LibreChat passes USER_ID correctly
   # Verify user extraction in logs
   ```

4. **Permission Errors**
   ```bash
   # JSON storage directory permissions
   chmod -R 755 ./todoodle_data/
   ```

### Debug Logging

Enable comprehensive logging:
```env
MCP_DEBUG=true
```

Logs include:
- Environment variable loading
- Storage type selection
- User context extraction
- MongoDB connection status
- Tool execution details
- Error stack traces

## Roadmap

### Immediate Enhancements
- [ ] **Recurring Todoodles**: Weekly, monthly task repetition
- [ ] **Reminder Notifications**: Integration with notification systems
- [ ] **Bulk Operations**: Complete/delete multiple todoodles
- [ ] **Import/Export**: CSV, JSON data exchange
- [ ] **Todoodle Templates**: Predefined task templates

### Advanced Features
- [ ] **Project Management**: Group todoodles into projects
- [ ] **Team Collaboration**: Shared todoodles between users
- [ ] **Time Tracking**: Detailed time analytics
- [ ] **Calendar Integration**: Sync with external calendars
- [ ] **Mobile API**: RESTful API for mobile apps

### Agent Integration
- [ ] **AI Agent Memory**: Agents track their own tasks
- [ ] **Task Delegation**: Agents assign tasks to each other
- [ ] **Performance Analytics**: Agent productivity metrics
- [ ] **Automated Scheduling**: AI-driven task prioritization

## License

ISC - See LICENSE file for details

---

## Support

For issues, feature requests, or contributions:
- Create an issue in the project repository
- Check troubleshooting section for common problems
- Enable debug logging for detailed error information 