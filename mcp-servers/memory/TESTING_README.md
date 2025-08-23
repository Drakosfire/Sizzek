# MCP Memory Server MongoDB Storage Testing

This directory contains comprehensive testing tools to diagnose and verify the MCP memory server's MongoDB integration. Use these tools to understand why data isn't being stored and to validate the storage system works correctly.

## 🚀 Quick Start

### Prerequisites

1. **MongoDB running** (via Docker or local installation)
2. **Node.js** with ES modules support
3. **MongoDB connection**: `mongodb://localhost:27017` (or your custom URI)

### Install Dependencies

```bash
npm install mongodb
```

### Run Complete Test Suite

```bash
# Run all tests and diagnostics
node run-storage-tests.js

# Clean up test data when done
node run-storage-tests.js --cleanup
```

## 📋 Test Files Overview

### 1. `test-mongodb-storage.js`
**Purpose**: Comprehensive storage validation with realistic MCP data

**Features**:
- ✅ Creates realistic test data (food preferences, schedules, projects, etc.)
- ✅ Tests user isolation between different phone numbers
- ✅ Validates data structure integrity
- ✅ Performs realistic queries (aggregations, filtering)
- ✅ Simulates MCP server operations

**Sample Data Created**:
```javascript
// User: +1234567890
{
  userId: '+1234567890',
  data: {
    entities: [
      {
        name: 'Pizza-Preference',
        entityType: 'FoodPreference',
        observations: ['User loves pizza with pepperoni', 'Prefers thin crust']
      },
      {
        name: 'Work-Schedule',
        entityType: 'Schedule', 
        observations: ['Works Monday-Friday 9-5', 'Team meetings Tuesday 2pm']
      }
    ],
    relations: [
      {
        from: 'Pizza-Preference',
        to: 'Work-Schedule',
        relationType: 'associated_with'
      }
    ]
  }
}
```

### 2. `debug-mcp-storage.js`
**Purpose**: Diagnose why MCP server isn't storing data

**Features**:
- 🔧 Environment variable validation
- 📁 File system checks (MCP server files, configs)
- 🔍 MongoDB connection and collection analysis
- 🧪 Direct storage operation testing
- 📊 Diagnostic report generation

**Commands**:
```bash
node debug-mcp-storage.js          # Full diagnostic
node debug-mcp-storage.js test     # Test direct storage only
node debug-mcp-storage.js report   # Generate diagnostic report
```

### 3. `run-storage-tests.js`
**Purpose**: Combined test runner for complete validation

**Features**:
- 📋 Runs diagnostics first
- 🧪 Executes comprehensive storage tests
- 📊 Provides actionable next steps
- 🧹 Easy cleanup option

## 🔍 Diagnostic Checklist

When running tests, check for these common issues:

### ❌ **Issue**: No `mcp_storage` collection
**Solution**: MCP server not configured or not running
- Check `librechat.yaml` for MCP server configuration
- Verify MCP server is starting without errors
- Check LibreChat logs for MCP initialization

### ❌ **Issue**: Collection exists but no documents
**Solution**: MCP server not receiving requests or failing to store
- Verify MCP tools are being called in LibreChat
- Check environment variables (`MCP_STORAGE_TYPE=mongodb`)
- Look for MCP server errors in logs

### ❌ **Issue**: Test data can be stored but MCP data cannot
**Solution**: MCP server configuration or integration issue
- Check user context passing to MCP server
- Verify MongoDB connection string in MCP config
- Ensure proper storage interface implementation

## 🧪 Manual Testing Steps

### Step 1: Verify MongoDB Connection
```bash
# Connect to MongoDB
docker exec -it chat-mongodb mongosh

# Check if LibreChat database exists
use LibreChat
show collections

# Look for mcp_storage collection
db.mcp_storage.find().pretty()
```

### Step 2: Check LibreChat Configuration
```yaml
# In librechat.yaml
mcpServers:
  memory:
    type: stdio
    command: node
    args:
      - "../Sizzek/mcp-servers/memory/dist/index.js"
    env:
      MCP_STORAGE_TYPE: "mongodb"
      MCP_USER_BASED: "true"
      MONGO_URI: "mongodb://mongodb:27017/LibreChat"
      MONGODB_DATABASE: "LibreChat"
      MONGODB_COLLECTION: "mcp_storage"
```

### Step 3: Test MCP Server Directly
```bash
# Send test message to LibreChat via SMS
curl -X POST http://your-librechat-url/api/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Remember that I like pizza"}'

# Check if data appears in MongoDB
db.mcp_storage.find({"userId": "+1234567890"}).pretty()
```

## 📊 Understanding Test Results

### ✅ **Success Indicators**:
- MongoDB connection successful
- Test data inserted and retrieved correctly
- User isolation working (each phone number has separate data)
- Data structure matches MCP server expectations
- No cross-contamination between users

### ❌ **Failure Indicators**:
- Cannot connect to MongoDB
- Test data insertion fails
- User isolation broken (data mixed between users)
- Data structure malformed
- MCP server simulation fails

## 🛠️ Troubleshooting Common Issues

### Issue: `MongoClient is not a constructor`
**Solution**: Install MongoDB driver
```bash
npm install mongodb
```

### Issue: `Cannot connect to MongoDB`
**Solutions**:
1. Check if MongoDB is running: `docker ps | grep mongo`
2. Verify connection string: `mongodb://localhost:27017`
3. Check firewall/network settings

### Issue: `Collection exists but no data`
**Solutions**:
1. Check MCP server logs for errors
2. Verify environment variables are set
3. Ensure MCP server is being called by LibreChat
4. Check user context is being passed correctly

### Issue: `Tests pass but MCP server still doesn't store`
**Solutions**:
1. Compare test data structure with MCP server expectations
2. Check MCP server storage implementation
3. Verify user ID format matches expectations
4. Look for errors in MCP server logs

## 📈 Next Steps After Testing

1. **If Tests Pass**: MCP server configuration or integration issue
   - Check MCP server logs for errors
   - Verify LibreChat is calling MCP tools
   - Ensure user context is passed correctly

2. **If Tests Fail**: MongoDB or environment issue
   - Fix MongoDB connection issues
   - Install missing dependencies
   - Check environment variables

3. **If Partial Success**: Data structure or user isolation issue
   - Review MCP server storage implementation
   - Check user ID format and context passing
   - Verify storage interface implementation

## 📝 Generating Reports

The test suite generates detailed reports:
- `mcp-storage-diagnostic-report.json` - Diagnostic information
- Console output with color-coded results
- Specific recommendations for each issue found

## 🧹 Cleanup

Always clean up test data after testing:
```bash
node run-storage-tests.js --cleanup
```

Or manually:
```javascript
// In MongoDB shell
use LibreChat
db.mcp_storage.deleteMany({"metadata.source": "mcp-memory-test"})
```

## 📞 Getting Help

If tests reveal issues:
1. Check the diagnostic report for specific recommendations
2. Review LibreChat logs for MCP server errors
3. Compare working test data structure with MCP server expectations
4. Verify MCP server configuration and environment variables 