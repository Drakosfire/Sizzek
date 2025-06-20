# MongoDB Testing Guide: User Isolation Verification

## 1. Connect to LibreChat MongoDB

### Option A: Using Docker Exec (Recommended)
```bash
# Connect to your LibreChat MongoDB container
docker exec -it chat-mongodb mongosh

# Or if your container has a different name:
docker ps | grep mongo
docker exec -it <container_name> mongosh
```

### Option B: Using MongoDB Compass (GUI)
```bash
# Connection string for Compass:
mongodb://localhost:27017
```

### Option C: Using mongosh directly (if installed locally)
```bash
mongosh mongodb://localhost:27017
```

## 2. Explore Database Structure

### List All Databases
```javascript
// In MongoDB shell
show dbs
```

**Expected Output:**
- `LibreChat` - Your existing LibreChat database
- `mcp-data` - New database for MCP server data (auto-created)

### Switch to MCP Data Database
```javascript
use mcp-data
show collections
```

**Expected Collections:**
- `mcp_storage` - Where user-isolated data is stored

## 3. Explore User Data Structure

### View All Documents (Before Testing)
```javascript
use mcp-data
db.mcp_storage.find().pretty()
```

### Monitor Real-Time Changes
```javascript
// Open a new terminal and run this to monitor changes
docker exec -it chat-mongodb mongosh --eval "
use mcp-data;
while(true) {
  print('=== Current Time:', new Date(), '===');
  db.mcp_storage.find().forEach(printjson);
  print('\\n--- Waiting 5 seconds ---\\n');
  sleep(5000);
}
"
```

## 4. Test User Isolation

### Step 1: Send SMS Messages from Different Numbers
Send test messages from different phone numbers to your Twilio SMS webhook:

```bash
# Test Message 1 - User A
curl -X POST http://your-ngrok-url.ngrok.io/webhooks/twilio/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B1234567890&Body=Remember that I like pizza&MessageSid=test-msg-1"

# Test Message 2 - User B  
curl -X POST http://your-ngrok-url.ngrok.io/webhooks/twilio/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B0987654321&Body=Remember that I prefer sushi&MessageSid=test-msg-2"
```

### Step 2: Check MongoDB for User-Specific Data
```javascript
use mcp-data

// View all user data
db.mcp_storage.find().pretty()

// Check specific user data
db.mcp_storage.find({"userId": "+1234567890"}).pretty()
db.mcp_storage.find({"userId": "+0987654321"}).pretty()

// Count documents per user
db.mcp_storage.aggregate([
  { $group: { _id: "$userId", count: { $sum: 1 } } }
])
```

### Step 3: Verify Memory MCP Server Data
```javascript
// Look for memory-specific data structure
db.mcp_storage.find({"data.entities": {$exists: true}}).pretty()

// Check entities created by each user
db.mcp_storage.find({}, {userId: 1, "data.entities.name": 1}).pretty()
```

## 5. Expected Results

### User Isolation Success Indicators:
✅ **Separate Documents**: Each phone number has separate documents in `mcp_storage`
✅ **No Cross-Contamination**: User A cannot see User B's entities/data
✅ **User-Specific Collections**: Data is properly tagged with `userId`

### Sample Expected Output:
```javascript
// User A's data
{
  "_id": ObjectId("..."),
  "userId": "+1234567890",
  "data": {
    "entities": [
      {
        "name": "Pizza-Preference",
        "entityType": "FoodPreference",
        "observations": ["User likes pizza"]
      }
    ],
    "relations": []
  },
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}

// User B's data (separate document)
{
  "_id": ObjectId("..."),
  "userId": "+0987654321", 
  "data": {
    "entities": [
      {
        "name": "Sushi-Preference",
        "entityType": "FoodPreference", 
        "observations": ["User prefers sushi"]
      }
    ],
    "relations": []
  },
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}
```

## 6. Debugging Commands

### Check LibreChat SMS Integration
```javascript
// Switch to LibreChat database
use LibreChat

// Check conversations created via SMS
db.conversations.find({"metadata.source": "sms"}).pretty()

// Find conversations by phone number
db.conversations.find({"metadata.phoneNumber": "+1234567890"}).pretty()
```

### Verify User Creation
```javascript
// Check if SMS users are being created
db.users.find({"provider": "sms"}).pretty()
db.users.find({"username": {$regex: "sms_"}}).pretty()
```

### Monitor MCP Server Logs
```bash
# In another terminal, watch LibreChat logs
docker logs -f librechat-api

# Look for MCP-related entries:
# - "MCP Server started"
# - "Tool called by user: +1234567890"
# - "Memory Storage] Saved graph for user"
```

## 7. Troubleshooting

### If No mcp-data Database Appears:
1. Verify MCP servers are configured in LibreChat
2. Check that SMS messages trigger MCP tool calls
3. Ensure `MCP_STORAGE_TYPE=mongodb` in environment

### If User Isolation Fails:
1. Check `userId` parameter is being passed correctly
2. Verify storage manager constructor logic
3. Review MCP server logs for user context

### If MongoDB Connection Fails:
```bash
# Check MongoDB container status
docker ps | grep mongo

# Check MongoDB logs
docker logs chat-mongodb

# Test connection
docker exec -it chat-mongodb mongosh --eval "db.runCommand('ismaster')"
```

## 8. Clean Up Test Data (Optional)
```javascript
// Remove test data after verification
use mcp-data
db.mcp_storage.deleteMany({"userId": {$in: ["+1234567890", "+0987654321"]}})

// Or drop the entire test database
use mcp-data
db.dropDatabase()
```

## 9. Success Criteria Checklist

- [ ] `mcp-data` database auto-created
- [ ] User-specific documents created per phone number
- [ ] No data cross-contamination between users
- [ ] Memory entities properly isolated
- [ ] SMS conversations link to correct user data
- [ ] Real-time monitoring shows data changes
- [ ] User isolation maintained across MCP server restarts 