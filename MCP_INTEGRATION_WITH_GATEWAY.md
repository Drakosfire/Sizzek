# MCP Integration with Gateway Proxy

## 🎯 Overview

This document explains how MCP servers integrate with the Gateway Proxy system for ephemeral web UIs. Based on analysis of working implementations (todoodles) and integration patterns in the mcp-web-ui framework.

## 🏗️ Architecture Flow

```
MCP Server Startup → Server Registration → Session Creation → Gateway Proxying
     ↓                      ↓                    ↓                ↓
Auto-detect serverName → Register with Gateway → JWT Token → Proxy Requests
```

## 🔧 Environment Variables

### **Core Gateway Variables**

| Variable | Purpose | Usage | Example |
|----------|---------|-------|---------|
| `MCP_WEB_UI_USE_GATEWAY` | Master switch for gateway mode | Triggers gateway session creation vs direct port access | `true` |
| `MCP_WEB_UI_GATEWAY_URL` | Gateway server endpoint | API endpoint for session creation and server registration | `http://localhost:3082` |
| `MCP_WEB_UI_PROXY_PREFIX` | URL prefix for proxied requests | Constructs gateway URLs: `{gateway_url}{prefix}/{token}/` | `/mcp` |
| `MCP_WEB_UI_BIND_ADDRESS` | Server bind address override | Forces localhost binding in proxy mode | `localhost` |

### **Supporting Variables**

| Variable | Purpose | Example |
|----------|---------|---------|
| `MCP_WEB_UI_BASE_URL` | Base domain for URL generation | `localhost` or `domain.com` |
| `MCP_WEB_UI_PORT_MIN` | Port range minimum | `12000` |
| `MCP_WEB_UI_PORT_MAX` | Port range maximum | `13000` |
| `MCP_WEB_UI_MONGO_URL` | MongoDB for session storage | `mongodb://localhost:27017` |

## 🔍 Server Name Configuration

**Critical**: Each MCP server must have a unique `serverName` for proper session isolation. The gateway uses composite keys (`userId:serverName:serverType`) to ensure different MCP servers don't share sessions.

### **Required Configuration**
```typescript
// In your web-ui-integration.ts constructor
this.webUI = new MCPWebUI<YourDataType>({
    dataSource: this.getDataSource.bind(this),
    schema,
    onUpdate: this.handleUIUpdate.bind(this),
    // ... other config
    serverName: 'your-server-name' // ✅ REQUIRED for session isolation
});
```

### **Server Name Examples**
- **scheduled-tasks**: `serverName: 'scheduled-tasks'`
- **todoodles**: `serverName: 'todoodles'`
- **grocery-list**: `serverName: 'grocery-list'`
- **movies**: `serverName: 'movies'`

### **Why This Matters**
Without explicit server names, all servers default to `'mcp-webui'`, causing session conflicts:
```
❌ All servers: userId:mcp-webui:mcp-webui (shared sessions)
✅ Each server: userId:serverName:mcp-webui (isolated sessions)
```

## 📋 Integration Checklist

### ✅ **Required for Gateway Integration**

#### **1. Web UI Integration File**
Your `src/web-ui-integration.ts` must include:

```typescript
// ✅ REQUIRED: Set explicit server name for session isolation
this.webUI = new MCPWebUI<YourDataType>({
    dataSource: this.getDataSource.bind(this),
    schema,
    onUpdate: this.handleUIUpdate.bind(this),
    sessionTimeout: 30 * 60 * 1000,
    pollInterval: 5000,
    enableLogging: this.enableLogging,
    serverName: 'your-server-name' // ✅ CRITICAL: Unique name per server
});

// ✅ RECOMMENDED: Add gateway environment variable logging
this.log('DEBUG', '[WEB-UI-ENV] Environment variables:', {
    MCP_WEB_UI_USE_GATEWAY: process.env.MCP_WEB_UI_USE_GATEWAY,
    MCP_WEB_UI_GATEWAY_URL: process.env.MCP_WEB_UI_GATEWAY_URL,
    MCP_WEB_UI_BASE_URL: process.env.MCP_WEB_UI_BASE_URL,
    MCP_WEB_UI_PROXY_PREFIX: process.env.MCP_WEB_UI_PROXY_PREFIX,
    MCP_WEB_UI_BIND_ADDRESS: process.env.MCP_WEB_UI_BIND_ADDRESS,
    MCP_WEB_UI_PORT_MIN: process.env.MCP_WEB_UI_PORT_MIN,
    MCP_WEB_UI_PORT_MAX: process.env.MCP_WEB_UI_PORT_MAX
});
```

#### **2. CSS Path Configuration**
Use server-specific path for proper detection:

```typescript
// ✅ Good - enables server directory detection
cssPath: path.join(process.cwd(), 'mcp-servers', 'your-server-name', 'static'),

// ❌ Bad - generic path
cssPath: process.env.MCP_WEB_UI_CSS_PATH || './static',
```

#### **3. Environment Configuration**
Add to your `env.example`:

```bash
# Gateway Proxy Configuration
MCP_WEB_UI_USE_GATEWAY=true
MCP_WEB_UI_GATEWAY_URL=http://localhost:3082
MCP_WEB_UI_PROXY_PREFIX=/mcp
MCP_WEB_UI_BIND_ADDRESS=localhost

# Base URL Configuration  
MCP_WEB_UI_BASE_URL=localhost

# Port Range Configuration
MCP_WEB_UI_PORT_MIN=12000
MCP_WEB_UI_PORT_MAX=13000
```

#### **4. Dependencies**
Ensure correct mcp-web-ui dependency:

```json
{
  "dependencies": {
    "mcp-web-ui": "file:../../mcp-web-ui"
  }
}
```

## 🔄 Integration Flow Details

### **Phase 1: Server Registration**
When MCP server starts with gateway mode enabled:

1. **Auto-detect serverName** from schema title
2. **Register with gateway** at `{GATEWAY_URL}/register-server`
3. **Provide backend info** (host, port, metadata)

```typescript
// Automatic registration data
{
  serverName: "grocery-list-dashboard", // from schema.title
  backend: {
    type: 'tcp',
    host: '172.18.0.5',  // Docker bridge IP
    port: 12861          // Allocated port
  },
  metadata: {
    schemaTitle: "Grocery List Dashboard",
    version: "2.0.0",
    features: ["api", "static", "websocket"]
  }
}
```

### **Phase 2: Session Creation**
When user calls `get_web_ui` tool:

1. **Check for registered server** via `{GATEWAY_URL}/discover-server/{serverName}`
2. **Create gateway session** via `{GATEWAY_URL}/create-session` with composite key
3. **Receive JWT token** for secure access with embedded server context
4. **Generate gateway URL**: `{BASE_URL}{PROXY_PREFIX}/{JWT_TOKEN}/`

**Session Isolation**: Each server creates sessions with unique composite keys:
- `scheduled-tasks`: `userId:scheduled-tasks:mcp-webui`
- `todoodles`: `userId:todoodles:mcp-webui`
- `grocery-list`: `userId:grocery-list:mcp-webui`

### **Phase 3: Request Proxying** 
All client requests flow through gateway:

```
Client: GET /mcp/jwt-token-abc123/api/items
   ↓
Gateway: Validates JWT → Discovers backend → Proxies to backend
   ↓  
Backend: 172.18.0.5:12861/api/items
```

## 🐛 Common Integration Issues

### **1. Missing Server Name Configuration**
**Problem**: All servers default to `'mcp-webui'`, causing session conflicts
**Solution**: Set explicit `serverName` in MCPWebUI configuration for each server

### **2. Missing Environment Variables**
**Problem**: Gateway environment variables not logged/monitored
**Solution**: Add comprehensive environment logging like todoodles

### **3. Incorrect CSS Path**
**Problem**: Generic CSS paths prevent server detection
**Solution**: Use server-specific paths with proper directory structure

### **4. MongoDB Connection Issues**
**Problem**: Gateway sessions stored in MongoDB but connection fails
**Solution**: Ensure `MCP_WEB_UI_MONGO_URL` is properly configured

## 📊 URL Patterns

### **Before Gateway (Direct Port Access)**
```
❌ https://domain.com:12345/?token=abc123
❌ https://domain.com:12346/?token=def456  
❌ https://domain.com:12347/?token=ghi789
```

### **After Gateway (Proxy Access)**
```
✅ https://domain.com/mcp/jwt-token-abc123/
✅ https://domain.com/mcp/jwt-token-def456/
✅ https://domain.com/mcp/jwt-token-ghi789/
```

## 🔒 Security Features

1. **JWT Tokens** with embedded user context and expiration
2. **MongoDB TTL** for automatic session cleanup  
3. **User-based Access Control** with scopes
4. **Token Validation** on every request
5. **CORS Configuration** for domain restrictions

## 🌐 Real-time Communication Support

The gateway fully supports:
- **WebSockets** - Bidirectional real-time communication
- **Server-Sent Events (SSE)** - Streaming updates
- **Long Polling** - Extended request handling

```javascript
// All work seamlessly through proxy
const ws = new WebSocket('wss://domain.com/mcp/token123/ws');
const eventSource = new EventSource('/mcp/token123/events');
const response = await fetch('/mcp/token123/poll');
```

## 📈 Production Deployment

### **Docker Compose Configuration**
```yaml
services:
  librechat:
    ports:
      - "${PORT}:${PORT}"
      - "127.0.0.1:3082:3082"  # Gateway proxy only
      # No need for 12000-13000:12000-13000 anymore!
    environment:
      - MCP_WEB_UI_USE_GATEWAY=true
      - MCP_WEB_UI_GATEWAY_URL=http://localhost:3082
      - MCP_WEB_UI_MONGO_URL=mongodb://mongodb:27017
```

### **Nginx Reverse Proxy**
```nginx
location /mcp/ {
    proxy_pass http://localhost:3082/mcp/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

## 🛠️ Debugging Gateway Integration

### **Check Server Registration**
```bash
curl http://localhost:3082/discover-server/grocery-list-dashboard
```

### **Monitor Gateway Health**
```bash
curl http://localhost:3082/health
curl http://localhost:3082/stats
```

### **Enable Debug Logging**
```bash
export MCP_DEBUG=true
export DEBUG=true
```

### **Common Debug Points**
1. **Server Name**: Check auto-detected serverName in logs
2. **Registration**: Verify server appears in gateway `/stats`
3. **Environment**: Check all gateway variables are set
4. **MongoDB**: Ensure gateway can store sessions
5. **Network**: Verify backend host/port accessibility

## 🏆 Working Example: Todoodles

Reference implementation in `/mcp-servers/todoodles/`:
- ✅ Complete environment variable logging
- ✅ Proper CSS path configuration  
- ✅ Gateway environment variables in env.example
- ✅ Server registration working correctly

## 📚 Next Steps

1. **Install dependencies**: Ensure mcp-web-ui is properly linked
2. **Update integration**: Add missing environment logging
3. **Configure environment**: Set gateway variables
4. **Test integration**: Verify server registration and session creation
5. **Deploy with gateway**: Use single proxy port instead of port ranges

---

*This document is based on analysis of the mcp-web-ui framework and working implementations as of the current codebase state.*
